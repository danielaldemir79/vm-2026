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
import { TeamFlag } from '../daily/TeamFlag';
import { groupByRound, type BracketSlotState } from './derive-bracket';
import { useBracketData } from './use-bracket-data';
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
 * "Klar"-brickan: markerar en DEFINITIV plats (resolution='resolved' men ännu inte
 * vidare-vinnare), Daniels önskemål: "när platsen är definitivt klar ska den markeras".
 * FÄRG-OBEROENDE: en lås-glyf (form) + ordet "Klar" (text), lugn och bekräftande. Den
 * VINNANDE slot:en bär redan vinnar-medaljen (data-winner, ✓ i bracket.css) + "(vidare)",
 * så vi visar "Klar" bara på en resolved ICKE-vinnare, annars vore platsen dubbel-märkt
 * (en vinnare ÄR definitiv på köpet). Lås-glyfen skiljer den tydligt från vinnar-bocken.
 */
function DefinitivBadge() {
  return (
    <span
      data-slot-definitiv=""
      className="vm-bracket-definitiv inline-flex shrink-0 items-center gap-1 rounded-pill px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide"
    >
      <svg
        aria-hidden="true"
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="vm-bracket-definitiv-glyph"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      Klar
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
 *   - data-slot-definitiv: en DEFINITIV plats (resolved icke-vinnare), "Klar"-märkt.
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
}: {
  slot: BracketSlotState;
  teamsById: ReadonlyMap<string, Team>;
  isWinner: boolean;
}) {
  const text = slotText(slot, teamsById);
  const isResolved = slot.resolution === 'resolved';
  const isPreliminary = slot.resolution === 'preliminary';
  // Ett FYLLT lag (resolved eller preliminärt) bär sin flagga; en obestämd plats visar
  // i stället sina alternativ (kandidatlag) nedanför positions-etiketten.
  const hasTeam = (isResolved || isPreliminary) && slot.teamId !== null;
  const code = hasTeam ? teamCodeOf(slot.teamId, teamsById) : null;
  const candidates = hasTeam ? [] : slot.candidateTeamIds;

  return (
    <li
      data-bracket-slot=""
      data-slot-resolution={slot.resolution}
      data-winner={isWinner ? '' : undefined}
      data-slot-definitiv={isResolved && !isWinner ? '' : undefined}
      className="vm-bracket-slot flex items-start gap-2 px-2.5 py-1.5"
    >
      {/* FLAGGA (eller platshållare): lyfter lag-igenkänningen, vänsterställd som ett ankare. */}
      <SlotFlag code={code} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex min-w-0 items-center gap-1.5">
          {/* En resolved slot bär lagnamnet i full kontrast; en obestämd/preliminär slot
              bär sin etikett/lagnamn dämpat, så hierarkin syns utan färg-beroende.
              .vm-bracket-slot-name bär den FÄRG-OBEROENDE vinnar-medaljens glyf (CSS-pseudo
              ::after), så bocken syns i gråskala/för färgblinda. */}
          <span
            className={`vm-bracket-slot-name min-w-0 truncate text-[0.8125rem] ${
              isResolved ? 'font-semibold text-fg' : 'text-fg-muted'
            }`}
            title={text}
          >
            {text}
          </span>
          {isWinner ? <span className="sr-only"> (vidare)</span> : null}
          {/* DEFINITIV-markör: en resolved icke-vinnare = platsen är klar/låst (Klar-bricka). */}
          {isResolved && !isWinner ? <DefinitivBadge /> : null}
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
    </li>
  );
}

/**
 * Ett match-kort i trädet: dess två slots (hemma/borta) med en avdelare. Bär
 * matchnumret som dämpad etikett. data-bracket-match + matchId ger design-seamen
 * en stabil hake per match (kopplingslinjer, animation).
 */
function MatchCard({
  matchId,
  home,
  away,
  winnerSlotId,
  teamsById,
}: {
  matchId: string;
  home: BracketSlotState;
  away: BracketSlotState;
  winnerSlotId: string | null;
  teamsById: ReadonlyMap<string, Team>;
}) {
  return (
    <article
      data-bracket-match={matchId}
      className="vm-bracket-match overflow-hidden rounded-card border border-border bg-surface shadow-[var(--vm-shadow-card)]"
    >
      {/* Match-nummer-cap: en diskret etikett (M73 ...) så ett kort kan placeras i
          trädet med blicken (vilken match det är). aria-hidden: matchnumret är
          orienterings-dekoration, slot-raderna nedan bär den tillgängliga datan. */}
      <p
        aria-hidden="true"
        className="border-b border-border/60 px-2.5 py-1 font-display text-[0.625rem] font-semibold uppercase tracking-wide text-fg-muted"
      >
        {matchId}
      </p>
      <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
        <SlotRow slot={home} teamsById={teamsById} isWinner={winnerSlotId === home.id} />
        <SlotRow slot={away} teamsById={teamsById} isWinner={winnerSlotId === away.id} />
      </ul>
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

      {/* KOMPRIMERING (T68/#129): rubrik + beskrivning + progress alltid synliga; här under
          komprimeras trädet så bara TOPP-DELEN syns som default (höjd-klipp + fade), en
          tydlig expandera fäller ut hela trädet. Trädet scrollar i sidled, så ett höjd-klipp
          visar de översta matchkorten per runda. Faden tonar mot app-bakgrunden. ~22rem visar
          runda-rubrikerna + de första (nu flagg-bärande, högre) matchkorten. */}
      <CollapsibleBody
        name="bracket"
        toggleLabels={{ expand: 'Visa hela slutspelsträdet', collapse: 'Visa mindre av trädet' }}
        collapsedMaxHeight="22rem"
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
                        teamsById={teamsById}
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
