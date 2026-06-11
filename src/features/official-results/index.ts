// Publik yta för det GLOBALA facit-lagret (T42, #72). Konsumenter (App,
// topplistan, resultat-feedback, admin-inmatning) importerar härifrån.

export { OfficialResultsProvider } from './OfficialResultsProvider';
export {
  useOfficialResultsStore,
  useOfficialResultsSync,
  OfficialResultsStoreContext,
  type OfficialResultsStore,
  type OfficialResultsStatus,
  type OfficialResultsSync,
} from './official-results-context';
