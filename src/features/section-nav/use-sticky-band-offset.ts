// useStickyBandOffset (T79, #167): mät de sticky-bandens samlade höjd ROBUST och exponera
// den som --vm-section-nav-offset / --vm-section-nav-header-top på <html>.
//
// VARFÖR DELAD (extraherad ur SectionNav i T79): sektions-navet har nu TVÅ responsiva band
// som aldrig syns samtidigt, den befintliga chip-raden (desktop, >= sm) och den nya
// hamburgare-knappen (mobil, < sm). BÅDA måste skriva SAMMA scroll-offset-kontrakt
// (--vm-section-nav-offset styr scroll-margin-top på sektionerna OCH scroll-spy-zonens topp,
// se section-nav.css + use-section-spy.ts). Hade de två banden mätt var för sig med
// kopierad logik skulle kontraktet kunna drifta isär (samma rot som C4-context-delningen:
// en delad sanning i stället för två som glider isär). Därför EN mät-hook som båda banden
// använder.
//
// HUR OFFSETEN HÄRLEDS (robust, ingen magisk pixel): headern (app-headerns uppmätta höjd via
// dess STABILA krok header[data-app-header], INTE en ren 'header'-selektor, F1 från T78) +
// det SYNLIGA bandets höjd. Eftersom de två banden växlas med CSS (Tailwind sm:-klasser:
// display:none på det dolda) rapporterar det dolda bandet getBoundingClientRect().height = 0,
// så MAX-höjden över alla [data-section-nav]-band = exakt det synliga bandets höjd. Vi tar
// MAX (inte summa), så när båda banden är monterade men bara ett syns blir offseten det
// synliga bandets höjd, oavsett vilket band som råkar köra sin mät-effekt sist (idempotent:
// båda effekterna räknar fram SAMMA värde, ingen kamp om CSS-variabeln).
//
// MÄTS: vid mount, vid resize (viewport/zoom, även sm-brytpunktens växling) och när bandets
// innehåll ändras (deps i anroparen, t.ex. chip-antal). ResizeObserver fångar bandens
// höjdändring utan scroll-polling; faller till window 'resize' i äldre miljöer (jsdom).
//
// RENSAR CSS-variablerna när SISTA bandet försvinner (C5 från T78, härdad i T79 C4-C5): de bor
// på <html>, inte på bandet, så de nollställs aldrig av sig själva. Eftersom BÅDA banden delar
// hook + variabler får cleanup rensa BARA när inget [data-section-nav]-band finns kvar i DOM
// (querySelectorAll-räkning). Annars skulle ena bandets cleanup (recompute/unmount) nolla
// variablerna trots att det andra bandet lever -> glapp tills nästa mätning.

import { useEffect, type RefObject } from 'react';

const OFFSET_VAR = '--vm-section-nav-offset';
const HEADER_TOP_VAR = '--vm-section-nav-header-top';

/** App-headerns uppmätta höjd (0 om den inte finns), via dess stabila krok (F1, T78). */
function measureHeaderHeight(): number {
  const header = document.querySelector('header[data-app-header]');
  return header?.getBoundingClientRect().height ?? 0;
}

/** Det SYNLIGA bandets höjd = MAX över alla [data-section-nav] (dolda band = 0, se headern). */
function measureVisibleBandHeight(): number {
  const bands = document.querySelectorAll<HTMLElement>('[data-section-nav]');
  let max = 0;
  for (const band of bands) {
    const height = band.getBoundingClientRect().height;
    if (height > max) {
      max = height;
    }
  }
  return max;
}

/**
 * Skriv --vm-section-nav-header-top (var bandet ska sitta, rakt under headern) och
 * --vm-section-nav-offset (header + synligt band, vad en rubrik måste rensa) på <html>.
 *
 * @param bandRef ref till bandets sticky-element (det med data-section-nav). Hookens effekt
 *   no-op:ar om ref:en saknar nod (bandet renderas inte, t.ex. 0 sektioner).
 * @param recomputeKey värde som triggar om-mätning när bandets innehåll ändras (chip-antal).
 */
export function useStickyBandOffset(
  bandRef: RefObject<HTMLElement | null>,
  recomputeKey: number
): void {
  useEffect(() => {
    const band = bandRef.current;
    if (!band) {
      return;
    }

    function measure(): void {
      const headerHeight = measureHeaderHeight();
      const bandHeight = measureVisibleBandHeight();
      const offset = Math.round(headerHeight + bandHeight);
      document.documentElement.style.setProperty(HEADER_TOP_VAR, `${Math.round(headerHeight)}px`);
      document.documentElement.style.setProperty(OFFSET_VAR, `${offset}px`);
    }
    measure();

    // ResizeObserver fångar bandets + headerns höjdändring (radbrytning, typsnitt/zoom,
    // sm-brytpunktens växling) utan scroll-polling. Saknas den (äldre jsdom) faller vi till
    // resize-event. Vi observerar BÅDA banden (om båda finns) så en höjdändring av endera
    // banden mäts om, plus headern via dess stabila krok.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      for (const el of document.querySelectorAll<HTMLElement>('[data-section-nav]')) {
        ro.observe(el);
      }
      const header = document.querySelector('header[data-app-header]');
      if (header) {
        ro.observe(header);
      }
    }
    window.addEventListener('resize', measure);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      // Rensa de globala CSS-variablerna BARA när INGET [data-section-nav]-band finns kvar i DOM.
      // T79 införde TVÅ band (desktop chip-rad + mobil hamburgare-band) som DELAR denna hook och
      // de globala variablerna. Rensade vi alltid (som tidigare) skulle ena instansens cleanup
      // (vid recompute eller unmount) nolla variablerna trots att det ANDRA bandet fortfarande
      // finns -> glapp/skört, scroll-margin + spy-zon tappar sin offset tills nästa mätning.
      // Vid recompute/unmount av ENA bandet finns det andra kvar (length >= 1) -> behåll. När
      // SISTA bandet försvinner (0 kvar) tas variablerna bort så de inte blir stale (C5, #168).
      if (document.querySelectorAll('[data-section-nav]').length === 0) {
        document.documentElement.style.removeProperty(HEADER_TOP_VAR);
        document.documentElement.style.removeProperty(OFFSET_VAR);
      }
    };
  }, [bandRef, recomputeKey]);
}
