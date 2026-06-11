// Bracket-tips-storens kontrakt + context + konsument-hook (T16b, #59).
//
// Systerfil till group-predictions-context.ts (T16) + predictions-context.ts (T15).
// Bär bara TYP-KONTRAKTET + context + hooken (ingen komponent), så react-refresh-
// regeln hålls ren och provider-komponenten bor i BracketPredictionsProvider.tsx
// (samma uppdelning som T15/T16).
//
// ANSVAR: hålla "mina bracket-tips i det aktiva rummet" (slotId -> tips, inkl.
// champion-slotten) + status, och exponera handlingen att spara ett bracket-tips.
// Bracket-tips är PER RUM: utan ett aktivt rum är storen inaktiv (UI:t visar "gå
// med i ett rum"). Säkerheten (per-slot/champion-deadline-lås, sekretess) bor i RLS
// (server-side); storen är bara klient-limmet mot API:t.

import { createContext, useContext } from 'react';
import type { BracketPrediction, BracketPredictionInput } from '../../data/predictions';

/** Laddningstillstånd (samma vokabulär som T15/T16:s tips-store). */
export type BracketPredictionsStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Vad bracket-tips-storen exponerar till UI:t. */
export interface BracketPredictionsStore {
  /** Är lagret aktivt (Supabase konfigurerat OCH ett aktivt rum valt)? */
  enabled: boolean;
  status: BracketPredictionsStatus;
  /** Felmeddelande vid status === 'error' (fail loud, inte tyst tom). */
  error: string | null;
  /** Det aktiva rummets id, eller null (då är bracket-tips inte möjligt). */
  activeRoomId: string | null;
  /** Mina egna bracket-tips i det aktiva rummet (slotId -> tips, inkl. 'champion'). */
  myBracketPredictions: ReadonlyMap<string, BracketPrediction>;
  /**
   * Spara (eller ändra) mitt bracket-tips för en slot. Kastar vid fel (UI fångar),
   * inklusive ett RLS-avslag om slotten är låst (avspark passerad / turneringen
   * startat) -> fail loud.
   */
  saveBracketPrediction: (input: BracketPredictionInput) => Promise<void>;
}

/**
 * Context med medvetet `null`-default: en konsument MÅSTE ligga under en
 * BracketPredictionsProvider. Saknas providern fail-loud:ar hooken.
 */
export const BracketPredictionsStoreContext = createContext<BracketPredictionsStore | null>(null);

/**
 * Läs bracket-tips-storen. KASTAR utan provider (fail loud, PRINCIPLES §8): en
 * konsument utan provider är ett wiring-fel, inte ett tillstånd att maskera.
 */
export function useBracketPredictionsStore(): BracketPredictionsStore {
  const store = useContext(BracketPredictionsStoreContext);
  if (store === null) {
    throw new Error(
      'useBracketPredictionsStore måste användas inuti en <BracketPredictionsProvider>.'
    );
  }
  return store;
}
