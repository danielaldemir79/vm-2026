// Publik yta för rums-feature:n (T14, #14).

export { RoomsProvider, type RoomsProviderProps } from './RoomsProvider';
export { RoomPanel, RoomSection } from './RoomPanel';
// T96 (#193): persistent rum-väljare i app-baren (aktivt rum + snabbyte på alla flikar).
export { RoomPill, type RoomFormTarget } from './RoomPill';
// T96 (#193): genväg-fokus till RoomSection-formulären (skapa/gå-med), bruten ut för test.
export { focusRoomForm } from './focus-room-form';
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
// T66 (#121): rums-chatten (provider + UI + store-kontrakt).
export { CommentsProvider, type CommentsProviderProps } from './CommentsProvider';
export { RoomComments } from './RoomComments';
export { useCommentsStore, type CommentsStore, type CommentsStatus } from './comments-context';
// T77 (#161): per-match kommentar-trådar (provider + UI + store + gruppering).
export { MatchCommentsProvider, type MatchCommentsProviderProps } from './MatchCommentsProvider';
export { MatchComments, type MatchCommentsProps } from './MatchComments';
export {
  useMatchCommentsStore,
  type MatchCommentsStore,
  type MatchCommentsStatus,
} from './match-comments-context';
export {
  groupCommentsByMatch,
  threadForMatch,
  type MatchCommentThread,
} from './match-comments-aggregate';
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
