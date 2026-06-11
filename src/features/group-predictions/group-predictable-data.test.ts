import { describe, expect, it } from 'vitest';
import { groupFirstMatchId, selectPredictableGroups } from './group-predictable-data';
import type { Group, Match, Team } from '../../domain/types';

const TEAMS: Team[] = [
  { id: 'mex', name: 'Mexiko', code: 'MEX', group: 'A' },
  { id: 'rsa', name: 'Sydafrika', code: 'RSA', group: 'A' },
  { id: 'kor', name: 'Sydkorea', code: 'KOR', group: 'A' },
  { id: 'cze', name: 'Tjeckien', code: 'CZE', group: 'A' },
  { id: 'can', name: 'Kanada', code: 'CAN', group: 'B' },
  { id: 'bih', name: 'Bosnien', code: 'BIH', group: 'B' },
];

const GROUPS: Group[] = [
  { id: 'B', teamIds: ['can', 'bih'] },
  { id: 'A', teamIds: ['mex', 'rsa', 'kor', 'cze'] },
];

function groupMatch(id: string, kickoff: string): Match {
  return {
    id,
    stage: 'group',
    groupId: id.charAt(2) as Group['id'],
    homeTeamId: null,
    awayTeamId: null,
    kickoff,
    venue: 'x',
    result: null,
    status: 'scheduled',
  };
}

const MATCHES: Match[] = [
  groupMatch('g-A-1', '2026-06-11T19:00:00.000Z'),
  groupMatch('g-B-1', '2026-06-12T19:00:00.000Z'),
];

describe('groupFirstMatchId', () => {
  it('bygger gruppens första match-id (deadline-ankaret)', () => {
    expect(groupFirstMatchId('A')).toBe('g-A-1');
    expect(groupFirstMatchId('L')).toBe('g-L-1');
  });
});

describe('selectPredictableGroups', () => {
  it('sorterar grupperna A..L och mappar lagen till code + namn', () => {
    const before = new Date('2026-06-10T00:00:00.000Z');
    const result = selectPredictableGroups(GROUPS, TEAMS, MATCHES, before);
    expect(result.map((g) => g.groupId)).toEqual(['A', 'B']); // sorterad
    expect(result[0].teams).toEqual([
      { code: 'MEX', name: 'Mexiko' },
      { code: 'RSA', name: 'Sydafrika' },
      { code: 'KOR', name: 'Sydkorea' },
      { code: 'CZE', name: 'Tjeckien' },
    ]);
    expect(result[0].deadlineIso).toBe('2026-06-11T19:00:00.000Z');
  });

  it('OLÅST före gruppens första match (now < g-X-1)', () => {
    const before = new Date('2026-06-11T18:59:59.000Z');
    const result = selectPredictableGroups(GROUPS, TEAMS, MATCHES, before);
    expect(result.find((g) => g.groupId === 'A')?.locked).toBe(false);
  });

  it('LÅST exakt på avspark (now === kickoff): deadline-sekunden hör till låst', () => {
    // Samma riktning som server-RLS (now() < kickoff nekar på likhet).
    const atKickoff = new Date('2026-06-11T19:00:00.000Z');
    const result = selectPredictableGroups(GROUPS, TEAMS, MATCHES, atKickoff);
    expect(result.find((g) => g.groupId === 'A')?.locked).toBe(true);
  });

  it('PER-GRUPP-LÅS: grupp A låst men grupp B fortfarande öppen (olika deadlines)', () => {
    // Mellan g-A-1 (11/6 19:00) och g-B-1 (12/6 19:00): A låst, B öppen.
    const between = new Date('2026-06-12T10:00:00.000Z');
    const result = selectPredictableGroups(GROUPS, TEAMS, MATCHES, between);
    expect(result.find((g) => g.groupId === 'A')?.locked).toBe(true);
    expect(result.find((g) => g.groupId === 'B')?.locked).toBe(false);
  });

  it('FAIL-SAFE: en grupp utan första match i planen behandlas som LÅST (deadlineIso null)', () => {
    // Tar bort g-B-1 ur planen: grupp B saknar då deadline-ankare -> låst (vi
    // erbjuder aldrig ett tips vi inte kan deadline-bevaka; RLS:ens NULL nekar ändå).
    const onlyA = MATCHES.filter((m) => m.id !== 'g-B-1');
    const result = selectPredictableGroups(GROUPS, TEAMS, onlyA, new Date('2026-06-10T00:00:00Z'));
    const b = result.find((g) => g.groupId === 'B');
    expect(b?.deadlineIso).toBeNull();
    expect(b?.locked).toBe(true);
  });

  it('faller tillbaka till team-id som code om laget saknas (ingen krasch)', () => {
    const groupWithUnknown: Group[] = [{ id: 'A', teamIds: ['mex', 'ghost'] }];
    const result = selectPredictableGroups(
      groupWithUnknown,
      TEAMS,
      MATCHES,
      new Date('2026-06-10T00:00:00Z')
    );
    expect(result[0].teams).toEqual([
      { code: 'MEX', name: 'Mexiko' },
      { code: 'ghost', name: 'ghost' },
    ]);
  });
});
