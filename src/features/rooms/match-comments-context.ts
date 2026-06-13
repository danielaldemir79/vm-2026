// Match-kommentar-storens kontrakt + context + konsument-hook (T77, #161).
//
// Bär bara TYP-KONTRAKTET + context + hooken (ingen komponent), så react-refresh-regeln
// hålls ren och provider-komponenten bor i MatchCommentsProvider.tsx (samma uppdelning
// som CommentsProvider / comments-context och ReactionsProvider / reactions-context).
//
// ANSVAR: hålla det aktiva rummets MATCH-kommentarer GRUPPERADE per match + ladd-status,
// exponera handlingarna (skriv i en match-tråd, radera egen) och userId + nameByUser så
// UI:t (MatchComments) kan markera "mina" rader och slå upp författarnamn ur medlemslistan
// (room_members, EN sanning). Match-trådarna är SKILDA från rums-chatten (T66, CommentsStore).

import { createContext, useContext } from 'react';
import type { MatchCommentThread } from './match-comments-aggregate';

/** Laddningstillstånd för match-kommentar-lagret (samma vokabulär som tips-/reaktions-storen). */
export type MatchCommentsStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Vad match-kommentar-storen exponerar till UI:t. */
export interface MatchCommentsStore {
  /** Aktivt bara med live-konfig OCH ett aktivt rum (porten, samma som reaktionerna). */
  enabled: boolean;
  status: MatchCommentsStatus;
  /** Felmeddelande vid status === 'error' (fail loud, inte tyst tom). */
  error: string | null;
  /**
   * matchId -> trådens kommentarer (äldst först) + antal. UI:t slår upp sin match via
   * threadForMatch (tom, giltig tråd som fallback för en match ingen kommenterat).
   */
  byMatch: Map<string, MatchCommentThread>;
  /** Den inloggades user_id (null tills känt), så UI:t vet vilka rader som är "mina". */
  userId: string | null;
  /** userId -> displayName ur rummets medlemmar (EN sanning, room_members). */
  nameByUser: ReadonlyMap<string, string>;
  /** Skriv en kommentar i EN match-tråd. Kastar vid fel (UI fångar + visar). */
  addComment: (matchId: string, body: string) => Promise<void>;
  /** Radera EN av mina egna kommentarer. Kastar vid fel (UI fångar + visar). */
  deleteComment: (commentId: string) => Promise<void>;
}

/**
 * Context med medvetet `null`-default. Till skillnad från useCommentsStore (rums-chatten,
 * som KASTAR) faller useMatchCommentsStore TOLERANT till en inert store utan provider
 * (samma val som useReactionsStore, T24 KA-F3, se nedan).
 */
export const MatchCommentsStoreContext = createContext<MatchCommentsStore | null>(null);

/** Inert match-kommentar-store: inaktiv (enabled=false), inga trådar, handlingar no-op. */
const INERT_MATCH_COMMENTS_STORE: MatchCommentsStore = {
  enabled: false,
  status: 'idle',
  error: null,
  byMatch: new Map(),
  userId: null,
  nameByUser: new Map(),
  addComment: async () => {},
  deleteComment: async () => {},
};

/**
 * Läs match-kommentar-storen TOLERANT mot en saknad provider (samma mönster som
 * useReactionsStore, T24 KA-F3, inte den kastande useCommentsStore).
 *
 * VARFÖR tolerant: kommentar-affordansen (MatchComments) är en FOTRAD på matchkorten i
 * dagens-vyn, och dagens-vyn (DailyMatchesView) renderas i MÅNGA tester och i lokalt läge
 * UTAN en MatchCommentsProvider. Match-kommentarer är ett ADDITIVT socialt lager: utan en
 * provider ska matchkorten fungera precis som förr (ingen kommentar-affordans). Därför
 * faller hooken till en INERT store (enabled=false -> MatchComments renderar null), i
 * stället för att tvinga varje matchkort-konsument under en provider. Säkerheten bor ändå
 * server-side i RLS; en inert store kan inte skriva något (no-op handlingar).
 */
export function useMatchCommentsStore(): MatchCommentsStore {
  const store = useContext(MatchCommentsStoreContext);
  return store ?? INERT_MATCH_COMMENTS_STORE;
}
