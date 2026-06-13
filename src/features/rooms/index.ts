// Publik yta för rums-feature:n (T14, #14).

export { RoomsProvider, type RoomsProviderProps } from './RoomsProvider';
export { RoomPanel, RoomSection } from './RoomPanel';
export {
  useRoomsStore,
  useRoomsSync,
  type RoomsStore,
  type RoomsStatus,
  type RoomsSync,
} from './rooms-context';
// T52 (#91): kopiera mina tips mellan rum (UI-kontroll + ren rapport-sammanfattning).
export { CopyTipsControl } from './CopyTipsControl';
export { summarizeCopyReport } from './copy-report-summary';
// T66 (#121): kommentarer i rummet (provider + UI + store-kontrakt).
export { CommentsProvider, type CommentsProviderProps } from './CommentsProvider';
export { RoomComments } from './RoomComments';
export { useCommentsStore, type CommentsStore, type CommentsStatus } from './comments-context';
// T24 (#24): emoji-reaktioner på matcher i rummet (provider + UI + store + aggregering).
export { ReactionsProvider, type ReactionsProviderProps } from './ReactionsProvider';
export { MatchReactions, type MatchReactionsProps } from './MatchReactions';
export { useReactionsStore, type ReactionsStore, type ReactionsStatus } from './reactions-context';
export {
  aggregateReactionsByMatch,
  summaryForMatch,
  type MatchReactionSummary,
  type ReactionTally,
  type ReactionReactor,
} from './reaction-aggregate';
// T74 (#157): se VILKA som reagerat (långtryck/hover/focus -> popover med namn + tid).
export { useLongPress, LONG_PRESS_THRESHOLD_MS } from './use-long-press';
export { resolveReactionAuthors, type ReactionAuthorRow } from './reaction-authors';
