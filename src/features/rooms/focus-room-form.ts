// Genväg-fokus till RoomSection-formulären (T96, #193).
//
// RoomPill-menyns "Skapa rum" / "Gå med i rum" navigerar till RoomSection (överst i
// Tips) och ska landa användaren PÅ rätt formulär. Tab-bytet (selectTab('tips')) bor i
// App-skalet (det äger flik-routern); DEN HÄR funktionen är den rena DOM-delen: hitta
// rätt formulär, scrolla in det och fokusera dess första fält. Bruten ut hit så seamen
// går att testa isolerat (jsdom) i stället för att gömmas i en App-callback , just det
// "gör seamen testbar"-mönstret (en otestad navigations-seam är hur reveal-/white-screen-
// buggarna slank igenom förr).
//
// VÄNTA PÅ LAYOUT: anroparen (App) kör detta EFTER att Tips-fliken bytts in (dubbel rAF),
// för Tips-panelen är monterad men `hidden` tills fliken är aktiv , utan layout blir
// scrollIntoView/focus en no-op. Funktionen själv är synkron och defensiv: hittar den
// inget formulär (oväntat) gör den ingenting (kastar aldrig).

import type { RoomFormTarget } from './RoomPill';

/** RoomPanels stabila krokar (skapa- resp. gå-med-formuläret). */
const FORM_SELECTOR: Record<RoomFormTarget, string> = {
  create: '[data-rooms-create-form]',
  join: '[data-rooms-join-form]',
};

/**
 * Scrolla in och fokusera RoomSection-formuläret för `target` (skapa/gå-med). No-op om
 * DOM saknas (SSR) eller formuläret inte finns. Respekterar prefers-reduced-motion
 * (smooth scroll bara när rörelse är ok).
 */
export function focusRoomForm(target: RoomFormTarget): void {
  if (typeof document === 'undefined') {
    return;
  }
  const form = document.querySelector<HTMLElement>(FORM_SELECTOR[target]);
  if (form === null) {
    return;
  }
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  form.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  // Fokusera första fältet, så tangentbord/skärmläsare landar direkt i formuläret.
  // preventScroll: scrollIntoView ovan äger scrollen (annars hoppar fokus den förbi).
  form.querySelector<HTMLElement>('input')?.focus({ preventScroll: true });
}
