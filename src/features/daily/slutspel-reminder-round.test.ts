import { describe, expect, it } from 'vitest';
import { currentKnockoutRound, ROUND_REMINDER } from './slutspel-reminder-round';
import type { Match, MatchStage } from '../../domain/types';

function m(id: string, stage: MatchStage, kickoff: string): Match {
  return {
    id,
    stage,
    groupId: stage === 'group' ? 'A' : null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff,
    status: 'scheduled',
  } as Match;
}

// Ett litet slutspels-schema (en match per runda) i kalender-ordning.
const schedule = [
  m('M73', 'round-of-32', '2026-06-28T19:00:00Z'),
  m('M89', 'round-of-16', '2026-07-04T19:00:00Z'),
  m('M97', 'quarter-final', '2026-07-09T19:00:00Z'),
  m('M101', 'semi-final', '2026-07-14T19:00:00Z'),
  m('M103', 'third-place', '2026-07-18T19:00:00Z'),
  m('M104', 'final', '2026-07-19T19:00:00Z'),
];

describe('currentKnockoutRound , följer nästa kommande avspark', () => {
  it('pekar på sextondelarna när de är nästa kommande', () => {
    expect(currentKnockoutRound(schedule, Date.parse('2026-06-28T08:00:00Z'))).toBe('round-of-32');
  });

  it('flyttar till åttondelarna när alla sextondels-avspark passerat', () => {
    expect(currentKnockoutRound(schedule, Date.parse('2026-06-29T08:00:00Z'))).toBe('round-of-16');
  });

  it('pekar på kvarten, sedan semin, mot slutet', () => {
    expect(currentKnockoutRound(schedule, Date.parse('2026-07-05T08:00:00Z'))).toBe(
      'quarter-final'
    );
    expect(currentKnockoutRound(schedule, Date.parse('2026-07-10T08:00:00Z'))).toBe('semi-final');
  });

  it('hoppar över bronsmatchen , pekar på finalen efter semifinalerna', () => {
    // 2026-07-15: nästa avspark är bronsmatchen (third-place), men den ingår inte i
    // rundorna -> nästa knockout-runda är finalen.
    expect(currentKnockoutRound(schedule, Date.parse('2026-07-15T08:00:00Z'))).toBe('final');
  });

  it('null när inga slutspelsmatcher är kvar att spela (efter finalen)', () => {
    expect(currentKnockoutRound(schedule, Date.parse('2026-07-20T08:00:00Z'))).toBeNull();
  });

  it('null när det inte finns några slutspelsmatcher alls', () => {
    const onlyGroups = [m('M1', 'group', '2026-06-11T19:00:00Z')];
    expect(currentKnockoutRound(onlyGroups, Date.parse('2026-06-12T08:00:00Z'))).toBeNull();
  });
});

describe('ROUND_REMINDER , innehåll per runda', () => {
  it('har eget namn + mening + cta för varje runda', () => {
    for (const round of [
      'round-of-32',
      'round-of-16',
      'quarter-final',
      'semi-final',
      'final',
    ] as const) {
      expect(ROUND_REMINDER[round].name.length).toBeGreaterThan(0);
      expect(ROUND_REMINDER[round].line.length).toBeGreaterThan(0);
      expect(ROUND_REMINDER[round].cta.length).toBeGreaterThan(0);
    }
    expect(ROUND_REMINDER.final.name).toBe('Final');
  });
});
