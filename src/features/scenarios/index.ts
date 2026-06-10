// Publik yta för "Vad krävs"-kalkylatorn (T11, issue #11). App och vyer
// importerar härifrån så intern filstruktur kan ändras utan att bryta call-sites.

export {
  computeGroupScenario,
  MAX_REMAINING_MATCHES,
  assertEnumerable,
  isScheduled,
} from './scenario-engine';
export type {
  AdvancementStatus,
  ScenarioPhase,
  TeamScenario,
  GroupScenario,
} from './scenario-engine';
export { useGroupScenarios } from './use-group-scenarios';
export type { GroupScenarioData } from './use-group-scenarios';
export { ScenarioView } from './ScenarioView';
