// Publik yta för det GLOBALA facit-/admin-datalagret (T42, #72). Konsumenter
// (leaderboard-vävningen, resultat-feedback, admin-UI) importerar härifrån så
// intern struktur kan ändras utan att bryta call-sites.

export {
  listOfficialResults,
  upsertOfficialResult,
  type OfficialMatchResult,
  type OfficialResultInput,
} from './official-results-api';

export { isAppAdmin } from './app-admin-api';
