// DELAD "skrolla tillbaka ankaret i vy vid komprimering"-hook (T92 del F, Daniels skärmdumps-
// feedback 2026-06-16).
//
// BUGG (ägarens rapport): klickar man "Dölj"/"Komprimera" LÅNGT NER i en utfälld lista, fälls
// listan ihop , men SID-SCROLLEN står kvar långt ner, där listans innehåll nyss tog slut. Då
// stirrar man på tomrum/nästa sektion och är desorienterad ("vart tog listan vägen?").
//
// FIX: vid komprimering, skrolla sektionens ANKARE (toppen av den komprimerbara regionen)
// tillbaka i vy. Vi använder en mätt scroll-till-offset (inte enbart scrollIntoView) så vi kan
// KOMPENSERA för den sticky app-barens höjd (--vm-app-bar-height): annars hamnar rubriken UNDER
// flik-raden/headern (osynlig). Smooth + reduced-motion-GATAD (WCAG 2.3.3): respekterar OS:ets
// "minska rörelse" genom att hoppa direkt (auto) i stället för att animera scrollen.
//
// VARFÖR i den DELADE komponenten: alla långa listor (per-rums-topplista, avslöjandet, och alla
// som senare använder StickyFollowToggle) ärver fixen på en gång, EN sanning, ingen drift.

import { useCallback, useRef } from 'react';

/**
 * Läs app-barens höjd ur CSS-variabeln --vm-app-bar-height (en sanning, samma som sticky-baren
 * använder), så scroll-offseten matchar exakt det som klistrar överst. Faller till 0 om
 * variabeln saknas/inte är px-baserad (då hamnar ankaret i absoluta toppen, fortfarande synligt).
 */
function readAppBarOffsetPx(el: Element): number {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return 0;
  }
  const raw = window.getComputedStyle(el).getPropertyValue('--vm-app-bar-height').trim();
  // CSS-variabeln kan vara "64px" / "7.3125rem" osv. Vi behöver px; rem*16 är en rimlig
  // approximation (appen sätter inte en avvikande root-font-size). Misslyckas parsningen = 0.
  if (raw.endsWith('px')) {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  }
  if (raw.endsWith('rem')) {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n * 16 : 0;
  }
  return 0;
}

export interface CollapseScrollRestore<T extends HTMLElement> {
  /** Sätt denna på ankar-elementet (toppen av den komprimerbara regionen). */
  anchorRef: React.RefObject<T | null>;
  /**
   * Skrolla ankaret tillbaka i vy (under den sticky app-baren). Anropas EFTER att listan
   * komprimerats. No-op om ankaret inte är monterat eller om scroll-API:t saknas (jsdom/SSR).
   */
  scrollAnchorIntoView: () => void;
}

/**
 * Ge en ankar-ref + en `scrollAnchorIntoView` som skrollar ankaret strax under app-baren,
 * reduced-motion-gatad. Generisk över ankar-elementtypen (default div).
 */
export function useCollapseScrollRestore<
  T extends HTMLElement = HTMLDivElement,
>(): CollapseScrollRestore<T> {
  const anchorRef = useRef<T | null>(null);

  const scrollAnchorIntoView = useCallback(() => {
    const el = anchorRef.current;
    if (el === null || typeof window === 'undefined' || typeof window.scrollTo !== 'function') {
      return;
    }
    // jsdom saknar layout (getBoundingClientRect ger 0:or); då är detta en no-op i praktiken,
    // men vi gatar ändå på funktionens existens så ett test inte kraschar. Den faktiska visuella
    // scrollen bevisas i webbläsaren (.vmshots/), strukturen (att vi anropar scrollTo med en
    // app-bar-kompenserad offset) testas i jsdom.
    const rect = el.getBoundingClientRect();
    const appBarOffset = readAppBarOffsetPx(document.documentElement);
    // Målet: ankarets topp hamnar `appBarOffset` px ner från fönstrets topp (precis under den
    // sticky app-baren), inte under den. rect.top är relativt viewporten; lägg på nuvarande
    // scrollY för en absolut sid-position, dra av offseten. Klampa >= 0 (aldrig negativ scroll).
    const target = Math.max(0, window.scrollY + rect.top - appBarOffset);
    // Reduced-motion: hoppa direkt (auto), annars mjukt (smooth). matchMedia kan saknas helt
    // (jsdom) ELLER returnera undefined; gata på BÅDA så ett saknat API aldrig kastar (då
    // behandlas det som "ingen reduced-motion-preferens", dvs smooth = standardbeteendet).
    const mql =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    const prefersReduced = mql !== null && mql !== undefined && mql.matches === true;
    window.scrollTo({ top: target, behavior: prefersReduced ? 'auto' : 'smooth' });
  }, []);

  return { anchorRef, scrollAnchorIntoView };
}
