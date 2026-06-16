// Sektions-nav , en sticky chip-rad som visar vilka sektioner en lång flik innehåller
// och hoppar direkt till en av dem (T103, Daniels önskemål: "inför en meny i turnering
// så man kan klicka sig till rätt statistik/sektion direkt, och då ser man direkt vad
// som finns där. Skapa bästa lösning för både mobil och större skärm.").
//
// DESIGN (förfinar, designar inte om , north-star §3 "ett konsekvent komponentsprak"):
// chipsen lånar flik-radens (TabBar) språk , accent på aktiv, en rundad pill-form, en
// mjuk yt-ton på hover, samma fokus-ring. Raden är HORISONTELLT skrollbar på smal skärm
// (sport-app-mönster: filter-chips man swipar) och centrerad/wrappar inte , så den läser
// likadant på mobil och desktop, bara med mer luft på desktop.
//
// PLACERING: sticky DIREKT under app-baren (header på mobil; header + flik-rad på
// desktop). Den är navigationens andra våning: app-bar väljer FLIK, det här navet väljer
// SEKTION inom fliken. z-index strax UNDER app-baren (z-20 < z-30) så app-baren alltid
// vinner vid överlapp, men ÖVER vanligt innehåll som skrollar förbi.
//
// A11Y: en riktig <nav aria-label> med <button>-kontroller (in-page-scroll, inte route-
// byte, så knappar , inte länkar). aria-current="true" på den aktiva. Tangentbord:
// knappar är fokuserbara/aktiverbara av sig själva (ingen roving-tabindex som i en
// tablist , det här är inte en tablist, det är en genvägs-meny, varje chip ska nås med
// Tab). Synlig fokus-ring (WCAG 2.4.7). Stör inte flik-systemet (egen z/region).

import { useEffect, useRef, useState } from 'react';
import { useScrollToSection } from './use-scroll-to-section';
import { useActiveSection } from './use-active-section';
import './section-nav.css';

export interface SectionNavItem {
  /** Ankar-id:t att skrolla till (matchar sektionens stabila id i DOM). */
  id: string;
  /** Synlig, kort svensk etikett (t.ex. "Grupper", "Slutspel"). */
  label: string;
}

export interface SectionNavProps {
  /** Sektionerna i dokumentordning. Första = default-aktiv vid sid-topp. */
  items: readonly SectionNavItem[];
  /** Tillgängligt namn på navet (t.ex. "Hoppa till sektion i Turnering"). */
  ariaLabel: string;
  /**
   * Fallback-höjd (px) på det sticky bandet (app-bar + nav) för scroll-spy:s topp-indrag,
   * tills navet kan mätas i DOM:en. Behöver inte vara exakt , den används bara för att
   * avgöra VILKEN sektion som är aktiv (markeringen), inte för själva scroll-landningen
   * (den mäter navets faktiska nedre kant). Default 112 (~header+nav-bandets höjd).
   */
  fallbackSpyOffsetPx?: number;
}

/**
 * En sticky genvägs-meny för en lång flik. Chip = sektion; klick skrollar dit (under
 * app-bar + nav), aktiv chip följer scrollen och hålls synlig i raden.
 */
export function SectionNav({ items, ariaLabel, fallbackSpyOffsetPx = 112 }: SectionNavProps) {
  const navRef = useRef<HTMLElement | null>(null);
  const scrollerRef = useRef<HTMLUListElement | null>(null);
  const scrollToSection = useScrollToSection();

  // Scroll-spy:s topp-indrag = navets nedre kant NÄR det är pinnat (app-bar + nav-höjd).
  // En sticky-elements computade `top` ÄR dess pinn-offset (--vm-header-height på mobil,
  // --vm-app-bar-height på desktop, satt i CSS), så pinn-bottom = top + nav-höjd , ett
  // mått som gäller oavsett var sidan står just nu (inte beroende av att man skrollat).
  // En sanning ur DOM:en (samma band scroll-landningen tuckar under), så markeringen
  // byter sektion exakt när rubriken passerar upp under bandet, inte en sektion för
  // tidigt. Mäts på mount + vid resize (mobil/desktop-bandet skiljer i höjd).
  const [spyOffset, setSpyOffset] = useState<number>(fallbackSpyOffsetPx);
  useEffect(() => {
    const measure = () => {
      const nav = navRef.current;
      if (nav === null || typeof window === 'undefined') return;
      const stickyTop = Number.parseFloat(window.getComputedStyle(nav).top);
      const pinnedBottom = (Number.isFinite(stickyTop) ? stickyTop : 0) + nav.offsetHeight;
      if (pinnedBottom > 0) setSpyOffset(Math.round(pinnedBottom));
    };
    measure();
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const sectionIds = items.map((it) => it.id);
  const activeId = useActiveSection({ sectionIds, topOffsetPx: spyOffset });

  // Håll den AKTIVA chippen synlig i den horisontella raden (annars kan den aktiva
  // markeringen ligga utanför vy på en smal skärm). inline:'nearest' skrollar bara om
  // den faktiskt är utanför, block:'nearest' rör inte sid-scrollen vertikalt.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller === null || activeId === '') return;
    const activeChip = scroller.querySelector<HTMLElement>(`[data-section-id="${activeId}"]`);
    if (activeChip === null || typeof activeChip.scrollIntoView !== 'function') return;
    activeChip.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  if (items.length === 0) return null;

  return (
    <nav ref={navRef} aria-label={ariaLabel} className="vm-section-nav" data-section-nav="">
      <ul ref={scrollerRef} className="vm-section-nav-list">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <li key={item.id}>
              <button
                type="button"
                className="vm-section-nav-chip"
                data-section-id={item.id}
                data-active={isActive ? 'true' : undefined}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => scrollToSection(item.id, spyOffset)}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
