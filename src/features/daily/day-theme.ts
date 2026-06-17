// Dynamiskt DAGS-TEMA (T8, issue #8): härled en subtil, deterministisk färgton
// för en speldag ur de lag som spelar den dagen. REN modul (inget I/O, ingen
// React, inga sido-effekter), så hela regeln kan enhetstestas fristående.
//
// VAD det styr (och VAD det ALDRIG styr): dags-temat ger EN dekorativ accent-hue
// (0-359) som designen väver in i DEKORATIVA ytor (hero-gradienter, glow,
// accent-detaljer) ovanpå T2:s token-system. Det rör ALDRIG text-, yt- eller
// kant-tokens som bär läsbarhet. Det är den medvetna KONTRAST-VAKTEN i kod: en
// hue som bara lever i dekor kan aldrig sänka text-kontrasten under WCAG AA,
// eftersom ingen text läggs på den (acceptanskriterium 2, decisions.md T8).
//
// HÄRLEDNINGEN (deterministisk, dokumenterad):
//  - Varje lag som spelar dagen bidrar med sin hue (hueFromCode, samma sanning
//    som TeamFlag:s disc, team-hue.ts).
//  - Dagens accent-hue = den CIRKULÄRA medelriktningen av lagens hues (vektor-
//    medel på färghjulet, INTE ett aritmetiskt medel som skulle wrappa fel kring
//    0/360). Cirkulärt medel är ORDNINGS-OBEROENDE och deterministiskt, så samma
//    uppsättning lag ger alltid samma dags-ton oavsett matchordning, och en
//    premiärdag med många lag (upp till 16) får en stabil, väldefinierad ton i
//    stället för en godtycklig regel.
//
// EDGE-FALL (alla explicita):
//  - VILODAG (inga matcher) -> neutralt DEFAULT-tema (ingen hue), source 'default'.
//  - Bara OKÄNDA lag den dagen (slutspel innan seedningen, homeTeamId/awayTeamId
//    null) -> ingen lag-hue finns, men dagen ska ändå kännas tematiskt distinkt.
//    Fall tillbaka på en hue härledd ur DAGENS DATUM-NYCKEL (deterministisk,
//    stabil per dag), source 'date'. Dokumenterat val, inte en gissning om lag.
//  - OGILTIG DATA (ett icke-null teamId som saknas i lag-uppslaget = brutet
//    referens-kontrakt) -> FAIL LOUD (kastar), maskeras inte tyst (PRINCIPLES §8,
//    lessons: tyst-maskerande-fallback). Ett okänt LAG (teamId null) är däremot
//    ett giltigt slutspels-tillstånd, inte ett fel.

import type { Match, Team } from '../../domain/types';
import { hueFromCode } from './team-hue';

/**
 * Resultatet av dags-tema-härledningen: en dekorativ accent-hue + varifrån den
 * kom (för felsökning/test och för en ärlig "demo/default"-markering i UI:t).
 *
 * `hue` är null bara i default-läget (vilodag). I 'teams'- och 'date'-läget är
 * den ett heltal i [0, 360). Inga andra fält behövs av det funktionella lagret:
 * designen bygger gradienter/glow ur denna enda hue + sina egna tokens.
 */
export interface DayTheme {
  /** Dekorativ accent-hue (0-359), eller null i default-läget (vilodag). */
  hue: number | null;
  /**
   * Varifrån hue:n härleddes:
   *  - 'teams'   : cirkulärt medel av dagens kända lags hues (normalfallet).
   *  - 'date'    : fallback ur datum-nyckeln (bara okända lag den dagen).
   *  - 'default' : ingen härledning (vilodag, inga matcher).
   */
  source: 'teams' | 'date' | 'default';
  /** Antal KÄNDA lag som bidrog till hue:n (0 för 'date'/'default'). */
  teamCount: number;
}

/** Det neutrala dags-temat (ingen färgförskjutning): vilodag/tom dag. */
const DEFAULT_DAY_THEME: DayTheme = { hue: null, source: 'default', teamCount: 0 };

/**
 * Samla de UNIKA, KÄNDA lagen som spelar i en uppsättning matcher, i den ordning
 * de först påträffas. Kastar (fail loud) om en match refererar ett icke-null
 * teamId som inte finns i `teamsById`: det är ett brutet referens-kontrakt i
 * datakällan, inte ett tillstånd att tyst gissa eller hoppa över.
 *
 * Ett `null` teamId (okänt slutspelslag innan seedningen) är INTE ett fel, det
 * hoppas bara över (det laget bidrar ingen hue än).
 */
function collectKnownTeams(
  matches: readonly Match[],
  teamsById: ReadonlyMap<string, Team>
): Team[] {
  const seen = new Set<string>();
  const teams: Team[] = [];
  for (const match of matches) {
    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      if (teamId === null || seen.has(teamId)) {
        continue;
      }
      const team = teamsById.get(teamId);
      if (team === undefined) {
        // Fail loud: ett satt lag-id som inte finns i uppslaget är ett datafel.
        throw new Error(
          `Dags-tema: match "${match.id}" refererar okänt teamId "${teamId}" som saknas i lag-uppslaget.`
        );
      }
      seen.add(teamId);
      teams.push(team);
    }
  }
  return teams;
}

/**
 * Cirkulärt medel (vektor-medel) av en lista hue-grader -> en hue i [0, 360).
 * Varje hue blir en enhetsvektor på färghjulet; vi summerar vektorerna och tar
 * vinkeln av summan. Detta wrappar korrekt kring 0/360 (t.ex. medel av 350 och
 * 10 blir 0, inte 180 som ett naivt aritmetiskt medel skulle ge).
 *
 * Förutsätter en icke-tom lista (anroparen gatar på det). Om vektorsumman är
 * (nära) noll (exakt motsatta hues som tar ut varandra, t.ex. CRO 85 mot QAT 265
 * som är precis antipodala) finns ingen meningsfull medelriktning. Då faller vi
 * tillbaka på den MINSTA hue:n i uppsättningen. Det är ORDNINGS-OBEROENDE (min är
 * oberoende av i vilken ordning lagen samlades in), till skillnad från `hues[0]`
 * som skulle ge olika ton beroende på hemma/borta-ordning för just det antipodala
 * paret. Deterministiskt och aldrig NaN/godtyckligt.
 */
function circularMeanHue(hues: readonly number[]): number {
  let x = 0;
  let y = 0;
  for (const hue of hues) {
    const rad = (hue * Math.PI) / 180;
    x += Math.cos(rad);
    y += Math.sin(rad);
  }
  // Degenererat fall (summan ~0): ingen meningsfull medelriktning. ORDNINGS-
  // OBEROENDE fallback till den minsta hue:n (Math.min är oberoende av insamlings-
  // ordningen) i stället för hues[0] (ordningsberoende) eller atan2(0,0) -> 0
  // (godtyckligt). Nåbart med riktiga koder: ett exakt antipodalt par (CRO/QAT).
  const EPSILON = 1e-9;
  if (Math.abs(x) < EPSILON && Math.abs(y) < EPSILON) {
    return Math.min(...hues);
  }
  let deg = (Math.atan2(y, x) * 180) / Math.PI;
  if (deg < 0) {
    deg += 360;
  }
  // Avrunda till heltals-grad (en hel grad räcker; håller värdet stabilt och
  // jämförbart i test). Modulo 360 så en avrundning av 359.6 -> 360 blir 0.
  return Math.round(deg) % 360;
}

/**
 * Deterministisk hue ur en dag-nyckel ("YYYY-MM-DD"). Återanvänder den delade
 * hash-funktionen (team-hue.ts) så hela appen har EN hash-regel; en datumsträng
 * är bara en annan sträng att sprida över hjulet. Används som fallback när en dag
 * bara har okända lag (slutspel innan seedningen).
 */
function hueFromDateKey(dateKey: string): number {
  return hueFromCode(dateKey);
}

/**
 * Härled dags-temat för EN dag (dess matcher) givet lag-uppslaget.
 *
 * @param matches    Dagens matcher (MatchDay.matches). Tom lista = vilodag.
 * @param teamsById  teamId -> Team (samma uppslag som matchkorten använder).
 * @param dateKey    Dagens svenska kalenderdatum ("YYYY-MM-DD"), för 'date'-
 *                   fallbacken. Valfri: utelämnas den och dagen bara har okända
 *                   lag, faller vi till default i stället för date-fallbacken.
 */
export function deriveDayTheme(
  matches: readonly Match[],
  teamsById: ReadonlyMap<string, Team>,
  dateKey?: string
): DayTheme {
  if (matches.length === 0) {
    return DEFAULT_DAY_THEME; // vilodag / tom dag
  }

  const teams = collectKnownTeams(matches, teamsById);

  if (teams.length === 0) {
    // Bara okända lag (slutspel innan seedningen). Ge dagen en stabil ton ur
    // datumet om vi har det, annars neutralt default (gissar aldrig om lag).
    if (dateKey !== undefined) {
      return { hue: hueFromDateKey(dateKey), source: 'date', teamCount: 0 };
    }
    return DEFAULT_DAY_THEME;
  }

  const hue = circularMeanHue(teams.map((t) => hueFromCode(t.code)));
  return { hue, source: 'teams', teamCount: teams.length };
}
