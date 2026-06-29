import { describe, expect, it } from 'vitest';
import { deriveBracketPredictionResults } from './derive-bracket-prediction-results';
import type { BracketFacit } from '../leaderboard';
import { asTeamCode } from '../../domain/team-code';
import { CHAMPION_SLOT_ID, type BracketPrediction } from '../../data/predictions';

// Minimal tips-fixtur (bara fälten poängsättningen läser; userId/updatedAt krävs av typen).
function pred(slotId: string, code: string): BracketPrediction {
  return {
    slotId,
    userId: 'u1',
    advancingTeamId: asTeamCode(code),
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

function facit(slotId: string, stage: BracketFacit['stage'], code: string): BracketFacit {
  return { slotId, stage, advancingTeam: asTeamCode(code) };
}

function predMap(...preds: BracketPrediction[]): Map<string, BracketPrediction> {
  return new Map(preds.map((p) => [p.slotId, p]));
}

describe('deriveBracketPredictionResults, per-slot rätt/fel + poäng (Del B)', () => {
  it('ett RÄTT slot-tips ger rundans poäng + correct=true + facit-laget', () => {
    const results = deriveBracketPredictionResults(
      [facit('M73', 'round-of-32', 'CAN')],
      null,
      predMap(pred('M73', 'CAN'))
    );
    const r = results.get('M73')!;
    expect(r.correct).toBe(true);
    expect(r.points).toBe(1); // round-of-32 = 1
    expect(r.maxPoints).toBe(1);
    expect(r.predictedCode).toBe('CAN');
    expect(r.actualCode).toBe('CAN');
  });

  it('ett FEL slot-tips ger 0 poäng + correct=false (men maxPoints = rundans vikt)', () => {
    const results = deriveBracketPredictionResults(
      [facit('M73', 'round-of-32', 'CAN')],
      null,
      predMap(pred('M73', 'RSA'))
    );
    const r = results.get('M73')!;
    expect(r.correct).toBe(false);
    expect(r.points).toBe(0);
    expect(r.maxPoints).toBe(1);
    expect(r.predictedCode).toBe('RSA');
    expect(r.actualCode).toBe('CAN');
  });

  it('poängen STIGER med rundan (kvart=3, semi=4, final=5)', () => {
    const results = deriveBracketPredictionResults(
      [
        facit('M99', 'quarter-final', 'BRA'),
        facit('M101', 'semi-final', 'BRA'),
        facit('M104', 'final', 'BRA'),
      ],
      null,
      predMap(pred('M99', 'BRA'), pred('M101', 'BRA'), pred('M104', 'BRA'))
    );
    expect(results.get('M99')!.points).toBe(3);
    expect(results.get('M101')!.points).toBe(4);
    expect(results.get('M104')!.points).toBe(5);
  });

  it('en slot UTAN facit (ej avgjord) ger INGEN post, även om man tippat den', () => {
    const results = deriveBracketPredictionResults(
      [facit('M73', 'round-of-32', 'CAN')],
      null,
      predMap(pred('M73', 'CAN'), pred('M90', 'CAN'))
    );
    expect(results.has('M90')).toBe(false);
    expect(results.size).toBe(1);
  });

  it('en avgjord slot man INTE tippat ger ingen post (gissar aldrig ett tips)', () => {
    const results = deriveBracketPredictionResults(
      [facit('M73', 'round-of-32', 'CAN')],
      null,
      predMap()
    );
    expect(results.size).toBe(0);
  });

  it('VM-vinnaren: rätt mästar-tips ger 20 poäng (correct=true)', () => {
    const results = deriveBracketPredictionResults(
      [],
      asTeamCode('ARG'),
      predMap(pred(CHAMPION_SLOT_ID, 'ARG'))
    );
    const r = results.get(CHAMPION_SLOT_ID)!;
    expect(r.correct).toBe(true);
    expect(r.points).toBe(20);
    expect(r.maxPoints).toBe(20);
    expect(r.actualCode).toBe('ARG');
  });

  it('VM-vinnaren: fel mästar-tips ger 0 poäng (correct=false)', () => {
    const results = deriveBracketPredictionResults(
      [],
      asTeamCode('ARG'),
      predMap(pred(CHAMPION_SLOT_ID, 'BRA'))
    );
    expect(results.get(CHAMPION_SLOT_ID)!.points).toBe(0);
    expect(results.get(CHAMPION_SLOT_ID)!.correct).toBe(false);
  });

  it('VM-vinnaren: ingen post förrän finalen är avgjord (champion=null)', () => {
    const results = deriveBracketPredictionResults(
      [],
      null,
      predMap(pred(CHAMPION_SLOT_ID, 'ARG'))
    );
    expect(results.has(CHAMPION_SLOT_ID)).toBe(false);
  });

  it('IDENTITETS-rymd: ett tips lagrat med versal code matchar facit oavsett rymd (defense-in-depth)', () => {
    // facit advancingTeam är redan versal CODE; tipset likaså. Korskoll att samma-lag-jämförelsen
    // (via scoreBracketAdvance) ger rätt, inte tyst 0 (T16 F1-seamen).
    const results = deriveBracketPredictionResults(
      [facit('M73', 'round-of-32', 'CAN')],
      null,
      predMap(pred('M73', 'CAN'))
    );
    expect(results.get('M73')!.points).toBeGreaterThan(0);
  });
});
