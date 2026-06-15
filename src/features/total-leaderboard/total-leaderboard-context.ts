// Den totala (cross-rum) topplistans store-kontrakt + context + konsument-hook
// (T82 del 3, #173).
//
// Bär bara TYP-KONTRAKTET + context + hooken (ingen komponent), så react-refresh-
// regeln hålls ren och provider-komponenten bor i TotalLeaderboardProvider.tsx (samma
// uppdelning som T17:s leaderboard-context). ANSVAR: hålla den GLOBALT rangordnade
// topplistan (alla deltagare över alla rum) + den inloggade spelarens sammanfattning,
// härledd ur de rena modulerna (aggregate-total). Allt LÄSES (ingen skriv-operation).

import { createContext, useContext } from 'react';
import type { TotalLeaderboardEntry, TotalSelfSummary } from './aggregate-total';

/** Laddningstillstånd (samma vokabulär som T17:s store). */
export type TotalLeaderboardStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Vad den totala topplistans store exponerar till UI:t. */
export interface TotalLeaderboardStore {
  /** Är lagret aktivt (live-läge ELLER demo-fixtures med data att visa)? */
  enabled: boolean;
  status: TotalLeaderboardStatus;
  /** Felmeddelande vid status === 'error' (fail loud, inte tyst tom). */
  error: string | null;
  /** Den GLOBALT rangordnade topplistan (högsta summa först, delad rank vid lika). */
  total: readonly TotalLeaderboardEntry[];
  /**
   * Den inloggade spelarens sammanfattning (placering + av N + poäng + antal rum), eller
   * null om vi inte kan peka ut en egen rad (ingen identitet / inte med i totalen). Driver
   * "din placering"-hjälten; null => ingen hjälte (hellre tyst än en gissad placering).
   */
  selfSummary: TotalSelfSummary | null;
  /**
   * Den inloggade spelarens id, eller null. SEAM för "du"-framhävningen: vyn jämför varje
   * rad-userId mot detta för att färg-OBEROENDE markera den egna raden (både i komprimerat
   * och utfällt läge). Bara en VISNINGS-hak; null = ingen rad markeras som "du".
   */
  currentUserId: string | null;
}

/**
 * Context med medvetet `null`-default: en konsument MÅSTE ligga under en
 * TotalLeaderboardProvider. Saknas providern fail-loud:ar hooken.
 */
export const TotalLeaderboardStoreContext = createContext<TotalLeaderboardStore | null>(null);

/**
 * Läs den totala topplistans store. KASTAR utan provider (fail loud, PRINCIPLES §8):
 * en konsument utan provider är ett wiring-fel, inte ett tillstånd att maskera.
 */
export function useTotalLeaderboardStore(): TotalLeaderboardStore {
  const store = useContext(TotalLeaderboardStoreContext);
  if (store === null) {
    throw new Error('useTotalLeaderboardStore måste användas inuti en <TotalLeaderboardProvider>.');
  }
  return store;
}
