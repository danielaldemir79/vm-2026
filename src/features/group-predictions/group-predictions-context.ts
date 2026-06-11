// Grupp-tips-storens kontrakt + context + konsument-hook (T16, #16).
//
// Systerfil till predictions-context.ts (T15). Bär bara TYP-KONTRAKTET + context +
// hooken (ingen komponent), så react-refresh-regeln hålls ren och provider-
// komponenten bor i GroupPredictionsProvider.tsx (samma uppdelning som T15).
//
// ANSVAR: hålla "mina grupp-tips i det aktiva rummet" + status, och exponera
// handlingen att spara ett grupp-tips (1:a + 2:a). Grupp-tips är PER RUM: utan ett
// aktivt rum är storen inaktiv (UI:t visar "gå med i ett rum"). Säkerheten (deadline-
// lås, sekretess) bor i RLS (server-side); storen är bara klient-limmet mot API:t.

import { createContext, useContext } from 'react';
import type { GroupPrediction, GroupPredictionInput } from '../../data/predictions';

/** Laddningstillstånd (samma vokabulär som T15:s tips-store). */
export type GroupPredictionsStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Vad grupp-tips-storen exponerar till UI:t. */
export interface GroupPredictionsStore {
  /** Är lagret aktivt (Supabase konfigurerat OCH ett aktivt rum valt)? */
  enabled: boolean;
  status: GroupPredictionsStatus;
  /** Felmeddelande vid status === 'error' (fail loud, inte tyst tom). */
  error: string | null;
  /** Det aktiva rummets id, eller null (då är grupp-tips inte möjligt). */
  activeRoomId: string | null;
  /** Mina egna grupp-tips i det aktiva rummet (groupId -> tips). */
  myGroupPredictions: ReadonlyMap<string, GroupPrediction>;
  /**
   * Spara (eller ändra) mitt grupp-tips. Kastar vid fel (UI fångar), inklusive
   * ett RLS-avslag om gruppen är låst (första matchen sparkat igång) -> fail loud.
   */
  saveGroupPrediction: (input: GroupPredictionInput) => Promise<void>;
}

/**
 * Context med medvetet `null`-default: en konsument MÅSTE ligga under en
 * GroupPredictionsProvider. Saknas providern fail-loud:ar hooken.
 */
export const GroupPredictionsStoreContext = createContext<GroupPredictionsStore | null>(null);

/**
 * Läs grupp-tips-storen. KASTAR utan provider (fail loud, PRINCIPLES §8): en
 * konsument utan provider är ett wiring-fel, inte ett tillstånd att maskera.
 */
export function useGroupPredictionsStore(): GroupPredictionsStore {
  const store = useContext(GroupPredictionsStoreContext);
  if (store === null) {
    throw new Error('useGroupPredictionsStore måste användas inuti en <GroupPredictionsProvider>.');
  }
  return store;
}
