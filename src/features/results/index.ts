// Publik yta för resultatinmatningen (T6, issue #6). App och andra vyer
// importerar härifrån så intern filstruktur kan ändras utan att bryta call-sites.

// Den delade storen (KÄRNAN: en sanning för matcher, läses av både inmatning och
// gruppspelsvy). T14/T18 kopplas in på provider-/mutator-seamen.
export { ResultsProvider } from './ResultsProvider';
export type { ResultsProviderProps } from './ResultsProvider';
export { useResultsStore } from './results-context';
export type { ResultsStore, ResultsLoadStatus } from './results-context';

// Inmatnings-UI:t.
export { ResultEntryView } from './ResultEntryView';
export type { ResultEntryViewProps } from './ResultEntryView';
export { ResultEntryForm } from './ResultEntryForm';
export type { ResultEntryFormProps } from './ResultEntryForm';

// Det visuella målfirande-lagret (design-frontends premium-yta ovanpå kroken).
// Kopplas in via ResultEntryViews renderCelebration-render-prop. Namnet skiljer
// sig från krokens GoalCelebration-TYP (firande-tillståndet): detta är overlay-
// KOMPONENTEN, så bägge kan samexistera i den publika ytan utan namnkrock.
export { GoalCelebrationOverlay } from './GoalCelebrationOverlay';

// Målfirande-kroken (funktionell + reduced-motion-säker seam, design-frontend
// lägger den visuella animationen ovanpå).
export { useGoalCelebration } from './goal-celebration';
export type { GoalCelebration, GoalCelebrationApi } from './goal-celebration';

// Ren validerings- + tillämpnings-logik (återanvändbar, testbar fristående).
export { validateResultEntry, toMatchResult } from './validate-result';
export type {
  ResultEntry,
  ResultValidation,
  ResultValidationError,
  ResultValidationCode,
  ResultValidationField,
} from './validate-result';
export { applyMatchResult } from './apply-match-result';

// 3-dagars fönster-urval för inmatningslistan (#39): ren, testbar funktion.
export { windowMatches, WINDOW_DAYS } from './result-window';
export type { ResultWindow } from './result-window';
