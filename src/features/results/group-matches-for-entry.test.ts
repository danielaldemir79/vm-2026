import { describe, expect, it } from 'vitest';
import type { Match } from '../../domain/types';
import { groupMatchesForEntry } from './group-matches-for-entry';

// En minimal match (bara fälten dag-grupperingen bryr sig om: id + kickoff).
function match(id: string, kickoff: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'mex',
    awayTeamId: 'rsa',
    kickoff,
    venue: 'Arena ej verifierad',
    tvChannel: 'TV4',
    result: null,
    status: 'scheduled',
  };
}

describe('groupMatchesForEntry, dag-gruppering för inmatningslistan', () => {
  it('grupperar per svensk kalenderdag i kronologisk ordning, matcher sorterade på tid', () => {
    const days = groupMatchesForEntry([
      match('m2', '2026-06-12T19:00:00.000Z'), // 06-12 svensk
      match('m1', '2026-06-11T19:00:00.000Z'), // 06-11 svensk
      match('m1b', '2026-06-11T16:00:00.000Z'), // 06-11 svensk, tidigare avspark
    ]);

    expect(days.map((d) => d.dateKey)).toEqual(['2026-06-11', '2026-06-12']);
    // Dag 06-11 har sina två matcher sorterade tidigast först (16:00Z före 19:00Z).
    expect(days[0].matches.map((m) => m.id)).toEqual(['m1b', 'm1']);
  });

  it('KRITISK dag-gräns: en match 00:00 svensk tid hör till SVENSKA dagen, inte UTC-dagen före', () => {
    // 2026-06-13 22:00Z = 2026-06-14 00:00 svensk tid (sommartid, +2). Den hör till
    // 06-14, inte 06-13 (off-by-one-skyddet ärvt från daily/localDateKey, DRY).
    const days = groupMatchesForEntry([
      match('mid', '2026-06-13T22:00:00.000Z'),
      match('day', '2026-06-13T12:00:00.000Z'), // 06-13 svensk
    ]);
    expect(days.map((d) => d.dateKey)).toEqual(['2026-06-13', '2026-06-14']);
    expect(days.find((d) => d.dateKey === '2026-06-14')?.matches.map((m) => m.id)).toEqual(['mid']);
  });

  it('utelämnar VILODAGAR (dagar utan matcher), till skillnad från den dagliga vyn', () => {
    // 06-11 och 06-14, men INGEN match 06-12/06-13. Inmatningslistan ska INTE få
    // tomma dag-rubriker för 06-12/06-13 (daily/groupMatchesByDay skulle fyllt dem
    // för datumnavigeringen; här filtrerar vi bort dem).
    const days = groupMatchesForEntry([
      match('a', '2026-06-11T19:00:00.000Z'),
      match('b', '2026-06-14T19:00:00.000Z'),
    ]);
    expect(days.map((d) => d.dateKey)).toEqual(['2026-06-11', '2026-06-14']);
    expect(days.every((d) => d.matches.length > 0)).toBe(true);
  });

  it('tom indata ger en tom lista (inga dag-rubriker)', () => {
    expect(groupMatchesForEntry([])).toEqual([]);
  });

  it('muterar inte sina argument (kan köras om reaktivt)', () => {
    const input = [match('b', '2026-06-12T19:00:00.000Z'), match('a', '2026-06-11T19:00:00.000Z')];
    const before = input.map((m) => m.id);
    groupMatchesForEntry(input);
    expect(input.map((m) => m.id)).toEqual(before);
  });
});
