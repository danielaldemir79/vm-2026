// SKYTTELIGAN + ASSIST-LIGAN (T87, #179): den första roliga turnerings-stat-delen, i
// Turnering-fliken. Visar VM:s målskyttar rankade på mål (egenmål exkluderat, straff
// inkluderat) och en assist-liga, NEAR-LIVE (aggregaten räknas om inom sekunder när ett mål
// trillar, via useCrossMatchEvents T91-spine).
//
// PRESENTATION (north-star §2 progressive disclosure + §3 ETT komponentsprak): listorna
// börjar KOMPRIMERADE med bara topp-N synliga + "Visa alla"-utfäll (Daniels mönster: långa
// listor ska inte bli väggar), via den DELADE CollapsibleList-primitiven , samma sticky
// komprimera-kontroll som resten av appen. En segment-växel byter mellan skytteliga och
// assist-liga (en lista i taget, inte två konkurrerande väggar). Ytan bärs av Surface +
// tokens (konsekvent med resten). Lag-tillhörighet visas med den delade TeamFlag-discen
// (FIFA-kod via team-bridge), aldrig en gissad logga , de normaliserade events bär bara
// teamApiId/teamName, ingen logo-URL, så vi använder appens befintliga flagg-emblem.
//
// A11y: laddning = role=status, fel = role=alert (fail-loud), listan en <ol> med rank som
// aria-label per rad. Motion (segment-/utfälls-övergångar) ärvs av husets primitiver och är
// reduced-motion-gatade där. Responsiv: namnet truncar, siffer-kolumnerna är shrink-0 så de
// aldrig överlappar på smal skärm (samma grepp som LeaderboardRow).

import { useId, useMemo, useState } from 'react';
import { Surface } from '../../components/Surface';
import { CollapsibleList } from '../../components/collapsible-list';
import { resolveAppTeamId } from '../../data/livescore';
import { TeamFlag } from '../daily/TeamFlag';
import { useCrossMatchEvents } from './use-cross-match-events';
import { aggregateScoring, type AssistRow, type ScorerRow } from './scorer-table';

/** Hur många rader som visas i KOMPRIMERAT läge innan "Visa alla" (north-star: topp-N). */
const COLLAPSED_VISIBLE = 5;

/** Vilken liga som visas (en i taget, ingen vägg av två listor). */
type LeagueTab = 'scorers' | 'assists';

/** Pallplats-medalj-klass för topp-3 (samma vokabulär som topplistan). Plats 4+ = neutral. */
const MEDAL_CLASS: Record<number, string> = {
  1: 'vm-pool-medal vm-pool-medal--gold',
  2: 'vm-pool-medal vm-pool-medal--silver',
  3: 'vm-pool-medal vm-pool-medal--bronze',
};

/** En rad-modell efter att vyn löst lag-koden (för flagg-discen) ur teamApiId. */
interface DisplayRow {
  playerId: number;
  playerName: string;
  teamName: string;
  /** FIFA-kod (gemen) för TeamFlag, null när bryggan inte känner laget (ingen disc då). */
  teamCode: string | null;
  /** Den primära siffran (mål i skytteligan, assists i assist-ligan). */
  primary: number;
  /** Sekundär notering ("varav 2 straff" / "3 mål"), null när inget att visa. */
  note: string | null;
  /** Antal matcher (för "på Y matcher"). */
  matches: number;
}

/** Lag-koden (FIFA) för flagg-discen ur API-team-id. null -> ingen disc (gissa aldrig). */
function teamCodeFor(teamApiId: number): string | null {
  return resolveAppTeamId(teamApiId);
}

/** Projicera en skytteliga-rad till visnings-modellen (straff-notering om någon). */
function scorerToDisplay(row: ScorerRow): DisplayRow {
  return {
    playerId: row.playerId,
    playerName: row.playerName,
    teamName: row.teamName,
    teamCode: teamCodeFor(row.teamApiId),
    primary: row.goals,
    note: row.penalties > 0 ? `varav ${row.penalties} straff` : null,
    matches: row.matches,
  };
}

/** Projicera en assist-liga-rad till visnings-modellen (egna mål som notering). */
function assistToDisplay(row: AssistRow): DisplayRow {
  return {
    playerId: row.playerId,
    playerName: row.playerName,
    teamName: row.teamName,
    teamCode: teamCodeFor(row.teamApiId),
    primary: row.assists,
    note: row.goals > 0 ? `${row.goals} mål` : null,
    matches: row.matches,
  };
}

/** Den primära enheten ("mål"/"assist") , singular/plural-medvetet, för rad + skärmläsare. */
function unitLabel(tab: LeagueTab, n: number): string {
  if (tab === 'scorers') {
    return n === 1 ? 'mål' : 'mål'; // "mål" är oräknebart i svenskan (1 mål / 5 mål)
  }
  return n === 1 ? 'assist' : 'assists';
}

/** En rad i ligan. rank = absolut placering (1-baserad). Egen komponent för fokuserad markup. */
function LeagueRow({ row, rank, tab }: { row: DisplayRow; rank: number; tab: LeagueTab }) {
  const medal = MEDAL_CLASS[rank];
  const unit = unitLabel(tab, row.primary);
  return (
    <li
      data-scorer-row=""
      data-player-id={row.playerId}
      data-rank={rank}
      className="flex items-center gap-3 rounded-card px-3 py-2.5"
    >
      {/* Placering: topp-3 medalj (färg-oberoende form), plats 4+ neutral pill. aria-label
          bär den exakta platsen i båda fallen. */}
      <span
        aria-label={`Placering ${rank}`}
        className={
          medal
            ? `${medal} inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-sm tabular-nums`
            : 'vm-board-rank inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-sm tabular-nums'
        }
      >
        {rank}
      </span>

      {/* Lag-emblem (dekor, aria-hidden i TeamFlag). Saknas koden -> ingen disc (gissa aldrig). */}
      {row.teamCode ? <TeamFlag code={row.teamCode} size="sm" /> : null}

      {/* Spelare + lag. Namnet är det enda som krymper (min-w-0 + truncate), så siffer-
          kolumnen aldrig trycks ut på smal skärm. */}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{row.playerName}</span>
        <span className="truncate text-xs text-fg-muted">
          {row.teamName}
          {row.note ? ` , ${row.note}` : ''}
        </span>
      </span>

      {/* Primär siffra: mål/assists + enhet. Ledaren (rank 1) får guld-text (AA-mätt token). */}
      <span
        className={`shrink-0 font-display text-sm font-semibold tabular-nums ${
          rank === 1 ? 'text-warning' : ''
        }`}
      >
        {row.primary} {unit}
      </span>
    </li>
  );
}

/** Komprimerbar liga-lista (topp-N + "Visa alla"), via den delade CollapsibleList-primitiven. */
function LeagueList({ rows, tab, listId }: { rows: DisplayRow[]; tab: LeagueTab; listId: string }) {
  const noun = tab === 'scorers' ? 'målskytt' : 'assist';
  if (rows.length === 0) {
    // Edge: inga mål/assists än (före turneringens första mål). Lugn rad, ingen tom ruta.
    return (
      <p data-scorer-empty="" className="px-1 py-4 text-sm text-fg-muted">
        {tab === 'scorers'
          ? 'Inga mål gjorda än. Skytteligan fylls på så fort bollen går i nät.'
          : 'Inga assists noterade än.'}
      </p>
    );
  }
  return (
    <CollapsibleList
      items={rows}
      collapsedVisibleCount={COLLAPSED_VISIBLE}
      name="scorer"
      listId={listId}
      listAriaLabel={tab === 'scorers' ? 'Hela skytteligan' : 'Hela assist-ligan'}
      labels={{
        expand: (total) => `Visa alla ${total} (${noun}ar)`,
        collapse: 'Visa färre',
      }}
      getItemKey={(row) => String(row.playerId)}
      renderPreview={({ previewItems }) => (
        <ol data-scorer-preview="" className="flex flex-col gap-1">
          {previewItems.map((row, i) => (
            <LeagueRow key={row.playerId} row={row} rank={i + 1} tab={tab} />
          ))}
        </ol>
      )}
      renderItem={(row, index) => <LeagueRow row={row} rank={index + 1} tab={tab} />}
    />
  );
}

/** Segment-växeln mellan skytteliga och assist-liga (en lista i taget). */
function LeagueSwitch({
  tab,
  onChange,
  scorerCount,
  assistCount,
}: {
  tab: LeagueTab;
  onChange: (next: LeagueTab) => void;
  scorerCount: number;
  assistCount: number;
}) {
  const base =
    'flex-1 rounded-pill px-3 py-1.5 text-sm font-semibold transition-colors tabular-nums';
  const active = 'bg-surface text-fg shadow-[var(--vm-shadow-card)]';
  const inactive = 'text-fg-muted hover:text-fg';
  return (
    <div
      role="tablist"
      aria-label="Välj liga"
      className="flex gap-1 rounded-pill bg-surface-raised p-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'scorers'}
        onClick={() => onChange('scorers')}
        className={`${base} ${tab === 'scorers' ? active : inactive}`}
      >
        Skytteliga{scorerCount > 0 ? ` (${scorerCount})` : ''}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'assists'}
        onClick={() => onChange('assists')}
        className={`${base} ${tab === 'assists' ? active : inactive}`}
      >
        Assist{assistCount > 0 ? ` (${assistCount})` : ''}
      </button>
    </div>
  );
}

/**
 * Skytteliga-vyn: laddar cross-match-events (near-live), aggregerar, och visar den valda
 * ligan komprimerad + utfällbar. Tål alla tillstånd: loading (role=status), error (role=alert,
 * fail-loud), tom data (lugn rad). I fixtures-läge renderas den ur committade fixtures-events
 * (en demo-skytteliga utan backend).
 */
export function ScorerTableView() {
  const { status, matches, error } = useCrossMatchEvents();
  const [tab, setTab] = useState<LeagueTab>('scorers');
  const listId = useId();

  // Aggregeringen är ren + memoiserad: räknas bara om när events-mängden faktiskt ändras
  // (en near-live re-fetch som inte gav nya events ger samma referens -> ingen omräkning).
  const { scorers, assisters } = useMemo(() => aggregateScoring(matches), [matches]);
  const scorerRows = useMemo(() => scorers.map(scorerToDisplay), [scorers]);
  const assistRows = useMemo(() => assisters.map(assistToDisplay), [assisters]);

  return (
    <Surface aria-labelledby="scorer-heading" data-scorer-view="">
      <header className="flex flex-col gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-warning">
          VM-statistik
        </p>
        <h2 id="scorer-heading" className="font-display text-xl font-semibold sm:text-2xl">
          Skytteliga
        </h2>
        <p className="max-w-2xl text-sm text-fg-muted">
          Vem är VM:s skyttekung? Listan uppdateras direkt när ett mål trillar. Straffmål räknas,
          egenmål räknas inte på skytten.
        </p>
      </header>

      <div className="mt-5 flex flex-col gap-4">
        {status === 'loading' ? (
          <p role="status" data-scorer-loading="" className="py-4 text-sm text-fg-muted">
            Laddar skytteligan...
          </p>
        ) : status === 'error' ? (
          <p role="alert" data-scorer-error="" className="py-4 text-sm text-danger">
            Kunde inte ladda skytteligan{error ? `: ${error}` : '.'}
          </p>
        ) : (
          <>
            <LeagueSwitch
              tab={tab}
              onChange={setTab}
              scorerCount={scorerRows.length}
              assistCount={assistRows.length}
            />
            {tab === 'scorers' ? (
              <LeagueList rows={scorerRows} tab="scorers" listId={`${listId}-scorers`} />
            ) : (
              <LeagueList rows={assistRows} tab="assists" listId={`${listId}-assists`} />
            )}
          </>
        )}
      </div>
    </Surface>
  );
}
