// ROBUST FACIT-FÅNGST: välj vilka MAPPADE matcher som behöver en freeze-koll detta
// tick, så ett slutresultat ALDRIG missas , inte ens om matchen faller ur live=all
// mellan två tick (FT hinner droppas innan pollaren såg den som finished).
//
// PROBLEM (v1): pollaren frös bara matcher den såg som 'finished' i live=all. En match
// som avslutas mellan två tick försvinner ur live=all (FT droppas), så dess facit
// fångades aldrig. Det är g-F-1-buggen (ned-jpn redan spelad, mappad, men aldrig frusen).
//
// FIX (denna modul, REN + testbar): efter live=all-bearbetningen tar pollaren ÄVEN de
// mappade matcher vars kickoff PASSERAT (inom ett rimligt bak-fönster) och som ÄNNU INTE
// är frysta, och gör ett `fixtures?id`-anrop per styck för att härleda + frysa facit.
// Bak-fönstret undviker att vi för evigt om-kollar gamla matcher (en match är klar långt
// inom några timmar efter avspark). Antalet kollar per tick begränsas (budget-disciplin,
// facit får aldrig spräcka 100/dag-taket, se decidePollTick/poll-gate.ts).
//
// REN: in = matchplanen + DB:ns mappnings-/frozen-state + now + gränser, ut = en
// prioriterad lista matcher att freeze-kolla. Ingen IO. Edge-pollaren matar in
// state + agerar på listan; logiken speglas i livescore-core.ts (selectFreezeChecks),
// synk-märkt.

import type { MatchPlanEntry } from './fixture-map-resolver';

/**
 * Hur långt EFTER avspark en match fortfarande freeze-kollas. En match är avgjord
 * långt inom denna tid (90 min + ev. förlängning 30 + straffar + paus ~ < 3 h), så
 * 4 h ger marginal men slutar kolla en gammal match som av något skäl aldrig fick
 * facit (då är något annat fel; vi loggar hellre än om-pollar i evighet). Matcher
 * äldre än så hanteras manuellt (admin matar in facit), aldrig en evig API-kostnad.
 */
export const FREEZE_LOOKBACK_MS = 4 * 60 * 60 * 1000;

/** Default-tak för antal freeze-kollar per tick (budget-skydd, kan sänkas av anroparen). */
export const DEFAULT_MAX_FREEZE_CHECKS_PER_TICK = 10;

/** En mappad match med sin frozen-status (det pollaren läser ur DB:n per tick). */
export interface MappedMatchState {
  /** Appens match-id (har en rad i fixture_match_map). */
  matchId: string;
  /** API-Football fixture-id (för fixtures?id-anropet). */
  apiFixtureId: number;
  /** true om match_live_data-raden redan är fryst (facit fångat) , behöver ingen koll. */
  frozen: boolean;
}

/** En match som ska freeze-kollas detta tick (pollaren gör ett fixtures?id-anrop per styck). */
export interface FreezeCheckTarget {
  matchId: string;
  apiFixtureId: number;
  /** Hur många ms sedan avspark (för logg + prioritering: äldst-passerad först). */
  msSinceKickoff: number;
}

/**
 * Välj de mappade matcher som behöver en freeze-koll detta tick.
 *
 * URVAL (en match tas med om ALLA gäller):
 *   1. den har en rad i fixture_match_map (är i `mapped`),
 *   2. den är INTE redan fryst (frozen=false),
 *   3. dess kickoff har PASSERAT (kickoff < now), OCH
 *   4. den passerade för mindre än FREEZE_LOOKBACK_MS sedan (kickoff > now - fönster).
 *
 * Resultatet sorteras äldst-passerad FÖRST (en match som varit klar längst har störst
 * risk att ha fallit ur live=all -> facit-fångsten prioriterar den), och kapas till
 * `maxChecks` (budget-skydd , facit får aldrig spräcka dagsbudgeten).
 *
 * @param plan       matchplanen (kickoff per match_id, källåkrad).
 * @param mapped     mappade matcher + frozen-status (ur fixture_match_map + match_live_data).
 * @param now        nuvarande tid (injiceras, ingen Date.now i den rena logiken).
 * @param maxChecks  tak för antal kollar detta tick (default DEFAULT_MAX_FREEZE_CHECKS_PER_TICK).
 * @param lookbackMs bak-fönstret (default FREEZE_LOOKBACK_MS).
 */
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

  // Kickoff per match_id (O(1)-uppslag), en sanning ur planen.
  const kickoffByMatchId = new Map<string, number>();
  for (const entry of plan) {
    const ms = Date.parse(entry.kickoffUtc);
    if (!Number.isNaN(ms)) {
      kickoffByMatchId.set(entry.matchId, ms);
    }
  }

  const targets: FreezeCheckTarget[] = [];
  for (const m of mapped) {
    if (m.frozen) {
      continue; // redan fångat, ingen koll
    }
    const kickoffMs = kickoffByMatchId.get(m.matchId);
    if (kickoffMs === undefined) {
      continue; // mappad men ingen schemarad (planen är sanningen) , hoppas, gissa aldrig
    }
    const msSinceKickoff = nowMs - kickoffMs;
    // Kickoff passerad OCH inom bak-fönstret (inte en framtida match, inte uråldrig).
    if (msSinceKickoff > 0 && msSinceKickoff <= lookbackMs) {
      targets.push({ matchId: m.matchId, apiFixtureId: m.apiFixtureId, msSinceKickoff });
    }
  }

  // Äldst-passerad först (störst risk att ha fallit ur live=all), kapa till budget.
  targets.sort((a, b) => b.msSinceKickoff - a.msSinceKickoff);
  return targets.slice(0, maxChecks);
}
