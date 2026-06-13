// Reaktions-storens kontrakt + context + konsument-hook (T24, #24).
//
// Bär bara TYP-KONTRAKTET + context + hooken (ingen komponent), så
// react-refresh-regeln hålls ren och provider-komponenten bor i ReactionsProvider.tsx
// (samma uppdelning som CommentsProvider / comments-context).
//
// ANSVAR: hålla det aktiva rummets AGGREGERADE reaktioner (matchId -> sammanfattning)
// + ladd-status och exponera handlingarna (sätt/byt, ta bort). UI:t (MatchReactions)
// är en tunn konsument som slår upp sin match i kartan.

import { createContext, useContext } from 'react';
import type { ReactionEmoji } from '../../data/rooms';
import type { MatchReactionSummary } from './reaction-aggregate';

/** Laddningstillstånd för reaktions-lagret (samma vokabulär som kommentar-storen). */
export type ReactionsStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Vad reaktions-storen exponerar till UI:t. */
export interface ReactionsStore {
  /** Aktivt bara med live-konfig OCH ett aktivt rum (porten). */
  enabled: boolean;
  status: ReactionsStatus;
  /** Felmeddelande vid status === 'error' (fail loud, inte tyst tom). */
  error: string | null;
  /**
   * Det aktiva rummets reaktioner, AGGREGERADE per match (matchId -> sammanfattning).
   * En match utan reaktioner saknas i kartan; UI:t slår upp via summaryForMatch som
   * faller till en tom (giltig) sammanfattning.
   */
  byMatch: Map<string, MatchReactionSummary>;
  /** Den inloggades user_id (null tills känt), så UI:t vet vilken bricka som är "min". */
  userId: string | null;
  /**
   * VISNINGSNAMN per user_id (T74, #157): ur det aktiva rummets medlemmar (room_members),
   * så "vem reagerade"-popovern kan visa namn i stället för råa id:n. EN sanning för
   * "userId -> namn" (samma karta RoomComments bygger), buren på reaktions-storen så
   * MatchReactions inte behöver en EGEN koppling till rums-storen. En reagerare som
   * lämnat rummet saknas i kartan -> UI:t faller till "Tidigare medlem" (reaction-authors).
   */
  nameByUser: ReadonlyMap<string, string>;
  /**
   * Sätt ELLER byt min reaktion på en match (upsert). Kastar vid fel (UI fångar + visar).
   */
  react: (matchId: string, emoji: ReactionEmoji) => Promise<void>;
  /** Ta bort min reaktion på en match (avmarkera). Kastar vid fel (UI fångar + visar). */
  removeReaction: (matchId: string) => Promise<void>;
}

/**
 * Context med medvetet `null`-default. Till skillnad från useCommentsStore (som KASTAR)
 * faller useReactionsStore TOLERANT till en inert store utan provider (se nedan).
 */
export const ReactionsStoreContext = createContext<ReactionsStore | null>(null);

/** Inert reaktions-store: inaktiv (enabled=false), inga reaktioner, handlingar no-op. */
const INERT_REACTIONS_STORE: ReactionsStore = {
  enabled: false,
  status: 'idle',
  error: null,
  byMatch: new Map(),
  userId: null,
  nameByUser: new Map(),
  react: async () => {},
  removeReaction: async () => {},
};

/**
 * Läs reaktions-storen TOLERANT mot en saknad provider (samma mönster som useRoomsSync,
 * T14 KA-F3, inte den kastande useCommentsStore).
 *
 * VARFÖR tolerant: reaktions-raden (MatchReactions) är en FOTRAD på matchkorten i
 * dagens-vyn, och dagens-vyn (DailyMatchesView) renderas i MÅNGA tester och i lokalt
 * läge UTAN en ReactionsProvider. Reaktioner är ett ADDITIVT socialt lager: utan en
 * provider ska matchkorten fungera precis som förr (ingen reaktions-rad). Därför faller
 * hooken till en INERT store (enabled=false -> MatchReactions renderar null), i stället
 * för att tvinga varje matchkort-konsument under en provider. Säkerheten bor ändå
 * server-side i RLS; en inert store kan inte skriva något (no-op handlingar).
 */
export function useReactionsStore(): ReactionsStore {
  const store = useContext(ReactionsStoreContext);
  return store ?? INERT_REACTIONS_STORE;
}
