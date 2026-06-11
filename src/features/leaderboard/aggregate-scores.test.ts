// Tester för poäng-aggregeringen + rangordningen (T17, #17). FOKUS: summan över
// ALLA tre tips-typer mot facit, delad placering vid LIKA poäng (edge), tiebreak,
// och att ett OAVGJORT utfall inte ger poäng (poäng-/avslöjande-modellen).

import { describe, expect, it } from 'vitest';
import type { RoomMember } from '../../data/rooms';
import type { Match, Team } from '../../domain/types';
import { asTeamCode, type TeamCode } from '../../domain/team-code';
import { buildLeaderboard, type MemberPredictions } from './aggregate-scores';
import { CHAMPION_SLOT_ID, derivePoolFacit } from './derive-facit';
import type { PoolFacit } from './derive-facit';
import { WC2026_GROUPS, WC2026_TEAM_BASES, teamId } from '../../data/wc2026/team-refs';

/* ------------------------------------------------------------------ *
 * Test-hjälpare.
 * ------------------------------------------------------------------ */

function member(userId: string, displayName: string): RoomMember {
  return { userId, displayName };
}

function code(c: string): TeamCode {
  return asTeamCode(c);
}

/** En tom medlem (inga tips), keyad. */
function emptyPreds(userId: string): MemberPredictions {
  return { userId, matchPredictions: [], groupPredictions: [], bracketPredictions: [] };
}

/** Tom facit (inget avgjort). */
const EMPTY_FACIT: PoolFacit = { matches: [], groups: [], bracketSlots: [], champion: null };

describe('buildLeaderboard, summa över de tre tips-typerna mot facit', () => {
  it('summerar match-, grupp-, bracket- OCH mästar-poäng till en total', () => {
    const facit: PoolFacit = {
      matches: [{ matchId: 'g-A-1', actual: { homeGoals: 2, awayGoals: 1 } }],
      groups: [
        { groupId: 'A', actual: { winnerTeamId: code('MEX'), runnerUpTeamId: code('KOR') } },
      ],
      bracketSlots: [{ slotId: 'M73', stage: 'round-of-32', advancingTeam: code('BRA') }],
      champion: code('ARG'),
    };
    const preds = new Map<string, MemberPredictions>([
      [
        'u1',
        {
          userId: 'u1',
          // Exakt match-resultat (3p).
          matchPredictions: [
            { matchId: 'g-A-1', userId: 'u1', homeGoals: 2, awayGoals: 1, updatedAt: '' },
          ],
          // Rätt 1:a + 2:a (3 + 2 = 5p).
          groupPredictions: [
            {
              groupId: 'A',
              userId: 'u1',
              winnerTeamId: code('MEX'),
              runnerUpTeamId: code('KOR'),
              updatedAt: '',
            },
          ],
          // Rätt slot-avancerare R32 (1p) + rätt mästare (20p).
          bracketPredictions: [
            { slotId: 'M73', userId: 'u1', advancingTeamId: code('BRA'), updatedAt: '' },
            { slotId: CHAMPION_SLOT_ID, userId: 'u1', advancingTeamId: code('ARG'), updatedAt: '' },
          ],
        },
      ],
    ]);
    const board = buildLeaderboard([member('u1', 'Anna')], preds, facit);
    expect(board).toHaveLength(1);
    // 3 (exakt match) + 5 (grupp) + 1 (slot) + 20 (mästare) = 29.
    expect(board[0].points).toBe(29);
    expect(board[0].exactHits).toBe(1);
    expect(board[0].rank).toBe(1);
  });

  it('ett OAVGJORT utfall (saknas i facit) ger 0 poäng (poäng bara på avgjort)', () => {
    // Tipset finns, men facit har INTE matchen/gruppen/slotten -> 0 poäng.
    const preds = new Map<string, MemberPredictions>([
      [
        'u1',
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
          bracketPredictions: [
            { slotId: 'M73', userId: 'u1', advancingTeamId: code('BRA'), updatedAt: '' },
            { slotId: CHAMPION_SLOT_ID, userId: 'u1', advancingTeamId: code('ARG'), updatedAt: '' },
          ],
        },
      ],
    ]);
    const board = buildLeaderboard([member('u1', 'Anna')], preds, EMPTY_FACIT);
    expect(board[0].points).toBe(0);
  });

  it('en medlem UTAN tips är med i listan med 0 poäng (visas inte bort)', () => {
    const board = buildLeaderboard(
      [member('u1', 'Anna'), member('u2', 'Bertil')],
      new Map([['u1', emptyPreds('u1')]]),
      EMPTY_FACIT
    );
    expect(board.map((e) => e.userId).sort()).toEqual(['u1', 'u2']);
    expect(board.every((e) => e.points === 0)).toBe(true);
  });

  it('CODE-VS-ID-SEAM (defense-in-depth): ett gemen-id-facit ger ändå poäng (bonus-score normaliserar)', () => {
    // Om ett facit av misstag vore gemen id, normaliserar bonus-score ändå (T16 F1).
    // Vi castar för att simulera den otypade vägen (asTeamCode = betrodd cast).
    const facit: PoolFacit = {
      matches: [],
      groups: [
        {
          groupId: 'A',
          actual: { winnerTeamId: asTeamCode('mex'), runnerUpTeamId: asTeamCode('kor') },
        },
      ],
      bracketSlots: [],
      champion: null,
    };
    const preds = new Map<string, MemberPredictions>([
      [
        'u1',
        {
          ...emptyPreds('u1'),
          groupPredictions: [
            {
              groupId: 'A',
              userId: 'u1',
              winnerTeamId: code('MEX'),
              runnerUpTeamId: code('KOR'),
              updatedAt: '',
            },
          ],
        },
      ],
    ]);
    const board = buildLeaderboard([member('u1', 'Anna')], preds, facit);
    // Trots gemen facit ger normaliseringen full grupp-poäng (5).
    expect(board[0].points).toBe(5);
  });
});

describe('buildLeaderboard, SLUTSPELS-matchtips ger matchpoäng (Copilot C1, T15 §2)', () => {
  /** Produktions-lagen som Team[] (för derivePoolFacit:s id -> code-mappning). */
  const TEAMS: Team[] = WC2026_TEAM_BASES.map((b) => ({
    id: b.id,
    name: b.name,
    code: b.code,
    group: b.group,
  }));

  /** En färdigspelad slutspelsmatch (kända lag) med given ordinarie ställning. */
  function knockoutMatch(id: string, hg: number, ag: number, penalties = false): Match {
    return {
      id,
      stage: 'round-of-32',
      groupId: null,
      homeTeamId: teamId('BRA'),
      awayTeamId: teamId('ARG'),
      kickoff: '2026-07-01T19:00:00Z',
      venue: 'Arena',
      status: 'finished',
      result: penalties
        ? { homeGoals: hg, awayGoals: ag, penalties: { homeGoals: 4, awayGoals: 3 } }
        : { homeGoals: hg, awayGoals: ag },
    };
  }

  it('ett EXAKT matchtips på en avgjord slutspelsmatch ger matchpoäng (3p) i aggregeringen', () => {
    // Hela kedjan: derivePoolFacit MÅSTE ge ett matchfacit för M73 (slutspel), och
    // aggregeringen poängsätter matchtipset mot det. Före C1-fixen var facit.matches
    // tomt för slutspel -> 0 poäng (buggen). 1-0 exakt = 3p.
    const facit = derivePoolFacit(TEAMS, WC2026_GROUPS, [knockoutMatch('M73', 1, 0)]);
    expect(facit.matches).toHaveLength(1); // slutspels-matchfacit finns (regression)

    const preds = new Map<string, MemberPredictions>([
      [
        'u1',
        {
          ...emptyPreds('u1'),
          matchPredictions: [
            { matchId: 'M73', userId: 'u1', homeGoals: 1, awayGoals: 0, updatedAt: '' },
          ],
        },
      ],
    ]);
    const board = buildLeaderboard([member('u1', 'Anna')], preds, facit);
    expect(board[0].points).toBe(3); // exakt match-resultat på SLUTSPEL = 3p
    expect(board[0].exactHits).toBe(1);
  });

  it('straff-avgjort slutspel: matchtipset bedöms på ORDINARIE mål (1-1 = draw), inte straffarna', () => {
    // Ordinarie 1-1 (straffar 4-3). Ett tippat 1-1 ska ge EXAKT (3p), ett tippat
    // hemmavinst ska ge 0 (fel utfall mot 'draw'), oavsett straff-vinnaren. T15 §2.
    const facit = derivePoolFacit(TEAMS, WC2026_GROUPS, [knockoutMatch('M73', 1, 1, true)]);
    const exactDraw = new Map<string, MemberPredictions>([
      [
        'u1',
        {
          ...emptyPreds('u1'),
          matchPredictions: [
            { matchId: 'M73', userId: 'u1', homeGoals: 1, awayGoals: 1, updatedAt: '' },
          ],
        },
      ],
    ]);
    expect(buildLeaderboard([member('u1', 'A')], exactDraw, facit)[0].points).toBe(3);

    const wrongOutcome = new Map<string, MemberPredictions>([
      [
        'u1',
        {
          ...emptyPreds('u1'),
          matchPredictions: [
            { matchId: 'M73', userId: 'u1', homeGoals: 2, awayGoals: 0, updatedAt: '' },
          ],
        },
      ],
    ]);
    expect(buildLeaderboard([member('u1', 'A')], wrongOutcome, facit)[0].points).toBe(0);
  });

  it('matchtips + bracket-tips på SAMMA slutspelsmatch summeras additivt (skilda plan, ingen dubbelräkning)', () => {
    // Match-tips (ordinarie mål) och bracket-tips (vem avancerar) är två SKILDA tips
    // mot två SKILDA facit. Båda rätt -> matchpoäng (3) + slot-poäng (1) = 4, inte
    // en dubblering av samma utfall. Vi bygger facit manuellt så bracketSlot finns.
    const facit: PoolFacit = {
      matches: [{ matchId: 'M73', actual: { homeGoals: 1, awayGoals: 0 } }],
      groups: [],
      bracketSlots: [{ slotId: 'M73', stage: 'round-of-32', advancingTeam: code('BRA') }],
      champion: null,
    };
    const preds = new Map<string, MemberPredictions>([
      [
        'u1',
        {
          ...emptyPreds('u1'),
          matchPredictions: [
            { matchId: 'M73', userId: 'u1', homeGoals: 1, awayGoals: 0, updatedAt: '' },
          ],
          bracketPredictions: [
            { slotId: 'M73', userId: 'u1', advancingTeamId: code('BRA'), updatedAt: '' },
          ],
        },
      ],
    ]);
    const board = buildLeaderboard([member('u1', 'Anna')], preds, facit);
    // 3 (exakt match-resultat) + 1 (rätt avancerare R32) = 4. Distinkta, additiva.
    expect(board[0].points).toBe(4);
    expect(board[0].exactHits).toBe(1); // bara match-tipset räknas som exakt träff
  });
});

describe('buildLeaderboard, rangordning + delad placering + tiebreak', () => {
  /** En medlem med ett FÄRDIGT poäng-resultat via match-tips mot facit. */
  function withMatchPoints(
    userId: string,
    name: string,
    exactCount: number,
    outcomeCount: number
  ): { member: RoomMember; preds: [string, MemberPredictions] } {
    const matchPredictions = [];
    // exactCount exakta (3p), outcomeCount rätt-utfall (1p).
    for (let i = 0; i < exactCount; i++) {
      matchPredictions.push({
        matchId: `exact-${i}`,
        userId,
        homeGoals: 2,
        awayGoals: 1,
        updatedAt: '',
      });
    }
    for (let i = 0; i < outcomeCount; i++) {
      matchPredictions.push({
        matchId: `outcome-${i}`,
        userId,
        homeGoals: 3,
        awayGoals: 0, // rätt utfall (hemmavinst) men inte exakt
        updatedAt: '',
      });
    }
    return {
      member: member(userId, name),
      preds: [userId, { ...emptyPreds(userId), matchPredictions }],
    };
  }

  /** Facit som gör exact-* exakta (2-1) och outcome-* rätt-utfall (1-0 vs tippat 3-0). */
  function matchFacitFor(exactCount: number, outcomeCount: number): PoolFacit {
    const matches = [];
    for (let i = 0; i < exactCount; i++) {
      matches.push({ matchId: `exact-${i}`, actual: { homeGoals: 2, awayGoals: 1 } });
    }
    for (let i = 0; i < outcomeCount; i++) {
      matches.push({ matchId: `outcome-${i}`, actual: { homeGoals: 1, awayGoals: 0 } });
    }
    return { matches, groups: [], bracketSlots: [], champion: null };
  }

  it('sorterar på poäng fallande och numrerar 1,2,3', () => {
    // Anna 6p (2 exakta), Bertil 3p (1 exakt), Cecilia 1p (1 utfall).
    const a = withMatchPoints('u1', 'Anna', 2, 0);
    const b = withMatchPoints('u2', 'Bertil', 1, 0);
    const c = withMatchPoints('u3', 'Cecilia', 0, 1);
    const facit = matchFacitFor(2, 1); // täcker exact-0/1 + outcome-0
    const board = buildLeaderboard(
      [a.member, b.member, c.member],
      new Map([a.preds, b.preds, c.preds]),
      facit
    );
    expect(board.map((e) => [e.displayName, e.points, e.rank])).toEqual([
      ['Anna', 6, 1],
      ['Bertil', 3, 2],
      ['Cecilia', 1, 3],
    ]);
  });

  it('LIKA POÄNG ger DELAD placering (samma rank), nästa distinkta hoppar fram (1,1,3)', () => {
    // Anna och Bertil båda 3p (1 exakt var), Cecilia 1p.
    const a = withMatchPoints('u1', 'Anna', 1, 0);
    const b = withMatchPoints('u2', 'Bertil', 1, 0);
    const c = withMatchPoints('u3', 'Cecilia', 0, 1);
    const facit = matchFacitFor(1, 1);
    const board = buildLeaderboard(
      [a.member, b.member, c.member],
      new Map([a.preds, b.preds, c.preds]),
      facit
    );
    const byUser = new Map(board.map((e) => [e.userId, e]));
    expect(byUser.get('u1')!.rank).toBe(1);
    expect(byUser.get('u2')!.rank).toBe(1); // DELAD 1:a
    expect(byUser.get('u3')!.rank).toBe(3); // nästa distinkta hoppar till 3, inte 2
  });

  it('TIEBREAK vid lika poäng: fler EXAKTA träffar visas FÖRST (men rank förblir delad)', () => {
    // Båda 3p, men Bertil har 1 exakt (3p), Anna 3 utfall (3p). Bertil först i ordning.
    const a = withMatchPoints('u1', 'Anna', 0, 3); // 3p via 3 utfall, 0 exakta
    const b = withMatchPoints('u2', 'Bertil', 1, 0); // 3p via 1 exakt
    const facit = matchFacitFor(1, 3);
    const board = buildLeaderboard([a.member, b.member], new Map([a.preds, b.preds]), facit);
    // Bertil (fler exakta) sorteras före Anna...
    expect(board[0].displayName).toBe('Bertil');
    expect(board[1].displayName).toBe('Anna');
    // ...men PLACERINGEN är delad (lika poäng = samma rank).
    expect(board[0].rank).toBe(1);
    expect(board[1].rank).toBe(1);
  });

  it('TIEBREAK 2 vid lika poäng OCH lika exakta: alfabetisk visnings-ordning (svensk locale)', () => {
    // Båda 1p via 1 utfall, 0 exakta. Skiljer bara på namn (Åke efter Bo i sv).
    const a = withMatchPoints('u1', 'Åke', 0, 1);
    const b = withMatchPoints('u2', 'Bo', 0, 1);
    const facit = matchFacitFor(0, 1);
    const board = buildLeaderboard([a.member, b.member], new Map([a.preds, b.preds]), facit);
    // 'Bo' före 'Åke' i svensk sortering (Å sist i alfabetet).
    expect(board.map((e) => e.displayName)).toEqual(['Bo', 'Åke']);
    expect(board.every((e) => e.rank === 1)).toBe(true);
  });

  it('alla lika poäng (0) ger alla rank 1 (delad), stabil namn-ordning', () => {
    const board = buildLeaderboard(
      [member('u1', 'Cecilia'), member('u2', 'Anna'), member('u3', 'Bertil')],
      new Map(),
      EMPTY_FACIT
    );
    expect(board.every((e) => e.rank === 1)).toBe(true);
    expect(board.map((e) => e.displayName)).toEqual(['Anna', 'Bertil', 'Cecilia']);
  });
});
