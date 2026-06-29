// Slutspelsträd-vyn (T9, issue #9): det LEVANDE trädet, sextondel -> final.
//
// Ansvar (senior-devs lager): ladda data via useBracketData och rendera trädet
// som kolumner per runda (sextondel -> åttondel -> kvart -> semi -> final +
// bronsmatch), plus ICKE-happy-path (laddning/fel/tom). Trädet är LIVE,
// useBracketData härleder det reaktivt: en resultatinmatning räknar om både
// möjliga-lag-läget, låsningen och vinnar-propageringen.
//
// FUNKTIONELLT + a11y FÖRST: semantiska landmärken (section + rubrik per runda),
// varje slot som en list-rad med läsbar etikett (gruppvinnare/möjliga lag/lag),
// och stabila DATA-ATTRIBUT som designen bygger premium-trädet ovanpå
// (data-bracket-round, data-bracket-slot, data-slot-resolution, data-winner).
// Den horisontella kolumn-layouten TÅL mobil (overflow-x-auto, en runda i taget),
// och animationen som "drar fram vinnaren" ägs av designen via dessa hakar.
//
// VISUELL DESIGN (design-lagret, ovanpå): premium-bracket med kopplings-
// linjer, vinnar-animation och dags-tema. Strukturen är gjord lätt att styla:
// stabila roller + data-attribut, inga inbakade statusfärger (T7-pin).

import { useMemo, type ReactNode } from 'react';
import type { Team } from '../../domain/types';
import { Fade } from '../../motion';
import { CollapsibleBody } from '../../components/CollapsibleSection';
import { teamDisplayName } from '../daily/match-display';
import { formatKickoffDateShort } from '../daily/format-datetime';
import { TeamFlag } from '../daily/TeamFlag';
import { groupByRound, type BracketSlotState, type BracketMatchResult } from './derive-bracket';
import { useBracketData } from './use-bracket-data';
// Drill-in-seamen (T86): en match-nod kan öppna den DELADE rika matchvyn (stats/tidslinje/
// laguppställning). TOLERANT hook -> null utan provider (fristående/test), då degraderar
// noderna tyst till statiska (ingen ny modal byggs, vi återbrukar openMatch-seamen).
import { useOptionalMatchDetail } from '../match-detail/match-detail-context';
// Premium-trädets visuella lager (kopplings-affordans, vinnar-framhävning,
// avancerings-animation, scroll-edges). Stylas ENBART via seamens data-attribut
// + klass-hakar nedan, så senior-devs semantik + alla tester står kvar.
import './bracket.css';

/**
 * Trädets stege, vänster -> höger, som ett litet ordningstal per runda. Ger
 * varje runda-rubrik en redaktionell numrerad marker (1..6) så ögat följer
 * progressionen mot finalen. En sanning, knyts till stage (inte till index, så
 * ordningen är stabil oavsett ev. framtida filtrering).
 */
const ROUND_STEP: Readonly<Record<string, number>> = {
  'round-of-32': 1,
  'round-of-16': 2,
  'quarter-final': 3,
  'semi-final': 4,
  // Bronsmatchen spelas FÖRE finalen (C4): brons=5, final=6, samma kalender-
  // ordning som ROUND_ORDER i derive-bracket (källhänvisad mot T4:s tablå).
  'third-place': 5,
  final: 6,
};

/** Bygg ett snabbt teamId -> Team-uppslag (en gång per lag-lista). */
function indexTeams(teams: readonly Team[]): Map<string, Team> {
  return new Map(teams.map((t) => [t.id, t]));
}

/**
 * Grammatiskt korrekt antals-text för skärmläsaren: "1 match", "16 matcher".
 * Svenskt en-ord ("match") böjs i plural ("matcher"). Final/bronsmatch har
 * exakt 1 match, så utan böjning läses "Final (1 matcher)" upp, grammatiskt fel.
 */
function matchCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'match' : 'matcher'}`;
}

/**
 * Grammatiskt korrekt antal möjliga lag (C10, samma böjnings-mönster som
 * matchCountLabel). "Lag" är ett neutrum-ord, så adjektivet böjs "möjligt" i
 * singular och "möjliga" i plural: "1 möjligt lag" / "4 möjliga lag". En slot
 * kan ha exakt 1 kvarvarande kandidat (t.ex. när alla utom ett alternativ är
 * uteslutet), och då läses "1 möjliga lag" upp, grammatiskt fel.
 */
function possibleTeamsLabel(count: number): string {
  return `${count} ${count === 1 ? 'möjligt' : 'möjliga'} lag`;
}

/**
 * Visnings-texten för en slot, beroende på dess tillstånd:
 *   - resolved: lagets namn (gissas aldrig, "Ej klart" om uppslaget saknar det).
 *   - preliminary (T56): det NUVARANDE ledar-lagets namn, så man ser ett konkret
 *     lag röra sig i trädet redan under gruppspelet. Det märks ÄRLIGT som
 *     preliminärt (se nedan), aldrig som facit.
 *   - possible/tbd: positions-etiketten ("1:a grupp E", "3:a A/B/C/D/F",
 *     "Vinnare M89"), så användaren ser VAR laget kommer ifrån även innan det
 *     är känt.
 */
function slotText(slot: BracketSlotState, teamsById: ReadonlyMap<string, Team>): string {
  if (
    (slot.resolution === 'resolved' || slot.resolution === 'preliminary') &&
    slot.teamId !== null
  ) {
    return teamDisplayName(slot.teamId, teamsById);
  }
  return slot.label;
}

/** FIFA-koden (för flaggan) för ett lag-id, eller null om okänt/saknas. */
function teamCodeOf(teamId: string | null, teamsById: ReadonlyMap<string, Team>): string | null {
  if (teamId === null) {
    return null;
  }
  return teamsById.get(teamId)?.code ?? null;
}

/**
 * Flagg-emblemet för en slot, eller en neutral platshållar-disc när laget ännu är
 * okänt (possible/tbd). Platshållaren håller radens vänster-rytm lika med lag-raderna
 * (samma diameter som flaggan) och signalerar FÄRG-OBEROENDE (form + "?") att platsen
 * inte är fylld än, så ögat skiljer "lag står här" från "öppen plats" utan färg.
 */
function SlotFlag({ code }: { code: string | null }) {
  if (code) {
    return <TeamFlag code={code} size="sm" />;
  }
  return (
    <span
      aria-hidden="true"
      className="vm-bracket-slot-flag-empty inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-pill text-[0.6875rem] font-bold text-fg-muted"
    >
      ?
    </span>
  );
}

/**
 * "Säkrad"-brickan: lyfter en SÄKRAD PLATS, ett lag som AVANCERAT in i sin nästa rundas slot
 * (resolution='resolved' i en runda EFTER sextondelen, ännu inte vidare-vinnare härifrån).
 * Daniels önskemål #2: ett lag som säkrat sin plats i nästa fas (t.ex. Kanada i åttondelen)
 * ska sticka ut, över ALLA rundor. Ersätter den gamla "Klar"-markören, som lästes som att
 * MATCHEN var spelad.
 *
 * FÄRG-OBEROENDE: en dubbel-chevron-glyf (form, "avancerat framåt i trädet") + ordet "Säkrad"
 * (text). ACCENT-ton (turneringens framåt-energi, samma familj som vinnar-medaljen/"Vidare",
 * men lugnare), så avancemanget syns men inte skriker. AA-mätt recept i bracket.css. Den
 * dubbla chevronen skiljs medvetet från "Vidare"-pilens ENKLA pil (olika form) så de inte
 * förväxlas: "Vidare" = lämnade en spelad match, "Säkrad" = kom in i en kommande match.
 */
function SecuredBadge() {
  return (
    <span
      data-slot-secured-badge=""
      className="vm-bracket-secured-badge inline-flex shrink-0 items-center gap-1 rounded-pill px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide"
    >
      <svg
        aria-hidden="true"
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 17 5-5-5-5" />
        <path d="m13 17 5-5-5-5" />
      </svg>
      Säkrad
    </span>
  );
}

/**
 * Avsparksdag-brickan (Daniels önskemål #1): visar NÄR en KOMMANDE match spelas (båda lag
 * kända men ospelad), i match-huvudet, i stället för den tvetydiga "klar"-markören. En lugn,
 * INFORMATIV neutral pill (fg-muted på svag neutral tint, AA i båda teman) med en kalender-
 * glyf. Medvetet NEUTRAL: datumet är fakta om schemat, varken facit (guld) eller avancemang
 * (accent). Texten är LÄSBAR för skärmläsare via aria-label ("Spelas <dag>"), kalender-glyfen
 * är ren dekor.
 */
function DateBadge({ kickoff }: { kickoff: string }) {
  const day = formatKickoffDateShort(kickoff);
  return (
    <span
      data-bracket-date=""
      aria-label={`Spelas ${day}`}
      className="vm-bracket-date inline-flex shrink-0 items-center gap-1 rounded-pill px-1.5 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-wide"
    >
      <svg
        aria-hidden="true"
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
      <span aria-hidden="true">{day}</span>
    </span>
  );
}

/**
 * "Vidare"-brickan på vinnar-raden i en AVGJORD match (Daniels önskemål: avancemang ska
 * synas TYDLIGT, inte bara den diskreta medaljen). FÄRG-OBEROENDE: en pil-glyf (form) +
 * ordet "Vidare". aria-hidden, eftersom slot-radens sr-only "(vidare)" redan läses upp
 * (ingen dubbel-uppläsning). Accent-ton = turneringens framåt-energi (samma språk som
 * vinnar-medaljen), AA-mätt recept i bracket.css.
 */
function AdvanceBadge() {
  return (
    <span
      data-slot-advance=""
      aria-hidden="true"
      className="vm-bracket-advance-badge inline-flex shrink-0 items-center gap-1 rounded-pill px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide"
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </svg>
      Vidare
    </span>
  );
}

/**
 * "Avgjord"-statusen i en avgjord matchs huvud: matchen är spelad, facit finns. FACIT-
 * SPRÅK = GULD (samma som reveal-facit: "domen är fälld"), skilt från den GRÖNA accenten
 * (= live/pågår). FÄRG-OBEROENDE: en check-glyf (form) + ordet "Avgjord", LÄSBAR (ej
 * aria-hidden) så skärmläsaren får match-statusen. --color-warning är den AA-mätta guld-
 * texten (aldrig rå --vm-gold som text, guld-på-tint-fällan).
 */
function DecidedBadge() {
  return (
    <span
      data-bracket-decided=""
      className="vm-bracket-decided inline-flex shrink-0 items-center gap-1 rounded-pill px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide"
    >
      <svg
        aria-hidden="true"
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
      Avgjord
    </span>
  );
}

/**
 * Drill-in-affordansen i en klickbar match-nods huvud (Daniels önskemål #3): en TYDLIG,
 * ALLTID synlig "öppna matchfakta"-cue, så man vet att noden går att öppna även utan hover
 * (funkar på mobil). Den gamla lösningen var bara en diskret 12px-chevron som många missade.
 *
 * En liten pill-formad cue: ett stapel-/statistik-glyf (antyder den rika matchvyns innehåll)
 * + texten "Matchfakta" + en chevron (universell "öppna"-signal). ACCENT-tonad så den läser
 * som interaktiv (samma konvention som länkar), men lugn. Ren dekoration (aria-hidden):
 * overlay-knappens aria-label bär den tillgängliga beskrivningen av åtgärden, så cue:n inte
 * dubbel-läses. data-bracket-open-cue är design/test-seam.
 */
function OpenCue() {
  return (
    <span
      data-bracket-open-cue=""
      aria-hidden="true"
      className="vm-bracket-open-cue inline-flex shrink-0 items-center gap-1 rounded-pill px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide"
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 3v18h18" />
        <path d="M7 15l3-4 3 2 4-6" />
      </svg>
      Matchfakta
      <svg
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="vm-bracket-open-cue-chevron"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </span>
  );
}

/** Hur många kandidat-chips som visas innan resten fälls till "+N" (smal cell). */
const MAX_CANDIDATE_CHIPS = 4;

/**
 * "Alternativen" för en obestämd slot (possible/tbd): de lag som ÄNNU kan ta platsen,
 * som små flagg+namn-chips i stället för bara en räknare , så man SER vilka som slåss
 * om platsen i åttondel/kvart/semi/final, inte bara "2 möjliga". Vid fler än
 * MAX_CANDIDATE_CHIPS (tidig gruppspels-slot med många kandidater) visas de första +
 * en "+N"-chip, så cellen aldrig svämmar över. aria-label bär HELA sanningen (alla
 * namn + antal) för skärmläsaren, oavsett trunkeringen i bild.
 *
 * Exporterad för enhetstest (alternativ-renderingen, ersätter C10:s räknar-chip).
 */
export function CandidateChips({
  candidateTeamIds,
  teamsById,
}: {
  candidateTeamIds: readonly string[];
  teamsById: ReadonlyMap<string, Team>;
}) {
  const count = candidateTeamIds.length;
  if (count === 0) {
    return null;
  }
  const shown = candidateTeamIds.slice(0, MAX_CANDIDATE_CHIPS);
  const overflow = count - shown.length;
  const allNames = candidateTeamIds.map((id) => teamDisplayName(id, teamsById));
  // Hela sanningen för skärmläsaren: alla möjliga lag + det böjda antalet (C10-böjningen
  // bevaras i aria, även när chipsen i bild trunkeras till "+N").
  const ariaLabel = `Möjliga lag (${possibleTeamsLabel(count)}): ${allNames.join(', ')}`;

  return (
    <span
      data-bracket-alts=""
      className="vm-bracket-slot-alts mt-1 flex flex-wrap items-center gap-1"
      aria-label={ariaLabel}
    >
      {shown.map((id) => {
        const code = teamCodeOf(id, teamsById);
        return (
          <span
            key={id}
            data-bracket-candidate=""
            className="vm-bracket-candidate inline-flex items-center gap-1 rounded-pill px-1 py-0.5"
          >
            {code ? <TeamFlag code={code} size="xs" /> : null}
            <span className="max-w-[6.5rem] truncate text-[0.6875rem] font-medium text-fg-muted">
              {teamDisplayName(id, teamsById)}
            </span>
          </span>
        );
      })}
      {overflow > 0 ? (
        <span
          data-bracket-candidate-overflow=""
          className="vm-bracket-candidate inline-flex items-center rounded-pill px-1.5 py-0.5 text-[0.6875rem] font-semibold text-fg-muted"
        >
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

/**
 * En slot-rad i en slutspelsmatch. Stabil semantik + data-attribut (design-seam):
 *   - data-bracket-slot: hakar varje slot.
 *   - data-slot-resolution: resolved | preliminary | possible | tbd (design tonsätter).
 *   - data-winner: satt på den slot vars lag vann matchen (vinnar-framhävning).
 *   - data-slot-secured: en SÄKRAD PLATS (ett lag som avancerat in i sin nästa rundas slot),
 *     accent-lyft över alla rundor (Daniels önskemål #2).
 *   - data-bracket-alts: "alternativen" (möjliga lag) för en obestämd slot.
 *
 * LAGEN SYNS BÄTTRE (Daniels önskemål): ett fyllt lag (resolved/preliminary) bär nu
 * sin FLAGGA + namn, en obestämd plats bär en platshållar-disc + sina ALTERNATIV
 * (kandidatlag som flagg-chips), så trädet visar konkreta lag hela vägen mot finalen
 * i stället för bara "Vinnare M89" / en räknare.
 */
// Exporterad för enhetstest av slot-rendering. Renderas i produktion via MatchCard nedan.
export function SlotRow({
  slot,
  teamsById,
  isWinner,
  isLoser = false,
  goals = null,
  penaltyGoals = null,
  matchPending = false,
}: {
  slot: BracketSlotState;
  teamsById: ReadonlyMap<string, Team>;
  isWinner: boolean;
  /** Slogs denna slot ut (resolved icke-vinnare i en AVGJORD match)? Då dämpas raden. */
  isLoser?: boolean;
  /** Lagets mål (ordinarie) när matchen är spelad, annars null (visa ingen siffra). */
  goals?: number | null;
  /** Lagets straffmål om matchen avgjordes på straffar, annars null. */
  penaltyGoals?: number | null;
  /**
   * Väntar den containande matchen ÄNNU på sitt andra lag (motståndaren ej känd)? Då bär en
   * SÄKRAD plats även en "Säkrad"-bricka (förtydligar "laget är inne, matchen ej satt än").
   * När matchen är KLAR att spelas (båda lag kända) bär datum-brickan i huvudet "när", så
   * raden behöver inte upprepa texten, bara accent-lyftet (lugnare, mindre rörigt).
   */
  matchPending?: boolean;
}) {
  const text = slotText(slot, teamsById);
  const isResolved = slot.resolution === 'resolved';
  const isPreliminary = slot.resolution === 'preliminary';
  // Ett FYLLT lag (resolved eller preliminärt) bär sin flagga; en obestämd plats visar
  // i stället sina alternativ (kandidatlag) nedanför positions-etiketten.
  const hasTeam = (isResolved || isPreliminary) && slot.teamId !== null;
  const code = hasTeam ? teamCodeOf(slot.teamId, teamsById) : null;
  const candidates = hasTeam ? [] : slot.candidateTeamIds;
  // SÄKRAD PLATS (Daniels #2): ett lag som AVANCERAT in i sin nästa rundas slot, resolved
  // men matchen härifrån ännu ospelad (varken vinnare eller utslagen). Bara i rundor EFTER
  // sextondelen (round-of-32): en R32-slot fylls av GRUPP-seedningen (inträdet i slutspelet),
  // inte av en slutspelsvinst, så att märka alla 32 som "säkrade" vore brus, det meningsfulla
  // är att lyfta dem som tagit sig VIDARE via en vinst. Strukturen garanterar att R16+-slots
  // alltid kommer från en match-progression (vinnare/förlorare av Mxx), R32 alltid från grupp.
  const secured = isResolved && !isWinner && !isLoser && slot.stage !== 'round-of-32';
  // "Säkrad"-brickan visas bara när matchen ännu väntar på motståndaren (se matchPending).
  const showSecuredBadge = secured && matchPending;
  const hasGoals = goals !== null;
  // Lagnamnets ton: vinnare/resolved i full kontrast + fet; en utslagen resolved-rad dämpas
  // (medium + muted) så vinnaren tydligt sticker ut; obestämd/preliminär dämpad som förut.
  const nameTone = isLoser
    ? 'font-medium text-fg-muted'
    : isResolved
      ? 'font-semibold text-fg'
      : 'text-fg-muted';

  return (
    <li
      data-bracket-slot=""
      data-slot-resolution={slot.resolution}
      data-winner={isWinner ? '' : undefined}
      data-slot-eliminated={isLoser ? '' : undefined}
      data-slot-secured={secured ? '' : undefined}
      className="vm-bracket-slot flex items-start gap-2 px-2.5 py-1.5"
    >
      {/* FLAGGA (eller platshållare): lyfter lag-igenkänningen, vänsterställd som ett ankare. */}
      <SlotFlag code={code} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex min-w-0 items-center gap-1.5">
          {/* En resolved slot bär lagnamnet i full kontrast; en obestämd/preliminär/utslagen
              slot bär sitt namn dämpat, så hierarkin syns utan färg-beroende.
              .vm-bracket-slot-name bär den FÄRG-OBEROENDE vinnar-medaljens glyf (CSS-pseudo
              ::after), så bocken syns i gråskala/för färgblinda. */}
          <span
            className={`vm-bracket-slot-name min-w-0 truncate text-[0.8125rem] ${nameTone}`}
            title={text}
          >
            {text}
          </span>
          {isWinner ? <span className="sr-only"> (vidare)</span> : null}
          {/* En utslagen rad får en FÄRG-OBEROENDE sr-only-etikett (skärmläsare hör "utslagen"),
              den visuella dämpningen + vinnarens lyft bär det för seende. */}
          {isLoser ? <span className="sr-only"> (utslagen)</span> : null}
          {/* AVANCEMANG: vinnaren bär en tydlig "Vidare"-pill (utöver medaljen). */}
          {isWinner ? <AdvanceBadge /> : null}
          {/* SÄKRAD PLATS: ett lag som avancerat hit och väntar på sin motståndare (#2). */}
          {showSecuredBadge ? <SecuredBadge /> : null}
        </span>
        {isPreliminary ? (
          // Under lagnamnet: dess NUVARANDE position ("1:a grupp E") + att det är
          // preliminärt, så ett preliminärt lag aldrig läses som facit. aria-label
          // ger skärmläsaren hela sanningen i en mening.
          <span
            data-slot-preliminary=""
            className="vm-bracket-slot-prelim min-w-0 truncate text-[0.625rem] font-medium uppercase tracking-wide text-fg-muted"
            aria-label={`${slot.label}, nuvarande ställning (inte klart)`}
          >
            {slot.label} · nu
          </span>
        ) : null}
        {/* ALTERNATIVEN: kandidatlagen för en obestämd plats, som flagg-chips. */}
        {candidates.length > 0 ? (
          <CandidateChips candidateTeamIds={candidates} teamsById={teamsById} />
        ) : null}
      </span>
      {/* RESULTATET PÅ NODEN (Daniels önskemål): lagets mål när matchen är spelad. Vinnaren
          i full kontrast + fet, förloraren dämpad, så slutställningen läses på en blink.
          Straffsiffror i parentes ("1 (4)") när matchen avgjordes på straffar (FIFA Art. 14). */}
      {hasGoals ? (
        <span
          data-bracket-slot-score=""
          className={`vm-bracket-slot-score shrink-0 self-center text-right ${
            isWinner ? 'font-bold text-fg' : 'font-semibold text-fg-muted'
          }`}
        >
          {goals}
          {penaltyGoals !== null ? (
            <span className="vm-bracket-slot-pens ml-0.5 text-[0.625rem] font-semibold text-fg-muted">
              ({penaltyGoals})
            </span>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

/** Är BÅDA en slutspels-slots lag slutgiltigt kända (resolved)? Då kan matchen öppnas. */
function bothTeamsResolved(home: BracketSlotState, away: BracketSlotState): boolean {
  return (
    home.resolution === 'resolved' &&
    home.teamId !== null &&
    away.resolution === 'resolved' &&
    away.teamId !== null
  );
}

/**
 * Ett match-kort i trädet: dess två slots (hemma/borta) med en avdelare + matchnummer-
 * huvud. Bär TRE TYDLIGT ÅTSKILDA tillstånd (Daniels turnering-lyft, inget får läsas som
 * ett annat):
 *   - AVGJORD (winnerSlotId satt): match-huvudet visar "Avgjord", varje slot-rad bär sitt
 *     RESULTAT (mål, + ev. straffar), vinnaren lyfts (medalj + "Vidare") och förloraren
 *     dämpas, så avgjort resultat + avancemang syns på en blick.
 *   - KOMMANDE / ready (båda lag kända, ej spelad): match-huvudet visar AVSPARKSDAGEN
 *     ("spelas 5 juli", #1), så man ser NÄR matchen spelas. Ett lag som avancerat hit bär
 *     säkrad-plats-lyftet (#2). Noden är klickbar -> rik matchvy (drill-in).
 *   - VÄNTAR / pending (minst ett lag ej känt): neutralt, positions-etiketter/alternativ
 *     på de obestämda raderna. Ett redan AVANCERAT lag (känt) bär säkrad-plats-lyftet +
 *     "Säkrad"-brickan (det är inne, motståndaren ej klar än). Ingen drill-in.
 *
 * DRILL-IN (T86-seamen, återbrukad): en nod med båda lag kända blir en klickbar yta som
 * öppnar den DELADE rika matchvyn (stats/tidslinje/laguppställning) via openMatch(matchId).
 * En riktig <button> (overlay), inte en klickbar div, så den nås med tangentbord + har rätt
 * roll (samma princip som MatchDetailTrigger). `onOpen` null -> ingen drill-in (degraderar
 * tyst, t.ex. utan MatchDetailProvider i enhetstest). En ALLTID synlig "Matchfakta"-cue (#3)
 * gör drill-in upptäckbar även utan hover (mobil).
 */
function MatchCard({
  matchId,
  home,
  away,
  winnerSlotId,
  result,
  kickoff,
  teamsById,
  onOpen,
}: {
  matchId: string;
  home: BracketSlotState;
  away: BracketSlotState;
  winnerSlotId: string | null;
  result: BracketMatchResult | null;
  kickoff: string | null;
  teamsById: ReadonlyMap<string, Team>;
  onOpen: ((matchId: string) => void) | null;
}) {
  const decided = winnerSlotId !== null;
  const homeWinner = winnerSlotId === home.id;
  const awayWinner = winnerSlotId === away.id;
  const teamsKnown = bothTeamsResolved(home, away);
  const canOpen = onOpen !== null && teamsKnown;
  // data-bracket-match-state: ett stabilt avläsbart tillstånd för design + test.
  const matchState = decided ? 'decided' : teamsKnown ? 'ready' : 'pending';
  // KOMMANDE match (båda lag kända, ospelad) med känd avsparkstid -> visa dagen i huvudet.
  const showDate = matchState === 'ready' && kickoff !== null;
  // Väntar matchen på sitt andra lag? Då bär en säkrad plats även "Säkrad"-brickan (se SlotRow).
  const matchPending = matchState === 'pending';

  return (
    <article
      data-bracket-match={matchId}
      data-bracket-match-state={matchState}
      className={`vm-bracket-match relative overflow-hidden rounded-card border border-border bg-surface shadow-[var(--vm-shadow-card)] ${
        canOpen ? 'vm-bracket-match--clickable' : ''
      }`}
    >
      {/* MATCH-HUVUD: matchnummer (orienterings-dekor, aria-hidden) + status. "Avgjord" (facit)
          och datum-brickan ("spelas <dag>") är LÄSBARA för skärmläsare; "Matchfakta"-cue:n är
          den alltid synliga drill-in-affordansen (aria-hidden, overlay-knappen bär etiketten). */}
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-2.5 py-1">
        <span
          aria-hidden="true"
          className="font-display text-[0.625rem] font-semibold uppercase tracking-wide text-fg-muted"
        >
          {matchId}
        </span>
        <span className="flex items-center gap-1.5">
          {decided ? <DecidedBadge /> : null}
          {showDate ? <DateBadge kickoff={kickoff} /> : null}
          {canOpen ? <OpenCue /> : null}
        </span>
      </header>
      <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
        <SlotRow
          slot={home}
          teamsById={teamsById}
          isWinner={homeWinner}
          isLoser={decided && !homeWinner}
          goals={result ? result.homeGoals : null}
          penaltyGoals={result?.penalties ? result.penalties.homeGoals : null}
          matchPending={matchPending}
        />
        <SlotRow
          slot={away}
          teamsById={teamsById}
          isWinner={awayWinner}
          isLoser={decided && !awayWinner}
          goals={result ? result.awayGoals : null}
          penaltyGoals={result?.penalties ? result.penalties.awayGoals : null}
          matchPending={matchPending}
        />
      </ul>
      {/* DRILL-IN-OVERLAY: en stretchad knapp som täcker noden (stretched-link-mönstret), så
          hela kortet öppnar matchvyn med EN tydlig knapp i stället för nästlade interaktiva
          element. Slot-raderna är icke-interaktiva (spans), så ingen klick-konflikt. */}
      {canOpen ? (
        <button
          type="button"
          data-bracket-match-open=""
          onClick={() => onOpen(matchId)}
          aria-label={`Öppna matchfakta: ${teamDisplayName(home.teamId, teamsById)} mot ${teamDisplayName(
            away.teamId,
            teamsById
          )}`}
          className="absolute inset-0 z-10 rounded-card outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
        />
      ) : null}
    </article>
  );
}

/**
 * En runda som en KOLUMN av matchkort, med en rubrik. Kolumnen har en fast min-
 * bredd så rundorna ligger sida vid sida och hela trädet kan scrollas horisontellt
 * på smala skärmar (overflow-x-auto på containern), i stället för att klämmas ihop.
 */
function RoundColumn({
  label,
  matchCount,
  children,
  stage,
}: {
  label: string;
  matchCount: number;
  stage: string;
  children: ReactNode;
}) {
  const step = ROUND_STEP[stage] ?? 0;
  const isFinal = stage === 'final';
  return (
    <section
      data-bracket-round={stage}
      aria-label={`${label} (${matchCountLabel(matchCount)})`}
      className="vm-bracket-round flex w-60 shrink-0 flex-col gap-3"
    >
      {/* Rubrik-rad: numrerad marker (progression mot finalen) + runda-namn.
          Finalen får en guld-ton på markern + rubriken (FÄRG-OBEROENDE krona:
          guld signalerar mästerskap, men formen/numret bär ändå hierarkin). */}
      <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide">
        <span
          aria-hidden="true"
          className="vm-bracket-round-marker"
          style={
            // FINALEN: en SOLID guld-bricka med mörk ink-text (samma färg-oberoende
            // AA-säkra mönster som "Dagens match"-chippet, T7-pin). Guld-text på vit
            // yta föll under AA (uppmätt 3.29:1 i ljust tema); solid guld + near-black
            // ink ger garanterad AA i BÅDA teman (guld är ljus/mellanljus i båda).
            isFinal
              ? {
                  borderColor: 'transparent',
                  backgroundColor: 'var(--vm-gold)',
                  color: '#1c1403',
                }
              : undefined
          }
        >
          {step}
        </span>
        <span className={isFinal ? 'text-fg' : 'text-fg-muted'}>{label}</span>
      </h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function BracketView() {
  // Läser den DELADE results-storen via useBracketData (samma store som
  // gruppspelet + inmatningen). Måste renderas inuti en <ResultsProvider>.
  const { status, bracket, teams, mode, error } = useBracketData();
  const teamsById = useMemo(() => indexTeams(teams), [teams]);
  const rounds = useMemo(() => (bracket ? groupByRound(bracket) : []), [bracket]);
  // Drill-in: finns MatchDetailProvider (appen) blir match-noderna klickbara -> rik matchvy.
  // Saknas den (fristående/test) är seamen null och noderna är statiska (ingen krasch).
  const matchDetail = useOptionalMatchDetail();
  const openMatch = matchDetail?.openMatch ?? null;

  // BONUS-STAT (wow inför slutspelet): hur långt trädet har avgjorts. Ren härledning
  // ur det redan härledda trädet (winnerSlotId per match), ingen ny datakälla.
  const progress = useMemo(() => {
    if (!bracket) {
      return { decided: 0, total: 0 };
    }
    const decided = bracket.matches.filter((m) => m.winnerSlotId !== null).length;
    return { decided, total: bracket.matches.length };
  }, [bracket]);

  // VÄRLDSMÄSTAREN: finalens vinnar-slot, men BARA när finalen faktiskt är avgjord
  // (winnerSlotId satt). Annars null , vi gissar aldrig en mästare i förväg.
  const championTeamId = useMemo(() => {
    const finalMatch = bracket?.matches.find((m) => m.stage === 'final');
    if (!finalMatch || finalMatch.winnerSlotId === null) {
      return null;
    }
    const champ = [finalMatch.home, finalMatch.away].find((s) => s.id === finalMatch.winnerSlotId);
    return champ?.teamId ?? null;
  }, [bracket]);
  const championCode = teamCodeOf(championTeamId, teamsById);
  // Progress-sammanfattningen är meningsfull FÖRST när trädet är låst (slutspelet är
  // seedat med riktiga lag); under gruppspelet bär "Nuvarande ställning"-pillen läget.
  const showProgress = bracket?.locked === true;

  return (
    <section aria-labelledby="slutspel-rubrik" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="slutspel-rubrik" className="font-display text-xl font-semibold sm:text-2xl">
            Slutspelsträdet
          </h2>
          {mode === 'fixtures' ? <span className="vm-demo-chip">Demo-data</span> : null}
          {/* "Låst"-märke när grupperna är klara: nu är slotarna riktiga lag. */}
          {bracket?.locked ? (
            <span
              data-bracket-locked=""
              className="rounded-pill border border-border px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-fg-muted"
            >
              Låst seedning
            </span>
          ) : null}
          {/* PRELIMINÄR-märke (T56): under gruppspelet visas det NUVARANDE läget med
              konkreta lag. ÄRLIGT märkt så ingen tror att det är klart, samma anda
              som T51:s simulering. Visas bara när trädet faktiskt har preliminära lag.

              VISUELL FAMILJ (T56-finish): samma LEVANDE accent-pågår-pill som tips-
              avslöjandets "Pågår"-bricka (T55), inte en guld-VARNINGS-ton. Grön accent
              = turneringens energi ("ställningen lever, rör sig vid varje resultat"),
              guld är reserverat för det AVGJORDA (facit/final). En pulsande prick +
              ordet bär budskapet FÄRG-OBEROENDE (formen syns i gråskala / för färgblind
              / vid reducerad rörelse, då pricken blir statisk). AA: accent-text på den
              lätta 9%-accent-tinten = 8.10:1 mörkt / 4.77:1 ljust (samma mätta recept
              som .vm-reveal-pending, DRY). Den gamla guld-som-text-på-12%-guld-tinten
              föll under AA i ljust tema (uppmätt 3.17:1, den kända guld-på-tint-fällan). */}
          {bracket?.preliminary ? (
            <span
              data-bracket-preliminary=""
              className="vm-bracket-prelim-pill inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide"
            >
              <span aria-hidden="true" className="vm-pending-dot" />
              Nuvarande ställning
            </span>
          ) : null}
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          {bracket?.preliminary ? (
            // Den ärliga meningen när trädet visar nuvarande ställning: konkreta lag
            // syns och rör sig vid varje resultat, men inget är klart förrän
            // grupperna är färdigspelade. Ingen tvetydighet om vad man ser (T56).
            <>
              Trädet visar <strong className="font-semibold text-fg">nuvarande ställning</strong>:
              gruppernas 1:or och 2:or och de 8 bästa treorna (FIFA-seedningen) fyller platserna
              preliminärt och rör sig vid varje inmatat resultat.{' '}
              <strong className="font-semibold text-fg">Inte klart</strong> förrän grupperna är
              färdigspelade, då låses trädet till de riktiga lagen.
            </>
          ) : (
            <>
              Sextondel till final. Under gruppspelet visar trädet det nuvarande läget, det låses
              när grupperna är klara (FIFA-seedningen), och vinnaren förs fram automatiskt när ett
              slutspelsresultat matas in.
            </>
          )}
        </p>
      </header>

      {/* PROGRESS / VÄRLDSMÄSTARE (bonus-wow): en sammanfattning ovanför trädet, alltid
          synlig (utanför komprimeringen), men BARA när slutspelet är låst (riktiga lag).
          Är finalen avgjord lyfts världsmästaren med guld-signatur (trädets krona); annars
          visas hur många slutspelsmatcher som avgjorts med en slank progress-bar, så man
          ser slutspelet röra sig mot finalen. Rena härledningar, ingen ny datakälla. */}
      {showProgress ? (
        championTeamId ? (
          <div
            data-bracket-champion=""
            className="vm-bracket-champion flex items-center gap-3 rounded-card border px-4 py-3"
          >
            <span aria-hidden="true" className="vm-bracket-champion-trophy">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            </span>
            {championCode ? <TeamFlag code={championCode} size="md" /> : null}
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="font-display text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-fg-muted">
                Världsmästare
              </span>
              <span className="truncate font-display text-lg font-semibold text-fg">
                {teamDisplayName(championTeamId, teamsById)}
              </span>
            </span>
          </div>
        ) : (
          <div data-bracket-progress="" className="vm-bracket-progress flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-display text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-fg-muted">
                Slutspelet
              </span>
              <span className="text-xs font-semibold text-fg">
                {progress.decided} av {progress.total} matcher avgjorda
              </span>
            </div>
            <div
              className="vm-bracket-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.decided}
              aria-label={`Slutspelet: ${progress.decided} av ${progress.total} matcher avgjorda`}
            >
              <span
                className="vm-bracket-progress-fill"
                style={{
                  width: `${progress.total > 0 ? (progress.decided / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )
      ) : null}

      {/* EXPANDERAT FRÅN START (2026-06-28, Daniels önskemål): slutspelet är det som gäller
          nu, så hela trädet visas direkt (startExpanded) , man ska inte behöva fälla ut det.
          Komprimeringen finns kvar som en MÖJLIGHET (en "Visa mindre"-toggel) för den som vill
          fälla ihop; collapsedMaxHeight styr då hur stor toppen blir. Trädet scrollar i sidled,
          faden tonar mot app-bakgrunden. */}
      <CollapsibleBody
        name="bracket"
        toggleLabels={{ expand: 'Visa hela slutspelsträdet', collapse: 'Visa mindre av trädet' }}
        collapsedMaxHeight="22rem"
        startExpanded
        fadeTo="var(--color-bg)"
      >
        {status === 'loading' ? (
          <p role="status" className="text-sm text-fg-muted">
            Laddar slutspelsträdet ...
          </p>
        ) : null}

        {status === 'error' ? (
          <Fade>
            <p
              role="alert"
              className="flex items-start gap-3 rounded-card border px-4 py-3 text-sm"
              style={{
                borderColor: 'color-mix(in srgb, var(--color-danger) 50%, transparent)',
                backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
                color: 'var(--color-danger)',
              }}
            >
              <span aria-hidden="true" className="mt-0.5 text-base leading-none">
                !
              </span>
              <span>Kunde inte ladda slutspelsträdet: {error}</span>
            </p>
          </Fade>
        ) : null}

        {status === 'ready' && rounds.length > 0 ? (
          // vm-bracket: positions-kontext för scroll-edge-maskeringen + hinten.
          // Trädet är brett till sin natur, så scrollen är en FEATURE (mjuka kant-
          // toningar + en mobil scroll-hint), inte ett misslyckande.
          <div className="vm-bracket flex flex-col gap-2">
            {/* Scroll-hint: bara på smala skärmar (CSS döljer den >= 1024px), där
              trädet garanterat svämmar över. En affordans, inte interaktiv. */}
            <p
              aria-hidden="true"
              className="vm-bracket-hint self-end text-[0.6875rem] font-medium uppercase tracking-wide text-fg-muted"
            >
              Svep i sidled
              <span className="vm-bracket-hint-arrow" aria-hidden="true">
                →
              </span>
            </p>
            {/* overflow-x-auto (seam): trädet scrollas i sidled på smala skärmar i
              stället för att klämmas ihop (rundorna har fast bredd). Detta är den
              responsiva grunden; vm-bracket-scroll lägger kant-maskeringen ovanpå.

              A11y (T25, axe scrollable-region-focusable): en scrollbar yta MÅSTE nås
              med tangentbordet, annars kan en tangentbords-användare inte se det som
              ligger utanför vyporten. När slottarna är tomma (gruppspel ej klart) finns
              inga fokuserbara barn att tabba till, så själva ytan får tabIndex={0} +
              ett role="group" med ett tydligt namn, så piltangenterna kan scrolla den. */}
            <div
              data-bracket-scroll=""
              role="group"
              aria-label="Slutspelsträdet, bläddra i sidled"
              tabIndex={0}
              className="vm-bracket-scroll -mx-1 overflow-x-auto px-1 pb-2 outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
            >
              <div className="flex min-w-max gap-5">
                {rounds.map((round) => (
                  <RoundColumn
                    key={round.stage}
                    stage={round.stage}
                    label={round.label}
                    matchCount={round.matches.length}
                  >
                    {round.matches.map((match) => (
                      <MatchCard
                        key={match.matchId}
                        matchId={match.matchId}
                        home={match.home}
                        away={match.away}
                        winnerSlotId={match.winnerSlotId}
                        result={match.result}
                        kickoff={match.kickoff}
                        teamsById={teamsById}
                        onOpen={openMatch}
                      />
                    ))}
                  </RoundColumn>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {status === 'ready' && rounds.length === 0 ? (
          <p className="rounded-card border border-border bg-surface px-4 py-8 text-center text-sm text-fg-muted">
            Slutspelsträdet visas när matchdatan är laddad.
          </p>
        ) : null}
      </CollapsibleBody>
    </section>
  );
}
