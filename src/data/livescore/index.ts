// Publik yta för livescore Bit 1 (den rena kärnan). Bit 2 (pollare + Supabase) och
// Bit 3 (UI) bygger på dessa rena, testade byggstenar. Allt här är PURT: ingen
// nyckel, inget nätverk, ingen backend.

// Normaliserade domäntyper.
export type {
  CardColor,
  FinalResult,
  LiveEvent,
  LiveEventKind,
  LiveLineup,
  LiveLineupPlayer,
  LiveMatchSnapshot,
  LiveStatisticValue,
  LiveStatus,
  LiveTeamStatistics,
} from './live-types';

// Rena parsers (API-Footballs råa svar -> normaliserade typer).
export {
  normalizeStatus,
  parseEvents,
  parseFinalResult,
  parseLineups,
  parseLiveFixtures,
  parseStatistics,
  toUtcIso,
} from './parse-live';

// Match-identitet (API-fixture -> appmatch) + täckningsrapport.
export { KICKOFF_MATCH_WINDOW_MS, resolveAppMatch, resolveMatchCoverage } from './resolve-match';
export type { CoverageReport, CoverageRow, MatchResolution } from './resolve-match';

// Lag-brygga (API-team-id <-> app-lag-id, källhänvisad).
export { resolveAppTeamId, WC2026_API_TEAM_BRIDGE } from './team-bridge';

// Budget-medveten poll-planerare.
export { ACTIVE_WINDOW_MINUTES, planPolls } from './poll-budget';
export type { PollAllocation, PollDayMatch, PollPlan } from './poll-budget';

// Budget-gate per cron-tick (Bit 2: avgör om DETTA tick får slå mot API:t).
export { decidePollTick } from './poll-gate';
export type { PollGateDecision, PollGateInput } from './poll-gate';

// Status-styrd matchklocka.
export { computeClock } from './live-clock';
export type { MatchClock } from './live-clock';

// Fixtures-läge (committad live-data härledd ur verkliga svar).
export {
  fixtureFinalResult,
  fixtureLiveEvents,
  fixtureLiveLineups,
  fixtureLiveSnapshots,
  fixtureLiveStatistics,
} from './fixtures';
