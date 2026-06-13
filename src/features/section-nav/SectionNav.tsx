// SectionNav (T78, #165): den smala, sticky chip-raden under appens header.
//
// Daniels krav: en diskret, LEAN rad (inte rörig) som hoppar till varje sektion på den
// långa en-sides-appen (PWA på mobil i första hand). Den FUNKTIONELLA + tillgängliga
// strukturen byggs här (stabila krokar + semantik); design-frontend lägger premium-
// visuell finish ovanpå (chip-styling, band-behandling, aktiv-markering, swipe-affordans).
//
// KROKAR FÖR DESIGN-FRONTEND (styla mot dessa, ändra inte semantiken):
//   - <nav data-section-nav> (landmark, aria-label) = hela bandet.
//   - <button data-section-chip data-active={"true"|undefined}> = varje chip.
//   - aria-current="true" på det aktiva chip:et = den a11y-sanna aktiv-markeringen.
//   - CSS-variabeln --vm-section-nav-offset (på <html>) = uppmätt höjd av de TVÅ
//     sticky-banden, som scroll-margin-top och spy-zonen använder (se section-nav.css).
//
// CHIPS SPEGLAR REGISTRET: navet renderar bara chips för sektioner som FAKTISKT
// registrerat sig (SectionNavProvider). En sektion som returnerar null registrerar sig
// aldrig, så ett dött chip är omöjligt. Inga chips alls -> hela raden döljs (return null),
// så den aldrig tar plats i ett läge där inget finns att hoppa till.

import { useEffect, useRef } from 'react';
import { useSectionNavStore } from './section-nav-context';
import './section-nav.css';

export function SectionNav() {
  const { sections, activeId, scrollTo } = useSectionNavStore();
  const navRef = useRef<HTMLElement>(null);

  // Mät de två sticky-bandens samlade höjd ROBUST (inte en magisk pixel-gissning) och
  // exponera den som --vm-section-nav-offset på <html>. scroll-margin-top på sektionerna
  // och scroll-spy-zonen läser variabeln, så ett klick landar rubriken precis under raden
  // oavsett bandens faktiska höjd (varierar med skärmstorlek/typsnitt/temat). Mäts vid
  // mount, vid resize och när chip-antalet ändras (live-läge tänder fler -> ev. radbrytning).
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) {
      return;
    }
    function measure(): void {
      const navEl = navRef.current;
      if (!navEl) {
        return;
      }
      // Headern är det föregående sticky-bandet (sticky top-0). Navet stackas under den.
      // Headerns höjd + navets höjd = den yta en rubrik måste rensa. Vi mäter headern via
      // dess faktiska box (närmaste <header>), inte ett antaget värde.
      const header = document.querySelector('header');
      const headerHeight = header?.getBoundingClientRect().height ?? 0;
      const navHeight = navEl.getBoundingClientRect().height;
      const offset = Math.round(headerHeight + navHeight);
      // Två variabler: header-top = var navet ska sitta (rakt under headern), och offset =
      // header + nav = vad en rubrik måste rensa (scroll-margin + spy-zonens topp).
      document.documentElement.style.setProperty(
        '--vm-section-nav-header-top',
        `${Math.round(headerHeight)}px`
      );
      document.documentElement.style.setProperty('--vm-section-nav-offset', `${offset}px`);
    }
    measure();
    // ResizeObserver fångar bandens höjdändring (radbrytning, typsnitts-/zoom-ändring)
    // utan scroll-polling. Saknas den (äldre jsdom) faller vi till resize-event.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(nav);
      const header = document.querySelector('header');
      if (header) {
        ro.observe(header);
      }
    }
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [sections.length]);

  // Inget att hoppa till -> ingen rad (håller ytan lean, ingen tom sticky-list).
  if (sections.length === 0) {
    return null;
  }

  return (
    // Stackas DIREKT under headern: headern är sticky top-0 z-10, navet sitter under den
    // med top satt till headerns höjd (via --vm-section-nav-header-top i CSS) och ett z
    // UNDER headern (z-[9]) så banden aldrig överlappar visuellt. Frostat glas-band, samma
    // tema-trogna color-mix-recept som headern (design-frontend finputsar utseendet).
    <nav
      ref={navRef}
      data-section-nav=""
      aria-label="Sektioner"
      className="vm-section-nav sticky z-[9] border-b border-border backdrop-blur-md"
    >
      <ul
        className="mx-auto flex max-w-6xl items-center gap-1.5 overflow-x-auto px-4 py-2 sm:px-8"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-surface) 70%, transparent)' }}
      >
        {sections.map((section) => {
          const isActive = activeId === section.id;
          return (
            <li key={section.id} className="shrink-0">
              <button
                type="button"
                data-section-chip=""
                data-active={isActive ? 'true' : undefined}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => scrollTo(section.id)}
                className={
                  'rounded-pill border px-3 py-1 font-display text-xs font-semibold ' +
                  'whitespace-nowrap outline-none transition-colors ' +
                  'focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] ' +
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] ' +
                  (isActive
                    ? 'border-accent bg-accent text-accent-fg'
                    : 'border-border bg-surface text-fg-muted hover:text-fg')
                }
              >
                {section.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
