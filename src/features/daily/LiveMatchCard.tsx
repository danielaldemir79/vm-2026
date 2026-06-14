// LIVEKORTET (Bit 3b): den synliga live-/resultat-panelen som BERIKAR ett matchkort
// när det finns live-data för matchen. Renderas för BÅDE en pågående OCH en avslutad
// (frusen, bläddringsbar) match, faller tillbaka till matchkortets vanliga utseende
// när live-data saknas (komponenten renderas då helt enkelt inte, se MatchCard).
//
// DANIELS SPEC (följd exakt):
//   - KÄRNAN SYNS DIREKT: live-minut/status (status-styrd klocka, mjuk tick under live,
//     "Paus"/"Slut"/"45+" vid uppehåll/övertid/FT, ALDRIG fel tid vid vattenpaus),
//     ställning, målskyttar + assist, kort (gul/röd) och byten.
//   - EN TYDLIG "Visa mer"-knapp fäller ut resten: full statistik (bollinnehav, skott,
//     xG/hörnor osv.) + laguppställningar/formationer. Det SYNS att kortet kan expanderas.
//   - LIVE-känsla: en diskret pulsande "LIVE"-indikator + den mjukt tickande klockan.
//
// KLOCKA: useLiveClock kör Bit 1:s status-styrda klocka (vattenpaus-säkerheten bor där),
// vi implementerar INGEN egen tid-logik. STATISTIK/EVENTS/LINEUPS formas av det rena
// live-card-model-lagret (par-uppdelning hemma/borta + urval + sortering), inte här.
//
// A11Y: panelen är en region med ett tillgängligt namn som sammanfattar live-läget
// ("Live: <hemma> 1-0 <borta>, 29 minuter spelade"), så en skärmläsare hör läget utan
// att navigera varje rad. "Visa mer" återbrukar den delade ExpandToggle (aria-expanded
// /-controls, fokus, chevron) , samma komprimerings-affordans som hela appen har.
// Klockans pulsande punkt + målfärgerna är FÄRG-OBEROENDE förstärkta: status-ordet +
// minuten + namnen bär betydelsen i text, färgen är bara en cue (WCAG: inte enbart färg).

import { useId, useMemo, useState } from 'react';
import type { LiveData, LiveLineup } from '../../data/livescore';
import { ExpandToggle } from '../../components/ExpandToggle';
import { useLiveClock } from './use-live-clock';
import {
  buildStatRows,
  formatEventMinute,
  pairLineups,
  selectCards,
  selectGoals,
  selectSubs,
  type CardEntry,
  type GoalEntry,
  type StatRow,
  type SubEntry,
} from './live-card-model';
import './live-card.css';

export interface LiveMatchCardProps {
  /** Den projicerade live-raden (status/ställning/events/statistik/laguppställningar). */
  data: LiveData;
  /** Hemmalagets visningsnamn (appens, så live-panelen talar samma namn som kortet). */
  homeName: string;
  /** Bortalagets visningsnamn. */
  awayName: string;
  /**
   * Hemmalagets API-Football-id (härlett ur appens hemmalag via bryggan), för att para
   * events/statistik/laguppställningar till rätt SIDA. null -> positions-fallback i
   * model-lagret (block 0 = hemma), så kortet renderas även när id:t inte kan härledas.
   */
  homeApiId: number | null;
  /** Nuet (epoch-ms), injiceras för test. Default Date.now() i appen (klockan tickar). */
  now?: number;
}

/** Är status ett pågående live-läge (driver LIVE-indikatorn)? */
function isLiveStatus(status: LiveData['status']): boolean {
  return status === 'live' || status === 'paused';
}

export function LiveMatchCard({ data, homeName, awayName, homeApiId, now }: LiveMatchCardProps) {
  const clock = useLiveClock(data, now);
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();

  // Rena härledningar ur model-lagret (memoiserade per data/id, inte per render).
  const goals = useMemo(() => selectGoals(data.events, homeApiId), [data.events, homeApiId]);
  const cards = useMemo(() => selectCards(data.events, homeApiId), [data.events, homeApiId]);
  const subs = useMemo(() => selectSubs(data.events, homeApiId), [data.events, homeApiId]);
  const statRows = useMemo(
    () => buildStatRows(data.statistics, homeApiId),
    [data.statistics, homeApiId]
  );
  const lineups = useMemo(() => pairLineups(data.lineups, homeApiId), [data.lineups, homeApiId]);

  const live = isLiveStatus(data.status);
  const finished = data.status === 'finished';
  const homeGoals = data.homeGoals ?? 0;
  const awayGoals = data.awayGoals ?? 0;

  // Tillgängligt namn: hela live-läget som en mening (status + ställning + klocka).
  const stateWord = finished ? 'Slutresultat' : live ? 'Live' : clock.label;
  const regionLabel = `${stateWord}: ${homeName} ${homeGoals}-${awayGoals} ${awayName}, ${clock.label}`;

  // Det finns något att fälla ut bara om vi faktiskt har statistik eller laguppställning.
  const hasDetail = statRows.length > 0 || lineups.home !== null || lineups.away !== null;

  return (
    <section
      data-live-card=""
      data-live-status={data.status}
      data-live-ticking={clock.ticking ? '' : undefined}
      aria-label={regionLabel}
      className="vm-live-card mt-1 flex flex-col gap-3 rounded-card border p-3.5"
    >
      {/* RAD 1: klock-/status-chip + (live) en diskret pulsande LIVE-indikator. */}
      <div className="flex items-center justify-between gap-2">
        <span
          data-live-clock=""
          className="vm-live-clock inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 font-display text-xs font-bold tabular-nums"
        >
          {/* Pulsande punkt BARA under faktisk live-tick (ticking). I paus/slut är
              den en stilla punkt, så rörelsen ärligt signalerar "klockan går nu".
              Reduced-motion nollar pulsen (index.css/.vm-live-card-css). aria-hidden:
              status-ORDET bär betydelsen för skärmläsare, punkten är ren cue. */}
          {live ? (
            <span
              aria-hidden="true"
              data-live-dot=""
              className={`vm-live-card-dot inline-block h-1.5 w-1.5 rounded-pill ${
                clock.ticking ? 'vm-live-card-dot-ticking' : ''
              }`}
            />
          ) : null}
          <span>{clock.label}</span>
        </span>

        {/* LIVE-/SLUT-etikett: färg-oberoende (text bär betydelsen). */}
        <span
          data-live-badge={finished ? 'finished' : live ? 'live' : 'other'}
          className="vm-live-badge inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.12em]"
        >
          {finished ? 'Slut' : live ? 'Live' : 'Följ matchen'}
        </span>
      </div>

      {/* RAD 2: ställningen, stor och tydlig. tabular-nums så siffran sitter still
          när ett mål faller. Namnen kapas inom bredden (min-w-0 + truncate). */}
      <div className="flex items-center gap-3" data-live-score-row="">
        <span className="min-w-0 flex-1 truncate text-right font-display text-sm font-semibold">
          {homeName}
        </span>
        <span
          data-live-score=""
          className="shrink-0 font-display text-2xl font-bold tabular-nums leading-none"
        >
          {homeGoals}
          <span className="px-1 text-fg-muted">-</span>
          {awayGoals}
        </span>
        <span className="min-w-0 flex-1 truncate text-left font-display text-sm font-semibold">
          {awayName}
        </span>
      </div>

      {/* RAD 3: målskyttar (+ assist), kort och byten , kärnan, ALLTID synlig.
          Visas bara om det finns något (en tidig 0-0 utan events ger ingen tom yta). */}
      {goals.length > 0 ? <GoalList goals={goals} /> : null}
      {cards.length > 0 ? <CardList cards={cards} /> : null}
      {subs.length > 0 ? <SubList subs={subs} /> : null}

      {/* "VISA MER": återbrukar den delade ExpandToggle (aria-expanded/-controls,
          fokus, chevron). Visas bara när det FINNS detaljer att fälla ut (ärligt
          löfte, samma princip som CollapsibleBody). */}
      {hasDetail ? (
        <div data-live-detail-wrap="" className="flex flex-col gap-3">
          <div className="flex">
            <ExpandToggle
              name="live-detail"
              expanded={expanded}
              hiddenCount={0}
              labels={{ expand: 'Visa mer (statistik + laguppställning)', collapse: 'Visa mindre' }}
              controls={detailId}
              onToggle={() => setExpanded((v) => !v)}
              position="top"
            />
          </div>
          {expanded ? (
            <div id={detailId} data-live-detail="" className="flex flex-col gap-5">
              {statRows.length > 0 ? <StatBlock rows={statRows} /> : null}
              {lineups.home !== null || lineups.away !== null ? (
                <LineupBlock
                  home={lineups.home}
                  away={lineups.away}
                  homeName={homeName}
                  awayName={awayName}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Sidans korta etikett (H/B) för en kompakt rad. */
function sideTag(side: GoalEntry['side']): string {
  return side === 'home' ? 'H' : 'B';
}

/** Mål-listan: minut, sida, skytt (+ assist), straff/självmål-markering. */
function GoalList({ goals }: { goals: readonly GoalEntry[] }) {
  return (
    <ul data-live-goals="" className="flex flex-col gap-1.5">
      {goals.map((g, i) => (
        <li
          key={`${g.minute}-${g.scorer}-${i}`}
          data-live-goal=""
          data-live-goal-side={g.side}
          className="flex items-baseline gap-2 text-sm"
        >
          <span aria-hidden="true" className="vm-live-icon-goal shrink-0 text-base leading-none">
            ⚽
          </span>
          <span className="shrink-0 font-display text-xs font-bold tabular-nums text-fg-muted">
            {formatEventMinute(g.minute, g.extra)}
          </span>
          <span className="min-w-0">
            <span className="font-semibold">{g.scorer}</span>
            {g.penalty ? <span className="text-fg-muted"> (str.)</span> : null}
            {g.ownGoal ? <span className="text-fg-muted"> (självmål)</span> : null}
            {g.assist !== null ? <span className="text-fg-muted"> assist: {g.assist}</span> : null}
            <span className="ml-1 text-[0.625rem] font-semibold uppercase text-fg-muted">
              {sideTag(g.side)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Kort-listan: minut, sida, spelare, färg (färg-oberoende: glyf + ordet). */
function CardList({ cards }: { cards: readonly CardEntry[] }) {
  return (
    <ul data-live-cards="" className="flex flex-col gap-1.5">
      {cards.map((c, i) => (
        <li
          key={`${c.minute}-${c.player}-${i}`}
          data-live-card-event=""
          data-live-card-color={c.color}
          className="flex items-baseline gap-2 text-sm"
        >
          <span
            aria-hidden="true"
            className={`vm-live-card-pip shrink-0 ${
              c.color === 'red' ? 'vm-live-card-pip-red' : 'vm-live-card-pip-yellow'
            }`}
          />
          <span className="shrink-0 font-display text-xs font-bold tabular-nums text-fg-muted">
            {formatEventMinute(c.minute, c.extra)}
          </span>
          <span className="min-w-0">
            <span className="font-medium">{c.player}</span>
            <span className="ml-1 text-fg-muted">
              {c.color === 'red' ? 'rött kort' : 'gult kort'}
            </span>
            <span className="ml-1 text-[0.625rem] font-semibold uppercase text-fg-muted">
              {sideTag(c.side)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Byte-listan: minut, sida, in/ut. */
function SubList({ subs }: { subs: readonly SubEntry[] }) {
  return (
    <ul data-live-subs="" className="flex flex-col gap-1.5">
      {subs.map((s, i) => (
        <li
          key={`${s.minute}-${s.playerIn}-${i}`}
          data-live-sub=""
          data-live-sub-side={s.side}
          className="flex items-baseline gap-2 text-sm text-fg-muted"
        >
          <span aria-hidden="true" className="shrink-0 text-sm leading-none">
            🔁
          </span>
          <span className="shrink-0 font-display text-xs font-bold tabular-nums">
            {formatEventMinute(s.minute, s.extra)}
          </span>
          <span className="min-w-0">
            <span className="font-medium text-fg">{s.playerIn}</span>
            {s.playerOut !== null ? <span> in för {s.playerOut}</span> : <span> in</span>}
            <span className="ml-1 text-[0.625rem] font-semibold uppercase">{sideTag(s.side)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Statistik-blocket: en jämförelse-stapel per nyckeltal (hemma | etikett | borta). */
function StatBlock({ rows }: { rows: readonly StatRow[] }) {
  return (
    <div data-live-stats="" className="flex flex-col gap-2.5">
      <h4 className="font-display text-xs font-bold uppercase tracking-[0.14em] text-fg-muted">
        Statistik
      </h4>
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.label} data-live-stat-row="" className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold tabular-nums" data-live-stat-home="">
                {r.homeText}
              </span>
              <span className="text-fg-muted">{r.label}</span>
              <span className="font-semibold tabular-nums" data-live-stat-away="">
                {r.awayText}
              </span>
            </div>
            {/* Jämförelse-stapeln (aria-hidden: talen ovan bär betydelsen). De två
                segmenten möts i mitten, så övervikten syns direkt. */}
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
    </div>
  );
}

/** Laguppställnings-blocket: formation + startelva + avbytare per lag. */
function LineupBlock({
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
  return (
    <div data-live-lineups="" className="flex flex-col gap-4">
      <h4 className="font-display text-xs font-bold uppercase tracking-[0.14em] text-fg-muted">
        Laguppställning
      </h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <LineupColumn lineup={home} fallbackName={homeName} />
        <LineupColumn lineup={away} fallbackName={awayName} />
      </div>
    </div>
  );
}

/** En lag-kolumn i laguppställningen: namn + formation, startelva, avbytare. */
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
  return (
    <div data-live-lineup="" className="flex flex-col gap-2">
      <p className="flex items-baseline justify-between gap-2">
        <span className="font-display text-sm font-semibold">
          {lineup.teamName || fallbackName}
        </span>
        {lineup.formation ? (
          <span
            data-live-formation=""
            className="vm-live-formation rounded-pill px-2 py-0.5 font-display text-[0.625rem] font-bold tabular-nums"
          >
            {lineup.formation}
          </span>
        ) : null}
      </p>
      {lineup.startXI.length > 0 ? (
        <ol data-live-startxi="" className="flex flex-col gap-1 text-xs">
          {lineup.startXI.map((p) => (
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
      {lineup.substitutes.length > 0 ? (
        <details data-live-subs-list="" className="text-xs text-fg-muted">
          <summary className="vm-live-subs-summary cursor-pointer select-none font-medium">
            Avbytare ({lineup.substitutes.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-1">
            {lineup.substitutes.map((p) => (
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
