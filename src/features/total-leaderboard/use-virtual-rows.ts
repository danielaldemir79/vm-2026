// Lättviktig FAST-HÖJD virtualisering för den totala topplistans utfällda läge
// (T82 del 3, #173). Ingen extern dependency (PRINCIPLES §11): fast-höjd-windowing är
// en liten, väl förstådd beräkning (scroll-position + viewport-höjd -> synligt
// index-spann), så vi skriver den själva i stället för att dra in ett virtualiserings-
// paket. 240+ rader renderas då aldrig som en DOM-vägg , bara de synliga (+ overscan).
//
// MODELL: alla rader har samma höjd (rowHeight). Den totala höjden = count * rowHeight
// (en spacer-div håller scrollbaren rätt). Vid en scroll-position beräknar vi första
// och sista SYNLIGA index och renderar bara det spannet, absolut-positionerat på sin
// offset. En liten OVERSCAN ovanför/under gör att en snabb scroll inte blottar tomma
// rader innan nästa render hinner.

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/** Hur många extra rader vi renderar utanför viewporten (mjukar snabb scroll). */
const OVERSCAN = 6;

/** Vad hooken returnerar: scroll-container-ref, totalhöjd, synligt spann + dess offset. */
export interface VirtualRows {
  /** Sätt på den SCROLLANDE elementet (den med fast maxhöjd + overflow-y-auto). */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Total höjd på alla rader (px), för spacer-diven som håller scrollbaren rätt. */
  totalHeight: number;
  /** Första synliga radens index (inkl. overscan). */
  startIndex: number;
  /** Sista synliga radens index + 1 (exklusiv övre gräns, inkl. overscan). */
  endIndex: number;
  /** Y-offset (px) där det synliga spannet ska placeras (startIndex * rowHeight). */
  offsetTop: number;
  /** Skrolla så att raden `index` hamnar i vy (för "hoppa till mig" + sök-träff). */
  scrollToIndex: (index: number) => void;
}

/**
 * Beräkna det synliga index-spannet för en fast-höjd-lista.
 *
 * @param count        antal rader totalt.
 * @param rowHeight    varje rads höjd i px (måste matcha den faktiska radhöjden i CSS).
 * @param viewportH    den scrollande containerns höjd i px.
 * @param scrollTop    aktuell scroll-position i px.
 */
function computeRange(
  count: number,
  rowHeight: number,
  viewportH: number,
  scrollTop: number
): { startIndex: number; endIndex: number } {
  if (count === 0 || rowHeight <= 0) {
    return { startIndex: 0, endIndex: 0 };
  }
  const first = Math.floor(scrollTop / rowHeight) - OVERSCAN;
  const visibleCount = Math.ceil(viewportH / rowHeight) + OVERSCAN * 2;
  const startIndex = Math.max(0, first);
  const endIndex = Math.min(count, startIndex + visibleCount);
  return { startIndex, endIndex };
}

/**
 * Virtualisera en fast-höjd-lista. Lyssnar på containerns scroll + storleks-ändring
 * och håller `startIndex`/`endIndex` i synk, så bara det synliga spannet renderas.
 *
 * @param count      antal rader totalt.
 * @param rowHeight  varje rads höjd i px (matcha den faktiska radhöjden).
 */
export function useVirtualRows(count: number, rowHeight: number): VirtualRows {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  // Mät viewport-höjden (initialt + vid resize) så spannet är rätt även när containern
  // växer/krymper med skärmen. ResizeObserver där det finns; annars en window-resize-
  // fallback (jsdom i test saknar ResizeObserver, då räcker initial-mätningen).
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) {
      return;
    }
    const measure = () => setViewportH(el.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el !== null) {
      setScrollTop(el.scrollTop);
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) {
      return;
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = scrollRef.current;
      if (el === null) {
        return;
      }
      // Placera raden en bit ner i viewporten (inte exakt i kanten) så den känns
      // "hittad", inte avklippt högst upp. Klampa inom giltigt scroll-spann.
      const target = Math.max(0, index * rowHeight - rowHeight * 2);
      el.scrollTo({ top: target, behavior: 'smooth' });
    },
    [rowHeight]
  );

  const { startIndex, endIndex } = computeRange(count, rowHeight, viewportH, scrollTop);

  return {
    scrollRef,
    totalHeight: count * rowHeight,
    startIndex,
    endIndex,
    offsetTop: startIndex * rowHeight,
    scrollToIndex,
  };
}

// Exporteras för en ren enhetstest av spann-matematiken (utan DOM).
export { computeRange, OVERSCAN };
