// DELAD "STICKY KONTROLL-RAD + utfälld lång lista"-byggsten (#173 T82 del 4).
//
// ÄGARENS FEEDBACK (källan till hela bygget): den globala topplistans utfällda läge fick
// en STICKY kontroll-rad som "följer med i listan" (komprimera/sök/hoppa alltid ett tryck
// bort oavsett scroll-position), och listan börjar KOMPRIMERAD. Ägaren ville ha SAMMA
// mönster på alla långa listor. Den här komponenten bär den GENERELLA kärnan (lyft ur
// total-leaderboard/TotalLeaderboardList, generaliserad), så total-topplistan, resultat-
// listan och övriga långa listor delar EN sanning (PRINCIPLES §3-4, rule-of-three uppfyllt).
//
// VAD DEN GÖR: renderar en (möjligen mycket lång) rad-lista i ett HÖJD-begränsat, scrollbart
// fönster med en `position: sticky`-kontroll-rad överst INUTI fönstret. Kontroll-raden bär
// alltid en KOMPRIMERA-kontroll (nåbar från alla scroll-lägen) + ett valfritt `controls`-
// slot (sök/hoppa-till-mig per konsument). Vid LÅNGA listor (rowHeight satt) virtualiseras
// raderna (bara det synliga spannet i DOM:en) via den delade useVirtualRows; korta listor
// renderar alla rader (ingen virtualisering behövs, ingen fast radhöjd krävs).
//
// A11Y (lessons "list-ARIA, inte grid"): role="list" + aria-setsize/aria-posinset per rad
// bär HELA listans storlek för skärmläsaren även när bara en delmängd är i DOM:en
// (virtualiseringen får inte ljuga om storleken). Komprimera-kontrollen bär aria-expanded
// + aria-controls mot listans region. Den sticky raden fångar inte fokus konstigt (den är
// bara en container; kontrollerna i den är vanliga fokuserbara knappar/fält).

import { useEffect, useMemo, type MutableRefObject, type ReactNode } from 'react';
import { useVirtualRows } from './use-virtual-rows';
import './collapsible-list.css';

/** Maxhöjd (px) på det scrollande fönstret. Håller även en 240-rads-lista kompakt. */
const DEFAULT_SCROLL_VIEWPORT_PX = 520;

export interface CollapsibleScrollListProps<T> {
  /** Alla rader i listan (hela datat, även när bara en delmängd renderas via virtualisering). */
  items: readonly T[];
  /** Rendera EN rad. Får raden + dess absoluta index (0-baserat) i hela listan. */
  renderItem: (item: T, index: number) => ReactNode;
  /** Stabil React-key per rad (krävs, så virtualiseringens remount inte tappar identitet). */
  getItemKey: (item: T, index: number) => string;
  /**
   * Radhöjd i px. Satt => VIRTUALISERA (fast-höjd-windowing, bara synliga rader i DOM:en),
   * MÅSTE matcha radernas faktiska CSS-höjd. Utelämnad => rendera ALLA rader (korta listor
   * eller rader vars höjd varierar, t.ex. en motion-animerad rad som inte tål en fast höjd).
   */
  rowHeight?: number;
  /** Tillgängligt namn på list-regionen (aria-label), t.ex. "Hela topplistan, 240 deltagare". */
  ariaLabel: string;
  /** Etikett på komprimera-kontrollen (t.ex. "Komprimera"). Krävs när `onCollapse` ges. */
  collapseLabel?: string;
  /**
   * Fäll in den utfällda listan igen. När den ges renderas en STICKY "Komprimera"-kontroll i
   * raden (alltid nåbar oavsett scroll). Utelämnas den visas INGEN komprimera-kontroll (t.ex.
   * en fristående render där komprimering inte är aktuell), men scroll-fönstret + ev. övriga
   * `controls` (sök/hoppa) renderas ändå.
   */
  onCollapse?: () => void;
  /** Id på listans region (komprimera-kontrollens aria-controls + konsumentens aria-controls). */
  listId?: string;
  /**
   * Data-attribut-namnrymd: `data-${name}-scroll/-controls/-collapse` osv, så varje konsument
   * får stabila, egna test-/styling-krokar. Default 'collapsible'.
   */
  name?: string;
  /**
   * Valfritt extra kontroll-innehåll i den sticky raden (t.ex. sök + hoppa-till-mig).
   * Renderas FÖRE komprimera-knappen. Konsumenten äger dess beteende + a11y.
   */
  controls?: ReactNode;
  /**
   * Valfritt innehåll DIREKT under den sticky raden men INUTI det scrollande flödet (scrollar
   * med listan), t.ex. en "ingen träff"-sökfeedback. Bär ingen sticky-position.
   */
  belowControls?: ReactNode;
  /** Maxhöjd (px) på scroll-fönstret. Default 520. */
  scrollViewportPx?: number;
  /**
   * Extra klass(er) på scroll-fönstret / sticky raden / komprimera-knappen, så en konsument
   * kan behålla sina egna redan stylade/testade klassnamn (t.ex. total-topplistans
   * vm-total-scroll / vm-total-controls / vm-total-control). Ren styling-/test-hak,
   * påverkar ingen logik.
   */
  scrollClassName?: string;
  controlsClassName?: string;
  collapseClassName?: string;
  /**
   * Valfri ref som får den imperativa `scrollToIndex(index)` (virtualiseringens scroll-handle),
   * så en konsument kan skrolla till en rad (sök-träff, "hoppa till mig") utan att äga
   * scroll-elementet. Bara meningsfull i virtualiserat läge (satt rowHeight).
   */
  scrollToIndexRef?: MutableRefObject<((index: number) => void) | null>;
}

/**
 * Den utfällda långa listan med en sticky kontroll-rad. Virtualiserar vid satt rowHeight,
 * annars renderar alla rader. Generisk över radtypen T.
 */
export function CollapsibleScrollList<T>({
  items,
  renderItem,
  getItemKey,
  rowHeight,
  ariaLabel,
  collapseLabel,
  onCollapse,
  listId,
  name = 'collapsible',
  controls,
  belowControls,
  scrollViewportPx = DEFAULT_SCROLL_VIEWPORT_PX,
  scrollClassName,
  controlsClassName,
  collapseClassName,
  scrollToIndexRef,
}: CollapsibleScrollListProps<T>) {
  const virtualize = rowHeight !== undefined && rowHeight > 0;
  // Hooken anropas ovillkorligt (Rules of Hooks). Vid icke-virtualiserat läge matar vi en
  // radhöjd på 1 så matematiken är giltig men vi ANVÄNDER inte dess spann (vi renderar alla
  // rader); virtualiseringens scroll-/offset-utdata används bara när virtualize=true.
  const virtual = useVirtualRows(items.length, virtualize ? (rowHeight as number) : 1);

  // Exponera den imperativa scroll-handlen till konsumenten (sök/hoppa-till-mig). Stabil
  // (useCallback på rowHeight), så effekten bara skriver om vid en faktisk handle-ändring.
  useEffect(() => {
    if (scrollToIndexRef === undefined) {
      return;
    }
    scrollToIndexRef.current = virtual.scrollToIndex;
    return () => {
      scrollToIndexRef.current = null;
    };
  }, [scrollToIndexRef, virtual.scrollToIndex]);

  // Det renderade spannet: virtualiserat = [startIndex, endIndex), annars = hela listan.
  const startIndex = virtualize ? virtual.startIndex : 0;
  const endIndex = virtualize ? virtual.endIndex : items.length;
  const visible = useMemo(() => {
    const slice: { item: T; index: number }[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      slice.push({ item: items[i], index: i });
    }
    return slice;
  }, [items, startIndex, endIndex]);

  return (
    <div
      ref={virtual.scrollRef}
      {...{ [`data-${name}-scroll`]: '', [`data-${name}-count`]: items.length }}
      data-collapsible-scroll=""
      className={`vm-collapsible-scroll relative overflow-y-auto overscroll-contain rounded-card${
        scrollClassName ? ` ${scrollClassName}` : ''
      }`}
      style={{ maxHeight: scrollViewportPx }}
    >
      {/* STICKY KONTROLL-RAD: fäst överst i fönstret (position:sticky via Tailwind, opak fond
          + skugga via .vm-collapsible-controls i collapsible-list.css), så komprimera (+ ev.
          sök/hoppa) ALDRIG skrollas ur synhåll , kärnan i ägarens feedback. */}
      <div
        {...{ [`data-${name}-controls`]: '' }}
        data-collapsible-controls=""
        className={`vm-collapsible-controls sticky top-0 z-10 flex flex-col gap-2 px-2 py-2 sm:flex-row sm:items-center${
          controlsClassName ? ` ${controlsClassName}` : ''
        }`}
      >
        {/* Konsumentens egna kontroller (sök, hoppa-till-mig) FÖRE komprimera, så komprimera
            sitter konsekvent ytterst till höger på breda skärmar. */}
        {controls}
        {/* KOMPRIMERA: alltid nåbar (sticky), så man kan fälla in listan från vilken scroll-
            position som helst , kärnan i ägarens feedback. Bara när onCollapse ges (annars
            finns inget komprimerat läge att gå tillbaka till, t.ex. en fristående render). */}
        {onCollapse ? (
          <div className="flex flex-wrap items-stretch gap-2 sm:ml-auto">
            <button
              type="button"
              {...{ [`data-${name}-collapse`]: '' }}
              data-collapsible-collapse=""
              aria-expanded={true}
              aria-controls={listId}
              onClick={onCollapse}
              className={`vm-collapsible-control flex-1 whitespace-nowrap rounded-pill px-4 py-2 text-sm font-semibold sm:flex-none${
                collapseClassName ? ` ${collapseClassName}` : ''
              }`}
            >
              {collapseLabel}
            </button>
          </div>
        ) : null}
      </div>

      {/* Valfritt innehåll under den sticky raden men i scroll-flödet (t.ex. sök-feedback). */}
      {belowControls}

      <div
        role="list"
        aria-label={ariaLabel}
        // Virtualiserat: en spacer-div med listans FULLA höjd håller scrollbaren rätt, och
        // det synliga spannet ligger absolut på sin offset. Icke-virtualiserat: normalt flöde.
        style={virtualize ? { height: virtual.totalHeight, position: 'relative' } : undefined}
      >
        <div
          style={
            virtualize
              ? { position: 'absolute', top: virtual.offsetTop, left: 0, right: 0 }
              : undefined
          }
        >
          {visible.map(({ item, index }) => (
            <div
              key={getItemKey(item, index)}
              role="listitem"
              // HELA listans storlek + radens absoluta position bärs av list-ARIA, så AT vet
              // att listan har items.length rader även om bara en delmängd är monterad.
              aria-setsize={items.length}
              aria-posinset={index + 1}
              style={virtualize ? { height: rowHeight } : undefined}
              className="flex items-stretch px-1 py-1"
            >
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Exporterad för test (mät att fönstret är HÖJD-begränsat, inte hela listan i DOM:en).
export { DEFAULT_SCROLL_VIEWPORT_PX };
