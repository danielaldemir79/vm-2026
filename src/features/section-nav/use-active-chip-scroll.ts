// useActiveChipScroll (T78, #165, design-finish): håll det AKTIVA chip:et synligt i den
// horisontella chip-raden.
//
// VARFÖR: raden är overflow-x-auto. På en smal skärm (PWA på mobil i första hand) ryms inte
// alla chips, så när scroll-spy:n byter aktiv sektion längre ner kan det aktiva chip:et ligga
// UTANFÖR det synliga fönstret. Då tappar man "var är jag"-signalen. Den här hooken scrollar
// det aktiva chip:et in i raden NÄR det ligger utanför synfältet, så markeringen alltid syns.
//
// SCOPE (rör bara raden, aldrig sidan): vi scrollar chip:ets EGEN scroll-container (chip-raden)
// med scrollLeft, inte via scrollIntoView. scrollIntoView kan i en webbläsare bubbla upp och
// råka röra fönstrets VERTIKALA scroll (block:'nearest' är "nearest", inte "aldrig"), vilket
// skulle kapa sid-scrollen mitt i en scroll-spy-driven aktiv-ändring, en kamp mellan
// användarens scroll och vår. Genom att bara sätta containerns scrollLeft rör vi enbart den
// horisontella raden, aldrig sidans position.
//
// REDUCED-MOTION (WCAG 2.3.3, samma policy som provider:ns scrollTo): vid prefers-reduced-
// motion hoppar vi DIREKT (behavior:'auto'), ingen animerad scroll. Annars mjukt. Vi läser
// preferensen via samma useReducedMotion (motion/react) som SectionNavProvider, en sanning.

import { useEffect, type RefObject } from 'react';
import { useReducedMotion } from 'motion/react';

/** Marginal i px så ett in-scrollat chip andas mot kanten i stället för att klistra precis i den. */
const EDGE_GUTTER = 16;

/**
 * Scrolla det aktiva chip:et in i den horisontella raden när det ligger utanför synfältet.
 *
 * @param navRef ref till <nav data-section-nav> (chip-radens scroll-container hittas inuti)
 * @param activeId id för den aktiva sektionen (byts av scroll-spy:n / vid klick), eller null
 */
export function useActiveChipScroll(
  navRef: RefObject<HTMLElement | null>,
  activeId: string | null
): void {
  // Samma reduced-motion-källa som provider:ns scrollTo, så hela navet beter sig konsekvent.
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || activeId === null) {
      return;
    }
    // Chip-radens scroll-container = den overflow-x-auto-yta som bär chipsen.
    const track = nav.querySelector<HTMLElement>('[data-section-nav-track]');
    // Det aktiva chip:et bärs av sin <li>; vi scrollar hela li:t in (chip + dess luft).
    const activeChip = nav.querySelector<HTMLElement>('[data-section-chip][data-active="true"]');
    if (!track || !activeChip) {
      return;
    }
    const item = activeChip.closest<HTMLElement>('li') ?? activeChip;

    // Position RELATIVT containern (inte viewporten), så beräkningen är oberoende av var raden
    // sitter på sidan och av sidans egen scroll. offsetLeft är redan relativt track:en
    // (track är li:ts offsetParent via dess positionerade/överflödande box).
    const itemLeft = item.offsetLeft;
    const itemRight = itemLeft + item.offsetWidth;
    const viewLeft = track.scrollLeft;
    const viewRight = viewLeft + track.clientWidth;

    // Redan helt synligt -> rör ingenting (ingen onödig scroll, ingen kamp med användaren).
    if (itemLeft >= viewLeft && itemRight <= viewRight) {
      return;
    }

    // Utanför till VÄNSTER: dra fram chip:ets vänsterkant (minus en gutter). Utanför till
    // HÖGER: dra fram chip:ets högerkant (plus en gutter). Bara ett av fallen gäller.
    const nextLeft =
      itemLeft < viewLeft ? itemLeft - EDGE_GUTTER : itemRight - track.clientWidth + EDGE_GUTTER;

    track.scrollTo({
      left: Math.max(0, nextLeft),
      behavior: prefersReduced ? 'auto' : 'smooth',
    });
  }, [navRef, activeId, prefersReduced]);
}
