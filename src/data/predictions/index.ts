// Publik yta för tips-datalagret (T15, #15). Konsumenter (tips-UI, T17 topplista)
// importerar härifrån så intern struktur kan ändras utan att bryta call-sites.

export {
  listRoomPredictions,
  listMyPredictions,
  upsertMyPrediction,
  isMatchLocked,
  type Prediction,
  type PredictionInput,
} from './predictions-api';

export {
  scorePrediction,
  pointTypeOf,
  outcomeOf,
  PREDICTION_POINTS,
  type Scoreline,
  type Outcome,
  type MatchPointType,
} from './score';

// T58 (#99): EN sanning för match-tipsens VARFÖR-etikett (utfalls-medveten), delad av
// avslöjande-vyn OCH tips-listans poäng-rad, så ordet aldrig dubbleras eller driftar
// (#69 kryss-noten: aldrig "Rätt vinnare" på ett oavgjort).
export { matchPointLabel } from './match-point-label';

// T53 (#95): pool-tipsens FÖRLÄNGDA deadline (grupp + champion) , delad sanning för
// fasta söndagstiden + GREATEST-regeln, speglar RLS-helpers (klient + DB en sanning).
export { POOL_EXTENDED_DEADLINE_ISO, applyExtendedDeadline } from './prediction-deadline';

// T16 (#16): pool-bonus-poängsättning (grupp- + bracket-tips).
export {
  scoreGroupPrediction,
  scoreBracketAdvance,
  scoreChampionPrediction,
  GROUP_PREDICTION_POINTS,
  BRACKET_ROUND_POINTS,
  CHAMPION_PREDICTION_POINTS,
  type GroupOutcome,
  type GroupPredictionPick,
} from './bonus-score';

// T16 (#16): gruppvinnar-tips (gissad 1:a + 2:a per grupp).
export {
  listRoomGroupPredictions,
  listMyGroupPredictions,
  upsertMyGroupPrediction,
  type GroupPrediction,
  type GroupPredictionInput,
} from './group-predictions-api';

// T16 (#16): bracket-/slutspels-tips (vem går vidare per slot + VM-vinnaren).
export {
  listRoomBracketPredictions,
  listMyBracketPredictions,
  upsertMyBracketPrediction,
  bracketDeadlineMatchId,
  CHAMPION_SLOT_ID,
  TOURNAMENT_START_MATCH_ID,
  type BracketPrediction,
  type BracketPredictionInput,
} from './bracket-predictions-api';

// T19 (#19): joker-matchen, EN per omgång (svensk kalenderdag), dubblar match-poängen.
export {
  listRoomJokers,
  listMyJokers,
  upsertMyJoker,
  removeMyJoker,
  type RoomJoker,
  type RoomJokerInput,
} from './room-joker-api';

// T52 (#91): kopiera MINA tips mellan rum (match + grupp + bracket), ärlig rapport.
export {
  copyMyPredictions,
  type CopyCategory,
  type CopyOutcome,
  type CopyItemResult,
  type CopyCategorySummary,
  type CopyReport,
  type CopyLockSets,
} from './copy-predictions';
