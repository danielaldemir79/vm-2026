// Kommentar-storens kontrakt + context + konsument-hook (T66, #121).
//
// Bär bara TYP-KONTRAKTET + context + hooken (ingen komponent), så
// react-refresh-regeln hålls ren och provider-komponenten bor i CommentsProvider.tsx
// (samma uppdelning som PredictionsProvider / predictions-context).
//
// ANSVAR: hålla det aktiva rummets kommentarer + ladd-status och exponera
// handlingarna (skriv, radera egen). UI:t (RoomComments) är en tunn konsument som
// slår upp visningsnamn i medlemslistan (room_members) den redan har.

import { createContext, useContext } from 'react';
import type { RoomComment } from '../../data/rooms';

/** Laddningstillstånd för kommentar-lagret (samma vokabulär som tips-storen). */
export type CommentsStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Vad kommentar-storen exponerar till UI:t. */
export interface CommentsStore {
  /** Aktivt bara med live-konfig OCH ett aktivt rum (porten). */
  enabled: boolean;
  status: CommentsStatus;
  /** Felmeddelande vid status === 'error' (fail loud, inte tyst tom). */
  error: string | null;
  /** Det aktiva rummets kommentarer, ÄLDST först (nyast sist = chatt-konvention). */
  comments: RoomComment[];
  /** Den inloggades user_id (null tills känt), så UI:t vet vilka rader som är "mina". */
  userId: string | null;
  /** Skriv en kommentar i det aktiva rummet. Kastar vid fel (UI fångar + visar). */
  addComment: (body: string) => Promise<void>;
  /** Radera EN av mina egna kommentarer. Kastar vid fel (UI fångar + visar). */
  deleteComment: (commentId: string) => Promise<void>;
}

/**
 * Context med medvetet `null`-default: en konsument MÅSTE ligga under en
 * CommentsProvider. Saknas providern fail-loud:ar useCommentsStore (nedan).
 */
export const CommentsStoreContext = createContext<CommentsStore | null>(null);

/**
 * Läs kommentar-storen. KASTAR utan provider (fail loud, PRINCIPLES §8): en konsument
 * utan provider är ett wiring-fel, inte ett tillstånd att maskera med tom data.
 */
export function useCommentsStore(): CommentsStore {
  const store = useContext(CommentsStoreContext);
  if (store === null) {
    throw new Error('useCommentsStore måste användas inuti en <CommentsProvider>.');
  }
  return store;
}
