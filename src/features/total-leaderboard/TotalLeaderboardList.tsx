// Den UTFÄLLDA, virtualiserade fulla listan för den totala topplistan (T82 del 3, #173).
//
// SPIKAD UX: hela listan som EN mjuk scroll, VIRTUALISERAD (bara synliga rader i DOM:en,
// snabb även vid 240+). En STICKY kontroll-rad överst i det scrollande fönstret bär
// SÖKFÄLTET (hoppa till namn), en "HOPPA TILL MIG"-knapp och en "KOMPRIMERA"-knapp. Inga
// sidor/paginering. Egen rad fortsatt markerad.
//
// STICKY KONTROLL-RAD (#173-finish, ägarens feedback): kontrollerna ligger INUTI det
// scrollande fönstret som en `position: sticky; top: 0`-rad (tokens.css §26), så de FÖLJER
// MED när man bläddrar djupt i listan. Tidigare satt "Komprimera" bara ovanför fönstret,
// så man tvingades skrolla tillbaka till toppen för att fälla in listan när man stod på
// plats ~100. Nu är komprimera (och sök + hoppa-till-mig) alltid ETT tryck bort, oavsett
// scroll-position. Komprimera-kontrollen ägs av listan men flippar View:ns expanded-state
// via `onCollapse`; den bär `aria-expanded`/`aria-controls` mot den fulla listans region.
//
// VIRTUALISERING: useVirtualRows (fast radhöjd, hand-rullad, ingen dependency). Vi
// renderar bara spannet [startIndex, endIndex) absolut-positionerat på sin offset, inuti
// en spacer-div med listans fulla höjd (scrollbaren stämmer). En aria-setsize på varje
// rad säger skärmläsaren hur många rader som FINNS totalt, även om bara en delmängd är i
// DOM:en (virtualiseringen får inte ljuga om listans storlek för AT).

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
  onCollapse,
  listId,
}: {
  entries: readonly TotalLeaderboardEntry[];
  currentUserId: string | null;
  /**
   * Fäll in den fulla listan igen (View:ns expanded -> false). När den ges renderas en
   * STICKY "Komprimera"-kontroll i kontroll-raden, alltid nåbar oavsett scroll-position.
   * Utelämnas den (t.ex. en fristående test-render) visas ingen komprimera-kontroll.
   */
  onCollapse?: () => void;
  /** Id på den fulla listans region (för komprimera-kontrollens aria-controls). */
  listId?: string;
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
    <div data-total-list="" className="flex flex-col">
      {/* DET VIRTUALISERADE SCROLL-FÖNSTRET. Kontroll-raden ligger INUTI det som en sticky
          topp-rad, så sök + hoppa-till-mig + komprimera följer med när man bläddrar djupt.
          role="list" + aria-setsize/aria-posinset på varje RAD säger AT hur många rader som
          FINNS totalt (även om bara en DELMÄNGD är i DOM:en). En spacer-div med full höjd
          håller scrollbaren rätt; det synliga spannet ligger absolut på sin offset. */}
      <div
        ref={virtual.scrollRef}
        data-total-scroll=""
        data-total-count={entries.length}
        className="vm-total-scroll relative overflow-y-auto overscroll-contain rounded-card"
        style={{ maxHeight: SCROLL_VIEWPORT_PX }}
      >
        {/* STICKY KONTROLL-RAD: fäst överst i fönstret (position:sticky, tokens.css §26), så
            den aldrig skrollas ur synhåll. Bär sök, hoppa-till-mig och komprimera. */}
        <div
          data-total-controls=""
          className="vm-total-controls sticky top-0 z-10 flex flex-col gap-2 px-2 py-2 sm:flex-row sm:items-center"
        >
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
          {/* Hoppa-till-mig + komprimera: på smala skärmar (vikbar cover ~280px) WRAPPAR de
              och växer till full bredd (flex-1) så ingen knapp klipps; på bredare skärmar
              sitter de inline. shrink-0 på texten via white-space hindrar att etiketten bryts. */}
          <div className="flex flex-wrap items-stretch gap-2">
            {selfIndex >= 0 ? (
              <button
                type="button"
                data-total-jump-to-me=""
                onClick={jumpToMe}
                className="vm-total-jump flex-1 whitespace-nowrap rounded-pill px-4 py-2 text-sm font-semibold sm:flex-none"
              >
                Hoppa till mig
              </button>
            ) : null}
            {/* KOMPRIMERA: alltid nåbar (sticky), så man kan fälla in listan från vilken
                scroll-position som helst , kärnan i ägarens feedback. */}
            {onCollapse ? (
              <button
                type="button"
                data-total-collapse=""
                aria-expanded={true}
                aria-controls={listId}
                onClick={onCollapse}
                className="vm-total-control flex-1 whitespace-nowrap rounded-pill px-4 py-2 text-sm font-semibold sm:flex-none"
              >
                Komprimera
              </button>
            ) : null}
          </div>
        </div>

        {/* Sök-feedback (fail loud men lugnt): "ingen träff" om söktexten inte fanns. Den
            ligger ovanpå raderna men UNDER den sticky kontroll-raden (egen rad i flödet),
            så den syns när man sökt utan att täcka kontrollerna. */}
        <p
          ref={statusRef}
          role="status"
          aria-live="polite"
          data-total-search-status=""
          className="vm-total-search-feedback m-0 px-3 text-xs text-fg-muted"
          style={{ minHeight: searchMissing ? '1.25rem' : 0 }}
        >
          {searchMissing ? `Ingen deltagare matchar "${query.trim()}".` : ''}
        </p>

        <div
          role="list"
          aria-label={`Hela topplistan, ${entries.length} deltagare`}
          style={{ height: virtual.totalHeight, position: 'relative' }}
        >
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
