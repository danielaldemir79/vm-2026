// Publik yta för den TOTALA (cross-rum) topplistan (T82 del 3, #173). Konsumenter (App)
// importerar härifrån så intern struktur kan ändras utan att bryta call-sites.

export { TotalLeaderboardSection } from './TotalLeaderboardSection';
export { TotalLeaderboardProvider } from './TotalLeaderboardProvider';
export { TotalLeaderboardView } from './TotalLeaderboardView';
export {
  useTotalLeaderboardStore,
  TotalLeaderboardStoreContext,
  type TotalLeaderboardStore,
  type TotalLeaderboardStatus,
} from './total-leaderboard-context';

// Ren aggregering (cross-rum-summering + rangordning + spelarens sammanfattning),
// exporterad så den kan återanvändas/testas fristående.
export {
  buildTotalLeaderboard,
  deriveTotalSelfSummary,
  type RoomContribution,
  type TotalLeaderboardEntry,
  type TotalSelfSummary,
} from './aggregate-total';
