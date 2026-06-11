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
