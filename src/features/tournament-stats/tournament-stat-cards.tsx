// PRESENTATIONS-BYGGSTENAR för turneringsstatistiken (T88, #180). Rena vy-komponenter (ingen
// datahämtning, ingen aggregering) , de tar färdiga vy-modeller och renderar dem i appens
// designsystem (Surface-raised stat-kort, CollapsibleList för långa listor, TeamFlag för lag-
// identitet, tokens för färg/typografi). Bryts ut ur TournamentStatsView så vyn själv håller
// sig till "vilka stats + i vilken ordning" och korten till "hur en stat ser ut" (PRINCIPLES
// §2, en fil ett ansvar). Konsekvent med skytteligans LeagueRow/LeagueList-idiom.

import { Surface } from '../../components/Surface';
import { CollapsibleList } from '../../components/collapsible-list';
import { TeamFlag } from '../daily/TeamFlag';
import type { GoalTiming } from './tournament-stats-events';

/** Pallplats-medalj-klass för topp-3 (samma vokabulär som topplistan/skytteligan). */
const MEDAL_CLASS: Record<number, string> = {
  1: 'vm-pool-medal vm-pool-medal--gold',
  2: 'vm-pool-medal vm-pool-medal--silver',
  3: 'vm-pool-medal vm-pool-medal--bronze',
};

/**
 * En lugn, understruken coverage-notering (T100, #207): förklarar att ett event-/statistik-täckt
 * kort bara ser en DELMÄNGD matcher (de med detaljerad spelardata), så en frånvarande skytt/mål
 * inte väcker misstanke om fel. Husets typografi: liten, dämpad, en rad. Inte ett fel (ingen
 * role=alert) , bara en ärlig fotnot.
 */
function CoverageNote({ text }: { text: string }) {
  return (
    <p data-tournament-stat-coverage="" className="text-xs italic text-fg-muted">
      {text}
    </p>
  );
}

/** En generisk rad i ett stat-list-kort (en spelare/lag/match + ett nyckeltal). */
export interface MetricListItem {
  /** Stabil React-nyckel. */
  key: string;
  /** Primär etikett (spelarnamn / lagnamn / "X slog Y"). */
  title: string;
  /** Sekundär rad (lagnamn / antal matcher / ranking-info), null när inget. */
  subtitle: string | null;
  /** FIFA-kod (gemen) för flagg-discen, null när laget inte kan lösas (ingen disc då). */
  teamCode: string | null;
  /** Det primära värdet (mål/kort/snitt/gap), redan formaterat till text. */
  value: string;
  /** Enheten efter värdet ("mål"/"kort"/"%"...), tom sträng = ingen enhet. */
  valueUnit: string;
  /** Liten notering ("varav 2 gula"), null när inget att visa. */
  note: string | null;
}

/** En rad i ett stat-list-kort. rank = absolut placering (1-baserad). */
function MetricRow({ item, rank }: { item: MetricListItem; rank: number }) {
  const medal = MEDAL_CLASS[rank];
  return (
    <li
      data-tournament-stat-row=""
      data-rank={rank}
      className="flex items-center gap-3 rounded-card px-3 py-2.5"
    >
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

      {item.teamCode ? <TeamFlag code={item.teamCode} size="sm" /> : null}

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{item.title}</span>
        {item.subtitle || item.note ? (
          <span className="truncate text-xs text-fg-muted">
            {item.subtitle ?? ''}
            {item.subtitle && item.note ? ' , ' : ''}
            {item.note ?? ''}
          </span>
        ) : null}
      </span>

      <span
        className={`shrink-0 font-display text-sm font-semibold tabular-nums ${
          rank === 1 ? 'text-warning' : ''
        }`}
      >
        {item.value}
        {item.valueUnit ? ` ${item.valueUnit}` : ''}
      </span>
    </li>
  );
}

export interface MetricListCardProps {
  title: string;
  description: string;
  items: MetricListItem[];
  /** Är datakällan klar? Annars visas notReadyText (eller en lugn laddnings-rad). */
  ready: boolean;
  /** Text när listan är tom (ingen data än , lugn rad, ingen tom ruta). */
  emptyText: string;
  /**
   * Text när datakällan INTE är klar (default "Laddar..."). Används för en icke-laddnings-
   * orsak, t.ex. "visas med verkliga resultat" när what-if-läget döljer kortet (F2).
   */
  notReadyText?: string;
  /**
   * Lugn coverage-notering under listan (T100, #207, truth-in-labeling): för event-/statistik-
   * täckta kort som bara ser en delmängd matcher, t.ex. "Baseras på 7 matcher med detaljerad
   * spelardata." Null/utelämnad -> ingen not (facit-täckta kort behöver den inte).
   */
  coverageNote?: string | null;
  /** Id på den utfällda listans region (delas av expand-toggeln + sticky komprimera). */
  listId: string;
  /** Topp-N synliga i komprimerat läge. */
  collapsedVisibleCount: number;
}

/**
 * Ett stat-list-kort: rubrik + beskrivning + en KOMPRIMERAD lista (topp-N + "Visa alla") via
 * den delade CollapsibleList-primitiven. Egen upphöjd yta (Surface raised) inuti omslags-
 * Surfacen, så varje stat är ett tydligt avgränsat block utan att bli en vägg.
 */
export function MetricListCard({
  title,
  description,
  items,
  ready,
  emptyText,
  notReadyText,
  coverageNote,
  listId,
  collapsedVisibleCount,
}: MetricListCardProps) {
  return (
    <Surface
      as="section"
      tone="raised"
      padding="compact"
      aria-label={title}
      data-tournament-stat-card=""
      className="flex flex-col gap-3"
    >
      <header className="flex flex-col gap-1">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        <p className="text-xs text-fg-muted">{description}</p>
      </header>

      {/* Coverage-not (T100): visas bara när kortet ÄR klart med rader (annars är notReady/empty-
          texten redan förklaringen), så vi inte dubblar budskap eller visar den på en tom lista. */}
      {ready && coverageNote && items.length > 0 ? <CoverageNote text={coverageNote} /> : null}

      {!ready ? (
        <p role="status" data-tournament-stat-notready="" className="py-2 text-sm text-fg-muted">
          {notReadyText ?? 'Laddar...'}
        </p>
      ) : items.length === 0 ? (
        <p data-tournament-stat-empty="" className="py-2 text-sm text-fg-muted">
          {emptyText}
        </p>
      ) : (
        <CollapsibleList
          items={items}
          collapsedVisibleCount={collapsedVisibleCount}
          name="tournament-stat"
          listId={listId}
          listAriaLabel={`Hela listan: ${title}`}
          labels={{
            expand: (total) => `Visa alla ${total}`,
            collapse: 'Visa färre',
          }}
          getItemKey={(item) => item.key}
          renderPreview={({ previewItems }) => (
            <ol data-tournament-stat-preview="" className="flex flex-col gap-2">
              {previewItems.map((item, i) => (
                <MetricRow key={item.key} item={item} rank={i + 1} />
              ))}
            </ol>
          )}
          renderItem={(item, index) => <MetricRow item={item} rank={index + 1} />}
        />
      )}
    </Surface>
  );
}

export interface HighlightStatRowProps {
  label: string;
  /** Det stora värdet (snabbaste mål / målsnitt), null när inget än. */
  value: string | null;
  /** En liten under-rad (skytt + lag / mål-summering). */
  detail: string;
  ready: boolean;
  /**
   * Text när kortet INTE är klart (default "Laddar..."). För en icke-laddnings-orsak, t.ex. att
   * what-if-läget döljer ett facit-höjdpunkts-kort (T100, samma anda som MetricListCard).
   */
  notReadyText?: string;
}

/**
 * Ett KOMPAKT höjdpunkts-kort (ett enda nyckeltal stort + en under-rad). För snabbaste mål,
 * målsnitt och största matchen, som inte är listor utan enskilda siffror.
 */
export function HighlightStatRow({
  label,
  value,
  detail,
  ready,
  notReadyText,
}: HighlightStatRowProps) {
  return (
    <Surface
      as="div"
      tone="raised"
      padding="compact"
      data-tournament-highlight=""
      className="flex flex-col gap-1"
    >
      <p className="font-display text-xs font-semibold uppercase tracking-[0.15em] text-fg-muted">
        {label}
      </p>
      {!ready ? (
        <p role="status" className="text-sm text-fg-muted">
          {notReadyText ?? 'Laddar...'}
        </p>
      ) : (
        <>
          <p className="font-display text-2xl font-semibold tabular-nums">{value ?? ','}</p>
          <p className="truncate text-xs text-fg-muted">{detail}</p>
        </>
      )}
    </Surface>
  );
}

export interface GoalTimingCardProps {
  timing: GoalTiming;
  ready: boolean;
  /** Lugn coverage-not (T100): mål-tidningen ser bara de event-täckta matcherna. */
  coverageNote?: string | null;
}

/**
 * Mål-fördelningen över matchtiden (15-min-hinkar) som en liten horisontell stapel. Varje hink
 * får en bredd proportionell mot sin andel av målen; siffran står ovanför. Rent dekorativ
 * grafik (aria-hidden på staplarna) + en uttömmande text-sammanfattning för skärmläsare.
 */
export function GoalTimingCard({ timing, ready, coverageNote }: GoalTimingCardProps) {
  const max = timing.buckets.reduce((m, b) => Math.max(m, b.count), 0);
  const total = timing.buckets.reduce((s, b) => s + b.count, 0);
  return (
    <Surface
      as="section"
      tone="raised"
      padding="compact"
      aria-label="När faller målen"
      data-tournament-timing-card=""
      className="flex flex-col gap-3"
    >
      <header className="flex flex-col gap-1">
        <h3 className="font-display text-base font-semibold">När faller målen?</h3>
        <p className="text-xs text-fg-muted">Alla mål fördelade på 15-minutersperioder.</p>
      </header>

      {/* Coverage-not bara när det FINNS mål att fördela (annars är "inga mål än" förklaringen). */}
      {ready && coverageNote && total > 0 ? <CoverageNote text={coverageNote} /> : null}

      {!ready ? (
        <p role="status" className="py-2 text-sm text-fg-muted">
          Laddar...
        </p>
      ) : total === 0 ? (
        <p data-tournament-stat-empty="" className="py-2 text-sm text-fg-muted">
          Inga mål gjorda än.
        </p>
      ) : (
        <div
          data-tournament-timing-bars=""
          className="flex items-end gap-1.5"
          role="img"
          aria-label={timingSummary(timing)}
        >
          {timing.buckets.map((b) => {
            // Höjd proportionell mot hinkens andel av den största hinken (minst en gnutta
            // synlig även för en icke-tom hink, så stapeln aldrig "försvinner").
            const heightPct = max === 0 ? 0 : Math.round((b.count / max) * 100);
            return (
              <div key={b.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="text-[0.65rem] font-semibold tabular-nums text-fg-muted">
                  {b.count}
                </span>
                <div
                  aria-hidden="true"
                  className="flex h-20 w-full items-end overflow-hidden rounded-pill bg-surface"
                >
                  <div
                    className="w-full rounded-pill bg-accent transition-[height] motion-reduce:transition-none"
                    style={{ height: `${b.count === 0 ? 0 : Math.max(heightPct, 8)}%` }}
                  />
                </div>
                <span className="text-[0.6rem] tabular-nums text-fg-muted">{b.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </Surface>
  );
}

/** Uttömmande text-sammanfattning av mål-fördelningen, för skärmläsare (role=img-label). */
function timingSummary(timing: GoalTiming): string {
  const parts = timing.buckets
    .filter((b) => b.count > 0)
    .map((b) => `${b.label} minuter: ${b.count}`);
  return parts.length > 0 ? `Mål per period , ${parts.join('; ')}.` : 'Inga mål än.';
}
