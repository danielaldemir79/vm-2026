// Publik yta för domänmodellen + härledd state. Konsumenter importerar härifrån
// så intern struktur kan ändras utan att bryta call-sites.

export type {
  GroupId,
  Team,
  Group,
  MatchStage,
  MatchStatus,
  MatchResult,
  Match,
  GroupStanding,
  GroupTable,
  BracketSource,
  BracketSlot,
  // Social-stubs (Fas 2-3).
  User,
  Player,
  PlayerStats,
  Room,
  League,
  Prediction,
  BracketPrediction,
  GroupPrediction,
  Achievement,
  ReactionTarget,
  Reaction,
} from './types';

export { GROUP_IDS } from './types';
export { computeStandings } from './standings/compute-standings';
