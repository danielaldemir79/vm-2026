// Budget-GATE: den RENA beslutslogiken "ska DETTA cron-tick slå mot API:t?".
// Skild från planPolls (poll-budget.ts) som PLANERAR dagens fördelning , gaten
// AVGÖR per tick om vi får polla just nu, givet hur många anrop som redan gjorts
// idag. Self-contained budget-skydd (Daniels HARD-krav): även om cron-endpointen
// anropas OFTARE än tänkt får den ALDRIG spräcka dagsbudgeten (100/dag default).
//
// Rent in, rent ut (ingen Date.now, inget nätverk, ingen DB): pollaren matar in
// dagens redan-spenderade anrop + planen, gaten svarar deterministiskt. Så hela
// budget-disciplinen är trivialt testbar i Vitest, och edge-funktionen (Deno)
// behöver bara mata in räknaren + agera på svaret.

import type { PollDayMatch } from './poll-budget';
import { planPolls } from './poll-budget';

/** Vad pollaren behöver veta för att avgöra om detta tick får slå mot API:t. */
export interface PollGateInput {
  /** Dagens matcher (driver planen + facit-reservationen via planPolls). */
  matchesForDay: readonly PollDayMatch[];
  /** Hur många API-anrop som redan gjorts IDAG (läses ur app_config/poll_log). */
  callsUsedToday: number;
  /**
   * Antal matcher som AVSLUTATS sedan förra ticket och vars facit ännu inte
   * fångats (frozen=false men status finished). De har HÖGSTA prio , facit får
   * aldrig missas pga budget, så gaten släpper igenom dem även om den vanliga
   * live-potten är slut (så länge dagsbudgeten inte är spräckt).
   */
  finishedAwaitingFreeze: number;
  /** Dagens anropstak (default 100, gratisnyckelns kvot). */
  dailyBudget?: number;
}

/** Gatens beslut: får vi polla, hur många anrop kostar det, och varför. */
export interface PollGateDecision {
  /** true => detta tick SKA slå mot API:t. false => hoppa över (logga reason). */
  shouldPoll: boolean;
  /**
   * Hur många API-anrop detta tick får göra. 1 för ett vanligt live-tick
   * (fixtures?league=1&live=all = ett anrop alla live), + ett per match som
   * behöver freeze/facit-fångst (fixtures?id=). Aldrig mer än vad som ryms
   * under dagsbudgeten.
   */
  callBudgetThisTick: number;
  /** Människo-läsbar orsak (för loggen, fail-loud-spår). */
  reason: string;
}

/**
 * Avgör om detta cron-tick får polla, och med hur stor anropsbudget.
 *
 * PRIORITET (samma anda som planPolls krav 1): facit-fångst (freeze av nyss
 * avslutade matcher) går FÖRST, sedan live-ryggraden, allt strikt under
 * dagsbudgeten. Self-contained: oavsett hur ofta ticket kommer kan summan av
 * dagens anrop aldrig överstiga dailyBudget.
 *
 * EDGE-/FEL-vägar:
 *   - inga matcher idag => polla inte (inget att hämta).
 *   - dagsbudgeten redan spräckt (callsUsedToday >= dailyBudget) => polla inte,
 *     ALDRIG (hård budget-vägg, även om matcher pågår).
 *   - facit väntar men bara plats för någon enstaka => prioritera freeze-anropen
 *     upp till återstående budget (live-ryggraden får stå tillbaka).
 *   - callsUsedToday negativ eller dailyBudget < 0 => fail loud (orimlig input,
 *     gissa aldrig vidare på korrupt räknare).
 */
export function decidePollTick(input: PollGateInput): PollGateDecision {
  const dailyBudget = input.dailyBudget ?? 100;
  if (dailyBudget < 0) {
    throw new Error(`decidePollTick: dailyBudget får inte vara negativ (fick ${dailyBudget}).`);
  }
  if (input.callsUsedToday < 0) {
    throw new Error(
      `decidePollTick: callsUsedToday får inte vara negativ (fick ${input.callsUsedToday}).`
    );
  }
  if (input.finishedAwaitingFreeze < 0) {
    throw new Error(
      `decidePollTick: finishedAwaitingFreeze får inte vara negativ (fick ${input.finishedAwaitingFreeze}).`
    );
  }

  const remaining = dailyBudget - input.callsUsedToday;
  if (input.matchesForDay.length === 0) {
    return { shouldPoll: false, callBudgetThisTick: 0, reason: 'inga matcher idag' };
  }
  if (remaining <= 0) {
    return {
      shouldPoll: false,
      callBudgetThisTick: 0,
      reason: `dagsbudget spräckt (${input.callsUsedToday}/${dailyBudget})`,
    };
  }

  // planPolls ger oss dagens fördelning; vi använder den för att veta att det
  // FINNS en live-ryggrads-pott (annars är dagen så budget-tight att bara facit
  // ryms). Facit-reservationen lever i planen, gaten respekterar samma prioritet.
  const plan = planPolls(input.matchesForDay, dailyBudget);

  // Facit-fångst FÖRST: varje nyss avslutad match behöver ett fixtures?id-anrop
  // för freeze. Begränsa till återstående budget (facit får aldrig spräcka taket).
  const freezeCalls = Math.min(input.finishedAwaitingFreeze, remaining);

  // Live-ryggraden: ett enda live=all-anrop täcker alla samtidiga live-matcher,
  // men bara om planen avsatt en live-pott OCH det ryms efter freeze-anropen.
  const wantLive = plan.allocation.liveBackbone > 0;
  const liveCalls = wantLive && remaining - freezeCalls >= 1 ? 1 : 0;

  const callBudgetThisTick = freezeCalls + liveCalls;
  if (callBudgetThisTick === 0) {
    return {
      shouldPoll: false,
      callBudgetThisTick: 0,
      reason:
        freezeCalls === 0 && !wantLive
          ? 'inget att polla detta tick (ingen freeze, ingen live-pott)'
          : `budget slut för detta tick (kvar ${remaining})`,
    };
  }

  const parts: string[] = [];
  if (freezeCalls > 0) parts.push(`${freezeCalls} freeze/facit`);
  if (liveCalls > 0) parts.push('1 live=all');
  return {
    shouldPoll: true,
    callBudgetThisTick,
    reason: `pollar: ${parts.join(' + ')} (kvar ${remaining}/${dailyBudget})`,
  };
}
