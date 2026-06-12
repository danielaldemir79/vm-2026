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
