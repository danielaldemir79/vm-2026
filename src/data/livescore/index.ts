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
export { resolveApiTeamId, resolveAppTeamId, WC2026_API_TEAM_BRIDGE } from './team-bridge';

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

// Bit 3a: klient-läs-lager (DB-rad -> klient-modell, gate-medveten + fixtures-först).
export {
  getLiveData,
  getLiveDataForMatch,
  listLiveData,
  projectLiveData,
  fixtureLiveData,
} from './live-read';
export type { LiveData } from './live-read';

// Bit 3a: realtids-prenumeration på match_live_data + klock-brygga (re-sync mot push).
export { liveClockFor, liveDataSubscription, MATCH_LIVE_DATA_TABLE } from './live-realtime';

// Pollare-v3: fönster-gating (vilka matcher per-match-pollas NU) + per-match-poll-plan
// (discovery + budget-allokering med facit-prio). Rena, testbara byggstenar, speglade
// i _shared för edge-pollaren.
export { LIVE_WINDOW_AFTER_MS, LIVE_WINDOW_BEFORE_MS, selectInWindowMatches } from './live-window';
export type { InWindowMatch, LiveWindowBounds } from './live-window';
export {
  buildPerMatchPollPlan,
  DEFAULT_DAILY_BUDGET,
  DEFAULT_MAX_PER_MATCH_CALLS_PER_TICK,
} from './per-match-poll-plan';
export type {
  PerMatchPlanInput,
  PerMatchPollPlan,
  PerMatchPollTarget,
  WindowMatchState,
} from './per-match-poll-plan';
