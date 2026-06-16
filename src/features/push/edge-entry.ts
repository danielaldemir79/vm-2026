// BUNDLE-ENTRYPOINT för mål-push-dispatchern (T89, #182).
//
// VARFÖR EN EGEN ENTRYPOINT: edge-funktionen (Deno) kan inte importera src/, så
// scripts/generate-goal-push-core.ts BUNDLAR denna fil med esbuild till EN självständig
// Deno-ESM-modul (supabase/functions/_shared/goal-push-core.ts). Bundlingen drar in HELA den
// rena grafen , mål-detekteringen (goal-detection) + preferenserna (push-preferences) + den
// DELADE måltolkningen (parseEvents -> extractGoals, SPEC §13.3 "en sanning för mål-härledning")
// , så dispatchern kör EXAKT samma testade TS som klienten/skytteligan, utan en hand-skriven
// mirror (ingen drift-yta). Paritet bevisas behavioralt i goal-push-core-mirror-parity.test.ts.
//
// DEEP imports (inte feature-/data-barrels): barrels re-exporterar React-komponenter + CSS
// (PushOptInSection etc.) som annars bundlas in. Vi importerar de rena modulerna direkt, så
// bundlen förblir ren (ingen IO, ingen React, ingen Deno-global). Verifierat av paritetstestet
// (det laddar bundlen i node-miljö , en React/CSS-import skulle krascha det).

// Den DELADE måltolkningen (SPEC §13.3): rå API-events -> normaliserade events -> mål.
// Dispatchern parsar den råa events-blobben ur match_live_data med EXAKT dessa, samma som
// skytteligan (T87) , ingen parallell parse.
export { parseEvents } from '../../data/livescore/parse-live';
export { extractGoals } from '../../data/match-stats/match-stats';

// Mål-detektering (diff av nya mål, signatur, scoring-sida, notis-formulering).
export {
  diffNewGoals,
  goalSignature,
  scoringSideFromScoreDelta,
  resolveCelebratedTeamName,
  formatGoalNotification,
} from './goal-detection';
export type { DetectedGoal, GoalNotification, MatchScore, MatchSide } from './goal-detection';

// Preferenser (master/natt/scope + besluts-funktionen).
export {
  isQuietHoursStockholm,
  stockholmHour,
  matchesScope,
  shouldNotifyUser,
  QUIET_HOURS_START_HOUR,
  QUIET_HOURS_END_HOUR,
  QUIET_HOURS_TZ,
} from './push-preferences';
export type {
  PushPreferences,
  MatchScope,
  GoalMatchContext,
  NotifyDecision,
  SuppressionReason,
} from './push-preferences';
