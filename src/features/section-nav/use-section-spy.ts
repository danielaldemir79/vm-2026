// useSectionSpy (T78, #165): scroll-spy som markerar vilket chip som hör till den
// sektion man är i just nu, via IntersectionObserver.
//
// HUR: observera varje registrerad sektions scroll-mål-element (rubrikens `<section>`).
// rootMargin drar ner observationszonens topp under de två sticky-banden (header +
// chip-rad) så den "aktiva" sektionen är den som ligger precis under raden, inte den som
// råkar skymta längst ner. Den nedersta sektionen som korsar zonens topp vinner, så
// scrollar man neråt följer markeringen med. Vi väljer den sektion vars topp passerat
// zonens topp och ligger närmast den (störst top som är <= tröskeln), annars den första
// synliga. Allt härleds ur observer-callbackens entries, ingen scroll-event-polling.
//
// reduced-motion rör inte spy:n (den läser bara position, animerar inget); smooth-scroll-
// valet ligger i scrollTo (SectionNavProvider).

import { useEffect } from 'react';
import type { SectionDescriptor } from './section-labels';

/** Höjden navet reserverar överst (header + chip-rad) i px, för spy-zonens topp. */
function readStickyOffset(): number {
  // Den robusta mätningen (inte en magisk pixel-gissning): CSS-variabeln
  // --vm-section-nav-offset sätts av SectionNav när den mätt bandens faktiska höjd.
  // Saknas den (mätningen ej klar än) faller vi till 0, så spy:n ändå fungerar grovt.
  if (typeof document === 'undefined') {
    return 0;
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    '--vm-section-nav-offset'
  );
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Observera de registrerade sektionerna och rapportera den aktiva via setActiveId.
 *
 * @param sections registrerade sektioner (id används för att hitta scroll-målet)
 * @param setActiveId callback som tar emot aktivt id (stabil referens från storen)
 */
export function useSectionSpy(
  sections: SectionDescriptor[],
  setActiveId: (id: string | null) => void
): void {
  // Stabil nyckel på id-mängden så effekten kör om när sektioner kommer/går (live-läge
  // tänder fler), men inte vid varje render (sections-arrayen kan vara en ny referens).
  const idsKey = sections.map((s) => s.id).join('|');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }
    const ids = idsKey ? idsKey.split('|') : [];
    // Scroll-målet är `<section aria-labelledby={id}>`: hitta det via rubriken (id finns
    // på rubrik-elementet) och dess närmaste section, så vi observerar hela sektionen.
    const targets = ids
      .map((id) => document.getElementById(id)?.closest('section') ?? null)
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) {
      return;
    }

    const offset = readStickyOffset();
    // Synlighet per mål, så vi kan välja den översta sektionen vars topp passerat raden.
    const ratios = new Map<HTMLElement, number>();
    const topById = new Map<HTMLElement, number>();

    function recompute(): void {
      // Den aktiva = den NEDERSTA sektionen vars topp ligger ovanför/vid zonens topp
      // (man har scrollat in i den). Finns ingen sådan (man är ovanför första), ta den
      // första synliga. Tröskeln är offset + en liten marginal så bytet känns vid raden.
      const threshold = offset + 4;
      let active: HTMLElement | null = null;
      let bestTop = -Infinity;
      for (const el of targets) {
        const top = topById.get(el);
        if (top === undefined) {
          continue;
        }
        if (top <= threshold && top > bestTop) {
          bestTop = top;
          active = el;
        }
      }
      if (active === null) {
        // Ingen sektion har passerat raden än (man är högst upp): markera den första
        // som syns (störst ratio), annars första målet, så ett chip alltid är aktivt.
        let bestRatio = 0;
        for (const el of targets) {
          const r = ratios.get(el) ?? 0;
          if (r > bestRatio) {
            bestRatio = r;
            active = el;
          }
        }
        if (active === null) {
          active = targets[0];
        }
      }
      const headingId = active.getAttribute('aria-labelledby');
      setActiveId(headingId);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          ratios.set(el, entry.intersectionRatio);
          topById.set(el, entry.boundingClientRect.top);
        }
        recompute();
      },
      {
        // Dra ner zonens topp under de sticky banden så markeringen byter vid raden.
        rootMargin: `-${Math.round(offset)}px 0px -55% 0px`,
        threshold: [0, 0.1, 0.5, 1],
      }
    );

    for (const el of targets) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [idsKey, setActiveId]);
}
