// MATCH-DETALJ-DRILL-IN: kontrakt + context + hook (T86, #178).
//
// "Vad är öppet?" lyfts till en EGEN context (samma mönster som team-profile-context.ts,
// patterns.md "klickbar-entitet-oeppnar-en-delad-modal-overlay"), skild från data-storarna.
// En matchrad var som helst (Idag-listan nu, Tips-reveal-listan i T92) kan öppna DEN delade
// rika matchvyn för ett match-id utan prop-drilling: den anropar bara openMatch(matchId).
//
// VARFÖR en drill-in (modal) och inte inline-expand eller en egen route: north-star §2
// (progressive disclosure) säger att den TUNGA detaljen (rik matchvy) ska öppnas via
// DRILL-IN, inte inline-expand , det eliminerar nästlade komprimera-knappar. En MODAL (inte
// en routad vy) är KISS i den router-lösa PWA:n (flik-IA:n är hash-baserad, ingen
// react-router): en snabb djup-titt ovanpå Idag, ingen URL-route att bygga, och den
// återanvänder den redan a11y-kompletta delade <Modal>-primitiven (fokus-fälla, Escape,
// portal, reduced-motion). Avvägning vs delbar djuplänk: en hash-route per match hade gett
// en delbar URL, men hela appens delning sker redan på app-nivå (vm-2026.pages.dev) och en
// per-match-länk är inte ett uttalat krav , KISS vinner, beslutet i docs/decisions.md.

import { createContext, useContext } from 'react';

/** Vad drill-in-lagret exponerar: vilket match-id som är öppet + öppna/stäng. */
export interface MatchDetailContextValue {
  /** Det öppna match-id:t (appens match-id, t.ex. 'g-F-1'), null när inget är öppet. */
  openMatchId: string | null;
  /** Öppna den rika matchvyn för ett givet match-id. */
  openMatch: (matchId: string) => void;
  /** Stäng den rika matchvyn. */
  closeMatch: () => void;
}

/**
 * Context med medvetet `null`-default: en konsument (matchrad-triggern, vyn) MÅSTE ligga
 * under en MatchDetailProvider. Saknas providern fail-loud:ar hooken (ett klickbart element
 * utan provider är ett wiring-fel, inte ett tillstånd att maskera, PRINCIPLES §8).
 */
export const MatchDetailContext = createContext<MatchDetailContextValue | null>(null);

/**
 * Läs drill-in-seamen. KASTAR utan provider (fail loud). Använd i triggern (för openMatch)
 * och i provider-renderade vyn (för openMatchId/closeMatch).
 */
export function useMatchDetail(): MatchDetailContextValue {
  const ctx = useContext(MatchDetailContext);
  if (ctx === null) {
    throw new Error('useMatchDetail måste användas inuti en <MatchDetailProvider>.');
  }
  return ctx;
}

/**
 * TOLERANT variant: returnerar drill-in-seamen om en provider finns, annars `null` (samma
 * mönster som useOptionalResultsStore). Används av en vy som KAN drillas in men också
 * renderas fristående (t.ex. slutspelsträdet i enhetstester utan MatchDetailProvider):
 * finns seamen blir match-noderna klickbara, annars degraderar vyn tyst till en statisk
 * vy utan drill-in (ingen krasch). Ett klickbart element som KRÄVER seamen ska däremot
 * använda useMatchDetail (fail loud, ett saknat wiring är ett fel där).
 */
export function useOptionalMatchDetail(): MatchDetailContextValue | null {
  return useContext(MatchDetailContext);
}
