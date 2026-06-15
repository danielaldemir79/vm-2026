// Den UTFÄLLDA, virtualiserade fulla listan för den totala topplistan (#173). NU en TUNN
// konsument av den delade collapsible-list-byggstenen (T82 del 4): CollapsibleScrollList bär
// scroll-fönstret, den STICKY kontroll-raden, virtualiseringen och list-ARIA:n; här bor bara
// det TOTAL-SPECIFIKA , sök, "hoppa till mig" och rad-renderingen (TotalLeaderboardRow).
//
// SPIKAD UX (oförändrad mot #173-finishen): hela listan som EN mjuk scroll, VIRTUALISERAD
// (bara synliga rader i DOM:en, snabb även vid 240+). En STICKY kontroll-rad överst i det
// scrollande fönstret bär SÖKFÄLTET (hoppa till namn), en "HOPPA TILL MIG"-knapp och en
// "KOMPRIMERA"-knapp (sticky => alltid ett tryck bort oavsett scroll-position). Egen rad
// fortsatt markerad. Data-attributen (data-total-scroll/-controls/-collapse/-count, role/
// aria-setsize) bevaras genom byggstenens name="total"-namnrymd + dess generiska list-ARIA.

import { useMemo, useRef, useState } from 'react';
import { TotalLeaderboardRow, TOTAL_ROW_HEIGHT } from './TotalLeaderboardRow';
import { CollapsibleScrollList } from '../../components/collapsible-list';
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
   * Fäll in den fulla listan igen (View:ns expanded -> false). Byggstenens sticky
   * "Komprimera"-kontroll anropar denna. Utelämnas den (fristående test-render) ska INGEN
   * komprimera-kontroll visas, så vi renderar då inte byggstenen alls (en ren list-render).
   */
  onCollapse?: () => void;
  /** Id på den fulla listans region (för komprimera-kontrollens aria-controls). */
  listId?: string;
}) {
  const [query, setQuery] = useState('');
  const [searchMissing, setSearchMissing] = useState(false);
  // Imperativ scroll-handle från byggstenen (sök + hoppa-till-mig anropar scrollToIndex).
  const scrollToIndexRef = useRef<((index: number) => void) | null>(null);

  const selfIndex = useMemo(() => findSelfIndex(entries, currentUserId), [entries, currentUserId]);

  const jumpToMe = () => {
    if (selfIndex >= 0) {
      scrollToIndexRef.current?.(selfIndex);
    }
  };

  const runSearch = () => {
    const idx = findSearchIndex(entries, query);
    if (idx >= 0) {
      scrollToIndexRef.current?.(idx);
      setSearchMissing(false);
    } else {
      setSearchMissing(query.trim() !== '');
    }
  };

  // Sök + hoppa-till-mig: total-topplistans EGNA kontroller, renderade i byggstenens sticky
  // kontroll-rad via `controls`-slot:en (FÖRE den generiska komprimera-knappen).
  const controls = (
    <>
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
          className="vm-total-control vm-collapsible-control shrink-0 rounded-pill px-4 py-2 text-sm font-semibold"
        >
          Sök
        </button>
      </div>
      {/* Hoppa-till-mig: wrappar och växer till full bredd på smala skärmar (vikbar cover
          ~280px) så ingen knapp klipps; inline på bredare skärmar. */}
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
    </>
  );

  // Sök-feedback (fail loud men lugnt): "ingen träff" om söktexten inte fanns. Ligger under
  // den sticky raden men SCROLLAR med listan (hör till sök-resultatet, inte kontrollerna).
  const belowControls = (
    <p
      role="status"
      aria-live="polite"
      data-total-search-status=""
      className="vm-total-search-feedback m-0 px-3 text-xs text-fg-muted"
      style={{ minHeight: searchMissing ? '1.25rem' : 0 }}
    >
      {searchMissing ? `Ingen deltagare matchar "${query.trim()}".` : ''}
    </p>
  );

  return (
    <div data-total-list="" className="flex flex-col">
      <CollapsibleScrollList
        items={entries}
        rowHeight={TOTAL_ROW_HEIGHT}
        getItemKey={(entry) => entry.userId}
        renderItem={(entry) => (
          <TotalLeaderboardRow
            entry={entry}
            isSelf={currentUserId !== null && entry.userId === currentUserId}
            style={{ width: '100%' }}
          />
        )}
        ariaLabel={`Hela topplistan, ${entries.length} deltagare`}
        collapseLabel="Komprimera"
        // onCollapse/listId kan vara undefined (fristående test-render): byggstenen visar då
        // ingen komprimera-kontroll men behåller scroll-fönstret + sök/hoppa-till-mig.
        onCollapse={onCollapse}
        listId={listId}
        name="total"
        controls={controls}
        belowControls={belowControls}
        scrollViewportPx={SCROLL_VIEWPORT_PX}
        scrollClassName="vm-total-scroll"
        controlsClassName="vm-total-controls"
        collapseClassName="vm-total-control"
        scrollToIndexRef={scrollToIndexRef}
      />
    </div>
  );
}

// Exporterad för test (mät att fönstret är begränsat, inte hela listan i DOM:en).
export { SCROLL_VIEWPORT_PX };
