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
  outcomeOf,
  PREDICTION_POINTS,
  type Scoreline,
  type Outcome,
} from './score';

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
