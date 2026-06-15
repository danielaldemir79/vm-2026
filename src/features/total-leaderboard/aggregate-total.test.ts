// Tester för den GLOBALA (cross-rum) topplistans aggregering + rangordning (T90, #183,
// RÄTTVIS modell). FOKUS: varje deltagare räknas EN gång på sin BÄSTA enskilda rum-poäng
// (antal rum ger INGEN fördel , RÄTTVISE-regeln, ägarens fusk-fix), global rang är korrekt,
// "X:a av N" räknar DISTINKTA deltagare, och edge: deltagare i 0/1/flera rum + delade
// placeringar/tiebreak. Vi bevisar SKARVEN mot den RIKTIGA facit-formen (derivePoolFacit),
// inte bara mot en handgjord PoolFacit-litteral (lessons: bevisa skarven, inte happy-path).
//
// NEGATIV-KONTROLL (befordrad regel "bevisa att testet faktiskt vaktar"): RÄTTVISE-testet
// nedan är diskriminerande , under den GAMLA (buggiga) summa-regeln skulle en deltagare i
// N rum få N gångers poäng, så testet skulle RÖDNA. Verifierat manuellt under bygget genom
// att tillfälligt ändra isBetterRoom-valet till en summa (existing.points += entry.points);
// testet "samma poäng i N rum som i 1 rum" rödnade då (6 != 3), och blev grönt igen när
// best-room-regeln återställdes.

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

/** En medlems tips: bara match-tips (räcker för poäng-logiken). */
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
const OUTCOME = { matchId: 'g-A-1', homeGoals: 3, awayGoals: 1 }; // rätt 1X2, 1p
const MISS = { matchId: 'g-A-1', homeGoals: 0, awayGoals: 2 }; // fel utfall, 0p

/* ------------------------------------------------------------------ *
 * RÄTTVISA: antal rum ger INGEN fördel (kärnan i T90, ägarens fusk-fix).
 * ------------------------------------------------------------------ */

describe('buildTotalLeaderboard, RÄTTVIS modell (bästa rum, ingen rum-antals-fördel)', () => {
  it('en deltagare med IDENTISKA tips i N rum får SAMMA poäng som i 1 rum (diskriminerande mot summa-buggen)', () => {
    // u1 tippar EXAKT (3p) i två rum. RÄTTVIST: global poäng = 3 (bästa rum), INTE 6 (summa).
    // Detta är den befordrade negativ-kontrollens diskriminerande fall: under den GAMLA
    // summa-regeln hade points blivit 6 -> testet rödnat. Best-room ger 3.
    const twoRooms: RoomContribution[] = [
      room('r1', [{ member: member('u1', 'Alice'), preds: matchPreds('u1', [EXACT]) }]),
      room('r2', [{ member: member('u1', 'Alice'), preds: matchPreds('u1', [EXACT]) }]),
    ];
    const oneRoom: RoomContribution[] = [
      room('r1', [{ member: member('u1', 'Alice'), preds: matchPreds('u1', [EXACT]) }]),
    ];
    const totalTwo = buildTotalLeaderboard(twoRooms, FACIT);
    const totalOne = buildTotalLeaderboard(oneRoom, FACIT);
    expect(totalTwo).toHaveLength(1); // EN distinkt deltagare, oavsett rum-antal
    expect(totalTwo[0]).toMatchObject({ userId: 'u1', points: 3, exactHits: 1 });
    // Samma poäng som i ett enda rum , antal rum gav ingen fördel.
    expect(totalTwo[0].points).toBe(totalOne[0].points);
  });

  it('väljer det BÄSTA rummet när en deltagare presterar olika i olika rum', () => {
    // u1: miss (0p) i r1, exakt (3p) i r2 -> global = 3 (bästa). u2: outcome (1p) i ett rum.
    const rooms: RoomContribution[] = [
      room('r1', [{ member: member('u1', 'Alice'), preds: matchPreds('u1', [MISS]) }]),
      room('r2', [
        { member: member('u1', 'Alice'), preds: matchPreds('u1', [EXACT]) },
        { member: member('u2', 'Bob'), preds: matchPreds('u2', [OUTCOME]) },
      ]),
    ];
    const total = buildTotalLeaderboard(rooms, FACIT);
    expect(total.find((e) => e.userId === 'u1')).toMatchObject({ points: 3, exactHits: 1 });
    expect(total.find((e) => e.userId === 'u2')).toMatchObject({ points: 1 });
  });

  it('bästa rum bryts på fler EXAKTA träffar vid lika poäng (samma kvalitets-prioritet som rangordningen)', () => {
    // Facit: tre avgjorda matcher. I r1 tippar u1 3 x rätt utfall (1+1+1 = 3p, 0 exakta).
    // I r2 tippar u1 1 x exakt + 0 på resten (3p, 1 exakt). Samma poäng (3) i båda rummen,
    // men r2 har fler exakta -> "bästa rum" ska välja r2 (exactHits 1), inte r1 (exactHits 0).
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
          member: member('u1', 'Alice'),
          preds: matchPreds('u1', [
            { matchId: 'g-A-1', homeGoals: 5, awayGoals: 1 }, // rätt utfall (home), ej exakt
            { matchId: 'g-A-2', homeGoals: 4, awayGoals: 0 }, // rätt utfall (home), ej exakt
            { matchId: 'g-A-3', homeGoals: 2, awayGoals: 2 }, // rätt utfall (draw), ej exakt
          ]),
        },
      ]),
      room('r2', [
        {
          member: member('u1', 'Alice'),
          preds: matchPreds('u1', [{ matchId: 'g-A-1', homeGoals: 2, awayGoals: 1 }]), // exakt
        },
      ]),
    ];
    const total = buildTotalLeaderboard(rooms, matchFacit);
    // Bästa rum = r2: samma 3p men 1 exakt (mot r1:s 0). Global rad bär exactHits 1.
    expect(total[0]).toMatchObject({ userId: 'u1', points: 3, exactHits: 1 });
  });
});

/* ------------------------------------------------------------------ *
 * Global rangordning på bästa-rum-poängen.
 * ------------------------------------------------------------------ */

describe('buildTotalLeaderboard, global rangordning', () => {
  it('rangordnar deltagare GLOBALT på bästa-rum-poängen, delad rank vid lika', () => {
    // u1: 3p (bästa rum). u2: 1p (bästa). u3: 3p (bästa).
    const rooms: RoomContribution[] = [
      room('r1', [
        { member: member('u1', 'Alice'), preds: matchPreds('u1', [EXACT]) },
        { member: member('u2', 'Bob'), preds: matchPreds('u2', [OUTCOME]) },
      ]),
      room('r2', [
        { member: member('u2', 'Bob'), preds: matchPreds('u2', [MISS]) }, // sämre rum, ignoreras
        { member: member('u3', 'Cara'), preds: matchPreds('u3', [EXACT]) },
      ]),
    ];
    const total = buildTotalLeaderboard(rooms, FACIT);
    // u1 (3p) och u3 (3p) delar topp (alfabetiskt Alice före Cara), u2 (1p) sist på pos 3.
    expect(total.map((e) => [e.userId, e.points, e.rank])).toEqual([
      ['u1', 3, 1],
      ['u3', 3, 1],
      ['u2', 1, 3], // 1224-stil: två 1:or -> nästa distinkta poäng på absolut position 3
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * Tiebreak vid HELT lika (poäng + exactHits) -> alfabetiskt namn, DELAD rank.
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
    expect(total.map((e) => [e.displayName, e.rank])).toEqual([
      ['Ann', 1],
      ['Zeb', 1],
    ]);
  });

  it('fler exactHits bryter sorterings-ordningen men inte den delade poäng-ranken', () => {
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
          // 1 x exakt (3p, 1 exakt).
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
    expect(total[0]).toMatchObject({ userId: 'u1', points: 3 });
  });

  it('en medlem UTAN tips räknas (0p) och finns i listan', () => {
    const rooms: RoomContribution[] = [
      room('r1', [
        { member: member('u1', 'Alice'), preds: matchPreds('u1', [EXACT]) },
        { member: member('u2', 'Bob'), preds: emptyPreds('u2') },
      ]),
    ];
    const total = buildTotalLeaderboard(rooms, FACIT);
    expect(total).toHaveLength(2);
    expect(total.find((e) => e.userId === 'u2')).toMatchObject({ points: 0 });
  });

  it('en deltagare med 0p i ALLA sina rum finns kvar (bästa rum = 0p)', () => {
    const rooms: RoomContribution[] = [
      room('r1', [{ member: member('u1', 'Alice'), preds: matchPreds('u1', [MISS]) }]),
      room('r2', [{ member: member('u1', 'Alice'), preds: matchPreds('u1', [MISS]) }]),
    ];
    const total = buildTotalLeaderboard(rooms, FACIT);
    expect(total).toHaveLength(1);
    expect(total[0]).toMatchObject({ userId: 'u1', points: 0 });
  });
});

/* ------------------------------------------------------------------ *
 * "Din placering" (X:a av N) , N = distinkta deltagare.
 * ------------------------------------------------------------------ */

describe('deriveTotalSelfSummary', () => {
  it('ger rätt rang + bästa-rum-poäng + N (distinkta deltagare) för en deltagare i flera rum', () => {
    const rooms: RoomContribution[] = [
      room('r1', [
        { member: member('me', 'Daniel'), preds: matchPreds('me', [EXACT]) }, // 3p (bästa)
        { member: member('u2', 'Bob'), preds: matchPreds('u2', [OUTCOME]) },
      ]),
      room('r2', [
        { member: member('me', 'Daniel'), preds: matchPreds('me', [OUTCOME]) }, // 1p (sämre)
        { member: member('u3', 'Cara'), preds: matchPreds('u3', [MISS]) },
      ]),
    ];
    const total = buildTotalLeaderboard(rooms, FACIT);
    const summary = deriveTotalSelfSummary(total, 'me');
    // me: bästa rum = 3p, klar 1:a. N = 3 distinkta (me, u2, u3). Ingen roomCount längre.
    expect(summary).toEqual({ points: 3, rank: 1, totalParticipants: 3 });
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
  it('väljer bästa rum-poäng cross-rum mot ett facit härlett ur en spelad match', () => {
    const first = fixtureMatches.find((m) => m.id === 'g-A-1');
    expect(first).toBeDefined();
    const finished: Match = {
      ...first!,
      status: 'finished',
      result: { homeGoals: 2, awayGoals: 1 },
    };
    const facit = derivePoolFacit(fixtureTeams, [], [finished]);
    // me tippar exakt i båda rummen -> bästa rum = 3p (INTE 6, ingen summa). bot tippar fel.
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
    expect(total.find((e) => e.userId === 'me')).toMatchObject({ points: 3 });
    expect(total.find((e) => e.userId === 'bot1')).toMatchObject({ points: 0 });
  });
});
