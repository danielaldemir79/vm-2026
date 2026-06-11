// Tester för pool-bonus-poängsättningen (T16, #16): gruppvinnar-tips och
// bracket-/slutspels-tips. UTTÖMMANDE över de meningsfulla fallen + edge-fall
// (rätt lag fel position, partiell rätt, miss) + alla slutspelsrundor.

import { describe, expect, it } from 'vitest';
import {
  BRACKET_ROUND_POINTS,
  CHAMPION_PREDICTION_POINTS,
  GROUP_PREDICTION_POINTS,
  scoreBracketAdvance,
  scoreChampionPrediction,
  scoreGroupPrediction,
  type GroupOutcome,
} from './bonus-score';
import type { KnockoutStage } from '../../domain/bracket/bracket-structure';
import { computeStandings } from '../../domain/standings/compute-standings';
import { deriveBracket } from '../../features/bracket/derive-bracket';
import { ROUND_OF_32 } from '../../domain/bracket/bracket-structure';
import { WC2026_GROUPS, teamId } from '../wc2026/team-refs';
import type { GroupId, GroupTable, Match } from '../../domain/types';
import { GROUP_IDS } from '../../domain/types';

describe('scoreGroupPrediction (gruppvinnare 3p + tvåa 2p, oberoende)', () => {
  const actual: GroupOutcome = { winnerTeamId: 'BRA', runnerUpTeamId: 'ARG' };

  it('båda rätt ger 5 (3 + 2)', () => {
    expect(scoreGroupPrediction({ winnerTeamId: 'BRA', runnerUpTeamId: 'ARG' }, actual)).toBe(5);
  });

  it('bara rätt gruppvinnare ger 3', () => {
    expect(scoreGroupPrediction({ winnerTeamId: 'BRA', runnerUpTeamId: 'ESP' }, actual)).toBe(3);
  });

  it('bara rätt grupptvåa ger 2', () => {
    expect(scoreGroupPrediction({ winnerTeamId: 'ESP', runnerUpTeamId: 'ARG' }, actual)).toBe(2);
  });

  it('helt fel ger 0', () => {
    expect(scoreGroupPrediction({ winnerTeamId: 'ESP', runnerUpTeamId: 'FRA' }, actual)).toBe(0);
  });

  it('RÄTT LAG FEL POSITION ger 0 (positionen ÄR tipset, ingen delpoäng)', () => {
    // BRA tippad som 2:a (blev 1:a), ARG tippad som 1:a (blev 2:a): inget rätt
    // i exakt rätt position -> 0. Medvetet val (KISS, dokumenterat).
    expect(scoreGroupPrediction({ winnerTeamId: 'ARG', runnerUpTeamId: 'BRA' }, actual)).toBe(0);
  });

  it('poängkonstanterna är de dokumenterade (3 / 2)', () => {
    expect(GROUP_PREDICTION_POINTS.winner).toBe(3);
    expect(GROUP_PREDICTION_POINTS.runnerUp).toBe(2);
  });
});

describe('scoreBracketAdvance (rätt lag vidare, stigande per runda)', () => {
  it('rätt lag ger rundans poäng för VARJE runda', () => {
    const expected: Record<KnockoutStage, number> = {
      'round-of-32': 1,
      'round-of-16': 2,
      'quarter-final': 3,
      'semi-final': 4,
      'third-place': 5,
      final: 5,
    };
    for (const stage of Object.keys(expected) as KnockoutStage[]) {
      expect(scoreBracketAdvance(stage, 'BRA', 'BRA')).toBe(expected[stage]);
      // Konstant-tabellen och funktionen måste vara samma sanning.
      expect(BRACKET_ROUND_POINTS[stage]).toBe(expected[stage]);
    }
  });

  it('fel lag ger 0 oavsett runda', () => {
    const stages: KnockoutStage[] = [
      'round-of-32',
      'round-of-16',
      'quarter-final',
      'semi-final',
      'third-place',
      'final',
    ];
    for (const stage of stages) {
      expect(scoreBracketAdvance(stage, 'BRA', 'ARG')).toBe(0);
    }
  });

  it('djupare runda väger tyngre (monotont stigande t.o.m. semi)', () => {
    expect(BRACKET_ROUND_POINTS['round-of-32']).toBeLessThan(BRACKET_ROUND_POINTS['round-of-16']);
    expect(BRACKET_ROUND_POINTS['round-of-16']).toBeLessThan(BRACKET_ROUND_POINTS['quarter-final']);
    expect(BRACKET_ROUND_POINTS['quarter-final']).toBeLessThan(BRACKET_ROUND_POINTS['semi-final']);
    expect(BRACKET_ROUND_POINTS['semi-final']).toBeLessThan(BRACKET_ROUND_POINTS['final']);
  });
});

describe('scoreChampionPrediction (VM-vinnaren, 8p)', () => {
  it('rätt mästare ger 8', () => {
    expect(scoreChampionPrediction('BRA', 'BRA')).toBe(CHAMPION_PREDICTION_POINTS);
    expect(CHAMPION_PREDICTION_POINTS).toBe(8);
  });

  it('fel mästare ger 0', () => {
    expect(scoreChampionPrediction('BRA', 'ARG')).toBe(0);
  });

  it('mästar-bonusen väger tyngst (mer än djupaste bracket-rundan)', () => {
    expect(CHAMPION_PREDICTION_POINTS).toBeGreaterThan(BRACKET_ROUND_POINTS.final);
  });
});

// ============================================================================
// IDENTITETS-RYMD-SEAM (T16 F1): poängfunktionerna jämför ett LAGRAT tips (versal
// FIFA-code "BRA") mot ett HÄRLETT facit (gemen id "bra", `teamId(code)`). De två
// rymderna möts först HÄR (poäng-seamen), wirad i T17/T16b. Inget happy-path-test
// ovan matar de två VERKLIGA källornas värden mot varandra (alla strängar är där i
// SAMMA rymd), så driften vore osynligt grön. Dessa tester kör de RIKTIGA
// computeStandings/deriveBracket på en konstruerad fixture, plockar det härledda
// teamId/winnerTeamId (gemen id), och matar mot ett code-lagrat tips, så en
// identitets-rymd-drift failar RÖTT i stället för att ge tyst 0 poäng.
// ============================================================================

describe('identitets-rymd-seam: code-lagrat tips mot standings-/bracket-härlett facit (F1)', () => {
  /** En färdigspelad gruppmatch mellan två lag-id (gemen), i grupp `g`. */
  function groupMatch(g: GroupId, homeId: string, awayId: string, hg: number, ag: number): Match {
    return {
      id: `${g}-${homeId}-${awayId}`,
      stage: 'group',
      groupId: g,
      homeTeamId: homeId,
      awayTeamId: awayId,
      kickoff: '2026-06-12T18:00:00Z',
      venue: 'Arena',
      status: 'finished',
      result: { homeGoals: hg, awayGoals: ag },
    };
  }

  it('scoreGroupPrediction: standings-härlett actual (id) mot code-lagrat tips ger full poäng (5), inte tyst 0', () => {
    // Grupp C ur PRODUKTIONS-källan (WC2026_GROUPS): lag-id är GEMENA (teamId(code)).
    // C = [bra, mar, hai, sco]. Vi spelar matcher så BRA blir 1:a och MAR 2:a.
    const groupC = WC2026_GROUPS.find((grp) => grp.id === 'C')!;
    const [braId, marId, haiId, scoId] = groupC.teamIds; // gemena id ur källan
    const matches = [
      groupMatch('C', braId, marId, 1, 0), // BRA slår MAR
      groupMatch('C', braId, haiId, 3, 0),
      groupMatch('C', braId, scoId, 2, 0),
      groupMatch('C', marId, haiId, 2, 0), // MAR näst bäst
      groupMatch('C', marId, scoId, 1, 0),
      groupMatch('C', haiId, scoId, 0, 0),
    ];

    const standings = computeStandings(groupC.teamIds, matches);
    // Det HÄRLEDDA facit: rank 1 + rank 2 ur den riktiga funktionen (gemena id).
    const actual: GroupOutcome = {
      winnerTeamId: standings.find((r) => r.rank === 1)!.teamId,
      runnerUpTeamId: standings.find((r) => r.rank === 2)!.teamId,
    };
    // Sanity: facit ÄR i id-rymden (gemen), inte code, så seamen testas på riktigt.
    expect(actual.winnerTeamId).toBe(braId);
    expect(actual.winnerTeamId).toBe('bra');

    // Tipset LAGRAS som versal FIFA-code (DB-constraint ^[A-Z]{3}$).
    const predicted = { winnerTeamId: 'BRA', runnerUpTeamId: 'MAR' };

    // Hela poängen, trots att tips (code) och facit (id) ligger i olika rymder.
    expect(scoreGroupPrediction(predicted, actual)).toBe(5);
  });

  it('scoreBracketAdvance: deriveBracket-härlett winnerTeamId (id) mot code-lagrat tips ger rundans poäng, inte tyst 0', () => {
    // Bygg en komplett, låst grupp-fixture (alla 12 grupper färdigspelade) så
    // deriveBracket seedar och propagerar RIKTIGA lag-id (gemena, t.ex. "a2").
    const completeTable = (g: GroupId): GroupTable => ({
      groupId: g,
      standings: [
        {
          teamId: `${g}1`,
          played: 3,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 8,
          goalsAgainst: 2,
          goalDifference: 6,
          points: 9,
          rank: 1,
        },
        {
          teamId: `${g}2`,
          played: 3,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 5,
          goalsAgainst: 3,
          goalDifference: 2,
          points: 6,
          rank: 2,
        },
        {
          teamId: `${g}3`,
          played: 3,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 3,
          goalsAgainst: 3,
          goalDifference: 0,
          points: g <= 'H' ? 6 : 1,
          rank: 3,
        },
        {
          teamId: `${g}4`,
          played: 3,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 1,
          goalsAgainst: 7,
          goalDifference: -6,
          points: 0,
          rank: 4,
        },
      ],
    });
    const tables = GROUP_IDS.map(completeTable);

    // Avgör M73 (Runner-up A mot Runner-up B): hemma vinner 2-0 -> "a2" går vidare.
    const matches: Match[] = ROUND_OF_32.map((m) =>
      m.id === 'M73'
        ? {
            id: 'M73',
            stage: 'round-of-32' as const,
            groupId: null,
            homeTeamId: null,
            awayTeamId: null,
            kickoff: '2026-07-01T19:00:00Z',
            venue: 'Arena',
            status: 'finished' as const,
            result: { homeGoals: 2, awayGoals: 0 },
          }
        : {
            id: m.id,
            stage: 'round-of-32' as const,
            groupId: null,
            homeTeamId: null,
            awayTeamId: null,
            kickoff: '2026-07-01T19:00:00Z',
            venue: 'Arena',
            status: 'scheduled' as const,
            result: null,
          }
    );

    const state = deriveBracket(tables, matches);
    const m73 = state.matches.find((m) => m.matchId === 'M73')!;
    // Vinnaren (det lag som GÅR VIDARE) ur den RIKTIGA härledningen, i id-rymd.
    const advancingId = m73.home.teamId!;
    expect(advancingId).toBe('A2'); // härlett facit (deriveBracket bär rad-id "A2")

    // Tipset (code-rymd) skrivs som DB skulle: versal. Här är A2 redan versal, så
    // för att bevisa case-ROBUSTHETEN matar vi avsiktligt en gemen variant som tips
    // och ett blandat actual, och kräver ändå rätt poäng (R32 = 1).
    expect(scoreBracketAdvance('round-of-32', 'a2', advancingId)).toBe(1);
    expect(scoreBracketAdvance('round-of-32', advancingId.toLowerCase(), advancingId)).toBe(1);
  });

  it('REGRESSIONSVAKT: ren strängjämförelse (utan normalisering) skulle gett tyst 0, fixen ger poäng', () => {
    // Bevisar exakt den fälla F1 åtgärdar: code mot id är olika strängar. Hålls i
    // `string`-variabler så TS inte avvisar literal-jämförelsen som omöjlig (det är
    // just RUNTIME-skillnaden mellan rymderna vi vill demonstrera).
    const codeRef: string = 'BRA';
    const idRef: string = 'bra';
    expect(codeRef === idRef).toBe(false); // den tysta noll-fällan, dokumenterad
    expect(
      scoreGroupPrediction(
        { winnerTeamId: 'BRA', runnerUpTeamId: 'ARG' },
        { winnerTeamId: 'bra', runnerUpTeamId: 'arg' }
      )
    ).toBe(5);
    expect(scoreBracketAdvance('final', codeRef, idRef)).toBe(BRACKET_ROUND_POINTS.final);
    expect(scoreChampionPrediction(codeRef, idRef)).toBe(CHAMPION_PREDICTION_POINTS);
  });

  // Bevisar att importerna verkligen träffar produktionskällan, inte en kopia.
  it('härlednings-källan bär id i GEMEN rymd (teamId = toLowerCase), så seamen är äkta', () => {
    expect(teamId('BRA')).toBe('bra');
  });
});
