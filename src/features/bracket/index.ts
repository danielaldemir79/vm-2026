// Publik yta för slutspelsträd-feature (T9, issue #9). App och framtida vyer
// importerar härifrån så intern filstruktur kan ändras utan att bryta call-sites.

export { BracketView } from './BracketView';
export { useBracketData, type BracketData, type BracketLoadStatus } from './use-bracket-data';
export {
  deriveBracket,
  groupByRound,
  isGroupStageComplete,
  ROUND_ORDER,
  ROUND_LABELS,
  type BracketState,
  type BracketMatchState,
  type BracketSlotState,
  type BracketRound,
  type SlotResolution,
} from './derive-bracket';
