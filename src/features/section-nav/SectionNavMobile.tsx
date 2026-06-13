// SectionNavMobile (T79, #167): hamburgare-menyn för sektions-navigeringen på MOBIL (< sm).
//
// DANIELS FEEDBACK PÅ T78: på mobil var chip-raden swipe-bar i sidled, så man kunde LÄTT
// MISSA sektioner (man visste inte att man kunde svipa). Lösningen: en kompakt meny-knapp
// (hamburgare) som sitter sticky under headern och, vid klick, öppnar en panel som listar
// ALLA registrerade sektioner VERTIKALT, inget gömt bakom en swipe. Desktop (>= sm) behåller
// den oförändrade chip-raden (SectionNav); den här komponenten visas bara < sm (sm:hidden).
//
// SAMMA STORE SOM CHIP-RADEN (återanvänder HELA T78-infrastrukturen, rör inte dess kontrakt):
// useSectionNavState ger sections (det FAKTISKA registret, sorterat), activeId (scroll-spy)
// och scrollTo (mjuk scroll, reduced-motion-medveten). Listan speglar därför exakt samma
// sanning som chip-raden, inga döda rader. 0 sektioner -> hela bandet döljs (return null),
// precis som chip-raden, så ytan hålls lean (Daniels återkommande krav).
//
// AKTIV SEKTION SYNS PÅ MOBIL: meny-knappen visar den aktiva sektionens etikett (eller
// "Sektioner" innan spy:n satt en), OCH den aktiva raden i panelen bär aria-current="true"
// + en visuell markering, så scroll-spy-värdet aldrig tappas i hamburgare-läget.
//
// A11Y (kärnan i tasken):
//   - Knapp: aria-expanded (öppen/stängd), aria-controls -> panelens id, aria-haspopup,
//     ett tillgängligt namn ("Sektioner: <aktiv>" / "Sektioner").
//   - Escape stänger; klick UTANFÖR (på dokumentet, utanför band + panel) stänger.
//   - Fokus flyttas IN i panelen (första raden) vid öppning, ÅTERSTÄLLS till knappen vid
//     stängning. En enkel fokus-fälla (Tab/Shift+Tab cyklar inom panelen) håller
//     tangentbordsanvändaren kvar utan att slå knut på sig själv.
//   - aria-current="true" på aktiv rad. Riktiga <button>-rader, tangentbords-navigerbara.
//   - Reduced-motion: panelen öppnas utan animation vid prefers-reduced-motion (CSS-gatad).
//
// KROKAR FÖR DESIGN-FRONTEND (styla mot dessa, ändra inte semantiken):
//   - <nav data-section-nav data-section-nav-mobile> = det sticky bandet (mäts av offset-
//     hooken, samma data-section-nav-krok som chip-raden, se use-sticky-band-offset.ts).
//   - <button data-section-menu-button aria-expanded> = hamburgare-knappen.
//   - <div data-section-menu-panel id={panelId}> = den öppnade panelen.
//   - <button data-section-menu-item data-active={"true"|undefined}> = varje rad.
//   - aria-current="true" på den aktiva raden = den a11y-sanna aktiv-markeringen.

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useSectionNavState } from './section-nav-context';
import { useStickyBandOffset } from './use-sticky-band-offset';
import './section-nav.css';

/** Tab/Shift+Tab cyklar inom panelen (enkel fokus-fälla, samma form som Modal.trapFocus). */
function trapFocus(panel: HTMLElement | null, e: ReactKeyboardEvent): void {
  if (e.key !== 'Tab' || panel === null) {
    return;
  }
  const focusable = panel.querySelectorAll<HTMLElement>(
    'button, a[href], input, [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) {
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

export function SectionNavMobile() {
  const { sections, activeId, scrollTo } = useSectionNavState();
  const bandRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // Stabilt id som binder knappens aria-controls till panelen (unikt per instans).
  const panelId = useId();

  // Samma robusta offset-mätning som chip-raden (DELAD hook), så det SYNLIGA bandets höjd
  // (här: hamburgare-knappens band på mobil) driver scroll-margin + spy-zonen. recompute-
  // nyckeln är sections.length (live-läge tänder fler) OCH open (panelen ändrar inte bandets
  // höjd, men en om-mätning vid öppning är ofarlig och håller offseten färsk).
  useStickyBandOffset(bandRef, sections.length);

  const close = useCallback(() => setOpen(false), []);

  // Escape stänger (bubble-fas, som de flesta dialoger i repot). Klick UTANFÖR band + panel
  // stänger. Lyssnarna läggs BARA när panelen är öppen, så de inte churnar i stängt läge.
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        close();
      }
    }
    function onPointerDown(e: MouseEvent): void {
      const target = e.target as Node;
      // Klick inom bandet (knappen) eller panelen räknas inte som "utanför".
      if (bandRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      close();
    }
    document.addEventListener('keydown', onKeyDown);
    // pointerdown (inte click) så stängningen sker innan ett ev. fokus-skifte, och fångar
    // både mus och touch. capture:false (bubble) räcker, panelen stoppar inte eventet.
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, close]);

  // Fokus IN i panelen vid öppning (första raden), ÅTERSTÄLL till knappen vid STÄNGNING.
  // wasOpen-ref skiljer den FÖRSTA rendern (open=false vid mount, ska INTE stjäla fokus till
  // knappen) från en äkta öppen->stängd-övergång (då ska fokus tillbaka till knappen, så
  // tangentbordsanvändaren inte tappas ut i body). Vid öppning fokuseras första menyraden.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      const firstItem = panelRef.current?.querySelector<HTMLElement>('[data-section-menu-item]');
      firstItem?.focus();
    } else if (wasOpen.current) {
      // Bara på en äkta stängning (panelen var öppen): för fokus tillbaka till knappen. Vid
      // en rad-klick (scrollTo + close) är knappen rätt ankare efter att panelen stängts.
      buttonRef.current?.focus();
    }
    wasOpen.current = open;
    // Deps = bara open-flaggan: refs (panel/button/wasOpen) är stabila och exempta, så
    // effekten reagerar exakt på open-övergången (öppen <-> stängd), inget mer.
  }, [open]);

  const onPanelKeyDown = useCallback((e: ReactKeyboardEvent) => {
    trapFocus(panelRef.current, e);
  }, []);

  // Klick på en rad: hoppa till sektionen (samma scrollTo som chip-raden) och stäng panelen.
  const onSelect = useCallback(
    (id: string) => {
      scrollTo(id);
      close();
    },
    [scrollTo, close]
  );

  // Inget att hoppa till -> inget band (lean, ingen tom sticky-knapp), precis som chip-raden.
  if (sections.length === 0) {
    return null;
  }

  // Aktiv-etikett på knappen så scroll-spy-värdet syns även i hamburgare-läget.
  const activeSection = sections.find((s) => s.id === activeId) ?? null;
  const buttonLabel = activeSection ? `Sektioner: ${activeSection.label}` : 'Sektioner';

  return (
    // Sticky band, < sm (sm:hidden), z under headern (z-[9]) som chip-raden. data-section-nav
    // gör att offset-hooken mäter det här bandets höjd när det är det synliga (mobil). Det
    // distinkta utseendet (band, ikon, panel-form, animation) bor i CSS / läggs av
    // design-frontend; här är bara semantik + stabila krokar.
    <nav
      ref={bandRef}
      data-section-nav=""
      data-section-nav-mobile=""
      aria-label="Sektioner"
      className="vm-section-nav vm-section-nav-mobile sticky z-[9] sm:hidden"
    >
      <div className="mx-auto flex max-w-6xl items-center px-4 py-2">
        <button
          ref={buttonRef}
          type="button"
          data-section-menu-button=""
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="vm-section-menu-button font-display"
        >
          {/* Hamburgare-ikon (aria-hidden: knappens tillgängliga namn bär texten). Tre
            streck i en enkel SVG; design-frontend får byta ikon-behandling fritt. */}
          <svg
            data-section-menu-icon=""
            aria-hidden="true"
            viewBox="0 0 16 16"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <path d="M2 4h12M2 8h12M2 12h12" />
          </svg>
          <span data-section-menu-label="">{buttonLabel}</span>
        </button>
      </div>

      {/* Panelen renderas BARA när den är öppen (lean, inga dolda interaktiva rader i tab-
        ordningen när menyn är stängd). Reduced-motion-grenen (ingen öppnings-animation) är
        CSS-gatad i .vm-section-menu-panel (prefers-reduced-motion). role="menu" hade krävt
        full menu-tangentbordsmodell (piltangenter); vi håller det enklare och robustare med
        en lista av riktiga knappar i en panel som knappen styr via aria-expanded/-controls. */}
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          data-section-menu-panel=""
          onKeyDown={onPanelKeyDown}
          className="vm-section-menu-panel"
        >
          <ul className="mx-auto flex max-w-6xl flex-col px-2 py-1">
            {sections.map((section) => {
              const isActive = activeId === section.id;
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    data-section-menu-item=""
                    data-active={isActive ? 'true' : undefined}
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => onSelect(section.id)}
                    className="vm-section-menu-item font-display"
                  >
                    {section.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}
