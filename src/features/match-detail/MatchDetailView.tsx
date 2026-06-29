// DEN RIKA MATCHVYN (T86, #178): drill-in-målet. Visar för EN match, i en fokuserad
// modal-panel: en kronologisk tidslinje (mål/kort/byten/övrigt, hemma/borta-sidad), en
// statistik-panel (bollinnehav-stapel + skott/hörnor/fouls hemma-vs-borta), laguppställning
// (formation + startelva + avbytare + tränare), och "Vad alla tippade" SCOPAT till matchen
// (återanvänder reveal-kortet). Live-medveten: en pågående match visar live-tidslinje/stats
// (datan auto-uppdateras redan via T91:s use-live-data, vyn läser bara den färska Map:en).
//
// ÅTERANVÄNDNING (PRINCIPLES §4, bygg inte om): den TUNGA presentationen finns redan i
// livekortet (live-card-model: buildStatRows/pairLineups). Vi återbrukar de rena model-
// funktionerna rakt av (statistik-staplar, lineup-paring), bygger BARA den nya enade
// tidslinjen (match-timeline-model) ovanpå den DELADE match-stats-projektionen, och
// återanvänder RevealMatchCard för "vad alla tippade". Den visuella ytan bärs av den delade
// Surface-primitiven + tokens, så vyn ser konsekvent ut med resten av appen direkt (T95
// gör den holistiska finputsen). Mjuk motion ärvs av <Modal> (reduced-motion-gatad där).
//
// SAKNAD DATA = GRACIÖS FALLBACK (acceptanskriterie): ingen live-data alls -> en lugn
// "ingen live-data än"-rad (ingen krasch, ingen tom ruta). En enskild saknad del (t.ex.
// laguppställning inte publicerad än) -> just den sektionen visas inte, resten lever vidare.

import { useId, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import type { LiveData, LiveLineup } from '../../data/livescore';
import { resolveApiTeamId } from '../../data/livescore';
import { Modal } from '../../components/Modal';
import { Surface } from '../../components/Surface';
import { useResultsStore } from '../results';
import { useLeaderboardStore, RevealMatchCard } from '../leaderboard';
import {
  buildStatRows,
  formatEventMinute,
  pairLineups,
  resolveKnockoutTeams,
  teamDisplayName,
  useLiveData,
  useLiveClock,
  type StatRow,
} from '../daily';
import { extractLineup } from '../../data/match-stats';
import { buildTimeline, type TimelineEntry, type TimelineSide } from './match-timeline-model';
import { useMatchDetail } from './match-detail-context';

/** Neutral platshållare när API:t saknade ett namn (gissa aldrig en spelare). */
const UNKNOWN_PLAYER = 'Okänd spelare';

/**
 * Den öppna matchvyns MODAL-skal. Renderas av provideren när ett match-id är öppet. Äger
 * <Modal>-primitiven (a11y-dialog-kontraktet: fokus-fälla, Escape, portal, reduced-motion)
 * och placerar innehållet som dess barn. titleId + closeRef skapas HÄR (en sanning) så
 * aria-labelledby pekar på rubriken och fokus flyttas in till stäng-knappen vid öppning.
 */
export function MatchDetailView({ matchId, onClose }: { matchId: string; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      name="match-detail"
      onClose={onClose}
      labelledById={titleId}
      initialFocusRef={closeRef}
      // Samma dim+blur-finish som de andra dialogerna (onboarding/settings/score-guide), så
      // drill-in-overlayn talar samma språk (KISS, ingen ny CSS-fil för en standard-backdrop).
      overlayClassName="backdrop-blur-sm"
      overlayStyle={{ backgroundColor: 'color-mix(in srgb, var(--color-bg) 70%, transparent)' }}
      panelClassName="w-full max-w-2xl"
    >
      <MatchDetailContent
        matchId={matchId}
        onClose={onClose}
        titleId={titleId}
        closeRef={closeRef}
      />
    </Modal>
  );
}

/**
 * Den öppna matchvyns innehåll. Slår upp matchen + lag + live-data + reveal ur de delade
 * storarna (ingen prop-drilling, lågmäld koppling). titleId/closeRef kommer uppifrån så
 * Modal:ens a11y-kontrakt (aria-labelledby + fokus-flytt) hålls med EN sanning för id/ref.
 */
function MatchDetailContent({
  matchId,
  onClose,
  titleId,
  closeRef,
}: {
  matchId: string;
  onClose: () => void;
  titleId: string;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  const { matches, teams, groups } = useResultsStore();
  const leaderboard = useLeaderboardStore();
  const { byMatchId } = useLiveData();

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  // LÖS KNOCKOUT-LAGEN (bugg 2026-06-29, Daniels skärmdump): en slutspelsmatch (M73-M104)
  // bär null-lag i den seedade matchplanen tills den seedas, så matchvyn visade "Ej klart"
  // (rubrik) / "Okänt lag" (reveal) FAST matchen var seedbar/avgjord. Idag-vyn löser redan
  // lagen via samma rena upplösning; vi ÅTERANVÄNDER den (en sanning, ingen parallell
  // härledning) i stället för att läsa matchplanen rakt av. Faller upplösningen tillbaka
  // (matchen inte seedbar än) lämnas matchen orörd -> platshållaren visas (gissa aldrig).
  const resolvedMatches = useMemo(() => resolveKnockoutTeams(groups, matches), [groups, matches]);
  const match = useMemo(
    () => resolvedMatches.find((m) => m.id === matchId) ?? null,
    [resolvedMatches, matchId]
  );
  const live = byMatchId.get(matchId) ?? null;

  // Reveal SCOPAT till denna match (en sanning: samma reveal-rad topplistan visar i listan).
  // Reveal-radens lag-id är redan UPPLÖSTA vid källan (LeaderboardProvider kör nu
  // buildMatchReveal på resolveKnockoutTeams-matcherna, reviewer-fynd F1 #252), så en
  // knockout-rad bär riktiga lag, inte "Okänt lag". Ingen lokal patch här längre, EN sanning.
  const reveal = useMemo(
    () => leaderboard.reveal.find((r) => r.matchId === matchId) ?? null,
    [leaderboard.reveal, matchId]
  );
  // Lagnamn-uppslag för reveal-kortet (samma fallback-form som RevealView använder).
  const nameOf = useMemo(
    () => (teamId: string | null) =>
      teamId === null ? 'Okänt lag' : (teamsById.get(teamId)?.name ?? teamId),
    [teamsById]
  );

  const homeName = match ? teamDisplayName(match.homeTeamId, teamsById) : 'Hemmalag';
  const awayName = match ? teamDisplayName(match.awayTeamId, teamsById) : 'Bortalag';
  const homeApiId = match && match.homeTeamId !== null ? resolveApiTeamId(match.homeTeamId) : null;

  return (
    <Surface
      tone="surface"
      padding="none"
      as="div"
      data-match-detail-panel=""
      className="relative flex w-full flex-col gap-6 overflow-y-auto p-5 sm:p-7"
      style={{ maxHeight: 'min(90dvh, 56rem)' }}
    >
      <DetailHeader
        titleId={titleId}
        homeName={homeName}
        awayName={awayName}
        live={live}
        closeRef={closeRef}
        onClose={onClose}
      />

      {/* SCOPAT INNEHÅLL: tidslinje + statistik + laguppställning (live-data) följt av
          "vad alla tippade" (reveal). Saknas live-data helt visas en lugn fallback i
          stället för tidslinje/statistik/lineup (graciös, ingen tom ruta). */}
      {live ? (
        <LiveSections live={live} homeApiId={homeApiId} homeName={homeName} awayName={awayName} />
      ) : (
        <p data-match-detail-empty="" className="text-sm text-fg-muted">
          Ingen live-data för matchen än. Tidslinje, statistik och laguppställning visas här när
          matchen närmar sig avspark.
        </p>
      )}

      {reveal ? (
        <section
          data-match-detail-reveal=""
          aria-labelledby={`${titleId}-reveal`}
          className="flex flex-col gap-3"
        >
          <SectionHeading id={`${titleId}-reveal`}>Vad alla tippade</SectionHeading>
          {/* Återanvänder reveal-kortet (en sanning för facit-/pågår-markup:en), men bara
              för DENNA match , drill-in-innehållet per Daniels feedback. <ol> matchar
              reveal-kortets <li>-rot (semantisk lista). reveal-raden bär de upplösta
              knockout-lagen redan vid källan (se ovan), så kortets rubrik visar riktiga lag. */}
          <ol className="m-0 flex list-none flex-col gap-4 p-0">
            <RevealMatchCard match={reveal} nameOf={nameOf} />
          </ol>
        </section>
      ) : null}
    </Surface>
  );
}

/** Rubrik-raden: matchens lag + (om live) klock-/status-chip + stäng-knapp. */
function DetailHeader({
  titleId,
  homeName,
  awayName,
  live,
  closeRef,
  onClose,
}: {
  titleId: string;
  homeName: string;
  awayName: string;
  live: LiveData | null;
  closeRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 id={titleId} className="font-display text-lg font-bold sm:text-xl">
          {homeName} <span className="font-normal text-fg-muted">mot</span> {awayName}
        </h2>
        {live ? <LiveStatusChip live={live} /> : null}
      </div>
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Stäng matchvyn"
        data-match-detail-close=""
        className="shrink-0 rounded-pill border border-border px-2.5 py-1 text-sm font-semibold text-fg-muted transition-colors hover:bg-surface-raised hover:text-fg"
      >
        Stäng
      </button>
    </header>
  );
}

/** Klock-/status-chip: ställning + klocka, live-medveten (samma klock-källa som livekortet). */
function LiveStatusChip({ live }: { live: LiveData }) {
  const clock = useLiveClock(live);
  const homeGoals = live.homeGoals ?? 0;
  const awayGoals = live.awayGoals ?? 0;
  const finished = live.status === 'finished';
  const isLive = live.status === 'live' || live.status === 'paused';
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <span data-match-detail-score="" className="font-display text-base font-bold tabular-nums">
        {homeGoals}
        <span className="px-1 text-fg-muted">-</span>
        {awayGoals}
      </span>
      <span
        data-match-detail-status={finished ? 'finished' : isLive ? 'live' : 'other'}
        className="inline-flex items-center gap-1.5 rounded-pill bg-surface-raised px-2 py-0.5 text-xs font-semibold text-fg-muted"
      >
        {isLive ? (
          <span
            aria-hidden="true"
            className="vm-live-dot inline-block h-1.5 w-1.5 rounded-pill bg-accent"
          />
        ) : null}
        {clock.label}
      </span>
    </p>
  );
}

/** Live-sektionerna: tidslinje + statistik + laguppställning, var och en graciöst tom-säker. */
function LiveSections({
  live,
  homeApiId,
  homeName,
  awayName,
}: {
  live: LiveData;
  homeApiId: number | null;
  homeName: string;
  awayName: string;
}) {
  const timeline = useMemo(() => buildTimeline(live.events, homeApiId), [live.events, homeApiId]);
  const statRows = useMemo(
    () => buildStatRows(live.statistics, homeApiId),
    [live.statistics, homeApiId]
  );
  const lineups = useMemo(() => pairLineups(live.lineups, homeApiId), [live.lineups, homeApiId]);

  return (
    <>
      {timeline.length > 0 ? (
        <TimelineSection timeline={timeline} homeName={homeName} awayName={awayName} />
      ) : null}
      {statRows.length > 0 ? (
        <StatsSection rows={statRows} homeName={homeName} awayName={awayName} />
      ) : null}
      {lineups.home !== null || lineups.away !== null ? (
        <LineupSection
          home={lineups.home}
          away={lineups.away}
          homeName={homeName}
          awayName={awayName}
        />
      ) : null}
    </>
  );
}

/** En sektionsrubrik (delad form, så sektionerna talar samma språk). */
function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      className="font-display text-xs font-bold uppercase tracking-[0.14em] text-fg-muted"
    >
      {children}
    </h3>
  );
}

/**
 * TIDSLINJEN: kronologiska händelser (mål/kort/byten/övrigt) med minut + spelarnamn, hemma/
 * borta-sidad (hemma vänster | borta höger runt en central minut-spine, samma layout-språk
 * som livekortet). Varje rad bär en typ-ikon + text på lagets sida.
 */
function TimelineSection({
  timeline,
  homeName,
  awayName,
}: {
  timeline: readonly TimelineEntry[];
  homeName: string;
  awayName: string;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      data-match-detail-timeline=""
      className="flex flex-col gap-3"
    >
      <SectionHeading id={headingId}>
        Tidslinje
        <span className="sr-only">
          , {homeName} till vänster, {awayName} till höger
        </span>
      </SectionHeading>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {timeline.map((e, i) => (
          <li
            key={`${e.entryKind}-${e.minute}-${e.extra ?? 0}-${i}`}
            data-timeline-entry={e.entryKind}
            data-timeline-side={e.side}
          >
            <TimelineRow entry={e} />
          </li>
        ))}
      </ol>
    </section>
  );
}

/** En spegel-rad i tidslinjen: [hemma | minut | borta]. Innehållet på lagets sida. */
function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const isHome = entry.side === 'home';
  const content = <TimelineContent entry={entry} side={entry.side} />;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-2">
      {isHome ? (
        <div className="flex min-w-0 justify-end text-right">{content}</div>
      ) : (
        <div aria-hidden="true" />
      )}
      <span className="flex h-5 shrink-0 items-center justify-center px-1 font-display text-xs font-bold tabular-nums text-fg-muted">
        {formatEventMinute(entry.minute, entry.extra)}
      </span>
      {isHome ? (
        <div aria-hidden="true" />
      ) : (
        <div className="flex min-w-0 justify-start text-left">{content}</div>
      )}
    </div>
  );
}

/** Innehållet i en tidslinje-rad, per typ (ikon + text). Uttömmande över entryKind. */
function TimelineContent({ entry, side }: { entry: TimelineEntry; side: TimelineSide }) {
  const align = side === 'home' ? 'flex-row-reverse' : 'flex-row';
  const wrap = `flex min-w-0 items-start gap-2 text-sm ${align}`;
  switch (entry.entryKind) {
    case 'goal':
      return (
        <span className={wrap}>
          <span
            aria-hidden="true"
            className="flex h-5 shrink-0 items-center text-base leading-none"
          >
            ⚽
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-semibold">
              {entry.scorerName ?? UNKNOWN_PLAYER}
              {entry.isPenalty ? <span className="font-normal text-fg-muted"> (str.)</span> : null}
              {entry.isOwnGoal ? (
                <span className="font-normal text-fg-muted"> (självmål)</span>
              ) : null}
            </span>
            {entry.assistName !== null ? (
              <span className="truncate text-xs text-fg-muted">assist: {entry.assistName}</span>
            ) : null}
          </span>
        </span>
      );
    case 'card':
      return (
        <span className={wrap}>
          <span
            className={`vm-live-card-pip shrink-0 ${
              entry.color === 'red' ? 'vm-live-card-pip-red' : 'vm-live-card-pip-yellow'
            }`}
          >
            <span className="sr-only">{entry.color === 'red' ? 'rött kort' : 'gult kort'}</span>
          </span>
          <span className="truncate font-medium">{entry.playerName ?? UNKNOWN_PLAYER}</span>
        </span>
      );
    case 'subst':
      return (
        <span className={wrap}>
          <span aria-hidden="true" className="flex h-5 shrink-0 items-center text-sm leading-none">
            🔁
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-medium">
              <span aria-hidden="true" className="vm-live-sub-arrow">
                ▲
              </span>{' '}
              {entry.playerInName ?? UNKNOWN_PLAYER}
            </span>
            {entry.playerOutName !== null ? (
              <span className="truncate text-xs text-fg-muted">
                <span aria-hidden="true" className="vm-live-sub-arrow-out">
                  ▼
                </span>{' '}
                {entry.playerOutName}
              </span>
            ) : null}
          </span>
        </span>
      );
    case 'other':
      return (
        <span className={wrap}>
          <span
            aria-hidden="true"
            className="flex h-5 shrink-0 items-center text-xs leading-none text-fg-muted"
          >
            ◦
          </span>
          <span className="truncate text-xs text-fg-muted">{entry.detail}</span>
        </span>
      );
  }
}

/** STATISTIK-PANELEN: en jämförelse-stapel per nyckeltal (hemma | etikett | borta). */
function StatsSection({
  rows,
  homeName,
  awayName,
}: {
  rows: readonly StatRow[];
  homeName: string;
  awayName: string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} data-match-detail-stats="" className="flex flex-col gap-3">
      <SectionHeading id={headingId}>
        Statistik
        <span className="sr-only">
          , {homeName} till vänster, {awayName} till höger
        </span>
      </SectionHeading>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {rows.map((r) => (
          <li key={r.label} data-stat-row="" className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold tabular-nums" data-stat-home="">
                {r.homeText}
              </span>
              <span className="text-fg-muted">{r.label}</span>
              <span className="font-semibold tabular-nums" data-stat-away="">
                {r.awayText}
              </span>
            </div>
            <div
              aria-hidden="true"
              className="vm-live-stat-bar flex h-1.5 overflow-hidden rounded-pill"
            >
              <span
                className="vm-live-stat-bar-home"
                style={{ flexGrow: r.homeShare, flexBasis: 0 }}
              />
              <span
                className="vm-live-stat-bar-away"
                style={{ flexGrow: r.awayShare, flexBasis: 0 }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** LAGUPPSTÄLLNINGEN: formation + startelva + avbytare + tränare per lag (hemma/borta). */
function LineupSection({
  home,
  away,
  homeName,
  awayName,
}: {
  home: LiveLineup | null;
  away: LiveLineup | null;
  homeName: string;
  awayName: string;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      data-match-detail-lineups=""
      className="flex flex-col gap-3"
    >
      <SectionHeading id={headingId}>Laguppställning</SectionHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        <LineupColumn lineup={home} fallbackName={homeName} />
        <LineupColumn lineup={away} fallbackName={awayName} />
      </div>
    </section>
  );
}

/** En lag-kolumn: namn + formation + tränare, startelva, avbytare. */
function LineupColumn({
  lineup,
  fallbackName,
}: {
  lineup: LiveLineup | null;
  fallbackName: string;
}) {
  if (lineup === null) {
    return null;
  }
  // Återanvänd den delade projektionen för coach + spelare (en sanning).
  const info = extractLineup(lineup);
  return (
    <div data-lineup-team="" className="flex flex-col gap-2">
      <p className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-display text-sm font-semibold">
          {info.teamName || fallbackName}
        </span>
        {info.formation ? (
          <span
            data-lineup-formation=""
            className="vm-live-formation shrink-0 rounded-pill px-2 py-0.5 font-display text-[0.625rem] font-bold tabular-nums"
          >
            {info.formation}
          </span>
        ) : null}
      </p>
      {info.coachName !== null ? (
        <p data-lineup-coach="" className="text-xs text-fg-muted">
          Tränare: {info.coachName}
        </p>
      ) : null}
      {info.startXI.length > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-1 p-0 text-xs">
          {info.startXI.map((p) => (
            <li key={p.apiPlayerId} className="flex items-baseline gap-2">
              <span className="w-5 shrink-0 text-right font-semibold tabular-nums text-fg-muted">
                {p.number}
              </span>
              <span className="min-w-0 truncate">{p.name}</span>
              <span className="ml-auto shrink-0 text-[0.625rem] uppercase text-fg-muted">
                {p.position}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {info.substitutes.length > 0 ? (
        <details data-lineup-subs="" className="text-xs text-fg-muted">
          <summary className="vm-live-subs-summary cursor-pointer select-none font-medium">
            Avbytare ({info.substitutes.length})
          </summary>
          <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
            {info.substitutes.map((p) => (
              <li key={p.apiPlayerId} className="flex items-baseline gap-2">
                <span className="w-5 shrink-0 text-right tabular-nums">{p.number}</span>
                <span className="min-w-0 truncate">{p.name}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Triggern: en knapp som öppnar den rika matchvyn för ett match-id. Återanvändbar , Idag-
 * listan wrappar matchraden i denna, T92 wrappar reveal-listans rader. En RIKTIG <button>
 * (inte en klickbar div) så den nås med tangentbord och har rätt roll; aria-label beskriver
 * målet. Den lägger ingen egen visuell stil utöver `className`, så kallaren äger utseendet.
 */
export function MatchDetailTrigger({
  matchId,
  ariaLabel,
  className,
  children,
}: {
  matchId: string;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const { openMatch } = useMatchDetail();
  return (
    <button
      type="button"
      data-match-detail-trigger=""
      aria-label={ariaLabel}
      onClick={() => openMatch(matchId)}
      className={className}
    >
      {children}
    </button>
  );
}
