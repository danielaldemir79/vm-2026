// Publik yta för rums-/auth-lagret (T14, #14). UI:t importerar härifrån.

export { ensureSession, getCurrentIdentity, type AuthIdentity } from './auth';
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
