// Publik yta för rums-/auth-lagret (T14, #14). UI:t importerar härifrån.

export { ensureSession, getCurrentIdentity, type AuthIdentity } from './auth';
// T42 (#72): admin-inloggning via e-post (anonym -> permanent, behåller user_id).
export { requestAdminEmailUpgrade, confirmAdminEmailUpgrade, signOutAdmin } from './admin-auth';
export {
  createRoom,
  joinRoomByCode,
  listMyRooms,
  listMembers,
  leaveRoom,
  listRoomResults,
  upsertRoomResult,
  type RoomSummary,
  type RoomMember,
  type RoomMatchResult,
  type RoomResultInput,
} from './rooms-api';
export {
  generateRoomCode,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from './room-code';
// T66 (#121): kommentarer i rummet (lista, skriv, radera egen).
export {
  listRoomComments,
  addComment,
  deleteMyComment,
  COMMENT_MAX_LEN,
  type RoomComment,
} from './comments-api';
