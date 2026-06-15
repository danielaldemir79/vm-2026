// Status-styrd matchklocka. Löser Daniels vattenpaus-oro: klockan får ALDRIG
// springa fel. Den drivs på matchens STATUS (inte en blind tick) och RE-SYNKAS mot
// API:ts `elapsed` vid varje sync, så den inte kan glida iväg från sanningen.
//
// REN funktion: `now` INJICERAS (ingen Date.now() här), så varje drift-scenario är
// deterministiskt testbart. Detta är hela poängen , en klocka som tickar på en
// global timer är omöjlig att bevisa rätt; en som tar now som argument är trivial
// att bevisa rätt.
//
// REGLER (Daniels spec):
//   - FRYS under paus (HT/BT/P/SUSP/INT -> status 'paused'): displayMinute = API:ts
//     elapsed, ingen lokal tick. 20 min efter sync i HT får INTE avancera.
//   - Ticka mjukt bara under live (1H/2H/ET): displayMinute = elapsed + minuter
//     sedan sync, MEN kapad vid halvleksgränsen.
//   - CAPA vid halvleksgräns: i 1H aldrig över 45 (visa "45+"), i 2H aldrig över 90
//     (visa "90+"), så vi aldrig HITTAR PÅ tilläggstid. 1H elapsed=44 + 5 min sedan
//     sync -> "45+", inte 49.
//   - Slutlägen (FT/AET/PEN -> 'finished') visas som etikett, ingen tick.
//   - Före avspark ('scheduled') / okänd status: ingen tick, neutral etikett.

import type { LiveStatus } from './live-types';

/** Resultatet av klock-beräkningen, allt UI behöver för att rendera klockan. */
export interface MatchClock {
  /** Mänsklig etikett: "29'", "45+'", "Paus", "Slut", "Förlängning", ... */
  label: string;
  /** Minuten att visa (kapad vid halvleksgräns). Null när ingen minut är relevant. */
  displayMinute: number | null;
  /** Sant bara när klockan faktiskt tickar (live + inte vid taket). Driver UI-animation. */
  ticking: boolean;
}

/** Halvleksgränser (minut) , över dessa visas "+" i stället för påhittad tilläggstid. */
const FIRST_HALF_CAP = 45;
const SECOND_HALF_CAP = 90;
/** Förlängningens normaltak (2 x 15 min ovanpå 90). */
const EXTRA_TIME_CAP = 120;

/**
 * Beräkna matchklockan deterministiskt.
 *
 * @param status      normaliserad status (parse-live.normalizeStatus).
 * @param elapsed     API:ts senast kända spelade minut (null i paus/före avspark).
 * @param lastSyncAt  när `elapsed` senast hämtades (epoch-ms). Klockan tickar från
 *                    denna punkt under live.
 * @param now         nuet (epoch-ms), INJICERAS , aldrig Date.now() inne i funktionen.
 */
export function computeClock(
  status: LiveStatus,
  elapsed: number | null,
  lastSyncAt: number,
  now: number
): MatchClock {
  switch (status) {
    case 'scheduled':
      return { label: 'Ej startad', displayMinute: null, ticking: false };

    case 'finished':
      return { label: 'Slut', displayMinute: null, ticking: false };

    case 'postponed':
      return { label: 'Uppskjuten', displayMinute: null, ticking: false };

    case 'paused':
      // FRYS: visa API:ts elapsed, ingen lokal tick. Tiden sedan sync ignoreras
      // MED FLIT , det är just det som gör att klockan inte springer under pausen.
      return {
        label: 'Paus',
        displayMinute: elapsed,
        ticking: false,
      };

    case 'live':
      return computeLiveClock(elapsed, lastSyncAt, now);

    case 'unknown':
    default:
      // Okänd status , gissa ALDRIG att matchen är live (då hade klockan kunnat
      // springa på en kod vi inte förstår). Neutral, icke-tickande.
      return { label: 'Okänt läge', displayMinute: elapsed, ticking: false };
  }
}

/**
 * Live-grenen: ticka mjukt från senaste sync, men kapa vid halvleksgränsen.
 * Vi vet inte vilken halvlek API:t menar ur enbart 'live'-status, så vi härleder
 * det ur elapsed-värdet (<=45 = första halvlek-fönstret, <=90 = andra, annars
 * förlängning). Det är en härledning ur DATA (elapsed), inte en gissning.
 */
function computeLiveClock(elapsed: number | null, lastSyncAt: number, now: number): MatchClock {
  if (elapsed === null) {
    // Live men API:t gav ingen minut , ticka inte (vi har inget att ticka från).
    return { label: 'Pågår', displayMinute: null, ticking: false };
  }

  // Minuter sedan senaste sync (aldrig negativ , en klocka går inte bakåt även om
  // now råkar ligga före lastSyncAt pga klock-skew).
  const minutesSinceSync = Math.max(0, Math.floor((now - lastSyncAt) / 60_000));
  const projected = elapsed + minutesSinceSync;

  const cap = halfCapFor(elapsed);
  if (projected >= cap) {
    // Vid eller över halvleksgränsen: visa "<cap>+" och sluta ticka. Vi hittar
    // ALDRIG på tilläggstidens längd , den vet bara domaren / nästa API-sync.
    return {
      label: `${cap}+'`,
      displayMinute: cap,
      ticking: false,
    };
  }

  return {
    label: `${projected}'`,
    displayMinute: projected,
    ticking: true,
  };
}

/** Vilken halvleksgräns som gäller givet senast kända elapsed. */
function halfCapFor(elapsed: number): number {
  if (elapsed < FIRST_HALF_CAP) {
    return FIRST_HALF_CAP;
  }
  if (elapsed < SECOND_HALF_CAP) {
    return SECOND_HALF_CAP;
  }
  return EXTRA_TIME_CAP;
}
