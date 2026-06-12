// Publik yta för admin-statistik-datalagret (T45, #76). Konsumenter (admin-stats-
// vyn) importerar härifrån så intern struktur kan ändras utan att bryta call-sites.

export {
  fetchAdminRoomStats,
  fetchAdminRevealedPredictions,
  type AdminRoomStat,
  type AdminRoomMember,
  type AdminRevealedPrediction,
} from './admin-stats-api';
