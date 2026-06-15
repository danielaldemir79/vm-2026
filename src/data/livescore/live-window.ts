// FÖNSTER-GATING (pollare-v3): vilka matcher är i sitt LIVE-FÖNSTER just nu?
//
// VARFÖR (Daniels poll-modell): v3 byter från "live=all varje tick + rik data bara
// vid freeze" till PER-MATCH-polling (ett `fixtures?id` per pågående match = full rik
// data live). För att budgeten (100 API-anrop/dag) ska räcka får pollaren ALDRIG
// tomgångs-polla: är ingen match i sitt fönster NU (och inget facit att fånga) hoppas
// hela ticket (0 anrop). Den här rena funktionen avgör fönstret , det är nyckeln till
// att budgeten räcker.
//
// REN + testbar: in = matchplanen (kickoff per match) + now, ut = de matcher vars
// kickoff ligger i live-fönstret. Ingen IO, ingen Date.now (now injiceras), så hela
// fönster-disciplinen är trivialt testbar i Vitest. Edge-pollaren (Deno) kan inte
// importera src/, så logiken speglas i `supabase/functions/_shared/livescore-core.ts`
// (selectInWindowMatches), synk-märkt , medvetna kopior, inte två sanningar.

import type { MatchPlanEntry } from './fixture-map-resolver';

/**
 * Hur långt EFTER kickoff en match räknas som "i sitt live-fönster" (ska per-match-
 * pollas). En match är klar långt inom denna tid: 90 min ordinarie + paus 15 +
 * förlängning 30 + paus + straffläggning ~ < 3 h, så 3,5 h ger marginal för
 * stoppat spel/VAR utan att hålla fönstret öppet i evighet. Snävare än
 * FREEZE_LOOKBACK_MS (4 h): facit-fångsten får ett extra bak-fönster som skyddsnät,
 * men den AKTIVA per-match-pollningen ska sluta när matchen rimligen är slut.
 */
export const LIVE_WINDOW_BEFORE_MS = 5 * 60 * 1000; // ~5 min före avspark
export const LIVE_WINDOW_AFTER_MS = 3.5 * 60 * 60 * 1000; // ~3,5 h efter avspark

/** En match i sitt live-fönster (det pollaren ska per-match-polla detta tick). */
export interface InWindowMatch {
  /** Appens match-id (PK i matchplanen). */
  matchId: string;
  /** Avspark i ISO 8601 (UTC). */
  kickoffUtc: string;
  /** Hemmalag (app-lag-id), null i oseedat slutspel. */
  homeAppId: string | null;
  /** Bortalag (app-lag-id), null i oseedat slutspel. */
  awayAppId: string | null;
  /**
   * Ms sedan kickoff (negativt om kickoff ligger strax fram i tiden, inom
   * före-fönstret). För prioritering/logg: nyss avsparkad först är inte målet ,
   * vi sorterar äldst-kickoff först så de mest "färdiga" matcherna facit-kollas
   * tidigt om budgeten tryter.
   */
  msSinceKickoff: number;
}

/** Justerbara fönster-gränser (default LIVE_WINDOW_*), injiceras för test. */
export interface LiveWindowBounds {
  beforeMs?: number;
  afterMs?: number;
}

/**
 * Välj de matcher ur planen vars kickoff ligger i live-fönstret NU:
 * `now - afterMs <= kickoff <= now + beforeMs`. Dvs en match som startar inom
 * `beforeMs` (strax fram) ELLER startade för upp till `afterMs` sedan.
 *
 * Sorterad äldst-kickoff FÖRST (störst msSinceKickoff), så en match som rimligen
 * är slut hamnar tidigt , facit-prio i budget-allokeringen plockar då de mest
 * färdiga matcherna först om budgeten inte räcker till alla.
 *
 * EDGE-/FEL-vägar:
 *   - tom plan => tom lista (inget att polla).
 *   - now ogiltigt datum => fail loud (gissa aldrig vidare på en korrupt klocka).
 *   - en planrad med ogiltig kickoff hoppas (planen är källåkrad + värde-låst, så
 *     detta ska aldrig hända, men vi gissar aldrig på en NaN-tid).
 *   - beforeMs/afterMs negativa => fail loud (orimlig input).
 *
 * @param plan   matchplanen (kickoff per match_id, källåkrad + värde-låst).
 * @param now    nuvarande tid (injiceras, ingen Date.now i den rena logiken).
 * @param bounds fönster-gränserna (default LIVE_WINDOW_BEFORE_MS / _AFTER_MS).
 */
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
      continue; // ogiltig kickoff (ska aldrig hända i den värde-låsta planen), hoppas
    }
    const msSinceKickoff = nowMs - kickoffMs;
    // I fönstret: kickoff inom [now - afterMs, now + beforeMs].
    // msSinceKickoff = now - kickoff, så villkoret blir -beforeMs <= msSinceKickoff <= afterMs.
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
  // Äldst-kickoff först (störst msSinceKickoff): de mest "färdiga" matcherna prioriteras.
  inWindow.sort((a, b) => b.msSinceKickoff - a.msSinceKickoff);
  return inWindow;
}
