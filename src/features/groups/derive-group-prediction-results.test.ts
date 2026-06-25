// Tester för deriveGroupPredictionResults: bron mellan de avgjorda grupptabellerna
// och användarens grupp-tips. FOKUS: bara AVGJORDA grupper DÄR ett tips finns ger en
// post, samt code<->id-seamen (tips lagras versal, standings bär gemen id).

import { describe, expect, it } from 'vitest';
import type { GroupStanding, GroupTable } from '../../domain/types';
import type { GroupPrediction } from '../../data/predictions';
import { deriveGroupPredictionResults } from './derive-group-prediction-results';

/** Full GroupStanding med nollor; bara teamId/rank/played styr härledningen. */
function standing(teamId: string, rank: number, played: number): GroupStanding {
  return {
    teamId,
    played,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    rank,
  };
}

/** En 4-lags-grupp. `played` per lag styr om gruppen är avgjord (alla = 3). */
function group(groupId: GroupTable['groupId'], played: number, order: string[]): GroupTable {
  return {
    groupId,
    standings: order.map((teamId, i) => standing(teamId, i + 1, played)),
  };
}

/** Ett grupp-tips (code-rymd, versal), som listMyGroupPredictions ger. */
function pred(groupId: string, winner: string, runnerUp: string): GroupPrediction {
  return {
    groupId,
    userId: 'me',
    winnerTeamId: winner as GroupPrediction['winnerTeamId'],
    runnerUpTeamId: runnerUp as GroupPrediction['runnerUpTeamId'],
    updatedAt: 't',
  };
}

describe('deriveGroupPredictionResults', () => {
  it('avgjord grupp + tips: ger post med poäng + per-position-bockar', () => {
    // Grupp A avgjord (alla spelat 3): faktisk 1:a bra, 2:a arg. Tips: BRA + ESP.
    const tables = [group('A', 3, ['bra', 'arg', 'esp', 'fra'])];
    const preds = new Map<string, GroupPrediction>([['A', pred('A', 'BRA', 'ESP')]]);
    const result = deriveGroupPredictionResults(tables, preds);
    expect(result.get('A')).toEqual({
      groupId: 'A',
      points: 3, // rätt vinnare (BRA=bra), fel tvåa (ESP, blev fra/esp pos 3)
      winnerCorrect: true,
      runnerUpCorrect: false,
      predictedWinnerCode: 'BRA',
      predictedRunnerUpCode: 'ESP',
    });
  });

  it('EJ avgjord grupp (något lag har spelat färre än 3) ger ingen post', () => {
    const tables = [group('A', 2, ['bra', 'arg', 'esp', 'fra'])];
    const preds = new Map<string, GroupPrediction>([['A', pred('A', 'BRA', 'ARG')]]);
    expect(deriveGroupPredictionResults(tables, preds).has('A')).toBe(false);
  });

  it('avgjord grupp UTAN tips ger ingen post (overlay visas bara när man tippat)', () => {
    const tables = [group('A', 3, ['bra', 'arg', 'esp', 'fra'])];
    expect(deriveGroupPredictionResults(tables, new Map()).has('A')).toBe(false);
  });

  it('code<->id-seam: versalt tips mot gement standings-id ger full poäng, inte tyst 0', () => {
    const tables = [group('B', 3, ['bra', 'arg', 'esp', 'fra'])];
    const preds = new Map<string, GroupPrediction>([['B', pred('B', 'BRA', 'ARG')]]);
    expect(deriveGroupPredictionResults(tables, preds).get('B')).toMatchObject({
      points: 5,
      winnerCorrect: true,
      runnerUpCorrect: true,
    });
  });

  it('tom standings hoppas tyst (data-inkonsistens kraschar inte)', () => {
    const tables: GroupTable[] = [{ groupId: 'C', standings: [] }];
    const preds = new Map<string, GroupPrediction>([['C', pred('C', 'BRA', 'ARG')]]);
    expect(deriveGroupPredictionResults(tables, preds).has('C')).toBe(false);
  });

  it('blandning: bara avgjorda-med-tips kommer med', () => {
    const tables = [
      group('A', 3, ['bra', 'arg', 'esp', 'fra']), // avgjord + tips -> med
      group('B', 1, ['ger', 'ned', 'usa', 'mex']), // ej avgjord -> ej med
      group('C', 3, ['eng', 'por', 'bel', 'cro']), // avgjord men inget tips -> ej med
    ];
    const preds = new Map<string, GroupPrediction>([
      ['A', pred('A', 'BRA', 'ARG')],
      ['B', pred('B', 'GER', 'NED')],
    ]);
    const result = deriveGroupPredictionResults(tables, preds);
    expect([...result.keys()]).toEqual(['A']);
  });
});
