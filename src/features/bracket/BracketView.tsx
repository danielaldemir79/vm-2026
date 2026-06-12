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
// och stabila DATA-ATTRIBUT som design-frontend bygger premium-trädet ovanpå
// (data-bracket-round, data-bracket-slot, data-slot-resolution, data-winner).
// Den horisontella kolumn-layouten TÅL mobil (overflow-x-auto, en runda i taget),
// och animationen som "drar fram vinnaren" ägs av design-frontend via dessa hakar.
//
// VISUELL DESIGN (design-frontend-lagret, ovanpå): premium-bracket med kopplings-
// linjer, vinnar-animation och dags-tema. Strukturen är gjord lätt att styla:
// stabila roller + data-attribut, inga inbakade statusfärger (T7-pin).

import { useMemo, type ReactNode } from 'react';
import type { Team } from '../../domain/types';
import { Fade } from '../../motion';
import { teamDisplayName } from '../daily/match-display';
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

/**
 * En slot-rad i en slutspelsmatch. Stabil semantik + data-attribut (design-seam):
 *   - data-bracket-slot: hakar varje slot.
 *   - data-slot-resolution: resolved | possible | tbd (design kan tonsätta).
 *   - data-winner: satt på den slot vars lag vann matchen (vinnar-framhävning +
 *     animations-target för design-frontend), så "drag fram vinnaren" är en ren
 *     CSS/animations-fråga ovanpå denna hake.
 * Möjliga lag (under gruppspelet) visas som ett diskret antal ("4 möjliga"), så
 * raden inte blir textig men ändå kommunicerar att platsen inte är låst.
 */
// Exporterad för enhetstest av slot-rendering (möjliga-lag-chippets böjning,
// C10). Renderas i produktion bara via MatchCard nedan.
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
  const possibleCount = slot.resolution === 'possible' ? slot.candidateTeamIds.length : 0;
  const isPreliminary = slot.resolution === 'preliminary';

  return (
    <li
      data-bracket-slot=""
      data-slot-resolution={slot.resolution}
      data-winner={isWinner ? '' : undefined}
      className="vm-bracket-slot flex items-center justify-between gap-2 px-2.5 py-1.5"
    >
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="min-w-0 truncate text-[0.8125rem]" title={text}>
          {/* En resolved slot bär lagnamnet i full kontrast; en obestämd slot bär
              sin positions-etikett dämpat, så hierarkin syns utan färg-beroende.
              Ett PRELIMINÄRT lag (T56) bär lagnamnet men dämpat (text-fg-muted), så
              det syns att det inte är ett låst facit ens utan färg. .vm-bracket-slot-
              name bär den FÄRG-OBEROENDE vinnar-medaljens glyf (CSS-pseudo ::after),
              så bocken syns i gråskala/för färgblinda. */}
          <span
            className={`vm-bracket-slot-name ${
              slot.resolution === 'resolved' ? 'font-semibold text-fg' : 'text-fg-muted'
            }`}
          >
            {text}
          </span>
          {isWinner ? <span className="sr-only"> (vidare)</span> : null}
        </span>
        {isPreliminary ? (
          // Under lagnamnet: dess NUVARANDE position ("1:a grupp E") + att det är
          // preliminärt, så ett preliminärt lag aldrig läses som facit. aria-label
          // ger skärmläsaren hela sanningen i en mening (data-slot-resolution +
          // detta gör att design-frontend kan tonsätta utan att röra semantiken).
          <span
            data-slot-preliminary=""
            className="vm-bracket-slot-prelim min-w-0 truncate text-[0.625rem] font-medium uppercase tracking-wide text-fg-muted"
            aria-label={`${slot.label}, nuvarande ställning (inte klart)`}
          >
            {slot.label} , nu
          </span>
        ) : null}
      </span>
      {possibleCount > 0 ? (
        <span
          className="shrink-0 rounded-pill border border-border px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-fg-muted"
          // aria-label gör antalet begripligt för skärmläsare (inte bara "4 möjliga").
          // Böjs korrekt i singular/plural (C10): "1 möjligt lag" / "4 möjliga lag".
          aria-label={possibleTeamsLabel(possibleCount)}
        >
          {/* Visa hela böjda etiketten så chippet är grammatiskt rätt även vid 1. */}
          {possibleTeamsLabel(possibleCount)}
        </span>
      ) : null}
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

  return (
    <section aria-labelledby="slutspel-rubrik" className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="slutspel-rubrik" className="font-display text-2xl font-bold sm:text-3xl">
            Slutspelsträdet
          </h2>
          {mode === 'fixtures' ? (
            <span
              className="rounded-pill border px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide"
              style={{
                borderColor: 'color-mix(in srgb, var(--vm-gold) 45%, transparent)',
                backgroundColor: 'color-mix(in srgb, var(--vm-gold) 12%, transparent)',
                color: 'var(--vm-gold)',
              }}
            >
              Demo-data
            </span>
          ) : null}
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
              som T51:s simulering. Visas bara när trädet faktiskt har preliminära lag. */}
          {bracket?.preliminary ? (
            <span
              data-bracket-preliminary=""
              className="rounded-pill border px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide"
              style={{
                borderColor: 'color-mix(in srgb, var(--vm-gold) 45%, transparent)',
                backgroundColor: 'color-mix(in srgb, var(--vm-gold) 12%, transparent)',
                color: 'var(--vm-gold)',
              }}
            >
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
              responsiva grunden; vm-bracket-scroll lägger kant-maskeringen ovanpå. */}
          <div data-bracket-scroll="" className="vm-bracket-scroll -mx-1 overflow-x-auto px-1 pb-2">
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
    </section>
  );
}
