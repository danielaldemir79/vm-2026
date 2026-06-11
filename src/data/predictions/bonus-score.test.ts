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
