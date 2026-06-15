// Publik yta för bot-seednings-lagret (T82, #173). Seed-skriptet + framtida liv-lager
// importerar härifrån, så intern struktur kan ändras utan att bryta call-sites.

export { createRng, randomInt, pick, type Rng } from './prng';

export {
  generatePersonas,
  DEFAULT_PERSONA_CONFIG,
  type BotPersona,
  type BotPersonality,
  type BotCohort,
  type BotTone,
  type PersonaPlanConfig,
} from './personas';

export {
  generateBotPredictions,
  DEFAULT_PREDICT_CONFIG,
  type BotPredictions,
  type PredictConfig,
} from './predict';

export {
  buildSeedPlan,
  personaKey,
  VM2026_ROOM_NAME,
  FSU_ROOM_NAME,
  PROTECTED_ROOM_NAME,
  type SeedPlan,
  type SeedPlanSummary,
  type SeedDomain,
  type RoomsSnapshot,
  type ExistingRoom,
  type PlannedAccount,
  type PlannedRoom,
  type PlannedMembership,
  type PlannedPredictions,
  type PlannedRoomReaction,
  type PlannedRoomComment,
} from './seed-plan';

export { generateBotReactions, isAllowedReactionEmoji, type PlannedReaction } from './react';

export {
  generateBotComments,
  planReplies,
  COMMENT_SCALE,
  REPLY_CHANCE,
  type PlannedComment,
  type PrimaryComment,
  type PlannedReply,
} from './comment';

export { moodFromScoreline, type MatchMood } from './match-mood';
