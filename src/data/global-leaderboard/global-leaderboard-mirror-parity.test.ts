// @vitest-environment node
//
// Kör i NODE-miljön (inte jsdom): esbuild kräver en äkta TextEncoder/Uint8Array-
// invariant som jsdom bryter (känt esbuild-fel i jsdom). Det här testet rör ingen
// DOM, bara ren logik + esbuild-bundling, så node-miljön är rätt här (samma som
// v3-mirror-parity.test.ts).
//
// MIRROR-PARITETSTEST (T90, #183): bevisa att den GENERERADE Deno-mirror:n i
// `supabase/functions/_shared/global-leaderboard-core.ts` ger EXAKT samma utdata som
// src-grafen (`buildGlobalLeaderboard` + den inbäddade statiska planen) för den globala,
// RÄTTVISA topplistan som edge-funktionen kör i prod.
//
// VARFÖR (patterns.md "ren-logik-i-src-speglad..." steg 3 + lessons): mirror:n typas/
// lintas INTE av app-grafen och importeras bara av den @ts-nocheck:ade edge-funktionen
// (som inte körs i CI). Även om mirror:n är GENERERAD (esbuild-bundle, ingen hand-drift)
// kan den drifta från src om någon glömmer regenerera efter en scoring-ändring. Det här
// testet är grinden: vi BUNDLAR samma src-entrypoint färskt OCH laddar den COMMITTADE
// mirror-filen, och kör SAMMA diskriminerande in->ut-assertioner mot BÅDA. En glömd
// regenerering (committad mirror != src) failar i CI i stället för i prod (där edge-
// funktionen skriver en topplista som rangordnar hela tävlingen).

import { build } from 'esbuild';
import { beforeAll, describe, expect, it } from 'vitest';
import type { RoomMatchResult } from '../rooms/rooms-api';
import type { MemberPredictions } from '../../features/leaderboard/aggregate-scores';
import {
  buildGlobalLeaderboard as srcBuild,
  type RawRoomData,
  type SafeGlobalEntry,
  type StaticPlan,
} from './build-global-leaderboard';
import { EMBEDDED_STATIC_PLAN as srcPlan } from './edge-entry';

interface MirrorModule {
  buildGlobalLeaderboard: (
    rooms: readonly RawRoomData[],
    officialResults: readonly RoomMatchResult[],
    plan: StaticPlan
  ) => SafeGlobalEntry[];
  EMBEDDED_STATIC_PLAN: StaticPlan;
}

let mirror: MirrorModule;
let freshBundle: MirrorModule;

/** Bundla en entrypoint till ESM och ladda den som modul via en data:-URL (ingen fil
 * skrivs, ingen node:fs , samma teknik som v3-mirror-parity.test.ts). esbuild LÄSER
 * filen från disk, så att bundla den COMMITTADE mirror-filen testar just det artefakt
 * edge-funktionen deployar. */
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
  // 1) Bundla + ladda den COMMITTADE mirror-filen (det artefakt edge-funktionen deployar).
  mirror = await loadBundled('supabase/functions/_shared/global-leaderboard-core.ts');
  // 2) Bundla src-entrypointen FÄRSKT (samma toolchain som generatorn), så vi också kan
  //    upptäcka om den committade filen blivit STALE mot src (glömd regenerering).
  freshBundle = await loadBundled('src/data/global-leaderboard/edge-entry.ts');
});

/* ------------------------------------------------------------------ *
 * Diskriminerande indata (där FEL logik ger ETT ANNAT svar).
 * ------------------------------------------------------------------ */

function official(matchId: string, h: number, a: number): RoomMatchResult {
  return {
    matchId,
    homeGoals: h,
    awayGoals: a,
    penalties: null,
    status: 'finished',
    updatedBy: '00000000-0000-0000-0000-000000000000',
    updatedAt: '2026-06-15T00:00:00.000Z',
  };
}

function matchPreds(
  userId: string,
  preds: ReadonlyArray<{ matchId: string; homeGoals: number; awayGoals: number }>
): MemberPredictions {
  return {
    userId,
    matchPredictions: preds.map((p) => ({ ...p, userId, updatedAt: '' })),
    groupPredictions: [],
    bracketPredictions: [],
  };
}

function rawRoom(
  roomId: string,
  rows: ReadonlyArray<{ userId: string; displayName: string; preds: MemberPredictions }>
): RawRoomData {
  const predictionsByUser = new Map<string, MemberPredictions>();
  for (const r of rows) {
    predictionsByUser.set(r.userId, r.preds);
  }
  return {
    roomId,
    members: rows.map((r) => ({ userId: r.userId, displayName: r.displayName })),
    predictionsByUser,
  };
}

const OFFICIAL = [official('g-A-1', 2, 1)];
const EXACT = { matchId: 'g-A-1', homeGoals: 2, awayGoals: 1 }; // 3p
const OUTCOME = { matchId: 'g-A-1', homeGoals: 3, awayGoals: 1 }; // rätt 1X2, 1p
const MISS = { matchId: 'g-A-1', homeGoals: 0, awayGoals: 2 }; // 0p

// Diskriminerande fall (FEL logik ger ETT ANNAT svar):
//  - u1: SAMMA poäng (3) i två rum -> skiljer best-room från SUMMA (3, ej 6).
//  - u4: OLIKA poäng i två rum (1p i r1, 3p i r2) -> skiljer en korrekt best-room-SELEKTION
//    (3, det bättre rummet) från en drift som tar fel rum (1) eller summa (4). Bara
//    identiska-poäng-fallet (u1) räcker INTE för att fånga en selektions-drift (då ger
//    rätt och fel rum samma tal). Reviewer-fynd F1, punkt 5.
//  - flera deltagare över flera rum (rangordning + delad rank), tomt rum.
const ROOMS: RawRoomData[] = [
  rawRoom('r1', [
    { userId: 'u1', displayName: 'Alice', preds: matchPreds('u1', [EXACT]) }, // 3p i r1
    { userId: 'u2', displayName: 'Bob', preds: matchPreds('u2', [OUTCOME]) }, // 1p
    { userId: 'u4', displayName: 'Dan', preds: matchPreds('u4', [OUTCOME]) }, // 1p i r1 (sämre)
  ]),
  rawRoom('r2', [
    { userId: 'u1', displayName: 'Alice', preds: matchPreds('u1', [EXACT]) }, // 3p i r2 (best = 3, ej 6)
    { userId: 'u3', displayName: 'Cara', preds: matchPreds('u3', [MISS]) }, // 0p
    { userId: 'u4', displayName: 'Dan', preds: matchPreds('u4', [EXACT]) }, // 3p i r2 (BÄTTRE rum)
  ]),
  rawRoom('r3', []), // tomt rum
];

describe('global-leaderboard mirror-paritet: committad mirror == src (Deno-bundle)', () => {
  it('den inbäddade statiska planen är identisk (lag/grupp/match-antal)', () => {
    expect(mirror.EMBEDDED_STATIC_PLAN.teams.length).toBe(srcPlan.teams.length);
    expect(mirror.EMBEDDED_STATIC_PLAN.groups.length).toBe(srcPlan.groups.length);
    expect(mirror.EMBEDDED_STATIC_PLAN.matches.length).toBe(srcPlan.matches.length);
    // Sanity: planen är icke-tom (bundlingen drog in den källåkrade datan).
    expect(srcPlan.teams.length).toBeGreaterThan(40);
    expect(srcPlan.matches.length).toBeGreaterThan(100);
  });

  it('committad mirror ger IDENTISK global lista som src (fairness + best-room-selektion + rangordning)', () => {
    const src = srcBuild(ROOMS, OFFICIAL, srcPlan);
    const mir = mirror.buildGlobalLeaderboard(ROOMS, OFFICIAL, mirror.EMBEDDED_STATIC_PLAN);
    expect(mir).toEqual(src);
    // Diskriminerande sanity-koll på BÅDA sidorna (mirror OCH src), inte bara mir==src:
    for (const board of [src, mir]) {
      // u1: SAMMA poäng i två rum -> best-room = 3, INTE 6 (summa). Skiljer best-room/summa.
      expect(board.find((e) => e.userId === 'u1')).toMatchObject({ points: 3, rank: 1 });
      // u4: OLIKA poäng (1p i r1, 3p i r2) -> best-room ska VÄLJA det bättre rummet = 3.
      // Detta fall skiljer en korrekt selektion (3) från en drift som tar fel rum (1) eller
      // summerar (4) , identiska-poäng-fallet (u1) ensamt kan inte fånga det (reviewer F1 p5).
      expect(board.find((e) => e.userId === 'u4')).toMatchObject({ points: 3, rank: 1 });
    }
  });

  it('FÄRSK src-bundle == committad mirror (fångar en glömd regenerering)', () => {
    // Om någon ändrat scoring-koden men glömt `npm run gen:global-leaderboard-core` skiljer
    // sig den färska bundlen från den committade filen -> detta rödnar.
    const fresh = freshBundle.buildGlobalLeaderboard(
      ROOMS,
      OFFICIAL,
      freshBundle.EMBEDDED_STATIC_PLAN
    );
    const committedOut = mirror.buildGlobalLeaderboard(
      ROOMS,
      OFFICIAL,
      mirror.EMBEDDED_STATIC_PLAN
    );
    expect(committedOut).toEqual(fresh);
  });

  it('PRIVACY-paritet: mirror returnerar samma SÄKRA fält (inga råa tips)', () => {
    const mir = mirror.buildGlobalLeaderboard(ROOMS, OFFICIAL, mirror.EMBEDDED_STATIC_PLAN);
    for (const row of mir) {
      expect(Object.keys(row).sort()).toEqual(
        ['displayName', 'exactHits', 'points', 'rank', 'userId'].sort()
      );
    }
    expect(JSON.stringify(mir)).not.toContain('matchPredictions');
  });
});
