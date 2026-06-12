// Joker-storens kontrakt + context + konsument-hook (T19, #19).
//
// Bär bara TYP-KONTRAKTET + context + hooken (ingen komponent), så react-refresh-regeln
// hålls ren och provider-komponenten bor i JokerProvider.tsx (samma uppdelning som
// predictions-context / rooms-context).
//
// ANSVAR: hålla "mina joker-val i det aktiva rummet" (matchId -> joker) + status, och
// exponera handlingarna att SÄTTA/ÅNGRA en joker. EN joker per omgång (svensk dag):
// att sätta en joker på en match SAMMA dag som en befintlig joker FLYTTAR jokern
// (DB:ns PK på joker_day, upsert byter). Säkerheten (deadline-lås, sekretess) bor i RLS
// (server-side, bevisat T19); storen är bara klient-limmet mot joker-API:t.

import { createContext, useContext } from 'react';
import type { RoomJoker } from '../../data/predictions';

/** Laddningstillstånd för joker-lagret (samma vokabulär som tips-storen). */
export type JokerStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Vad joker-storen exponerar till UI:t. */
export interface JokerStore {
  /** Är joker-lagret aktivt (Supabase konfigurerat OCH ett aktivt rum valt)? */
  enabled: boolean;
  status: JokerStatus;
  /** Felmeddelande vid status === 'error' (fail loud, inte tyst tom). */
  error: string | null;
  /** Det aktiva rummets id, eller null (då är joker-val inte möjligt). */
  activeRoomId: string | null;
  /**
   * Mina egna joker-val i det aktiva rummet, keyade på matchId. En joker per svensk
   * kalenderdag, så normalt finns högst en per dag (men flera dagar kan ha var sin).
   */
  myJokers: ReadonlyMap<string, RoomJoker>;
  /**
   * Sätt (eller flytta) min joker till en match. Kastar vid fel (UI fångar), inkl. ett
   * RLS-avslag om matchen är låst (avspark passerad) -> fail loud. Sätter man en joker en
   * dag man redan har en, FLYTTAS jokern till den nya matchen (DB:ns PK på joker_day).
   */
  setJoker: (matchId: string) => Promise<void>;
  /** Ångra min joker på en match (ta bort). Kastar vid fel. No-op om ingen fanns. */
  clearJoker: (matchId: string) => Promise<void>;
}

/**
 * Context med medvetet `null`-default: en konsument MÅSTE ligga under en JokerProvider.
 * Saknas providern fail-loud:ar useJokerStore.
 */
export const JokerStoreContext = createContext<JokerStore | null>(null);

/**
 * Läs joker-storen. KASTAR utan provider (fail loud, PRINCIPLES §8): en konsument utan
 * provider är ett wiring-fel, inte ett tillstånd att maskera med tom data.
 */
export function useJokerStore(): JokerStore {
  const store = useContext(JokerStoreContext);
  if (store === null) {
    throw new Error('useJokerStore måste användas inuti en <JokerProvider>.');
  }
  return store;
}
