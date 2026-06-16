// "Vilken sektion tittar användaren på just nu?"-hook (scroll-spy) för sektions-navet
// (T103). Markerar den aktiva chippen så navet svarar på var man är, inte bara vart
// man kan gå , samma "tydlig aktiv-markering"-känsla som flik-raden (TabBar).
//
// MEKANIK (positions-baserad, deterministisk): vid scroll/resize mäter vi varje sektions
// topp relativt en linje strax UNDER det sticky bandet (app-bar + nav, `topOffsetPx`).
// Aktiv = den SISTA sektionen vars topp har passerat upp förbi linjen (dvs den man läser
// just under bandet). Två kant-fall hanteras explicit:
//   - SID-TOPPEN: ingen sektion har passerat linjen än -> första sektionen är aktiv.
//   - SID-BOTTEN: sista sektionen kan ligga KVAR under linjen även när man skrollat så
//     långt det går (kort sista-sektion). Då markeras ändå den sista, annars skulle
//     navet aldrig kunna markera den sista sektionen man faktiskt tittar på.
// Det här är robustare än en ren IntersectionObserver-rootMargin (som med botten-
// ankrade sektioner kan låsa markeringen en sektion för tidigt).
//
// GRACEFUL: utan DOM/scroll-API (SSR) blir hooken en no-op och faller på första sektionen.
// rAF-strypt så scroll-handlern aldrig blir en prestanda-tagg (north-star: inga tabbar).

import { useEffect, useState } from 'react';

export interface UseActiveSectionOptions {
  /** Sektions-ankarenas id:n, i dokumentordning (första = default-aktiv). */
  sectionIds: readonly string[];
  /**
   * Pixlar ner från fönstrets topp där "läs-linjen" ligger (app-bar + nav-höjd). En
   * sektion räknas som aktiv när dess topp passerat upp förbi denna linje. +8px luft så
   * tröskeln ligger en aning UNDER nav-kanten (matchar scroll-landningens clearance, så
   * en just-hoppad sektion direkt räknas som aktiv).
   */
  topOffsetPx: number;
}

/**
 * Returnerar id:t för den sektion som för närvarande är "i fokus" vid scroll.
 * Default = första sektionen (sid-topp / ingen DOM).
 */
export function useActiveSection({ sectionIds, topOffsetPx }: UseActiveSectionOptions): string {
  const [activeId, setActiveId] = useState<string>(sectionIds[0] ?? '');

  // Håll default-aktiv i synk om sektionslistan ändras (t.ex. en sektion tillkommer).
  useEffect(() => {
    setActiveId((current) => (sectionIds.includes(current) ? current : (sectionIds[0] ?? '')));
  }, [sectionIds]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (sectionIds.length === 0) return;

    // Läs-linjen ligger strax under det sticky bandet. +8 matchar scroll-landningens luft.
    const line = topOffsetPx + 8;
    // Throttle-state: `scheduled` är gaten (en boolean, oberoende av rAF:s retur-id, så en
    // synkron rAF i test inte kan låsa gaten), `frameId` bara för cancellering vid unmount.
    let scheduled = false;
    let frameId = 0;

    const compute = () => {
      scheduled = false;
      const tops = sectionIds.map((id) => {
        const el = document.getElementById(id);
        return el === null ? null : el.getBoundingClientRect().top;
      });

      // ICKE-SKROLLBAR SIDA: ryms allt i ett fönster (scrollHeight <= innerHeight, även
      // jsdom där scrollHeight=0 saknar layout) finns ingen scroll att spegla -> första
      // sektionen är aktiv. Gatar också bort det falska "vid botten"-fallet nedan.
      const scrollable = document.documentElement.scrollHeight > window.innerHeight + 1;
      if (!scrollable) {
        setActiveId(sectionIds[0]);
        return;
      }

      // SID-BOTTEN: har man skrollat så långt det går markeras den SISTA sektionen, även
      // om dess topp ligger kvar under linjen (kort sista-sektion ryms inte upp till linjen).
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom) {
        setActiveId(sectionIds[sectionIds.length - 1]);
        return;
      }

      // Annars: den SISTA sektionen vars topp passerat upp förbi linjen (top <= line).
      // Ingen passerad än (sid-topp) -> första sektionen.
      let active = sectionIds[0];
      for (let i = 0; i < sectionIds.length; i += 1) {
        const top = tops[i];
        if (top !== null && top <= line) {
          active = sectionIds[i];
        }
      }
      setActiveId(active);
    };

    // rAF-strypning: koalescera scroll-stormen till ett mått per frame.
    const onScroll = () => {
      if (scheduled) return;
      scheduled = true;
      frameId = window.requestAnimationFrame(compute);
    };

    compute(); // Initialt läge direkt vid montering.
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (frameId !== 0) window.cancelAnimationFrame(frameId);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [sectionIds, topOffsetPx]);

  return activeId;
}
