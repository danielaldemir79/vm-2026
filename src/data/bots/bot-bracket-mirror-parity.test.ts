// @vitest-environment node
//
// Kör i NODE-miljön (inte jsdom): esbuild kräver en äkta TextEncoder/Uint8Array-invariant
// som jsdom bryter. Testet rör ingen DOM, bara ren logik + esbuild-bundling.
//
// MIRROR-PARITETSTEST (Fas 3, spegel av global-leaderboard-mirror-parity.test.ts): bevisa
// att den GENERERADE Deno-mirror:n i supabase/functions/_shared/bot-bracket-core.ts ger
// EXAKT samma seed-plan som src-grafen (planBotBracketSeedingFromDb). Mirror:n typas/lintas
// inte av app-grafen och importeras bara av den @ts-nocheck:ade edge-funktionen (körs ej i
// CI). En glömd `npm run gen:bot-bracket-core` efter en kod-ändring fångas HÄR (committad
// mirror != färsk src-bundle) i stället för i prod (där edge-funktionen skriver bot-tips).

import { build } from 'esbuild';
import { beforeAll, describe, expect, it } from 'vitest';
import type { RoomMatchResult } from '../rooms/rooms-api';
import {
  planBotBracketSeedingFromDb as srcPlan,
  EMBEDDED_BRACKET_PLAN as srcEmbedded,
  type BracketSeedDbInput,
} from './bracket-seed-edge-entry';
import type { BotBracketSeedPlan } from './seed-bracket-slots';

interface MirrorModule {
  planBotBracketSeedingFromDb: (input: BracketSeedDbInput) => BotBracketSeedPlan;
  EMBEDDED_BRACKET_PLAN: typeof srcEmbedded;
}

let committed: MirrorModule;
let freshBundle: MirrorModule;

async function loadBundled(entry: string): Promise<MirrorModule> {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
  });
  const code = result.outputFiles[0].text;
  return (await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(code)}`
  )) as MirrorModule;
}

beforeAll(async () => {
  committed = await loadBundled('supabase/functions/_shared/bot-bracket-core.ts');
  freshBundle = await loadBundled('src/data/bots/bracket-seed-edge-entry.ts');
});

/** Avsluta alla gruppmatcher (hemmaseger 1-0) så gruppspelet blir komplett. */
function finishAllGroupMatches(plan: typeof srcEmbedded): RoomMatchResult[] {
  return plan.matches
    .filter((m) => m.stage === 'group')
    .map((m) => ({
      matchId: m.id,
      homeGoals: 1,
      awayGoals: 0,
      penalties: null,
      status: 'finished' as const,
      updatedBy: '00000000-0000-0000-0000-000000000000',
      updatedAt: '2026-06-27T00:00:00.000Z',
    }));
}

/** Diskriminerande indata: full grupp-facit, blandade botar, befintliga giltiga/ogiltiga +
 * en icke-bot-rad (ska bara räknas). FEL logik (skill, favorit, ogiltig-ersättning,
 * isolering) ger ett ANNAT resultat. */
function discriminatingInput(plan: typeof srcEmbedded): BracketSeedDbInput {
  const official = finishAllGroupMatches(plan);
  return {
    bots: [
      { userId: 'bot-1', roomId: 'R1', skillTier: 0.95, seedKey: 'vm2026#1' },
      { userId: 'bot-2', roomId: 'R1', skillTier: 0.05, seedKey: 'new-room#7' },
      { userId: 'bot-3', roomId: 'R2', skillTier: 0.5, seedKey: 'fsu#3' },
    ],
    existingBracket: [
      // ogiltig (ej ett av slottens lag) -> ska ersättas; icke-bot -> bara räknas.
      { roomId: 'R1', slotId: 'M73', userId: 'bot-1', advancingTeamId: 'ZZZ' },
      { roomId: 'R9', slotId: 'M73', userId: 'real-user', advancingTeamId: 'ZZZ' },
    ],
    officialResults: official,
    nowIso: '2026-06-27T00:00:00.000Z',
  };
}

describe('bot-bracket mirror-paritet: committad mirror == src (Deno-bundle)', () => {
  it('inbäddad plan identisk (lag/grupp/match-antal)', () => {
    expect(committed.EMBEDDED_BRACKET_PLAN.teams.length).toBe(srcEmbedded.teams.length);
    expect(committed.EMBEDDED_BRACKET_PLAN.groups.length).toBe(srcEmbedded.groups.length);
    expect(committed.EMBEDDED_BRACKET_PLAN.matches.length).toBe(srcEmbedded.matches.length);
    expect(srcEmbedded.teams.length).toBe(48);
    expect(srcEmbedded.matches.length).toBe(104);
  });

  it('committad mirror ger IDENTISK seed-plan som src (rader + summary)', () => {
    const input = discriminatingInput(srcEmbedded);
    const fromSrc = srcPlan(input);
    const fromMirror = committed.planBotBracketSeedingFromDb(input);
    expect(fromMirror).toEqual(fromSrc);

    // Diskriminerande sanity på BÅDA sidor (inte bara mir==src):
    for (const out of [fromSrc, fromMirror]) {
      expect(out.seedableSlots.length).toBeGreaterThan(0);
      expect(out.summary.rowsToWrite).toBeGreaterThan(0);
      expect(out.nonBotExistingCount).toBe(1); // den enda icke-bot-raden räknas
      expect(out.rows.some((r) => r.userId === 'real-user')).toBe(false); // isolering
      expect(out.summary.invalidReplaced).toBe(1); // bot-1:s ogiltiga M73 ersätts
    }
  });

  it('FÄRSK src-bundle == committad mirror (fångar en glömd regenerering)', () => {
    const input = discriminatingInput(srcEmbedded);
    const fresh = freshBundle.planBotBracketSeedingFromDb(input);
    const committedOut = committed.planBotBracketSeedingFromDb(input);
    expect(committedOut).toEqual(fresh);
  });
});
