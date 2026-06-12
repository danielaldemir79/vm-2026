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
import type { LeaderboardEntry, ScoreBySource } from './aggregate-scores';
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
  /**
   * Den inloggade (anonyma) användarens id, eller null innan auth-sessionen är klar.
   * SEAM för "du"-framhävningen i topplistan: vyn jämför varje rad-userId mot detta
   * för att färg-OBEROENDE markera den egna raden. Bara en VISNINGS-hak (ingen
   * sekretess hänger på den, RLS är skyddet); null = ingen rad markeras som "du".
   */
  currentUserId: string | null;
  /**
   * AKTUELL användares poäng UPPDELAD per tips-källa + total (T58, #99), eller null
   * tills vi kan peka ut en egen medlem (ingen identitet / inte medlem i rummet).
   * Härledd ur SAMMA scoreMember-väg som topplistan (scoreMemberBreakdown), så
   * detalj-vyn ("var kommer poängen ifrån?") aldrig räknar om i en parallell väg.
   * Konsumeras av tips-vyns summering, så tips-sektionen och topplistan delar
   * EN poäng-källa (ingen dubbelhämtning, providern hoistad i App så båda når den).
   */
  selfBreakdown: { bySource: ScoreBySource; total: number } | null;
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
