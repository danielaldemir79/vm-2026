import { describe, expect, it } from 'vitest';
import type { Match } from '../../domain/types';
import { computeCountdown, selectMatchOfTheDay, splitDuration } from './countdown';

function sched(id: string, kickoff: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'mex',
    awayTeamId: 'rsa',
    kickoff,
    venue: 'Arena ej verifierad (egen data-punkt)',
    tvChannel: 'TV4',
    result: null,
    status: 'scheduled',
  };
}

describe('splitDuration, delar upp ms i dygn/timmar/minuter/sekunder', () => {
  it('delar upp en blandad varaktighet korrekt', () => {
    const ms = 2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5 * 1000;
    expect(splitDuration(ms)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5, totalMs: ms });
  });

  it('klampar negativ tid till noll (en passerad avspark räknas inte bakåt)', () => {
    expect(splitDuration(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 });
  });
});

describe('computeCountdown, nästa kommande avspark', () => {
  it('NORMALFALL: räknar till den tidigaste matchen i framtiden', () => {
    const now = new Date('2026-06-11T10:00:00.000Z');
    const matches = [
      sched('sen', '2026-06-12T19:00:00.000Z'),
      sched('nasta', '2026-06-11T19:00:00.000Z'), // 9 tim fram
      sched('passerad', '2026-06-10T19:00:00.000Z'),
    ];
    const state = computeCountdown(matches, now);

    expect(state.kind).toBe('upcoming');
    if (state.kind !== 'upcoming') return; // narrow för TS
    expect(state.match.id).toBe('nasta');
    expect(state.remaining).toEqual({
      days: 0,
      hours: 9,
      minutes: 0,
      seconds: 0,
      totalMs: 9 * 3600000,
    });
  });

  it('EDGE: exakt VID avspark räknas matchen inte längre som kommande, går vidare till nästa', () => {
    const kickoff = '2026-06-11T19:00:00.000Z';
    const now = new Date(kickoff); // exakt avspark
    const matches = [sched('nu', kickoff), sched('senare', '2026-06-11T22:00:00.000Z')];
    const state = computeCountdown(matches, now);

    // 'nu' är inte längre kommande (kickoff === now), så nästa kommande är 'senare'.
    expect(state.kind).toBe('upcoming');
    if (state.kind !== 'upcoming') return;
    expect(state.match.id).toBe('senare');
  });

  it('EDGE: ingen kommande match (efter finalen) ger sluttillståndet, ingen krasch/negativ nedräkning', () => {
    const now = new Date('2026-07-20T00:00:00.000Z'); // efter finalen
    const matches = [sched('final', '2026-07-19T19:00:00.000Z')];
    expect(computeCountdown(matches, now)).toEqual({ kind: 'no-upcoming' });
  });

  it('EDGE: tom matchlista ger sluttillståndet', () => {
    expect(computeCountdown([], new Date('2026-06-11T10:00:00.000Z'))).toEqual({
      kind: 'no-upcoming',
    });
  });

  it('accepterar både Date och epoch-ms som "nu"', () => {
    const matches = [sched('m', '2026-06-11T19:00:00.000Z')];
    const asDate = computeCountdown(matches, new Date('2026-06-11T18:00:00.000Z'));
    const asMs = computeCountdown(matches, Date.parse('2026-06-11T18:00:00.000Z'));
    expect(asDate).toEqual(asMs);
  });
});

describe('selectMatchOfTheDay, deterministiskt val (tidigast, id som tie-break)', () => {
  it('väljer den tidigaste matchen på dagen', () => {
    const matches = [
      sched('sen', '2026-06-11T22:00:00.000Z'),
      sched('tidig', '2026-06-11T16:00:00.000Z'),
    ];
    expect(selectMatchOfTheDay(matches)?.id).toBe('tidig');
  });

  it('bryter lika avsparkstid på id (lexikografiskt minst), oberoende av ordning', () => {
    const a = sched('a', '2026-06-11T19:00:00.000Z');
    const b = sched('b', '2026-06-11T19:00:00.000Z');
    expect(selectMatchOfTheDay([b, a])?.id).toBe('a');
    expect(selectMatchOfTheDay([a, b])?.id).toBe('a');
  });

  it('returnerar null för en tom dag', () => {
    expect(selectMatchOfTheDay([])).toBeNull();
  });
});
