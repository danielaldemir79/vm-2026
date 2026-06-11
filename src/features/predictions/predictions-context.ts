// Tips-storens kontrakt + context + konsument-hook (T15, #15).
//
// Bär bara TYP-KONTRAKTET + context + hooken (ingen komponent), så
// react-refresh-regeln hålls ren och provider-komponenten bor i
// PredictionsProvider.tsx (samma uppdelning som rooms-context / results-context).
//
// ANSVAR: hålla "mina tips i det aktiva rummet" + status, och exponera handlingen
// att spara ett tips. Tips är PER RUM: utan ett aktivt rum är storen inaktiv
// (UI:t visar "gå med i ett rum för att tippa"). Säkerheten (deadline-lås, sekretess)
// bor i RLS (server-side), storen är bara klient-limmet mot tips-API:t.

import { createContext, useContext } from 'react';
import type { Prediction, PredictionInput } from '../../data/predictions';

/** Laddningstillstånd för tips-lagret (samma vokabulär som rooms/results-storen). */
export type PredictionsStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Vad tips-storen exponerar till UI:t. */
export interface PredictionsStore {
  /** Är tips-lagret aktivt (Supabase konfigurerat OCH ett aktivt rum valt)? */
  enabled: boolean;
  status: PredictionsStatus;
  /** Felmeddelande vid status === 'error' (fail loud, inte tyst tom). */
  error: string | null;
  /** Det aktiva rummets id, eller null (då är tips-inmatning inte möjlig). */
  activeRoomId: string | null;
  /** Mina egna tips i det aktiva rummet (matchId -> tips). */
  myPredictions: ReadonlyMap<string, Prediction>;
  /**
   * Spara (eller ändra) mitt tips på en match. Kastar vid fel (UI fångar),
   * inklusive ett RLS-avslag om matchen är låst (avspark passerad) -> fail loud.
   */
  savePrediction: (input: PredictionInput) => Promise<void>;
}

/**
 * Context med medvetet `null`-default: en konsument MÅSTE ligga under en
 * PredictionsProvider. Saknas providern fail-loud:ar usePredictionsStore.
 */
export const PredictionsStoreContext = createContext<PredictionsStore | null>(null);

/**
 * Läs tips-storen. KASTAR utan provider (fail loud, PRINCIPLES §8): en konsument
 * utan provider är ett wiring-fel, inte ett tillstånd att maskera med tom data.
 */
export function usePredictionsStore(): PredictionsStore {
  const store = useContext(PredictionsStoreContext);
  if (store === null) {
    throw new Error('usePredictionsStore måste användas inuti en <PredictionsProvider>.');
  }
  return store;
}
