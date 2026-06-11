// Publik yta för datalagret. Konsumenter (T6-T11) importerar getDataSource
// härifrån och får samma kontrakt oavsett om källan är fixtures eller live.

export type { DataSource, DataSourceMode } from './data-source';
export { getDataSource, getDataSourceMode, isSupabaseConfigured, LIVE_READY } from './data-source';

// Fixtures exponeras för tester och för UI som vill visa platshållar-data direkt.
export { fixtureTeams, fixtureGroups, fixtureMatches } from './fixtures';

// T42 (#72): GLOBAL facit + admin-status (officiella matchresultat, en sanning för alla).
export {
  listOfficialResults,
  upsertOfficialResult,
  isAppAdmin,
  type OfficialMatchResult,
  type OfficialResultInput,
} from './official';
