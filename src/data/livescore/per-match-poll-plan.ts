// PER-MATCH-POLL-PLAN + BUDGET-ALLOKERING (pollare-v3, Daniels poll-modell).
//
// VARFÖR: v3 ger en LIVE match full rik data UNDER matchen (målskytt/assist/kort/byten/
// statistik/laguppställning), inte bara vid slutet. Det görs med ETT `fixtures?id`-anrop
// per pågående match (svaret bär allt INLINE, verifierat). Den här rena funktionen
// PLANERAR ett cron-tick ur fönster-urvalet + DB-state + budget:
//   1. DISCOVERY: finns en in-fönster-match som SAKNAR rad i fixture_match_map ->
//      ett `live=all`-anrop behövs (auto-mappa de okända). När alla in-fönster-matcher
//      är mappade behövs INGET live=all (sparar ett anrop varje tick).
//   2. PER-MATCH: för varje MAPPAD in-fönster-match -> ett `fixtures?id`-anrop (full data).
//   3. BUDGET (Daniels matte, HARD): summan av tickets anrop får ALDRIG spräcka det som
//      ryms under dagsbudgeten (100/dag). FACIT-PRIO: en match som rimligen är AVGJORD
//      (eller känd finished-men-ofryst) ska få sitt anrop FÖRE en match som nyss börjat
//      om budgeten tryter , facit får aldrig missas pga budget.
//
// REN + testbar: in = fönster-urval + map/frozen-state + budget, ut = planen (live=all
// ja/nej + ordnad per-match-lista + skipped-flagga + reason). Ingen IO, ingen Date.now.
// Speglas i `supabase/functions/_shared/livescore-core.ts` (buildPerMatchPollPlan),
// synk-märkt , medvetna kopior, inte två sanningar.

import type { InWindowMatch } from './live-window';

/** Dagens hårda anropstak (gratisnyckelns kvot). Self-contained budget-skydd. */
export const DEFAULT_DAILY_BUDGET = 100;

/**
 * Tak för per-match-anrop ETT tick (utöver dagsbudgeten). Skyddar mot att ett enda
 * tick bränner stora delar av budgeten om ovanligt många matcher råkar vara i fönster
 * samtidigt. VM 2026 har som mest ~4 samtidiga matcher (sista gruppspelsomgången), så
 * 6 ger marginal utan att bli en tomgångs-risk. Anroparen kan sänka det.
 */
export const DEFAULT_MAX_PER_MATCH_CALLS_PER_TICK = 6;

/** En in-fönster-match med sitt DB-state (det pollaren läser per tick). */
export interface WindowMatchState {
  /** Matchen ur fönster-urvalet (selectInWindowMatches). */
  match: InWindowMatch;
  /**
   * API-Football fixture-id om matchen redan är mappad (rad i fixture_match_map),
   * annars null (då behövs discovery via live=all för att auto-mappa den).
   */
  apiFixtureId: number | null;
  /** true om match_live_data-raden redan är fryst (facit fångat) , ska inte pollas mer. */
  frozen: boolean;
  /**
   * true om matchen är KÄND avgjord men ÄNNU INTE fryst (status finished, frozen=false).
   * Högsta facit-prio: får sitt fixtures?id före pågående matcher om budgeten tryter.
   * null/false när status inte är känd ännu (matchen har ingen live-rad).
   */
  finishedAwaitingFreeze?: boolean;
}

/** Vad pollaren behöver för att planera ett tick. */
export interface PerMatchPlanInput {
  /** In-fönster-matchernas DB-state (ur fönster-urval + fixture_match_map + match_live_data). */
  windowMatches: readonly WindowMatchState[];
  /** Hur många API-anrop som redan gjorts IDAG (poll_log). */
  callsUsedToday: number;
  /** Dagens anropstak (default DEFAULT_DAILY_BUDGET). */
  dailyBudget?: number;
  /** Tak för per-match-anrop detta tick (default DEFAULT_MAX_PER_MATCH_CALLS_PER_TICK). */
  maxPerMatchCallsPerTick?: number;
}

/** En match att per-match-polla detta tick (ett fixtures?id-anrop per styck). */
export interface PerMatchPollTarget {
  matchId: string;
  apiFixtureId: number;
  /** true om matchen är känd avgjord-men-ofryst (facit-prio, för logg/spårbarhet). */
  facitPriority: boolean;
}

/** Den färdiga tick-planen. */
export interface PerMatchPollPlan {
  /** true => hoppa hela ticket (0 API-anrop). Nyckeln till att budgeten räcker. */
  skipTick: boolean;
  /**
   * true => gör ETT `live=all`-anrop detta tick (discovery: minst en in-fönster-match
   * saknar mappning). false => alla in-fönster-matcher är redan mappade, inget live=all.
   */
  needsDiscovery: boolean;
  /** De matcher som ska per-match-pollas (fixtures?id), facit-prio + äldst-kickoff först. */
  perMatchTargets: PerMatchPollTarget[];
  /** Summan av tickets API-anrop (discovery + per-match). ALDRIG > remaining budget. */
  callBudgetThisTick: number;
  /** Människo-läsbar orsak (logg/fail-loud-spår). */
  reason: string;
}

/**
 * Planera ett cron-tick: discovery (live=all) + per-match-anrop (fixtures?id), strikt
 * under dagsbudgeten med facit-prio.
 *
 * ALLOKERING (Daniels matte, HARD):
 *   - remaining = dailyBudget - callsUsedToday. Är remaining <= 0 -> hoppa (budget-vägg).
 *   - Är inga matcher i fönster OCH inga okända att upptäcka -> hoppa (0 anrop, ingen
 *     tomgångs-polling). Detta är vad som gör att budgeten räcker.
 *   - DISCOVERY: behövs (en okänd in-fönster-match) -> reservera 1 anrop FÖRST (en okänd
 *     match kan vara avgjord vars facit vi annars aldrig fångar). Ryms inte ens det ->
 *     hoppa.
 *   - PER-MATCH: ordna de MAPPADE, ej-frysta matcherna med FACIT-PRIO (finished-väntar-
 *     freeze före pågående; inom varje grupp äldst-kickoff först), och ta så många som
 *     ryms efter discovery, kapat till maxPerMatchCallsPerTick. Frysta matcher hoppas
 *     (redan klara). En okänd (omappad) match får inget per-match-anrop förrän nästa
 *     tick (efter att discovery auto-mappat den) , vi gissar aldrig dess fixture-id.
 *
 * EDGE-/FEL-vägar:
 *   - dailyBudget < 0 / callsUsedToday < 0 / max < 0 => fail loud (orimlig input).
 *   - alla in-fönster-matcher frysta OCH inga okända => hoppa (inget att göra).
 *
 * @param input  fönster-state + budget.
 */
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

  // En in-fönster-match som saknar mappning -> discovery (live=all) behövs.
  const hasUnmapped = input.windowMatches.some((w) => w.apiFixtureId === null);

  // Kandidater för per-match-polling: MAPPADE + EJ frysta (frysta är klara, omappade
  // upptäcks av discovery och pollas först nästa tick). Facit-prio FÖRST, sedan äldst-
  // kickoff (msSinceKickoff störst) , de mest färdiga matcherna får sitt anrop först.
  const candidates = input.windowMatches
    .filter((w): w is WindowMatchState & { apiFixtureId: number } => w.apiFixtureId !== null)
    .filter((w) => !w.frozen)
    .sort((a, b) => {
      const aPrio = a.finishedAwaitingFreeze === true ? 1 : 0;
      const bPrio = b.finishedAwaitingFreeze === true ? 1 : 0;
      if (aPrio !== bPrio) return bPrio - aPrio; // facit-prio först
      return b.match.msSinceKickoff - a.match.msSinceKickoff; // äldst-kickoff först
    });

  // Inget att upptäcka OCH inget att per-match-polla -> hoppa (t.ex. alla frysta).
  if (!hasUnmapped && candidates.length === 0) {
    return skip('inget att polla (alla in-fönster-matcher frysta, inga okända)');
  }

  // DISCOVERY reserveras FÖRST (en okänd match kan vara avgjord). Ryms inte ens det -> hoppa.
  const discoveryCalls = hasUnmapped ? 1 : 0;
  if (discoveryCalls > remaining) {
    return skip(`budget räcker inte ens till discovery (kvar ${remaining})`);
  }

  // Per-match-anrop: så många som ryms efter discovery, kapat till tick-taket.
  const perMatchBudget = Math.min(remaining - discoveryCalls, maxPerMatch);
  const perMatchTargets: PerMatchPollTarget[] = candidates.slice(0, perMatchBudget).map((w) => ({
    matchId: w.match.matchId,
    apiFixtureId: w.apiFixtureId,
    facitPriority: w.finishedAwaitingFreeze === true,
  }));

  const callBudgetThisTick = discoveryCalls + perMatchTargets.length;
  if (callBudgetThisTick === 0) {
    // hasUnmapped var false (annars hade discoveryCalls=1) och perMatchBudget=0 (budget slut).
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
