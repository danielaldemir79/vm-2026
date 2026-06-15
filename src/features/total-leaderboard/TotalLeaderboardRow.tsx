// En rad i den TOTALA topplistan (T82 del 3, #173). Delad mellan pallen (topp-5) och
// den virtualiserade fulla listan, så en rad ser IDENTISK ut var den än renderas (DRY).
//
// ÅTERBRUKAR T17:s board-recept (decisions.md T17-visuellt, tokens.css §13): topp-3 =
// .vm-pool-medal (guld/silver/brons, färg-oberoende solid-bricka), plats 4+ =
// .vm-board-rank-pill, egna raden = .vm-board-row[data-self] (accent-ring + "DU"-bricka
// + tint), ledaren = [data-leader] (guld-glow). Ingen ny färgkombination => ärver T17:s
// uppmätta AA-värden (MIN 6.60:1 mörkt / 4.87:1 ljust, decisions.md T17-visuellt).
//
// T90 (#183): "med i N rum"-meta-texten BORTTAGEN. Under den RÄTTVISA modellen (poäng =
// deltagarens BÄSTA enskilda rum, inte summa) ger rum-antalet ingen fördel, så att visa det
// per rad vore vilseledande. Raden bär nu bara placering + namn + poäng (deltagarens bästa
// rum-resultat), samma form som per-rums-raden , det är just det som gör listan rättvis.

import { MEDAL_CLASS } from './medal-class';
import type { TotalLeaderboardEntry } from './aggregate-total';

/** Fast radhöjd (px) , MÅSTE matcha virtualiseringens rowHeight (use-virtual-rows). */
export const TOTAL_ROW_HEIGHT = 64;

/**
 * En total-topplista-rad. `isSelf` markerar den inloggade spelarens rad (färg-oberoende
 * framhävd). `style` injiceras av virtualiseringen (absolut position i listan); utan
 * den (pallen) flödar raden normalt.
 */
export function TotalLeaderboardRow({
  entry,
  isSelf,
  style,
}: {
  entry: TotalLeaderboardEntry;
  isSelf: boolean;
  style?: React.CSSProperties;
}) {
  const isLeader = entry.rank === 1;
  const medalClass = MEDAL_CLASS[entry.rank];

  return (
    <div
      data-total-row=""
      data-user-id={entry.userId}
      data-rank={entry.rank}
      data-points={entry.points}
      data-leader={isLeader ? 'true' : undefined}
      data-self={isSelf ? 'true' : undefined}
      style={style}
      className="vm-board-row flex items-center gap-3 rounded-card px-3 py-2.5 sm:px-4"
    >
      {/* Placering: topp-3 medalj, plats 4+ neutral rank-pill. aria-label bär den exakta
          platsen i BÅDA fallen. */}
      <span
        data-total-rank=""
        aria-label={`Placering ${entry.rank}`}
        className={
          medalClass
            ? `vm-pool-medal ${medalClass} inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-sm tabular-nums sm:h-10 sm:w-10`
            : 'vm-board-rank inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-sm tabular-nums sm:h-10 sm:w-10'
        }
      >
        {entry.rank}
      </span>

      {/* Namn. Truncar (min-w-0), så det är det ENDA som krymper när raden blir trång;
          brickan + poängen är shrink-0 SYSKON och kan aldrig överlappa. */}
      <span data-total-name-group="" className="flex min-w-0 flex-1 flex-col leading-tight">
        <span data-total-name="" className="truncate font-medium">
          {entry.displayName}
        </span>
      </span>

      {/* "DU"-bricka: gör egna raden läsbar som TEXT (färg-oberoende redundans). */}
      {isSelf ? (
        <span
          data-total-self-badge=""
          aria-hidden="true"
          className="vm-board-self-badge shrink-0 rounded-pill px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.12em]"
        >
          Du
        </span>
      ) : null}

      {/* Poängen: ledaren får guld-TEXT (AA-mätt --color-warning), övriga fg. */}
      <span
        data-total-points=""
        className={`shrink-0 font-display text-sm font-semibold tabular-nums ${
          isLeader ? 'text-warning' : ''
        }`}
      >
        {entry.points} p
      </span>
    </div>
  );
}
