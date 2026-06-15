// ORKESTRERAR "börja KOMPRIMERAD med N rader synliga + Visa alla M + sticky-kontroll-rad i
// utfällt läge" (#173 T82 del 4, delad husprimitiv). Generaliserad ur den uppskattade total-
// topplistans View-orkestrering (TotalLeaderboardView): komprimerat default visar en preview
// (de N översta raderna), en "Visa alla M"-knapp fäller ut hela listan i ett scrollbart
// fönster med en STICKY kontroll-rad (CollapsibleScrollList), och en komprimera-kontroll i
// den raden fäller in igen från VILKEN scroll-position som helst (ägarens kärn-feedback).
//
// FOKUS-DISCIPLIN (a11y, lessons "ingen tappad fokus"): komprimeras listan via den sticky
// kontrollen INUTI fönstret (som sedan avmonteras) återförs fokus till "Visa alla M"-knappen,
// så användaren inte tappas vid en kontroll som just försvann. Bara vid en användar-utlöst
// komprimering, aldrig vid första monteringen.
//
// VARFÖR preview = render-prop (inte en rad-renderare här): "toppen" ser ofta ANNORLUNDA ut
// än en vanlig rad (t.ex. en pall med medaljer). Konsumenten äger preview-markupen och får
// bara veta hur många rader som ska previas (visibleCount) + om utfäll behövs.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CollapsibleScrollList } from './CollapsibleScrollList';
import { ExpandToggle } from '../ExpandToggle';

export interface CollapsibleListRenderArgs<T> {
  /** De N rader som ska visas i KOMPRIMERAT läge (toppen/previewn). */
  previewItems: readonly T[];
  /** Hur många rader previewn visar (= min(items.length, collapsedVisibleCount)). */
  visibleCount: number;
}

export interface CollapsibleListProps<T> {
  /** Hela rad-listan. */
  items: readonly T[];
  /** Hur många rader som visas i KOMPRIMERAT läge (toppen). Default 5. */
  collapsedVisibleCount?: number;
  /** Rendera KOMPRIMERAT läge (toppen/previewn). Konsumenten äger markupen. */
  renderPreview: (args: CollapsibleListRenderArgs<T>) => ReactNode;
  /** Rendera EN rad i den UTFÄLLDA listan. Får raden + dess absoluta index. */
  renderItem: (item: T, index: number) => ReactNode;
  /** Stabil React-key per rad. */
  getItemKey: (item: T, index: number) => string;
  /** Radhöjd (px) => virtualisera den utfällda listan. Utelämnad => rendera alla rader. */
  rowHeight?: number;
  /** Tillgängligt namn på den utfällda list-regionen (aria-label). */
  listAriaLabel: string;
  /** Etiketter för expandera/komprimera-kontrollerna. */
  labels: { expand: (total: number) => string; collapse: string };
  /** Id på den utfällda listans region (delas av expand-toggeln + sticky komprimera). */
  listId: string;
  /** Data-attribut-namnrymd (skickas vidare till CollapsibleScrollList). Default 'collapsible'. */
  name?: string;
  /** Valfritt extra kontroll-innehåll i den sticky raden (sök/hoppa-till-mig). */
  controls?: ReactNode;
  /** Valfritt innehåll under den sticky raden i scroll-flödet (sök-feedback). */
  belowControls?: ReactNode;
  /** Maxhöjd (px) på scroll-fönstret (skickas vidare). */
  scrollViewportPx?: number;
}

/**
 * Komprimerbar lista: börjar KOMPRIMERAD (preview av de N översta raderna), "Visa alla M"
 * fäller ut hela listan i ett scrollbart fönster med sticky kontroll-rad. Generisk över T.
 */
export function CollapsibleList<T>({
  items,
  collapsedVisibleCount = 5,
  renderPreview,
  renderItem,
  getItemKey,
  rowHeight,
  listAriaLabel,
  labels,
  listId,
  name = 'collapsible',
  controls,
  belowControls,
  scrollViewportPx,
}: CollapsibleListProps<T>) {
  const [expanded, setExpanded] = useState(false);
  // Ref till "Visa alla M"-toggeln, så fokus återförs dit när listan komprimeras via den
  // sticky kontrollen INUTI listan (annars tappas fokus när den kontrollen avmonteras).
  const expandToggleRef = useRef<HTMLButtonElement | null>(null);
  // Sätts när komprimeringen skedde via en KONTROLL (inte vid initial render), så fokus
  // bara flyttas som svar på användarens komprimera-klick, inte vid första monteringen.
  const restoreFocusRef = useRef(false);

  const collapse = () => {
    restoreFocusRef.current = true;
    setExpanded(false);
  };

  // Fokus-återföring EFTER att DOM:en åter-renderat i komprimerat läge (expand-toggeln finns
  // igen). Körs bara när komprimeringen var en användar-åtgärd, så ingen fokus-stöld vid mount.
  useEffect(() => {
    if (!expanded && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      expandToggleRef.current?.focus();
    }
  }, [expanded]);

  const visibleCount = Math.min(items.length, collapsedVisibleCount);
  const hasMore = items.length > collapsedVisibleCount;

  return (
    <div data-collapsible-list="" className="flex flex-col gap-5">
      {/* KOMPRIMERAT: previewn (toppen). I utfällt läge tar listan över. */}
      {!expanded ? (
        <div data-collapsible-preview="" {...{ [`data-${name}-preview`]: '' }}>
          {renderPreview({ previewItems: items.slice(0, visibleCount), visibleCount })}
        </div>
      ) : null}

      {/* "Visa alla M"-knapp (KOMPRIMERAT läge). I utfällt läge tar listans STICKY komprimera-
          kontroll över (alltid nåbar oavsett scroll), så vi duplicerar inte en toggle ovanför
          fönstret , det var hela problemet ägaren flaggade. ExpandToggle är husets delade
          kontroll (samma aria-/chevron-semantik som resten av sidan). */}
      {!expanded && hasMore ? (
        <ExpandToggle
          expanded={false}
          hiddenCount={0}
          labels={{ expand: labels.expand(items.length), collapse: labels.collapse }}
          controls={listId}
          onToggle={() => setExpanded(true)}
          position="top"
          name={name}
          buttonRef={expandToggleRef}
        />
      ) : null}

      {/* UTFÄLLT: hela listan i ett scroll-fönster med sticky kontroll-rad (komprimera + ev.
          sök/hoppa). Komprimera-kontrollen där är alltid nåbar, så listan kan fällas in från
          vilken scroll-position som helst utan att skrolla tillbaka till toppen. */}
      {expanded ? (
        <div id={listId} data-collapsible-full="" {...{ [`data-${name}-full`]: '' }}>
          <CollapsibleScrollList
            items={items}
            renderItem={renderItem}
            getItemKey={getItemKey}
            rowHeight={rowHeight}
            ariaLabel={listAriaLabel}
            collapseLabel={labels.collapse}
            onCollapse={collapse}
            listId={listId}
            name={name}
            controls={controls}
            belowControls={belowControls}
            scrollViewportPx={scrollViewportPx}
          />
        </div>
      ) : null}
    </div>
  );
}
