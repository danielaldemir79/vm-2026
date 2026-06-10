// Publik yta för what-if-simulatorn (T12, issue #12). App och vyer importerar
// härifrån så intern filstruktur kan ändras utan att bryta call-sites.
//
// Själva simulerings-STATE:t bor i den delade results-storen (ResultsProvider),
// eftersom what-if-läget bara är ett hypotetiskt overlay ovanpå samma matchlista
// som alla vyer redan härleder ur (en sanning, härledd state, SPEC §6). Denna
// feature-modul bär därför bara (a) den rena overlay-sammanvävningen och (b)
// kontroll-/markerings-UI:t.

// Ren overlay-logik (riktig + overlay -> effektiva matcher), testbar fristående.
export { applySimulationOverlay, EMPTY_OVERLAY } from './apply-simulation';
export type { SimulationOverlay } from './apply-simulation';

// Kontroll + markering (starta/återställ/avsluta + "Simulering pågår"-banner).
export { SimulationBanner } from './SimulationBanner';

// App-global visuell ram (ring + tint + sticky markeringsbadge) runt de
// simulerade vyerna när what-if-läget är PÅ.
export { SimulationFrame } from './SimulationFrame';
