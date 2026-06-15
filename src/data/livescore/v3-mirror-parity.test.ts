// @vitest-environment node
//
// Kör i NODE-miljön (inte jsdom): esbuild kräver en äkta TextEncoder/Uint8Array-
// invariant som jsdom bryter (känt esbuild-fel i jsdom). Det här testet rör ingen
// DOM, bara ren logik + esbuild-bundling, så node-miljön är rätt här.
//
// MIRROR-PARITETSTEST (pollare-v3): bevisa att Deno-mirror:n i
// `supabase/functions/_shared/livescore-core.ts` ger EXAKT samma utdata som src-
// originalet för de v3-funktioner pollaren kör i prod (`selectInWindowMatches`,
// `buildPerMatchPollPlan`).
//
// VARFÖR (lärdomen `handskriven-deno-mirror-av-ren-logik-ar-otestad` + patterns.md
// steg 3): mirror:n typas/lintas INTE av app-grafen och importeras bara av den
// `@ts-nocheck`:ade edge-pollaren (som inte körs i CI). En synk-kommentar är en
// MÄNSKLIG påminnelse, ingen mekanisk grind , en en-sidig redigering driver isär
// utan att något rödnar förrän i PROD (pollaren skriver facit till tävlingen). Det
// här testet är grinden: vi BUNDLAR mirror-filen med esbuild (samma toolchain som
// projektet redan har) och kör SAMMA diskriminerande in->ut-assertioner mot BÅDE
// src och mirror, så en divergens failar i CI i stället för i prod.

import { build } from 'esbuild';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  selectInWindowMatches as srcSelectInWindow,
  type InWindowMatch as SrcInWindowMatch,
} from './live-window';
import {
  buildPerMatchPollPlan as srcBuildPlan,
  type WindowMatchState as SrcWindowMatchState,
} from './per-match-poll-plan';
import type { MatchPlanEntry } from './fixture-map-resolver';

// Mirror-exporterna (laddas via esbuild-bundle i beforeAll, samma signaturer som src).
interface MirrorModule {
  selectInWindowMatches: typeof srcSelectInWindow;
  buildPerMatchPollPlan: typeof srcBuildPlan;
  LIVE_WINDOW_BEFORE_MS: number;
  LIVE_WINDOW_AFTER_MS: number;
  DEFAULT_DAILY_BUDGET: number;
  DEFAULT_MAX_PER_MATCH_CALLS_PER_TICK: number;
}

let mirror: MirrorModule;

beforeAll(async () => {
  // Bundla Deno-mirror:n till ESM (löser dess `./embedded-match-plan.ts`-import) och
  // ladda den som modul via en base64 data:-URL , ingen fil skrivs (patterns.md steg 3).
  const result = await build({
    entryPoints: ['supabase/functions/_shared/livescore-core.ts'],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
  });
  const code = result.outputFiles[0].text;
  // data:-URL via encodeURIComponent (ingen Buffer/btoa , portabelt, typas av app-libs).
  const dataUrl = `data:text/javascript,${encodeURIComponent(code)}`;
  mirror = (await import(/* @vite-ignore */ dataUrl)) as MirrorModule;
});

const NOW = new Date('2026-06-14T16:45:00.000Z');

// Diskriminerande fall: en match i fönster, en mellan matcher (utanför), en omappad.
const PLAN: MatchPlanEntry[] = [
  { matchId: 'g-A-1', kickoffUtc: '2026-06-14T16:00:00.000Z', homeAppId: 'mex', awayAppId: 'rsa' },
  { matchId: 'g-B-1', kickoffUtc: '2026-06-14T22:00:00.000Z', homeAppId: 'esp', awayAppId: 'uru' },
];

function windowState(
  m: SrcInWindowMatch,
  apiFixtureId: number | null,
  frozen: boolean,
  finishedAwaitingFreeze?: boolean
): SrcWindowMatchState {
  return { match: m, apiFixtureId, frozen, finishedAwaitingFreeze };
}

describe('v3 mirror-paritet: src == _shared (Deno-mirror) för pollarens funktioner', () => {
  it('konstanterna är identiska (fönster-gränser + budget)', () => {
    expect(mirror.LIVE_WINDOW_BEFORE_MS).toBe(5 * 60 * 1000);
    expect(mirror.LIVE_WINDOW_AFTER_MS).toBe(3.5 * 60 * 60 * 1000);
    expect(mirror.DEFAULT_DAILY_BUDGET).toBe(100);
    expect(mirror.DEFAULT_MAX_PER_MATCH_CALLS_PER_TICK).toBe(6);
  });

  it('selectInWindowMatches: src och mirror ger identiskt fönster-urval (mitt i match)', () => {
    const src = srcSelectInWindow(PLAN, NOW);
    const mir = mirror.selectInWindowMatches(PLAN, NOW);
    expect(mir).toEqual(src);
    expect(src.map((m) => m.matchId)).toEqual(['g-A-1']); // sanity: rätt match
  });

  it('selectInWindowMatches: src och mirror är BÅDA tomma i pausen mellan matcher', () => {
    const between = new Date('2026-06-14T20:00:00.000Z');
    expect(mirror.selectInWindowMatches(PLAN, between)).toEqual(srcSelectInWindow(PLAN, between));
    expect(mirror.selectInWindowMatches(PLAN, between)).toEqual([]);
  });

  it('buildPerMatchPollPlan: src och mirror planerar identiskt (discovery + per-match)', () => {
    const inWindow = srcSelectInWindow(PLAN, NOW)[0];
    const input = {
      windowMatches: [
        windowState(inWindow, 1489376, false),
        windowState({ ...inWindow, matchId: 'okänd' }, null, false),
      ],
      callsUsedToday: 0,
    };
    expect(mirror.buildPerMatchPollPlan(input)).toEqual(srcBuildPlan(input));
  });

  it('buildPerMatchPollPlan: FACIT-PRIO identisk i src och mirror (diskriminerande budget-fall)', () => {
    const inWindow = srcSelectInWindow(PLAN, NOW)[0];
    const input = {
      windowMatches: [
        windowState({ ...inWindow, matchId: 'pågår', msSinceKickoff: 3 * 3600_000 }, 100, false),
        windowState(
          { ...inWindow, matchId: 'avgjord', msSinceKickoff: 3600_000 },
          200,
          false,
          true
        ),
      ],
      callsUsedToday: 99,
      dailyBudget: 100,
    };
    const src = srcBuildPlan(input);
    const mir = mirror.buildPerMatchPollPlan(input);
    expect(mir).toEqual(src);
    // sanity: facit-prio plockade den avgjorda först (diskriminerar rätt logik)
    expect(src.perMatchTargets[0].matchId).toBe('avgjord');
  });

  it('buildPerMatchPollPlan: budget-vägg identisk (src och mirror hoppar båda)', () => {
    const inWindow = srcSelectInWindow(PLAN, NOW)[0];
    const input = {
      windowMatches: [windowState(inWindow, 100, false)],
      callsUsedToday: 100,
      dailyBudget: 100,
    };
    const src = srcBuildPlan(input);
    const mir = mirror.buildPerMatchPollPlan(input);
    expect(mir).toEqual(src);
    expect(src.skipTick).toBe(true);
  });

  it('fail-loud-kontraktet är identiskt (samma kast på korrupt input)', () => {
    expect(() => mirror.selectInWindowMatches(PLAN, new Date('ogiltig'))).toThrow(/now/);
    expect(() => srcSelectInWindow(PLAN, new Date('ogiltig'))).toThrow(/now/);
    const inWindow = srcSelectInWindow(PLAN, NOW)[0];
    const bad = { windowMatches: [windowState(inWindow, 100, false)], callsUsedToday: -1 };
    expect(() => mirror.buildPerMatchPollPlan(bad)).toThrow(/callsUsedToday/);
    expect(() => srcBuildPlan(bad)).toThrow(/callsUsedToday/);
  });
});
