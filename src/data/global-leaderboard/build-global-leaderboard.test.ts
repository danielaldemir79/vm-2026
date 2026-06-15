// Tester för server-side bygget av den globala, rättvisa topplistan (T90, #183).
// FOKUS (acceptanskriterier):
//   * RÄTTVISA: ingen rum-antals-fördel (samma poäng i N rum som i 1) , server-vägen.
//   * PRIVACY: returvärdet bär BARA (userId, displayName, points, rank, exactHits) ,
//     ALDRIG en rå tips-rad, fast indata bär rika råa tips.
//   * EKVIVALENS: server-bygget == den DELADE TS-motorn (buildTotalLeaderboard mot
//     samma derivePoolFacit) , ingen divergerande motor.
//   * Edge: tomma rum / deltagare i 0 rum / inga officiella resultat.
// Vi matar RIKTIG facit-form (derivePoolFacit via buildGlobalFacit), inte en litteral
// (lessons: bevisa skarven). Negativ-kontroll på fairness-regeln ligger i
// aggregate-total.test.ts (samma buildTotalLeaderboard).

import { describe, expect, it } from 'vitest';
import type { RoomMatchResult } from '../rooms';
import type { MemberPredictions } from '../../features/leaderboard';
import { derivePoolFacit, buildLeaderboard } from '../../features/leaderboard';
import { fixtureTeams, fixtureGroups, fixtureMatches } from '../index';
import { applyRoomResults } from '../../features/results';
import {
  buildTotalLeaderboard,
  type RoomContribution,
} from '../../features/total-leaderboard/aggregate-total';
import {
  buildGlobalLeaderboard,
  buildGlobalFacit,
  type RawRoomData,
  type StaticPlan,
} from './build-global-leaderboard';

/* ------------------------------------------------------------------ *
 * Hjälpare.
 * ------------------------------------------------------------------ */

const PLAN: StaticPlan = { teams: fixtureTeams, groups: fixtureGroups, matches: fixtureMatches };

/** Ett officiellt resultat (facit-källa) i RoomMatchResult-form (samma som DB-projektionen). */
function officialResult(matchId: string, homeGoals: number, awayGoals: number): RoomMatchResult {
  return {
    matchId,
    homeGoals,
    awayGoals,
    penalties: null,
    status: 'finished',
    updatedBy: '00000000-0000-0000-0000-000000000000',
    updatedAt: '2026-06-15T00:00:00.000Z',
  };
}

/** En medlems match-tips i MemberPredictions-form (källans schema). */
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

/** Bygg ett RawRoomData ur (userId, namn, tips)-rader. */
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

// g-A-1 = 2-1 (exakt 3p, rätt utfall 1p).
const OFFICIAL = [officialResult('g-A-1', 2, 1)];
const EXACT = { matchId: 'g-A-1', homeGoals: 2, awayGoals: 1 }; // 3p
const OUTCOME = { matchId: 'g-A-1', homeGoals: 3, awayGoals: 1 }; // 1p
const MISS = { matchId: 'g-A-1', homeGoals: 0, awayGoals: 2 }; // 0p

/* ------------------------------------------------------------------ *
 * RÄTTVISA (server-vägen): antal rum ger ingen fördel.
 * ------------------------------------------------------------------ */

describe('buildGlobalLeaderboard, RÄTTVIS modell (server-side)', () => {
  it('en deltagare med IDENTISKA tips i N rum får SAMMA poäng som i 1 rum', () => {
    const twoRooms: RawRoomData[] = [
      rawRoom('r1', [{ userId: 'u1', displayName: 'Alice', preds: matchPreds('u1', [EXACT]) }]),
      rawRoom('r2', [{ userId: 'u1', displayName: 'Alice', preds: matchPreds('u1', [EXACT]) }]),
    ];
    const oneRoom: RawRoomData[] = [
      rawRoom('r1', [{ userId: 'u1', displayName: 'Alice', preds: matchPreds('u1', [EXACT]) }]),
    ];
    const totalTwo = buildGlobalLeaderboard(twoRooms, OFFICIAL, PLAN);
    const totalOne = buildGlobalLeaderboard(oneRoom, OFFICIAL, PLAN);
    expect(totalTwo).toHaveLength(1);
    expect(totalTwo[0]).toMatchObject({ userId: 'u1', points: 3, exactHits: 1, rank: 1 });
    expect(totalTwo[0].points).toBe(totalOne[0].points); // ingen rum-antals-fördel
  });

  it('omfattar ALLA deltagare i ALLA rum (inte bara ett rum)', () => {
    const rooms: RawRoomData[] = [
      rawRoom('r1', [{ userId: 'u1', displayName: 'Alice', preds: matchPreds('u1', [EXACT]) }]),
      rawRoom('r2', [{ userId: 'u2', displayName: 'Bob', preds: matchPreds('u2', [OUTCOME]) }]),
      rawRoom('r3', [{ userId: 'u3', displayName: 'Cara', preds: matchPreds('u3', [MISS]) }]),
    ];
    const total = buildGlobalLeaderboard(rooms, OFFICIAL, PLAN);
    expect(total.map((e) => e.userId).sort()).toEqual(['u1', 'u2', 'u3']);
  });
});

/* ------------------------------------------------------------------ *
 * PRIVACY: returvärdet läcker ALDRIG råa tips.
 * ------------------------------------------------------------------ */

describe('buildGlobalLeaderboard, PRIVACY (inga råa tips i utdatan)', () => {
  it('returnerar BARA säkra fält (userId, displayName, points, rank, exactHits), inga tips', () => {
    // Indata bär RIKA råa tips (match + grupp + bracket). Utdatan får inte bära NÅGOT av det.
    const richPreds: MemberPredictions = {
      userId: 'u1',
      matchPredictions: [
        { matchId: 'g-A-1', userId: 'u1', homeGoals: 2, awayGoals: 1, updatedAt: '' },
      ],
      groupPredictions: [
        // @ts-expect-error TeamCode är branded; för testet räcker rå sträng (vi testar bara att
        // INGET av detta läcker till utdatan, inte poängsättningen av grupp-tipset).
        { groupId: 'A', userId: 'u1', winnerTeamId: 'BRA', runnerUpTeamId: 'ARG', updatedAt: '' },
      ],
      bracketPredictions: [
        // @ts-expect-error branded TeamCode, se ovan.
        { slotId: 'champion', userId: 'u1', advancingTeamId: 'BRA', updatedAt: '' },
      ],
    };
    const rooms: RawRoomData[] = [
      rawRoom('r1', [{ userId: 'u1', displayName: 'Alice', preds: richPreds }]),
    ];
    const total = buildGlobalLeaderboard(rooms, OFFICIAL, PLAN);

    expect(total).toHaveLength(1);
    // EXAKT dessa nycklar, inget mer (ingen matchPredictions/homeGoals/winnerTeamId/...).
    expect(Object.keys(total[0]).sort()).toEqual(
      ['displayName', 'exactHits', 'points', 'rank', 'userId'].sort()
    );
    // Defensivt: ingen serialiserad utdata får innehålla tips-fält-namn eller mål-värden.
    const serialized = JSON.stringify(total);
    for (const leaked of [
      'matchPredictions',
      'groupPredictions',
      'bracketPredictions',
      'homeGoals',
      'awayGoals',
      'winnerTeamId',
      'advancingTeamId',
    ]) {
      expect(serialized).not.toContain(leaked);
    }
  });
});

/* ------------------------------------------------------------------ *
 * EKVIVALENS: server-bygget == den DELADE TS-motorn (ingen divergerande motor).
 * ------------------------------------------------------------------ */

describe('buildGlobalLeaderboard, EKVIVALENS med den delade TS-motorn', () => {
  it('ger IDENTISK rangordning som buildTotalLeaderboard mot samma derivePoolFacit', () => {
    const rows: RawRoomData[] = [
      rawRoom('r1', [
        { userId: 'u1', displayName: 'Alice', preds: matchPreds('u1', [EXACT]) },
        { userId: 'u2', displayName: 'Bob', preds: matchPreds('u2', [OUTCOME]) },
      ]),
      rawRoom('r2', [
        { userId: 'u2', displayName: 'Bob', preds: matchPreds('u2', [MISS]) },
        { userId: 'u3', displayName: 'Cara', preds: matchPreds('u3', [EXACT]) },
      ]),
    ];
    const server = buildGlobalLeaderboard(rows, OFFICIAL, PLAN);

    // Bygg referens-resultatet DIREKT med den delade motorn (samma facit-kedja).
    const woven = applyRoomResults([...fixtureMatches], [...OFFICIAL]);
    const facit = derivePoolFacit(fixtureTeams, fixtureGroups, woven);
    const contributions: RoomContribution[] = rows.map((r) => ({
      roomId: r.roomId,
      members: [...r.members],
      predictionsByUser: r.predictionsByUser,
    }));
    const reference = buildTotalLeaderboard(contributions, facit).map((e) => ({
      userId: e.userId,
      displayName: e.displayName,
      points: e.points,
      rank: e.rank,
      exactHits: e.exactHits,
    }));

    expect(server).toEqual(reference);
  });

  it('buildGlobalFacit ger samma facit som den direkta derivePoolFacit-kedjan (facit-skarven)', () => {
    const fromHelper = buildGlobalFacit(PLAN, OFFICIAL);
    const direct = derivePoolFacit(
      fixtureTeams,
      fixtureGroups,
      applyRoomResults([...fixtureMatches], [...OFFICIAL])
    );
    expect(fromHelper).toEqual(direct);
    // Sanity: g-A-1 ÄR i facit (vävningen + härledningen fungerade), inte tom.
    expect(fromHelper.matches.find((m) => m.matchId === 'g-A-1')).toMatchObject({
      actual: { homeGoals: 2, awayGoals: 1 },
    });
  });
});

/* ------------------------------------------------------------------ *
 * Edge-fall.
 * ------------------------------------------------------------------ */

describe('buildGlobalLeaderboard, edge-fall', () => {
  it('inga rum ger tom lista', () => {
    expect(buildGlobalLeaderboard([], OFFICIAL, PLAN)).toEqual([]);
  });

  it('inga officiella resultat -> alla 0p men ALLA deltagare rankas (delad 1:a)', () => {
    const rooms: RawRoomData[] = [
      rawRoom('r1', [{ userId: 'u1', displayName: 'Alice', preds: matchPreds('u1', [EXACT]) }]),
      rawRoom('r2', [{ userId: 'u2', displayName: 'Bob', preds: matchPreds('u2', [EXACT]) }]),
    ];
    const total = buildGlobalLeaderboard(rooms, [], PLAN);
    expect(total).toHaveLength(2);
    expect(total.every((e) => e.points === 0 && e.rank === 1)).toBe(true);
  });

  it('en deltagare bara i ett tomt rum (inga medlemsrader) syns inte; övriga rankas', () => {
    const rooms: RawRoomData[] = [
      rawRoom('r1', [{ userId: 'u1', displayName: 'Alice', preds: matchPreds('u1', [EXACT]) }]),
      rawRoom('r2', []), // tomt rum
    ];
    const total = buildGlobalLeaderboard(rooms, OFFICIAL, PLAN);
    expect(total.map((e) => e.userId)).toEqual(['u1']);
  });

  // Korsläsning mot per-rums-motorn: server-radens poäng för en deltagare i ETT rum ska
  // vara EXAKT vad buildLeaderboard ger för det rummet (samma motor, ingen omräkning).
  it('en deltagares server-poäng matchar per-rums buildLeaderboard för samma rum', () => {
    const preds = matchPreds('u1', [OUTCOME]); // 1p
    const rooms: RawRoomData[] = [rawRoom('r1', [{ userId: 'u1', displayName: 'Alice', preds }])];
    const facit = buildGlobalFacit(PLAN, OFFICIAL);
    const perRoom = buildLeaderboard(
      [{ userId: 'u1', displayName: 'Alice' }],
      rooms[0].predictionsByUser,
      facit
    );
    const server = buildGlobalLeaderboard(rooms, OFFICIAL, PLAN);
    expect(server[0].points).toBe(perRoom[0].points);
    expect(server[0].points).toBe(1);
  });
});
