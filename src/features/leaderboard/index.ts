// Publik yta för topplista + tips-avslöjande-featuren (T17, #17). Konsumenter
// (App) importerar härifrån så intern struktur kan ändras utan att bryta call-sites.

export { LeaderboardSection } from './LeaderboardSection';
export { LeaderboardProvider } from './LeaderboardProvider';
export { LeaderboardSummary } from './LeaderboardSummary';
export { LeaderboardView } from './LeaderboardView';
export { RevealView } from './RevealView';
export { TipsScoreSummary } from './TipsScoreSummary';
export { PersonalStatsSection } from './PersonalStatsSection';
export {
  useLeaderboardStore,
  LeaderboardStoreContext,
  type LeaderboardStore,
  type LeaderboardStatus,
} from './leaderboard-context';

// Rena moduler (poäng-aggregering, facit-härledning, avslöjande), exporterade så
// de kan återanvändas/testas av andra (t.ex. T18 realtid, mini-ligor T20).
export {
  buildLeaderboard,
  scoreMemberBreakdown,
  JOKER_MULTIPLIER,
  type LeaderboardEntry,
  type MemberPredictions,
  type ScoreBySource,
} from './aggregate-scores';
export {
  derivePoolFacit,
  type PoolFacit,
  type MatchFacit,
  type GroupFacit,
  type BracketFacit,
} from './derive-facit';
export {
  buildMatchReveal,
  type RevealedMatch,
  type FinishedRevealedMatch,
  type PendingRevealedMatch,
  type RevealedMatchPick,
  type PendingMatchPick,
} from './reveal';
export { deriveSelfSummary, type SelfSummary } from './self-summary';

// T23 (#23): personlig statistik (träffsäkerhet, exakt/utfall/miss, bästa call),
// HÄRLEDD ur samma score.ts-poängväg som topplistan (ingen omräkning, ingen DB).
export { derivePersonalStats, type PersonalStats, type BestCall } from './personal-stats';

// T19 (#19): gamification, streaks + märken HÄRLEDDA ur tips + facit (ingen DB).
export {
  deriveMemberBadges,
  PERFECT_ROUND_MIN_MATCHES,
  type MemberBadges,
  type StreakInfo,
  type BadgeId,
} from './derive-badges';
