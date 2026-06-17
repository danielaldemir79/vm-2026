// Publik yta för turnerings-statistiken (T87 skytteliga; T88 turneringsstatistik bygger
// vidare på samma cross-match-hookar). App och framtida vyer importerar HÄRIFRÅN, så intern
// filstruktur kan ändras utan att bryta call-sites.

export { ScorerTableView } from './ScorerTableView';
export { TournamentStatsView } from './TournamentStatsView';
export { SuspensionsView } from './SuspensionsView';

// Den rena avstängnings-härledningen (T99) , delbar om en annan vy vill räkna samma.
export { deriveSuspensions, type SuspensionPost, type SuspensionReason } from './suspensions';

// De ÅTERANVÄNDBARA cross-match-hookarna: hämtar events/statistik för ALLA matcher (smalt
// SELECT) och håller dem near-live via den DELADE T91-spine:n (useNearLiveCollection).
export {
  useCrossMatchEvents,
  CROSS_MATCH_POLL_INTERVAL_MS,
  type CrossMatchEventsResult,
  type CrossMatchEventsStatus,
} from './use-cross-match-events';
export {
  useCrossMatchStats,
  type CrossMatchStatsResult,
  type CrossMatchStatsStatus,
} from './use-cross-match-stats';
export {
  useNearLiveCollection,
  NEAR_LIVE_POLL_INTERVAL_MS,
  type NearLiveCollection,
  type NearLiveStatus,
} from './use-near-live-collection';

// Den rena aggregeringen (skytteliga + assist-liga) , delbar om en annan vy vill räkna samma.
export {
  aggregateScoring,
  type TournamentScoring,
  type ScorerRow,
  type AssistRow,
} from './scorer-table';

// De rena turneringsstatistik-aggregaten (events-, statistik- och tabell-härledda). Lag-mål +
// turnerings-mål source:as ur officiellt facit (aggregateTeamScoreGoals i -tables), INTE events
// (T100, #207): events täcker bara en delmängd matcher.
export {
  aggregateCardLeague,
  aggregateGoalTiming,
  GOAL_TIMING_BUCKETS,
  type CardLeague,
  type CardPlayerRow,
  type CardTeamRow,
  type GoalTiming,
  type GoalTimingBucket,
  type GoalTimingBucketLabel,
  type FastestGoal,
} from './tournament-stats-events';
export { aggregateTeamMetric, type TeamMetricRow } from './tournament-stats-team-metrics';
export {
  aggregateCleanSheets,
  aggregateUpsets,
  aggregateTeamScoreGoals,
  type CleanSheetRow,
  type UpsetRow,
  type RankLookup,
  type TeamScoreGoals,
  type TeamScoreGoalRow,
  type BiggestMatch,
} from './tournament-stats-tables';
