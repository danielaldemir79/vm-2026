// Tester för JOKER-dubblingen i poäng-aggregeringen (T19, #19). FOKUS: en joker-match
// dubblar sin MATCH-poäng (och bara den), summan==delarna-invarianten består, miss×2=0,
// och en medlem UTAN joker poängsätts oförändrat (bakåtkompatibelt).

import { describe, expect, it } from 'vitest';
import type { RoomMember } from '../../data/rooms';
import { asTeamCode, type TeamCode } from '../../domain/team-code';
import {
  buildLeaderboard,
  scoreMemberBreakdown,
  JOKER_MULTIPLIER,
  type MemberPredictions,
} from './aggregate-scores';
import type { PoolFacit } from './derive-facit';

function code(c: string): TeamCode {
  return asTeamCode(c);
}
function member(userId: string, displayName: string): RoomMember {
  return { userId, displayName };
}

// Facit: två avgjorda matcher (g-A-1 = 2-1, g-A-2 = 0-0) + en grupp (5p möjligt).
const FACIT: PoolFacit = {
  matches: [
    { matchId: 'g-A-1', actual: { homeGoals: 2, awayGoals: 1 } },
    { matchId: 'g-A-2', actual: { homeGoals: 0, awayGoals: 0 } },
  ],
  groups: [{ groupId: 'A', actual: { winnerTeamId: code('MEX'), runnerUpTeamId: code('KOR') } }],
  bracketSlots: [],
  champion: null,
};

/** Bygg en medlem med två exakt-rätt match-tips + ett rätt grupp-tips. */
function predsWithJoker(jokerMatchIds?: ReadonlySet<string>): Map<string, MemberPredictions> {
  return new Map<string, MemberPredictions>([
    [
      'u1',
      {
        userId: 'u1',
        matchPredictions: [
          { matchId: 'g-A-1', userId: 'u1', homeGoals: 2, awayGoals: 1, updatedAt: '' }, // exakt 3p
          { matchId: 'g-A-2', userId: 'u1', homeGoals: 0, awayGoals: 0, updatedAt: '' }, // exakt 3p
        ],
        groupPredictions: [
          {
            groupId: 'A',
            userId: 'u1',
            winnerTeamId: code('MEX'),
            runnerUpTeamId: code('KOR'),
            updatedAt: '',
          },
        ],
        bracketPredictions: [],
        jokerMatchIds,
      },
    ],
  ]);
}

describe('joker dubblar match-poängen i aggregeringen', () => {
  it('UTAN joker: 3 + 3 (match) + 5 (grupp) = 11', () => {
    const board = buildLeaderboard([member('u1', 'Anna')], predsWithJoker(), FACIT);
    expect(board[0].points).toBe(11);
  });

  it('MED joker på g-A-1: den matchens 3p DUBBLAS (6), totalt 6 + 3 + 5 = 14', () => {
    const board = buildLeaderboard(
      [member('u1', 'Anna')],
      predsWithJoker(new Set(['g-A-1'])),
      FACIT
    );
    expect(board[0].points).toBe(14);
    // Skillnaden mot utan-joker (11) är exakt EN extra match-poäng (3), dvs JOKER_MULTIPLIER.
    expect(board[0].points - 11).toBe(3 * (JOKER_MULTIPLIER - 1));
  });

  it('joker dubblar BARA match-poäng, INTE grupp-poäng (käll-uppdelningen)', () => {
    const { bySource, total } = scoreMemberBreakdown(
      {
        userId: 'u1',
        matchPredictions: [
          { matchId: 'g-A-1', userId: 'u1', homeGoals: 2, awayGoals: 1, updatedAt: '' },
        ],
        groupPredictions: [
          {
            groupId: 'A',
            userId: 'u1',
            winnerTeamId: code('MEX'),
            runnerUpTeamId: code('KOR'),
            updatedAt: '',
          },
        ],
        bracketPredictions: [],
        jokerMatchIds: new Set(['g-A-1']),
      },
      FACIT
    );
    expect(bySource.match).toBe(6); // 3 ×2 (joker)
    expect(bySource.group).toBe(5); // grupp orörd av jokern
    // SUMMAN==DELARNA-invarianten består även med joker.
    expect(bySource.match + bySource.group + bySource.bracket + bySource.champion).toBe(total);
    expect(total).toBe(11);
  });

  it('EDGE: joker på en MISS ger 0 (0 ×2 = 0, ingen straff, ingen vinst)', () => {
    const facit: PoolFacit = {
      matches: [{ matchId: 'g-A-1', actual: { homeGoals: 0, awayGoals: 2 } }], // borta-vinst
      groups: [],
      bracketSlots: [],
      champion: null,
    };
    const { total } = scoreMemberBreakdown(
      {
        userId: 'u1',
        matchPredictions: [
          { matchId: 'g-A-1', userId: 'u1', homeGoals: 2, awayGoals: 0, updatedAt: '' }, // MISS
        ],
        groupPredictions: [],
        bracketPredictions: [],
        jokerMatchIds: new Set(['g-A-1']),
      },
      facit
    );
    expect(total).toBe(0);
  });

  it('EDGE: joker på en match SAKNAS i facit (oavgjord) ger 0 (inget att dubbla än)', () => {
    const { total } = scoreMemberBreakdown(
      {
        userId: 'u1',
        matchPredictions: [
          { matchId: 'g-A-99', userId: 'u1', homeGoals: 2, awayGoals: 1, updatedAt: '' },
        ],
        groupPredictions: [],
        bracketPredictions: [],
        jokerMatchIds: new Set(['g-A-99']),
      },
      FACIT
    );
    expect(total).toBe(0);
  });

  it('joker på en match medlemmen INTE tippade påverkar inget (ingen match-poäng att dubbla)', () => {
    const board = buildLeaderboard(
      [member('u1', 'Anna')],
      predsWithJoker(new Set(['g-A-2'])), // joker på g-A-2 som ÄR tippad -> kontroll: dubblas
      FACIT
    );
    // g-A-2 (3p) dubblas -> 6; g-A-1 3p; grupp 5p = 14.
    expect(board[0].points).toBe(14);
  });

  it('exactHits (tiebreak) påverkas INTE av jokern (ett antal, inte poäng)', () => {
    const withJoker = buildLeaderboard(
      [member('u1', 'Anna')],
      predsWithJoker(new Set(['g-A-1'])),
      FACIT
    );
    const withoutJoker = buildLeaderboard([member('u1', 'Anna')], predsWithJoker(), FACIT);
    // Två exakta träffar oavsett joker (jokern ändrar poäng, inte antalet exakta tips).
    expect(withJoker[0].exactHits).toBe(2);
    expect(withoutJoker[0].exactHits).toBe(2);
  });
});
