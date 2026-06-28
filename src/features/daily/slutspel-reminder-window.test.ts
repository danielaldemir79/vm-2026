import { describe, expect, it } from 'vitest';
import { knockoutWindowActive } from './slutspel-reminder-window';
import type { Match } from '../../domain/types';

const DAY = 86_400_000;

// Minimala matcher (bara fälten gaten läser: stage + kickoff).
function group(id: string, kickoff: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: null,
    awayTeamId: null,
    kickoff,
    status: 'scheduled',
  } as Match;
}
function knockout(id: string, kickoff: string): Match {
  return {
    id,
    stage: 'round-of-32',
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff,
    status: 'scheduled',
  } as Match;
}

describe('knockoutWindowActive', () => {
  const ko = [knockout('M73', '2026-06-28T19:00:00Z'), knockout('M104', '2026-07-19T19:00:00Z')];

  it('false långt före slutspelet (tidigt gruppspel)', () => {
    expect(knockoutWindowActive(ko, Date.parse('2026-06-15T12:00:00Z'))).toBe(false);
  });

  it('true ett par dagar före första slutspelsavsparken (heads-up)', () => {
    expect(knockoutWindowActive(ko, Date.parse('2026-06-27T12:00:00Z'))).toBe(true);
  });

  it('true mitt i slutspelet', () => {
    expect(knockoutWindowActive(ko, Date.parse('2026-06-29T09:00:00Z'))).toBe(true);
  });

  it('false väl efter finalen (fönstret slocknar)', () => {
    expect(knockoutWindowActive(ko, Date.parse('2026-07-19T19:00:00Z') + 2 * DAY)).toBe(false);
  });

  it('false när det inte finns några slutspelsmatcher', () => {
    const onlyGroups = [group('M1', '2026-06-11T19:00:00Z')];
    expect(knockoutWindowActive(onlyGroups, Date.parse('2026-06-29T09:00:00Z'))).toBe(false);
  });
});
