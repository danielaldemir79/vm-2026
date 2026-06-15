// Tester för den TOTALA (cross-rum) topplistans aggregering + rangordning (T82 del 3,
// #173). FOKUS: en deltagares poäng SUMMERAS över ALLA rum, global rang är korrekt,
// "X:a av N" räknar DISTINKTA deltagare, och edge: deltagare i 0/1/flera rum + delade
// placeringar/tiebreak. Vi bevisar SKARVEN mot den RIKTIGA facit-formen (derivePoolFacit),
// inte bara mot en handgjord PoolFacit-litteral (lessons: bevisa skarven, inte happy-path).

import { describe, expect, it } from 'vitest';
import type { RoomMember } from '../../data/rooms';
import type { Match } from '../../domain/types';
import type { MemberPredictions, PoolFacit } from '../leaderboard';
import { derivePoolFacit } from '../leaderboard';
import {
  buildTotalLeaderboard,
  deriveTotalSelfSummary,
  type RoomContribution,
} from './aggregate-total';
import { fixtureTeams, fixtureMatches } from '../../data';

/* ------------------------------------------------------------------ *
 * Hjälpare.
 * ------------------------------------------------------------------ */

function member(userId: string, displayName: string): RoomMember {
  return { userId, displayName };
}

/** Ett rum-bidrag ur en lista (userId, namn, tips) , kortform för testen. */
function room(
  roomId: string,
  rows: ReadonlyArray<{ member: RoomMember; preds: MemberPredictions }>
): RoomContribution {
  const predictionsByUser = new Map<string, MemberPredictions>();
  for (const r of rows) {
    predictionsByUser.set(r.member.userId, r.preds);
  }
  return {
    roomId,
    members: rows.map((r) => r.member),
    predictionsByUser,
  };
}

/** En medlems tips: bara match-tips (räcker för poäng-summans logik). */
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

/** Tom medlem (inga tips). */
function emptyPreds(userId: string): MemberPredictions {
  return { userId, matchPredictions: [], groupPredictions: [], bracketPredictions: [] };
}

// Ett litet facit: en avgjord match g-A-1 = 2-1 (exakt = 3p, rätt utfall = 1p).
const FACIT: PoolFacit = {
  matches: [{ matchId: 'g-A-1', actual: { homeGoals: 2, awayGoals: 1 } }],
  groups: [],
  bracketSlots: [],
  champion: null,
};

const EXACT = { matchId: 'g-A-1', homeGoals: 2, awayGoals: 1 }; // 3p
const OUTCOME = { matchId: 'g-A-1', homeGoals: 3, awayGoals: 1 }; // rätt 1, 1p
const MISS = { matchId: 'g-A-1', homeGoals: 0, awayGoals: 2 }; // fel utfall, 0p

/* ------------------------------------------------------------------ *
 * Summering över rum (kärnan).
 * ------------------------------------------------------------------ */

describe('buildTotalLeaderboard, summa över ALLA rum', () => {
  it('summerar en deltagares poäng från FLERA rum (samma match tippad i båda räknas i båda)', () => {
    // u1 är med i två rum och tippar EXAKT (3p) i båda -> totalen ska bli 6, inte 3.
    const rooms: RoomContribution[] = [
      room('r1', [{ member: member('u1', 'Alice'), preds: matchPreds('u1', [EXACT]) }]),
      room('r2', [{ member: member('u1', 'Alice'), preds: matchPreds('u1', [EXACT]) }]),
    ];
    const total = buildTotalLeaderboard(rooms, FACIT);
    expect(total).toHaveLength(1); // EN distinkt deltagare
    expect(total[0]).toMatchObject({ userId: 'u1', points: 6, roomCount: 2 });
  });

  it('rangordnar deltagare GLOBALT på den summerade totalen', () => {
    // u1: 3p (ett rum). u2: 1p+1p = 2p (två rum). u3: 3p (ett rum).
    const rooms: RoomContribution[] = [
      room('r1', [
        { member: member('u1', 'Alice'), preds: matchPreds('u1', [EXACT]) },
        { member: member('u2', 'Bob'), preds: matchPreds('u2', [OUTCOME]) },
      ]),
      room('r2', [
        { member: member('u2', 'Bob'), preds: matchPreds('u2', [OUTCOME]) },
        { member: member('u3', 'Cara'), preds: matchPreds('u3', [EXACT]) },
      ]),
    ];
    const total = buildTotalLeaderboard(rooms, FACIT);
    // u1 (3p) och u3 (3p) delar topp, u2 (2p) sist.
    expect(total.map((e) => [e.userId, e.points, e.rank])).toEqual([
      ['u1', 3, 1], // alfabetiskt före u3 vid lika poäng+exactHits (tiebreak: namn)
      ['u3', 3, 1], // delad 1:a
      ['u2', 2, 3], // 1224-stil: nästa distinkta poäng hoppar till absolut position 3
    ]);
  });

  it('räknar exactHits summerat över rum (tiebreak-måttet ärvs)', () => {
    // u1: exakt i två rum -> 6p, 2 exactHits. u2: exakt + outcome -> 4p.
    const rooms: RoomContribution[] = [
      room('r1', [
        { member: member('u1', 'Alice'), preds: matchPreds('u1', [EXACT]) },
        { member: member('u2', 'Bob'), preds: matchPreds('u2', [EXACT]) },
      ]),
      room('r2', [
        { member: member('u1', 'Alice'), preds: matchPreds('u1', [EXACT]) },
        { member: member('u2', 'Bob'), preds: matchPreds('u2', [OUTCOME]) },
      ]),
    ];
    const total = buildTotalLeaderboard(rooms, FACIT);
    expect(total[0]).toMatchObject({ userId: 'u1', points: 6, exactHits: 2 });
    expect(total[1]).toMatchObject({ userId: 'u2', points: 4, exactHits: 1 });
  });
});

/* ------------------------------------------------------------------ *
 * Tiebreak vid HELT lika (poäng + exactHits) -> alfabetiskt namn.
 * ------------------------------------------------------------------ */

describe('buildTotalLeaderboard, tiebreak + delad placering', () => {
  it('helt lika (poäng + exactHits) sorteras alfabetiskt men DELAR rank', () => {
    const rooms: RoomContribution[] = [
      room('r1', [
        { member: member('uZ', 'Zeb'), preds: matchPreds('uZ', [EXACT]) },
        { member: member('uA', 'Ann'), preds: matchPreds('uA', [EXACT]) },
      ]),
    ];
    const total = buildTotalLeaderboard(rooms, FACIT);
    // Båda 3p + 1 exactHit -> samma rank 1, alfabetisk ordning Ann före Zeb.
    expect(total.map((e) => [e.displayName, e.rank])).toEqual([
      ['Ann', 1],
      ['Zeb', 1],
    ]);
  });

  it('fler exactHits bryter sorterings-ordningen men inte den delade poäng-ranken', () => {
    // Konstruera lika TOTAL men olika exactHits: omöjligt med en match, så använd en
    // deltagare med outcome x3 (3p, 0 exactHits) mot en med exakt x1 (3p, 1 exactHit).
    const matchFacit: PoolFacit = {
      matches: [
        { matchId: 'g-A-1', actual: { homeGoals: 2, awayGoals: 1 } },
        { matchId: 'g-A-2', actual: { homeGoals: 1, awayGoals: 0 } },
        { matchId: 'g-A-3', actual: { homeGoals: 0, awayGoals: 0 } },
      ],
      groups: [],
      bracketSlots: [],
      champion: null,
    };
    const rooms: RoomContribution[] = [
      room('r1', [
        {
          // 3 x rätt utfall (1+1+1 = 3p, 0 exakta).
          member: member('uOut', 'Out'),
          preds: matchPreds('uOut', [
            { matchId: 'g-A-1', homeGoals: 5, awayGoals: 1 },
            { matchId: 'g-A-2', homeGoals: 4, awayGoals: 0 },
            { matchId: 'g-A-3', homeGoals: 2, awayGoals: 2 },
          ]),
        },
        {
          // 1 x exakt (3p, 1 exakt), inget på de andra.
          member: member('uEx', 'Ex'),
          preds: matchPreds('uEx', [{ matchId: 'g-A-1', homeGoals: 2, awayGoals: 1 }]),
        },
      ]),
    ];
    const total = buildTotalLeaderboard(rooms, matchFacit);
    // Båda 3p -> DELAR rank 1; men uEx (1 exakt) sorteras FÖRE uOut (0 exakta).
    expect(total.map((e) => [e.userId, e.points, e.exactHits, e.rank])).toEqual([
      ['uEx', 3, 1, 1],
      ['uOut', 3, 0, 1],
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * Edge: deltagare i 0/1/flera rum, tomma rum, medlem utan tips.
 * ------------------------------------------------------------------ */

describe('buildTotalLeaderboard, edge-fall', () => {
  it('tom lista av rum ger tom total', () => {
    expect(buildTotalLeaderboard([], FACIT)).toEqual([]);
  });

  it('ett tomt rum (inga medlemmar) bidrar med inget', () => {
    const rooms: RoomContribution[] = [
      room('r1', [{ member: member('u1', 'Alice'), preds: matchPreds('u1', [EXACT]) }]),
      room('r2', []),
    ];
    const total = buildTotalLeaderboard(rooms, FACIT);
    expect(total).toHaveLength(1);
    expect(total[0]).toMatchObject({ userId: 'u1', roomCount: 1 });
  });

  it('en medlem UTAN tips räknas (0p) och med i N', () => {
    const rooms: RoomContribution[] = [
      room('r1', [
        { member: member('u1', 'Alice'), preds: matchPreds('u1', [EXACT]) },
        { member: member('u2', 'Bob'), preds: emptyPreds('u2') },
      ]),
    ];
    const total = buildTotalLeaderboard(rooms, FACIT);
    expect(total).toHaveLength(2);
    expect(total.find((e) => e.userId === 'u2')).toMatchObject({ points: 0, roomCount: 1 });
  });

  it('en miss-tippare får 0p men finns kvar i totalen', () => {
    const rooms: RoomContribution[] = [
      room('r1', [{ member: member('u1', 'Alice'), preds: matchPreds('u1', [MISS]) }]),
    ];
    const total = buildTotalLeaderboard(rooms, FACIT);
    expect(total[0]).toMatchObject({ userId: 'u1', points: 0 });
  });
});

/* ------------------------------------------------------------------ *
 * "Din placering" (X:a av N) , N = distinkta deltagare.
 * ------------------------------------------------------------------ */

describe('deriveTotalSelfSummary', () => {
  it('ger rätt rang + total + N (distinkta deltagare) för en deltagare i flera rum', () => {
    const rooms: RoomContribution[] = [
      room('r1', [
        { member: member('me', 'Daniel'), preds: matchPreds('me', [EXACT]) },
        { member: member('u2', 'Bob'), preds: matchPreds('u2', [OUTCOME]) },
      ]),
      room('r2', [
        { member: member('me', 'Daniel'), preds: matchPreds('me', [OUTCOME]) },
        { member: member('u3', 'Cara'), preds: matchPreds('u3', [MISS]) },
      ]),
    ];
    const total = buildTotalLeaderboard(rooms, FACIT);
    const summary = deriveTotalSelfSummary(total, 'me');
    // me: 3 + 1 = 4p, klar 1:a. N = 3 distinkta (me, u2, u3). roomCount 2.
    expect(summary).toEqual({ points: 4, rank: 1, totalParticipants: 3, roomCount: 2 });
  });

  it('null utan känd identitet', () => {
    const total = buildTotalLeaderboard(
      [room('r1', [{ member: member('u1', 'Alice'), preds: matchPreds('u1', [EXACT]) }])],
      FACIT
    );
    expect(deriveTotalSelfSummary(total, null)).toBeNull();
  });

  it('null om identiteten inte finns i totalen', () => {
    const total = buildTotalLeaderboard(
      [room('r1', [{ member: member('u1', 'Alice'), preds: matchPreds('u1', [EXACT]) }])],
      FACIT
    );
    expect(deriveTotalSelfSummary(total, 'someone-else')).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * SKARVEN mot RIKTIG facit-form (derivePoolFacit), inte en handgjord litteral.
 * Bevisar att aggregeringen + poäng-motorn fungerar mot facit härlett ur en RIKTIG
 * matchlista , den otestade live-grenen i lessons. (Bevisa skarven, inte happy-path.)
 * ------------------------------------------------------------------ */

describe('buildTotalLeaderboard mot derivePoolFacit (riktig facit-form)', () => {
  it('summerar match-poäng cross-rum mot ett facit härlett ur en spelad match', () => {
    // Återanvänd den RIKTIGA matchplanen (fixtureMatches) och markera den FÖRSTA
    // grupp-A-matchen som avgjord 2-1. Då härleds facit ur den verkliga matchformen
    // (samma form live-datan väver in), inte ur en handgjord litteral.
    const first = fixtureMatches.find((m) => m.id === 'g-A-1');
    expect(first).toBeDefined();
    const finished: Match = {
      ...first!,
      status: 'finished',
      result: { homeGoals: 2, awayGoals: 1 },
    };
    const facit = derivePoolFacit(fixtureTeams, [], [finished]);
    // Två rum: me tippar exakt i båda (3 + 3 = 6); en bot tippar fel (0p).
    const rooms: RoomContribution[] = [
      room('r1', [
        {
          member: member('me', 'Daniel'),
          preds: matchPreds('me', [{ matchId: 'g-A-1', homeGoals: 2, awayGoals: 1 }]),
        },
        {
          member: member('bot1', 'Bot'),
          preds: matchPreds('bot1', [{ matchId: 'g-A-1', homeGoals: 0, awayGoals: 0 }]),
        },
      ]),
      room('r2', [
        {
          member: member('me', 'Daniel'),
          preds: matchPreds('me', [{ matchId: 'g-A-1', homeGoals: 2, awayGoals: 1 }]),
        },
      ]),
    ];
    const total = buildTotalLeaderboard(rooms, facit);
    expect(total[0]).toMatchObject({ userId: 'me', points: 6, roomCount: 2 });
    expect(total.find((e) => e.userId === 'bot1')).toMatchObject({ points: 0, roomCount: 1 });
  });
});
