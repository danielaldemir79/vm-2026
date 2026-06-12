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

// SIMULERAD slutspelsbild UR grupp-tipsen (T51, #88): se vilka som möts i
// sextondelen + vägen mot finalen, ur dina tippade ettor/tvåor. Ren härledd vy
// (skriver aldrig), tydligt märkt simulering, treorna gissas aldrig.
export {
  deriveTipsBracket,
  type GroupTipPick,
  type TipsBracketState,
  type TipsMatchState,
  type TipsSlotState,
  type TipsSlotResolution,
} from './derive-tips-bracket';
// Treorna ur match-tipsen (T64, #118): simulerade tabeller -> Article 13 -> Annexe C.
export {
  deriveTipsThirdSeeding,
  type MatchTipScore,
  type TipsThirdSeeding,
} from './derive-tips-thirds';
// Per-grupp 1:a/2:a UR match-tipsen (T65, #119): driver "Föreslå ur mina matchtips"-
// knappen i grupp-tippningen. Återanvänder samma deriveGroupTables-härledning, men
// per grupp (1:a/2:a beror bara på den gruppens matcher, se decisions.md T65).
export { deriveTippedGroupSuggestion, type GroupSuggestion } from './derive-tipped-group-table';
export { useTipsBracketData, type TipsBracketData } from './use-tips-bracket-data';
export { TipsBracketView, type TipsBracketViewProps } from './TipsBracketView';
