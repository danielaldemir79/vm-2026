// Publik yta för den DELADE match-statistik-projektionen (T86, #178). T86 (rik matchvy),
// T87 (skytteliga) och T88 (turneringsstatistik) importerar HÄRIFRÅN, så intern struktur
// kan ändras utan att bryta call-sites, och alla tre delar EN sanning för projektionen.

export {
  extractGoals,
  extractShootout,
  isRealGoalEvent,
  extractCards,
  extractSubs,
  extractOtherEvents,
  normalizeTeamStats,
  normalizeMatchStats,
  extractLineup,
} from './match-stats';

export type {
  MatchGoal,
  ShootoutKick,
  MatchCardEvent,
  MatchSub,
  MatchOtherEvent,
  TeamMatchStats,
  TeamStatMetric,
  TeamStatKey,
  TeamLineupInfo,
  LineupPlayerInfo,
} from './match-stats-types';
