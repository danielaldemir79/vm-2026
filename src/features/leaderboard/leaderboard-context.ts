// Topplistans + avslöjandets store-kontrakt + context + konsument-hook (T17, #17).
//
// Bär bara TYP-KONTRAKTET + context + hooken (ingen komponent), så
// react-refresh-regeln hålls ren och provider-komponenten bor i
// LeaderboardProvider.tsx (samma uppdelning som T15/T16:s tips-stores).
//
// ANSVAR: hålla den RANGORDNADE topplistan (alla medlemmars totalpoäng) + tips-
// AVSLÖJANDET (per avgjord match) för det aktiva rummet, härlett ur de tre tips-
// typerna + det delade facit. Allt LÄSES (T17 har ingen skriv-operation, tipsen
// skrivs av T15/T16:s stores). Säkerheten (sekretess: andras tips dolda före
// deadline) bor i RLS (server-side, T15/T16); storen läser bara det RLS släpper.

import { createContext, useContext } from 'react';
import type { Team } from '../../domain/types';
import type { LeaderboardEntry } from './aggregate-scores';
import type { RevealedMatch } from './reveal';

/** Laddningstillstånd (samma vokabulär som T15/T16:s stores). */
export type LeaderboardStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Vad topplista-storen exponerar till UI:t. */
export interface LeaderboardStore {
  /** Är lagret aktivt (Supabase konfigurerat OCH ett aktivt rum valt)? */
  enabled: boolean;
  status: LeaderboardStatus;
  /** Felmeddelande vid status === 'error' (fail loud, inte tyst tom). */
  error: string | null;
  /** Det aktiva rummets id, eller null (då är topplistan inte möjlig). */
  activeRoomId: string | null;
  /** Den rangordnade topplistan (högsta poäng först, delad rank vid lika). */
  leaderboard: readonly LeaderboardEntry[];
  /** Tips-avslöjandet per avgjord+låst match (andras tips synliga efter deadline). */
  reveal: readonly RevealedMatch[];
  /** Lag-listan (Team.id -> namn för avslöjande-vyns match-rubriker). */
  teams: readonly Team[];
}

/**
 * Context med medvetet `null`-default: en konsument MÅSTE ligga under en
 * LeaderboardProvider. Saknas providern fail-loud:ar hooken.
 */
export const LeaderboardStoreContext = createContext<LeaderboardStore | null>(null);

/**
 * Läs topplista-storen. KASTAR utan provider (fail loud, PRINCIPLES §8): en
 * konsument utan provider är ett wiring-fel, inte ett tillstånd att maskera.
 */
export function useLeaderboardStore(): LeaderboardStore {
  const store = useContext(LeaderboardStoreContext);
  if (store === null) {
    throw new Error('useLeaderboardStore måste användas inuti en <LeaderboardProvider>.');
  }
  return store;
}
