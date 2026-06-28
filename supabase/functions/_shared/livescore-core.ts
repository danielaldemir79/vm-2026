// DENO-MIRROR av Bit 1:s rena livescore-kärna (src/data/livescore/).
//
// VARFÖR EN MIRROR (medvetet, sanktionerat av task-direktivet): Supabase
// deployar BARA `supabase/functions/`-trädet, så edge-funktionen kan INTE
// importera app-grafens moduler (src/...). De rena bitar pollaren behöver
// kopieras därför hit, MINIMALT och med EXAKT samma logik + källhänvisning som
// originalet, så de kan hållas i synk. Allt här är PURT (ingen Deno-global,
// inget nätverk), så det är samma testbara logik som Bit 1, bara i Deno-trädet.
//
// SYNK-ANSVAR: ändras facit-regeln eller status-mappningen i
// src/data/livescore/parse-live.ts MÅSTE denna fil uppdateras likadant (och
// tvärtom). De två är medvetna kopior, inte två sanningar , de ska aldrig drifta.

// Den inbäddade, genererade matchplanen (match_id + kickoff + lag-par) för auto-
// mappningen. GENERERAD ur matches.ts, värde-låst i CI (match-plan.test.ts).
import { EMBEDDED_MATCH_PLAN, type MatchPlanEntry } from './embedded-match-plan.ts';

export { EMBEDDED_MATCH_PLAN };
export type { MatchPlanEntry };

// ---------------------------------------------------------------------------
// STATUS-MAPPNING (mirror av parse-live.ts STATUS_BY_SHORT, källhänvisad där).
// Vi behöver bara veta om en match är AVGJORD (finished) för freeze/facit.
// Källa: API-Football v3 fixtures-status (korsverifierad 2026-06-14, se
// docs/decisions.md). FT/AET/PEN = finished.
// ---------------------------------------------------------------------------
export type LiveStatus = 'scheduled' | 'live' | 'paused' | 'finished' | 'postponed' | 'unknown';

const STATUS_BY_SHORT: Readonly<Record<string, LiveStatus>> = {
  NS: 'scheduled',
  TBD: 'scheduled',
  '1H': 'live',
  '2H': 'live',
  ET: 'live',
  P: 'paused',
  HT: 'paused',
  BT: 'paused',
  SUSP: 'paused',
  INT: 'paused',
  FT: 'finished',
  AET: 'finished',
  PEN: 'finished',
  PST: 'postponed',
  CANC: 'postponed',
  ABD: 'postponed',
  AWD: 'postponed',
  WO: 'postponed',
};

/** Slå upp en short-kod, fail-safe till 'unknown' (aldrig 'live') vid okänd kod. */
export function normalizeStatus(short: string): LiveStatus {
  return STATUS_BY_SHORT[short] ?? 'unknown';
}

// ---------------------------------------------------------------------------
// LAG-BRYGGA (mirror av team-bridge.ts WC2026_API_TEAM_BRIDGE). FULL 48/48-brygga
// (app-lag-id = gemen FIFA-kod -> API-Football team-id), omvänd här (API-id ->
// app-id) för pollarens uppslag. Källa (gissas ALDRIG): API-Footballs national-
// team-id via teams?search + national=true + FIFA-kod-match, cuw/cod via entydigt
// namn, 2026-06-15 (se docs/decisions.md). Ändras team-bridge.ts MÅSTE denna
// uppdateras likadant (synk-märkt). En okänd fixture markeras unresolved + hoppas.
// ---------------------------------------------------------------------------
export const API_TEAM_BRIDGE: Readonly<Record<number, string>> = {
  16: 'mex',
  1531: 'rsa',
  17: 'kor',
  770: 'cze',
  5529: 'can',
  1113: 'bih',
  1569: 'qat',
  15: 'sui',
  6: 'bra',
  31: 'mar',
  2386: 'hai',
  1108: 'sco',
  2384: 'usa',
  2380: 'par',
  20: 'aus',
  777: 'tur',
  25: 'ger',
  5530: 'cuw', // API-kod-avvikelse men entydig: enda national-laget "Curaçao"
  1501: 'civ',
  2382: 'ecu',
  1118: 'ned',
  12: 'jpn',
  5: 'swe',
  28: 'tun',
  1: 'bel',
  32: 'egy',
  22: 'irn',
  4673: 'nzl',
  9: 'esp',
  1533: 'cpv',
  23: 'ksa',
  7: 'uru',
  2: 'fra',
  13: 'sen',
  1567: 'irq',
  1090: 'nor',
  26: 'arg',
  1532: 'alg',
  775: 'aut',
  1548: 'jor',
  27: 'por',
  1508: 'cod', // API-kod-avvikelse men entydig: enda national-laget "DR Kongo"
  1568: 'uzb',
  8: 'col',
  10: 'eng',
  3: 'cro',
  1504: 'gha',
  11: 'pan',
};

/** Omvänd uppslag: app-lag-id -> API-Football team-id (för auto-mappning). null om okänt. */
export function resolveApiTeamId(appTeamId: string): number | null {
  for (const [apiId, appId] of Object.entries(API_TEAM_BRIDGE)) {
    if (appId === appTeamId) return Number(apiId);
  }
  return null;
}

// ---------------------------------------------------------------------------
// FACIT-REGELN (mirror av parse-live.ts parseFinalResult, källhänvisad,
// gissas ALDRIG, verifierad mot RIKTIG data 2026-06-14):
//   * slutresultat = goals.home/away (aggregat ordinarie+förlängning, EXKL.
//     straffar). Rätt för FT, AET och PEN.
//   * straffar = score.penalty, BARA vid status PEN.
//   * ANVÄND ALDRIG score.extratime (bara mål UNDER förlängningen, additivt).
// Källa: fixture-aet-pen.json (Argentina-Frankrike: goals 3-3, et 1-1, pen 4-2).
// ---------------------------------------------------------------------------
export interface RawScorePair {
  home: number | null;
  away: number | null;
}
export interface RawFixtureResponse {
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null } };
  teams: { home: { id: number }; away: { id: number } };
  goals: RawScorePair;
  score: { fulltime: RawScorePair; extratime: RawScorePair; penalty: RawScorePair };
}

export interface AutoFacit {
  apiFixtureId: number;
  homeGoals: number;
  awayGoals: number;
  /** Normaliserad status (alltid 'finished' här). */
  status: LiveStatus;
  /** Straffar, satt BARA vid PEN. */
  penalties: { home: number; away: number } | null;
}

/**
 * Härled facit ur ett RÅTT fixtures?id-svar (en avgjord match). Fail loud om
 * matchen inte är avgjord eller om goals saknas (gissa aldrig). Samma regel +
 * fail-loud-kontrakt som parse-live.ts parseFinalResult.
 */
export function deriveFacit(r: RawFixtureResponse): AutoFacit {
  const short = r.fixture.status.short;
  const status = normalizeStatus(short);
  if (status !== 'finished') {
    throw new Error(
      `deriveFacit: matchen är inte avgjord (status "${short}" -> ${status}). Facit läses bara på avgjord match.`
    );
  }
  if (typeof r.goals.home !== 'number' || typeof r.goals.away !== 'number') {
    throw new Error(`deriveFacit: avgjord match ${r.fixture.id} saknar goals.home/away (facit).`);
  }
  let penalties: AutoFacit['penalties'] = null;
  if (short === 'PEN') {
    const pen = r.score.penalty;
    if (typeof pen.home !== 'number' || typeof pen.away !== 'number') {
      throw new Error(`deriveFacit: PEN-match ${r.fixture.id} saknar score.penalty.`);
    }
    penalties = { home: pen.home, away: pen.away };
  }
  return {
    apiFixtureId: r.fixture.id,
    homeGoals: r.goals.home,
    awayGoals: r.goals.away,
    status: 'finished',
    penalties,
  };
}

/** Slå upp app-lag-id ur bryggan, null om okänt (gissa aldrig). */
export function resolveAppTeamId(apiTeamId: number): string | null {
  return API_TEAM_BRIDGE[apiTeamId] ?? null;
}

// ---------------------------------------------------------------------------
// KUVERT-LINDNING (mirror av src/data/livescore/freeze-shape.ts). Linda de
// inline-arrayerna ur fixtures?id (response[0].events/.statistics/.lineups) i
// RawApiResponse-KUVERT vid lagring, så läs-lagrets parsers (requireResponseArray)
// kan parsa dem. Skarv-fixen: producent-form == konsument-form. Synk-märkt mot
// freeze-shape.ts. Källa: docs/decisions.md 2026-06-15.
// ---------------------------------------------------------------------------

/** Linda en array (eller null) i ett minimalt RawApiResponse-kuvert (errors: [] = inget fel). */
export function wrapApiEnvelope<T>(
  items: readonly T[] | null | undefined,
  get = 'fixtures'
): { get: string; results: number; response: T[]; errors: [] } {
  const response = Array.isArray(items) ? [...items] : [];
  return { get, results: response.length, response, errors: [] };
}

/** De inline-arrayer fixtures?id bär (rich.events/.statistics/.lineups). */
export interface RichFixtureInline {
  events?: readonly unknown[] | null;
  statistics?: readonly unknown[] | null;
  lineups?: readonly unknown[] | null;
}

/** Forma de tre rika blobbarna för LAGRING (kuvert-lindade, EXAKT vad läs-lagret tar). */
export function shapeFrozenBlobs(rich: RichFixtureInline): {
  events: ReturnType<typeof wrapApiEnvelope>;
  statistics: ReturnType<typeof wrapApiEnvelope>;
  lineups: ReturnType<typeof wrapApiEnvelope>;
} {
  return {
    events: wrapApiEnvelope(rich.events ?? [], 'fixtures/events'),
    statistics: wrapApiEnvelope(rich.statistics ?? [], 'fixtures/statistics'),
    lineups: wrapApiEnvelope(rich.lineups ?? [], 'fixtures/lineups'),
  };
}

// ---------------------------------------------------------------------------
// AUTO-MAPPNING (mirror av src/data/livescore/fixture-map-resolver.ts). Koppla en
// live-fixture till appens match_id via den inbäddade matchplanen + lag-bryggan
// (omvänt), så fixture_match_map självseedar. Gissar aldrig: en entydig träff
// resolveras, en tvetydig/saknad hoppas. Synk-märkt mot fixture-map-resolver.ts.
// ---------------------------------------------------------------------------

export interface LiveFixtureRef {
  apiFixtureId: number;
  homeTeamApiId: number;
  awayTeamApiId: number;
  kickoffUtc: string;
}

export type FixtureMapResolution =
  | { kind: 'resolved'; appMatchId: string; apiFixtureId: number }
  | { kind: 'unresolved'; apiFixtureId: number; reason: string };

/** Kickoff-fönstret för gruppmatch-matchning (mirror av AUTO_MAP_KICKOFF_WINDOW_MS). */
export const AUTO_MAP_KICKOFF_WINDOW_MS = 2 * 60 * 60 * 1000;

function kickoffDeltaMs(aIso: string, bIso: string): number | null {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.abs(a - b);
}

function teamPairMatches(entry: MatchPlanEntry, appHome: string, appAway: string): boolean {
  if (entry.homeAppId === null || entry.awayAppId === null) return false;
  const sameOrder = entry.homeAppId === appHome && entry.awayAppId === appAway;
  const swapped = entry.homeAppId === appAway && entry.awayAppId === appHome;
  return sameOrder || swapped;
}

/** Auto-mappa EN live-fixture till en schemarad (resolved bara vid EXAKT en entydig träff). */
export function resolveFixtureToMatch(
  fixture: LiveFixtureRef,
  plan: readonly MatchPlanEntry[] = EMBEDDED_MATCH_PLAN,
  windowMs: number = AUTO_MAP_KICKOFF_WINDOW_MS
): FixtureMapResolution {
  const appHome = resolveAppTeamId(fixture.homeTeamApiId);
  const appAway = resolveAppTeamId(fixture.awayTeamApiId);

  if (appHome !== null && appAway !== null) {
    const candidates = plan.filter((entry) => {
      if (!teamPairMatches(entry, appHome, appAway)) return false;
      const delta = kickoffDeltaMs(entry.kickoffUtc, fixture.kickoffUtc);
      return delta !== null && delta <= windowMs;
    });
    if (candidates.length === 1) {
      return {
        kind: 'resolved',
        appMatchId: candidates[0].matchId,
        apiFixtureId: fixture.apiFixtureId,
      };
    }
    if (candidates.length === 0) {
      // FALLBACK , OSEEDAT SLUTSPEL: en känd-lags slutspelsmatch (båda lagen spelade
      // gruppspel, så de finns i bryggan) vars bracket-plats ÄNNU är oseedad. M73-M104
      // bär null lag tills seedningen fyllt dem, så lag-paret ovan kan aldrig matcha en
      // null-lags-rad , men fixturens UNIKA avsparkstid identifierar slutspels-platsen
      // entydigt. Slutspels-raderna ligger minst 3,5 h isär i planen (källa: matches.ts
      // M73-M104, låst i invariant-testet), så ett 2h-fönster fångar som mest EN oseedad
      // rad. Mappa på tid OM exakt en oseedad rad ligger i fönstret; 0 eller >1 -> gissa
      // ALDRIG, behåll unresolved. Detta är den AVSEDDA "slutspel mappas på unik
      // avsparkstid"-logiken, bara felgrindad tidigare. Synk-märkt mot fixture-map-resolver.ts.
      const unseededKnockout = plan.filter((entry) => {
        if (entry.homeAppId !== null || entry.awayAppId !== null) {
          return false; // bara HELT oseedade slutspels-rader (grupprader har alltid lag)
        }
        const delta = kickoffDeltaMs(entry.kickoffUtc, fixture.kickoffUtc);
        return delta !== null && delta <= windowMs;
      });
      if (unseededKnockout.length === 1) {
        return {
          kind: 'resolved',
          appMatchId: unseededKnockout[0].matchId,
          apiFixtureId: fixture.apiFixtureId,
        };
      }
      if (unseededKnockout.length > 1) {
        return {
          kind: 'unresolved',
          apiFixtureId: fixture.apiFixtureId,
          reason: `tvetydigt: ${unseededKnockout.length} oseedade slutspels-rader inom kickoff-fönstret för lag ${appHome}/${appAway} (${fixture.kickoffUtc})`,
        };
      }
      return {
        kind: 'unresolved',
        apiFixtureId: fixture.apiFixtureId,
        reason: `ingen schemarad med lag ${appHome}/${appAway} eller oseedad slutspels-plats inom kickoff-fönstret (${fixture.kickoffUtc})`,
      };
    }
    return {
      kind: 'unresolved',
      apiFixtureId: fixture.apiFixtureId,
      reason: `tvetydigt: ${candidates.length} schemarader matchar lag ${appHome}/${appAway} inom fönstret`,
    };
  }

  // Bara BÅDA lagen okända (helt oseedat slutspel) får matchas på enbart tid. Är
  // bara ett lag okänt kan vi inte bekräfta kopplingen (gissa aldrig på tid).
  if (appHome !== null || appAway !== null) {
    const known = appHome ?? appAway;
    return {
      kind: 'unresolved',
      apiFixtureId: fixture.apiFixtureId,
      reason:
        `ett lag känt (${known}) men det andra saknas i bryggan ` +
        `(API-id ${fixture.homeTeamApiId}/${fixture.awayTeamApiId}); kan inte bekräfta kopplingen`,
    };
  }

  const exact = plan.filter((entry) => kickoffDeltaMs(entry.kickoffUtc, fixture.kickoffUtc) === 0);
  if (exact.length === 1) {
    return { kind: 'resolved', appMatchId: exact[0].matchId, apiFixtureId: fixture.apiFixtureId };
  }
  if (exact.length === 0) {
    return {
      kind: 'unresolved',
      apiFixtureId: fixture.apiFixtureId,
      reason:
        `lag saknas i bryggan (API-id ${fixture.homeTeamApiId}/${fixture.awayTeamApiId}) ` +
        `och ingen schemarad med exakt kickoff ${fixture.kickoffUtc}`,
    };
  }
  return {
    kind: 'unresolved',
    apiFixtureId: fixture.apiFixtureId,
    reason: `tvetydigt: ${exact.length} schemarader har exakt kickoff ${fixture.kickoffUtc}`,
  };
}

// ---------------------------------------------------------------------------
// ROBUST FACIT-FÅNGST (mirror av src/data/livescore/freeze-selection.ts). Välj de
// mappade matcher vars kickoff passerat (inom bak-fönstret) och som ännu inte är
// frysta , så ett slutresultat aldrig missas om matchen föll ur live=all mellan
// tick. Budget-kapad. Synk-märkt mot freeze-selection.ts.
// ---------------------------------------------------------------------------

export const FREEZE_LOOKBACK_MS = 4 * 60 * 60 * 1000;
export const DEFAULT_MAX_FREEZE_CHECKS_PER_TICK = 10;

export interface MappedMatchState {
  matchId: string;
  apiFixtureId: number;
  frozen: boolean;
}

export interface FreezeCheckTarget {
  matchId: string;
  apiFixtureId: number;
  msSinceKickoff: number;
}

/** Välj mappade, ej-frysta matcher vars kickoff passerat (inom fönstret), äldst först, budget-kapat. */
export function selectFreezeChecks(
  plan: readonly MatchPlanEntry[],
  mapped: readonly MappedMatchState[],
  now: Date,
  maxChecks: number = DEFAULT_MAX_FREEZE_CHECKS_PER_TICK,
  lookbackMs: number = FREEZE_LOOKBACK_MS
): FreezeCheckTarget[] {
  if (maxChecks < 0) {
    throw new Error(`selectFreezeChecks: maxChecks får inte vara negativ (fick ${maxChecks}).`);
  }
  const nowMs = now.getTime();
  if (Number.isNaN(nowMs)) {
    throw new Error('selectFreezeChecks: now är ett ogiltigt datum.');
  }
  const kickoffByMatchId = new Map<string, number>();
  for (const entry of plan) {
    const ms = Date.parse(entry.kickoffUtc);
    if (!Number.isNaN(ms)) kickoffByMatchId.set(entry.matchId, ms);
  }
  const targets: FreezeCheckTarget[] = [];
  for (const m of mapped) {
    if (m.frozen) continue;
    const kickoffMs = kickoffByMatchId.get(m.matchId);
    if (kickoffMs === undefined) continue;
    const msSinceKickoff = nowMs - kickoffMs;
    if (msSinceKickoff > 0 && msSinceKickoff <= lookbackMs) {
      targets.push({ matchId: m.matchId, apiFixtureId: m.apiFixtureId, msSinceKickoff });
    }
  }
  targets.sort((a, b) => b.msSinceKickoff - a.msSinceKickoff);
  return targets.slice(0, maxChecks);
}

// ---------------------------------------------------------------------------
// FÖNSTER-GATING (mirror av src/data/livescore/live-window.ts). Vilka matcher är i
// sitt LIVE-FÖNSTER NU? Pollare-v3 per-match-pollar bara matcher i fönster, så
// budgeten (100/dag) räcker , ingen tomgångs-polling mellan matcher. Synk-märkt mot
// live-window.ts , medvetna kopior, inte två sanningar.
// ---------------------------------------------------------------------------

export const LIVE_WINDOW_BEFORE_MS = 5 * 60 * 1000; // ~5 min före avspark
export const LIVE_WINDOW_AFTER_MS = 3.5 * 60 * 60 * 1000; // ~3,5 h efter avspark

export interface InWindowMatch {
  matchId: string;
  kickoffUtc: string;
  homeAppId: string | null;
  awayAppId: string | null;
  msSinceKickoff: number;
}

export interface LiveWindowBounds {
  beforeMs?: number;
  afterMs?: number;
}

/** Välj de matcher ur planen vars kickoff ligger i live-fönstret NU. Äldst-kickoff först. */
export function selectInWindowMatches(
  plan: readonly MatchPlanEntry[],
  now: Date,
  bounds: LiveWindowBounds = {}
): InWindowMatch[] {
  const beforeMs = bounds.beforeMs ?? LIVE_WINDOW_BEFORE_MS;
  const afterMs = bounds.afterMs ?? LIVE_WINDOW_AFTER_MS;
  if (beforeMs < 0 || afterMs < 0) {
    throw new Error(
      `selectInWindowMatches: fönster-gränserna får inte vara negativa (before ${beforeMs}, after ${afterMs}).`
    );
  }
  const nowMs = now.getTime();
  if (Number.isNaN(nowMs)) {
    throw new Error('selectInWindowMatches: now är ett ogiltigt datum.');
  }

  const inWindow: InWindowMatch[] = [];
  for (const entry of plan) {
    const kickoffMs = Date.parse(entry.kickoffUtc);
    if (Number.isNaN(kickoffMs)) {
      continue;
    }
    const msSinceKickoff = nowMs - kickoffMs;
    if (msSinceKickoff >= -beforeMs && msSinceKickoff <= afterMs) {
      inWindow.push({
        matchId: entry.matchId,
        kickoffUtc: entry.kickoffUtc,
        homeAppId: entry.homeAppId,
        awayAppId: entry.awayAppId,
        msSinceKickoff,
      });
    }
  }
  inWindow.sort((a, b) => b.msSinceKickoff - a.msSinceKickoff);
  return inWindow;
}

// ---------------------------------------------------------------------------
// PER-MATCH-POLL-PLAN + BUDGET-ALLOKERING (mirror av src/data/livescore/
// per-match-poll-plan.ts). Discovery (live=all bara när en in-fönster-match saknar
// mappning) + per-match (fixtures?id, full data) med FACIT-PRIO, strikt under
// dagsbudgeten. Synk-märkt mot per-match-poll-plan.ts.
// ---------------------------------------------------------------------------

export const DEFAULT_DAILY_BUDGET = 100;
export const DEFAULT_MAX_PER_MATCH_CALLS_PER_TICK = 6;

export interface WindowMatchState {
  match: InWindowMatch;
  apiFixtureId: number | null;
  frozen: boolean;
  finishedAwaitingFreeze?: boolean;
}

export interface PerMatchPlanInput {
  windowMatches: readonly WindowMatchState[];
  callsUsedToday: number;
  dailyBudget?: number;
  maxPerMatchCallsPerTick?: number;
}

export interface PerMatchPollTarget {
  matchId: string;
  apiFixtureId: number;
  facitPriority: boolean;
}

export interface PerMatchPollPlan {
  skipTick: boolean;
  needsDiscovery: boolean;
  perMatchTargets: PerMatchPollTarget[];
  callBudgetThisTick: number;
  reason: string;
}

/** Planera ett cron-tick: discovery + per-match med facit-prio, strikt under dagsbudgeten. */
export function buildPerMatchPollPlan(input: PerMatchPlanInput): PerMatchPollPlan {
  const dailyBudget = input.dailyBudget ?? DEFAULT_DAILY_BUDGET;
  const maxPerMatch = input.maxPerMatchCallsPerTick ?? DEFAULT_MAX_PER_MATCH_CALLS_PER_TICK;
  if (dailyBudget < 0) {
    throw new Error(
      `buildPerMatchPollPlan: dailyBudget får inte vara negativ (fick ${dailyBudget}).`
    );
  }
  if (input.callsUsedToday < 0) {
    throw new Error(
      `buildPerMatchPollPlan: callsUsedToday får inte vara negativ (fick ${input.callsUsedToday}).`
    );
  }
  if (maxPerMatch < 0) {
    throw new Error(
      `buildPerMatchPollPlan: maxPerMatchCallsPerTick får inte vara negativ (fick ${maxPerMatch}).`
    );
  }

  const remaining = dailyBudget - input.callsUsedToday;
  const skip = (reason: string): PerMatchPollPlan => ({
    skipTick: true,
    needsDiscovery: false,
    perMatchTargets: [],
    callBudgetThisTick: 0,
    reason,
  });

  if (remaining <= 0) {
    return skip(`dagsbudget spräckt (${input.callsUsedToday}/${dailyBudget})`);
  }
  if (input.windowMatches.length === 0) {
    return skip('ingen match i live-fönster (0 anrop, ingen tomgångs-polling)');
  }

  const hasUnmapped = input.windowMatches.some((w) => w.apiFixtureId === null);

  const candidates = input.windowMatches
    .filter((w): w is WindowMatchState & { apiFixtureId: number } => w.apiFixtureId !== null)
    .filter((w) => !w.frozen)
    .sort((a, b) => {
      const aPrio = a.finishedAwaitingFreeze === true ? 1 : 0;
      const bPrio = b.finishedAwaitingFreeze === true ? 1 : 0;
      if (aPrio !== bPrio) return bPrio - aPrio;
      return b.match.msSinceKickoff - a.match.msSinceKickoff;
    });

  if (!hasUnmapped && candidates.length === 0) {
    return skip('inget att polla (alla in-fönster-matcher frysta, inga okända)');
  }

  const discoveryCalls = hasUnmapped ? 1 : 0;
  if (discoveryCalls > remaining) {
    return skip(`budget räcker inte ens till discovery (kvar ${remaining})`);
  }

  const perMatchBudget = Math.min(remaining - discoveryCalls, maxPerMatch);
  const perMatchTargets: PerMatchPollTarget[] = candidates.slice(0, perMatchBudget).map((w) => ({
    matchId: w.match.matchId,
    apiFixtureId: w.apiFixtureId,
    facitPriority: w.finishedAwaitingFreeze === true,
  }));

  const callBudgetThisTick = discoveryCalls + perMatchTargets.length;
  if (callBudgetThisTick === 0) {
    return skip(`budget slut för per-match-anrop detta tick (kvar ${remaining})`);
  }

  const parts: string[] = [];
  if (discoveryCalls > 0) parts.push('1 live=all (discovery)');
  if (perMatchTargets.length > 0) {
    const prio = perMatchTargets.filter((t) => t.facitPriority).length;
    parts.push(
      `${perMatchTargets.length} fixtures?id${prio > 0 ? ` (varav ${prio} facit-prio)` : ''}`
    );
  }
  return {
    skipTick: false,
    needsDiscovery: hasUnmapped,
    perMatchTargets,
    callBudgetThisTick,
    reason: `pollar: ${parts.join(' + ')} (kvar ${remaining}/${dailyBudget})`,
  };
}
