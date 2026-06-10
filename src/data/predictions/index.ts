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
