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

import { useRef } from 'react';
import { useSectionNavState } from './section-nav-context';
import { useActiveChipScroll } from './use-active-chip-scroll';
import { useStickyBandOffset } from './use-sticky-band-offset';
import './section-nav.css';

export function SectionNav() {
  // Navet (och bara navet) konsumerar STATE-ytan: sections/activeId/scrollTo. Den byter
  // referens vid activeId-byte, men det är bara DEN här komponenten som re-renderas av det
  // (C4), inte de 8 sektions-vyerna (de läser actions-ytan via useRegisterSection).
  const { sections, activeId, scrollTo } = useSectionNavState();
  const navRef = useRef<HTMLElement>(null);

  // Håll det aktiva chip:et synligt i den horisontella raden: när scroll-spy:n byter aktiv
  // sektion (eller man klickar) scrollas chip:et in om det ligger utanför synfältet, så man
  // alltid ser var man är. Respekterar reduced-motion (hookens egen useReducedMotion).
  useActiveChipScroll(navRef, activeId);

  // Mät de sticky-bandens samlade höjd ROBUST (inte en magisk pixel-gissning) och exponera
  // den som --vm-section-nav-offset / --vm-section-nav-header-top på <html>. scroll-margin-top
  // på sektionerna och scroll-spy-zonen läser variablerna, så ett klick landar rubriken precis
  // under det synliga bandet oavsett bandens faktiska höjd. Mät-logiken är DELAD (T79): den
  // bor i useStickyBandOffset så den nya mobil-knappen (SectionNavMobile) skriver SAMMA
  // offset-kontrakt utan kopierad logik (de två responsiva banden syns aldrig samtidigt, och
  // offseten = header + det synliga bandets höjd). Mäts om vid chip-antals-ändring (deps).
  useStickyBandOffset(navRef, sections.length);

  // Inget att hoppa till -> ingen rad (håller ytan lean, ingen tom sticky-list).
  if (sections.length === 0) {
    return null;
  }

  return (
    // Stackas DIREKT under headern: headern är sticky top-0 z-10, navet sitter under den
    // med top satt till headerns höjd (via --vm-section-nav-header-top i CSS) och ett z
    // UNDER headern (z-[9]) så banden aldrig överlappar visuellt. Det frostade glas-bandet
    // (samma tema-trogna color-mix-recept som headern), den tunna skiljelinjen, kant-faden
    // och chip-formerna bor i .vm-section-nav* (section-nav.css), så markupen håller bara
    // semantiken + de stabila krokarna.
    //
    // RESPONSIV VÄXLING (T79): chip-raden är DESKTOP-varianten, dold under sm-brytpunkten
    // (hidden) och synlig från sm och upp (sm:block). På mobil (< sm) visas i stället
    // hamburgare-menyn (SectionNavMobile), så man inte missar sektioner bakom en swipe.
    // Växlingen sker helt i CSS (Tailwind sm:-klasser), ingen JS-resize-gissning behövs.
    <nav
      ref={navRef}
      data-section-nav=""
      aria-label="Sektioner"
      className="vm-section-nav sticky z-[9] hidden sm:block"
    >
      {/* Chip-radens scroll-container (overflow-x-auto). data-section-nav-track är haken
        useActiveChipScroll scrollar i sidled; kant-faden + dolda scrollbaren ligger på
        klassen. items-center håller chipsen i lodrät mitt även om de skiljer i höjd. */}
      <ul
        data-section-nav-track=""
        className="vm-section-nav-track mx-auto flex max-w-6xl items-center gap-1.5 px-4 py-2 sm:px-8"
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
                className="vm-section-chip font-display"
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
