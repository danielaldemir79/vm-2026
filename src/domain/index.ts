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
  ScheduledMatch,
  LiveMatch,
  FinishedMatch,
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

// Slutspels-/treeplats-motorn (T4, SPEC §5). Strukturell seedning av de 8 bästa
// treorna enligt FIFA:s Annexe C + det fullständiga slutspelsträdet.
export {
  seedThirdPlaces,
  QUALIFYING_THIRDS,
  COLUMN_MATCH_IDS,
  type ThirdPlaceAssignment,
} from './bracket/seed-third-places';
export { buildBracket, slotId, type BracketNode, type SlotSide } from './bracket/build-bracket';
export {
  BRACKET_MATCHES,
  ROUND_OF_32,
  ROUND_OF_16,
  QUARTER_FINALS,
  SEMI_FINALS,
  THIRD_PLACE_MATCH,
  FINAL,
  type BracketMatch,
  type SlotSource,
  type KnockoutStage,
} from './bracket/bracket-structure';
