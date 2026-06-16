// "Skrolla en sektion till strax under den sticky app-baren + sektions-navet"-hook
// (T103, Daniels önskemål: en meny i Turnering som hoppar direkt till rätt sektion).
//
// PROBLEM: klickar man en chip i sektions-navet ska sektionens RUBRIK landa SYNLIGT,
// inte under den sticky app-baren (header + flik-rad) ELLER under sektions-navet
// självt (som också är sticky DIREKT under app-baren). En naiv scrollIntoView lägger
// rubriken i absoluta toppen, dvs DOLD bakom de sticky banden.
//
// FIX: skrolla så rubriken landar `clearancePx` ner från fönstertoppen, där clearancePx
// är det sticky bandets PINNADE höjd (app-bar + nav) , SAMMA mått som scroll-spy:n
// använder för sin läs-linje. Vi mäter INTE navets live-bounding-box vid klick: dess
// position varierar med om det är pinnat just nu (vid sid-toppen ligger det längre ner i
// flödet), så en live-mätning gav fel landning. Ett fast band-mått (delat med scroll-
// spy:n) gör att landningen OCH aktiv-markeringen alltid är överens , en sanning. Se
// JSDoc på scrollToSection nedan för clearancePx-kontraktet.
//
// Smooth + reduced-motion-GATAD (WCAG 2.3.3): respekterar OS:ets "minska rörelse"
// genom att hoppa direkt (auto) i stället för att animera. Samma recept som den
// befintliga use-collapse-scroll-restore-hooken (ingen drift mellan scroll-beteenden).

import { useCallback } from 'react';

/**
 * Läs om användaren bett om mindre rörelse. matchMedia kan saknas helt (jsdom/SSR)
 * eller returnera undefined; gata på BÅDA så ett saknat API aldrig kastar (då
 * behandlas det som "ingen preferens", dvs smooth = standardbeteendet).
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  return mql !== null && mql !== undefined && mql.matches === true;
}

/**
 * Ge en `scrollToSection(targetId, clearancePx)` som skrollar elementet med id=targetId
 * så dess topp landar `clearancePx` ner från fönstrets topp, dvs precis under det sticky
 * bandet (app-bar + nav).
 *
 * VIKTIGT: `clearancePx` är det sticky bandets PINNADE höjd (samma värde scroll-spy:n
 * använder för sin läs-linje), INTE navets nuvarande bounding-box. Navets live-position
 * varierar med om det är pinnat just nu eller ej (vid sid-toppen ligger det längre ner i
 * flödet), så en live-mätning vid klick gav fel landning. Ett fast band-mått gör att
 * landningen OCH aktiv-markeringen alltid är överens (en sanning).
 *
 * No-op om målet inte finns eller scroll-API:t saknas (jsdom/SSR), så ett test aldrig
 * kraschar. Den faktiska visuella scrollen bevisas i webbläsaren.
 */
export function useScrollToSection() {
  return useCallback((targetId: string, clearancePx: number) => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (typeof window.scrollTo !== 'function') return;

    const target = document.getElementById(targetId);
    if (target === null) return;

    // +8px liten luft så rubriken inte klistrar exakt mot bandets nederkant.
    const clearance = clearancePx + 8;

    const rect = target.getBoundingClientRect();
    // rect.top är relativt viewporten; lägg på nuvarande scrollY för en absolut sid-
    // position och dra av clearance. Klampa >= 0 (aldrig negativ scroll).
    const top = Math.max(0, window.scrollY + rect.top - clearance);

    window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);
}
