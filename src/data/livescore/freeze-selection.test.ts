// Robust facit-fångst-tester: bevisa att en MAPPAD, ej-fryst match vars kickoff
// passerat (inom bak-fönstret) väljs för freeze-koll , just det fall (g-F-1) där
// matchen föll ur live=all innan FT sågs, så facit annars hade missats. Edge + fel-
// vägar + budget-kapning + negativ-kontroll (fryst/framtida/uråldrig väljs INTE).

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_FREEZE_CHECKS_PER_TICK,
  FREEZE_LOOKBACK_MS,
  selectFreezeChecks,
  type MappedMatchState,
} from './freeze-selection';
import type { MatchPlanEntry } from './fixture-map-resolver';

const NOW = new Date('2026-06-14T22:30:00.000Z'); // 2,5h efter g-F-1:s avspark (20:00Z)

// Mini-plan: en match vars kickoff passerat nyss, en framtida, en uråldrig.
const PLAN: MatchPlanEntry[] = [
  { matchId: 'g-F-1', kickoffUtc: '2026-06-14T20:00:00.000Z', homeAppId: 'ned', awayAppId: 'jpn' }, // 2,5h sedan
  { matchId: 'g-A-1', kickoffUtc: '2026-06-15T19:00:00.000Z', homeAppId: 'mex', awayAppId: 'rsa' }, // framtid
  { matchId: 'g-Z-9', kickoffUtc: '2026-06-10T19:00:00.000Z', homeAppId: 'esp', awayAppId: 'uru' }, // >4 dygn sedan
];

function mapped(matchId: string, frozen: boolean, apiFixtureId = 1): MappedMatchState {
  return { matchId, apiFixtureId, frozen };
}

describe('selectFreezeChecks: vilka mappade matcher behöver freeze-koll', () => {
  it('väljer en MAPPAD, EJ-fryst match vars kickoff nyss passerat (g-F-1-fallet)', () => {
    const out = selectFreezeChecks(PLAN, [mapped('g-F-1', false, 1489376)], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].matchId).toBe('g-F-1');
    expect(out[0].apiFixtureId).toBe(1489376);
    expect(out[0].msSinceKickoff).toBeGreaterThan(0);
  });

  it('väljer INTE en redan FRYST match (facit redan fångat)', () => {
    const out = selectFreezeChecks(PLAN, [mapped('g-F-1', true)], NOW);
    expect(out).toHaveLength(0);
  });

  it('väljer INTE en FRAMTIDA match (kickoff har inte passerat)', () => {
    const out = selectFreezeChecks(PLAN, [mapped('g-A-1', false)], NOW);
    expect(out).toHaveLength(0);
  });

  it('väljer INTE en URÅLDRIG match (utanför bak-fönstret, hanteras manuellt)', () => {
    const out = selectFreezeChecks(PLAN, [mapped('g-Z-9', false)], NOW);
    expect(out).toHaveLength(0);
  });

  it('hoppar en mappad match som SAKNAR schemarad i planen (gissar aldrig)', () => {
    const out = selectFreezeChecks(PLAN, [mapped('okänd-match', false)], NOW);
    expect(out).toHaveLength(0);
  });

  it('sorterar äldst-passerad FÖRST (störst risk att ha fallit ur live=all)', () => {
    const plan: MatchPlanEntry[] = [
      { matchId: 'tidig', kickoffUtc: '2026-06-14T19:00:00.000Z', homeAppId: 'a', awayAppId: 'b' }, // 3,5h
      { matchId: 'sen', kickoffUtc: '2026-06-14T21:00:00.000Z', homeAppId: 'c', awayAppId: 'd' }, // 1,5h
    ];
    const out = selectFreezeChecks(plan, [mapped('sen', false), mapped('tidig', false)], NOW);
    expect(out.map((t) => t.matchId)).toEqual(['tidig', 'sen']);
  });

  it('kapar till maxChecks (budget-skydd: spräck aldrig taket)', () => {
    const plan: MatchPlanEntry[] = [
      { matchId: 'a', kickoffUtc: '2026-06-14T20:00:00.000Z', homeAppId: 'a', awayAppId: 'b' },
      { matchId: 'b', kickoffUtc: '2026-06-14T20:30:00.000Z', homeAppId: 'c', awayAppId: 'd' },
      { matchId: 'c', kickoffUtc: '2026-06-14T21:00:00.000Z', homeAppId: 'e', awayAppId: 'f' },
    ];
    const out = selectFreezeChecks(
      plan,
      [mapped('a', false), mapped('b', false), mapped('c', false)],
      NOW,
      2 // tak
    );
    expect(out).toHaveLength(2);
  });

  it('maxChecks = 0 ger tom lista (ingen budget för freeze detta tick)', () => {
    expect(selectFreezeChecks(PLAN, [mapped('g-F-1', false)], NOW, 0)).toHaveLength(0);
  });

  it('fail loud på negativ maxChecks (korrupt input gissas aldrig)', () => {
    expect(() => selectFreezeChecks(PLAN, [], NOW, -1)).toThrow(/maxChecks/);
  });

  it('fail loud på ogiltigt now-datum', () => {
    expect(() => selectFreezeChecks(PLAN, [], new Date('inte-ett-datum'))).toThrow(/now/);
  });

  it('default-konstanterna är rimliga (4h fönster, 10 kollar/tick)', () => {
    expect(FREEZE_LOOKBACK_MS).toBe(4 * 60 * 60 * 1000);
    expect(DEFAULT_MAX_FREEZE_CHECKS_PER_TICK).toBe(10);
  });

  it('precis på fönster-gränsen (4h) väljs, strax utanför väljs inte', () => {
    const plan: MatchPlanEntry[] = [
      { matchId: 'kant', kickoffUtc: '2026-06-14T18:30:00.000Z', homeAppId: 'a', awayAppId: 'b' }, // exakt 4h
      { matchId: 'over', kickoffUtc: '2026-06-14T18:29:00.000Z', homeAppId: 'c', awayAppId: 'd' }, // 4h01m
    ];
    const out = selectFreezeChecks(plan, [mapped('kant', false), mapped('over', false)], NOW);
    expect(out.map((t) => t.matchId)).toEqual(['kant']); // bara den exakt på gränsen
  });
});
