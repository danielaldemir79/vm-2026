// Den UTFÄLLDA, virtualiserade fulla listan för den totala topplistan (T82 del 3, #173).
//
// SPIKAD UX: hela listan som EN mjuk scroll, VIRTUALISERAD (bara synliga rader i DOM:en,
// snabb även vid 240+). Ett SÖKFÄLT (hoppa till namn) + en "HOPPA TILL MIG"-knapp. Inga
// sidor/paginering. Egen rad fortsatt markerad.
//
// VIRTUALISERING: useVirtualRows (fast radhöjd, hand-rullad, ingen dependency). Vi
// renderar bara spannet [startIndex, endIndex) absolut-positionerat på sin offset, inuti
// en spacer-div med listans fulla höjd (scrollbaren stämmer). En aria-rowcount på
// container:n säger skärmläsaren hur många rader som FINNS totalt, även om bara en
// delmängd är i DOM:en (virtualiseringen får inte ljuga om listans storlek för AT).

import { useMemo, useRef, useState } from 'react';
import { TotalLeaderboardRow, TOTAL_ROW_HEIGHT } from './TotalLeaderboardRow';
import { useVirtualRows } from './use-virtual-rows';
import type { TotalLeaderboardEntry } from './aggregate-total';

/** Maxhöjd på det scrollande fönstret (px). Håller listan kompakt även vid 240 rader. */
const SCROLL_VIEWPORT_PX = 520;

/** Hitta index för den inloggade spelarens rad (för "hoppa till mig"). -1 om saknas. */
function findSelfIndex(entries: readonly TotalLeaderboardEntry[], userId: string | null): number {
  if (userId === null) {
    return -1;
  }
  return entries.findIndex((e) => e.userId === userId);
}

/** Första index vars namn matchar söktexten (case-insensitiv, svensk locale). -1 om inget. */
function findSearchIndex(entries: readonly TotalLeaderboardEntry[], query: string): number {
  const q = query.trim().toLocaleLowerCase('sv');
  if (q === '') {
    return -1;
  }
  return entries.findIndex((e) => e.displayName.toLocaleLowerCase('sv').includes(q));
}

export function TotalLeaderboardList({
  entries,
  currentUserId,
}: {
  entries: readonly TotalLeaderboardEntry[];
  currentUserId: string | null;
}) {
  const [query, setQuery] = useState('');
  const [searchMissing, setSearchMissing] = useState(false);
  const virtual = useVirtualRows(entries.length, TOTAL_ROW_HEIGHT);
  // Live-region-text för en lyckad/missad sök- eller hopp-åtgärd (skärmläsar-feedback).
  const statusRef = useRef<HTMLParagraphElement | null>(null);

  const selfIndex = useMemo(() => findSelfIndex(entries, currentUserId), [entries, currentUserId]);

  const visible = useMemo(() => {
    const slice: TotalLeaderboardEntry[] = [];
    for (let i = virtual.startIndex; i < virtual.endIndex; i++) {
      slice.push(entries[i]);
    }
    return slice;
  }, [entries, virtual.startIndex, virtual.endIndex]);

  const jumpToMe = () => {
    if (selfIndex >= 0) {
      virtual.scrollToIndex(selfIndex);
    }
  };

  const runSearch = () => {
    const idx = findSearchIndex(entries, query);
    if (idx >= 0) {
      virtual.scrollToIndex(idx);
      setSearchMissing(false);
    } else {
      setSearchMissing(query.trim() !== '');
    }
  };

  return (
    <div data-total-list="" className="flex flex-col gap-3">
      {/* KONTROLLER: sök + hoppa-till-mig. Wrappar på smal skärm, sitter på en rad på sm+. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-stretch gap-2">
          <label className="sr-only" htmlFor="total-search">
            Sök en deltagare i topplistan
          </label>
          <input
            id="total-search"
            data-total-search=""
            type="search"
            inputMode="search"
            placeholder="Sök namn…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchMissing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                runSearch();
              }
            }}
            className="vm-total-search min-w-0 flex-1 rounded-pill px-4 py-2 text-sm"
          />
          <button
            type="button"
            data-total-search-go=""
            onClick={runSearch}
            className="vm-total-control shrink-0 rounded-pill px-4 py-2 text-sm font-semibold"
          >
            Sök
          </button>
        </div>
        {selfIndex >= 0 ? (
          <button
            type="button"
            data-total-jump-to-me=""
            onClick={jumpToMe}
            className="vm-total-jump shrink-0 rounded-pill px-4 py-2 text-sm font-semibold"
          >
            Hoppa till mig
          </button>
        ) : null}
      </div>

      {/* Sök-feedback (fail loud men lugnt): "ingen träff" om söktexten inte fanns. */}
      <p
        ref={statusRef}
        role="status"
        aria-live="polite"
        data-total-search-status=""
        className="m-0 min-h-[1.25rem] text-xs text-fg-muted"
      >
        {searchMissing ? `Ingen deltagare matchar "${query.trim()}".` : ''}
      </p>

      {/* DET VIRTUALISERADE FÖNSTRET. role="list" + aria-setsize/aria-posinset på varje
          rad säger AT hur många rader som FINNS totalt (även om bara en DELMÄNGD är i
          DOM:en) , virtualiseringen får inte ljuga om listans storlek för en skärmläsare.
          (Vi använder aria-setsize/posinset, inte aria-rowcount/rowindex: de senare är
          grid/table-attribut, inte giltiga på en role="list".) En spacer-div med full höjd
          håller scrollbaren rätt; det synliga spannet ligger absolut på sin offset. */}
      <div
        ref={virtual.scrollRef}
        data-total-scroll=""
        role="list"
        aria-label={`Hela topplistan, ${entries.length} deltagare`}
        data-total-count={entries.length}
        className="vm-total-scroll relative overflow-y-auto overscroll-contain rounded-card"
        style={{ maxHeight: SCROLL_VIEWPORT_PX }}
      >
        <div style={{ height: virtual.totalHeight, position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              top: virtual.offsetTop,
              left: 0,
              right: 0,
            }}
          >
            {visible.map((entry, i) => (
              <div
                key={entry.userId}
                role="listitem"
                aria-setsize={entries.length}
                aria-posinset={virtual.startIndex + i + 1}
                style={{ height: TOTAL_ROW_HEIGHT }}
                className="flex items-stretch px-1 py-1"
              >
                <TotalLeaderboardRow
                  entry={entry}
                  isSelf={currentUserId !== null && entry.userId === currentUserId}
                  style={{ width: '100%' }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Exporterad för test (mät att fönstret är begränsat, inte hela listan i DOM:en).
export { SCROLL_VIEWPORT_PX };
