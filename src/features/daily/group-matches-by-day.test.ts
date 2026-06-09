import { describe, expect, it } from 'vitest';
import type { Match } from '../../domain/types';
import { groupMatchesByDay, localDateKey } from './group-matches-by-day';

// En minimal schemalagd match (bara fälten dag-grupperingen bryr sig om).
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

describe('localDateKey, härleder SVENSK kalenderdag ur UTC-instant (off-by-one-skydd)', () => {
  it('en match mitt på svensk dag hamnar på samma datum', () => {
    // 2026-06-11 19:00 UTC = 21:00 svensk tid (sommartid, +2) => 2026-06-11.
    expect(localDateKey('2026-06-11T19:00:00.000Z')).toBe('2026-06-11');
  });

  it('KRITISK midnatts-fall: en match 00:00 svensk tid hör till den SVENSKA dagen, inte UTC-dagen före', () => {
    // 2026-06-13 22:00 UTC = 2026-06-14 00:00 svensk tid (sommartid, +2). Det
    // svenska kalenderdatumet är 06-14, INTE 06-13 som en UTC-datumklippning gett.
    expect(localDateKey('2026-06-13T22:00:00.000Z')).toBe('2026-06-14');
  });

  it('strax före midnatt svensk tid stannar på den svenska dagen (gränsen åt andra hållet)', () => {
    // 2026-06-13 21:00 UTC = 23:00 svensk tid => fortfarande 06-13.
    expect(localDateKey('2026-06-13T21:00:00.000Z')).toBe('2026-06-13');
  });

  it('kastar (fail loud) på en ogiltig tidsstämpel i stället för att gissa en dag', () => {
    expect(() => localDateKey('inte-ett-datum')).toThrow(/Ogiltig kickoff/);
  });
});

describe('groupMatchesByDay, gruppering + ordning', () => {
  it('grupperar matcher per svensk dag och sorterar dagarna kronologiskt', () => {
    const matches = [
      sched('m2', '2026-06-12T19:00:00.000Z'), // 06-12 svensk
      sched('m1', '2026-06-11T19:00:00.000Z'), // 06-11 svensk
      sched('m3', '2026-06-12T22:00:00.000Z'), // 06-13 svensk (00:00 nästa dag!)
    ];
    const days = groupMatchesByDay(matches);

    expect(days.map((d) => d.dateKey)).toEqual(['2026-06-11', '2026-06-12', '2026-06-13']);
    // m3 (22:00Z = 00:00 svensk nästa dag) hamnar på 06-13, inte 06-12.
    expect(days.find((d) => d.dateKey === '2026-06-13')?.matches.map((m) => m.id)).toEqual(['m3']);
  });

  it('sorterar matcherna inom en dag på avsparkstid (tidigast först)', () => {
    // Alla tre på samma SVENSKA dag (06-11): 21:00Z = 23:00 svensk är fortfarande
    // 06-11, men 22:00Z = 00:00 svensk vore nästa dag, så vi håller oss under den.
    const matches = [
      sched('sen', '2026-06-11T21:00:00.000Z'),
      sched('tidig', '2026-06-11T16:00:00.000Z'),
      sched('mitten', '2026-06-11T19:00:00.000Z'),
    ];
    const days = groupMatchesByDay(matches);

    expect(days).toHaveLength(1);
    expect(days[0].dateKey).toBe('2026-06-11');
    expect(days[0].matches.map((m) => m.id)).toEqual(['tidig', 'mitten', 'sen']);
  });

  it('tom indata ger en tom lista (normalfall: idag före turneringen)', () => {
    expect(groupMatchesByDay([])).toEqual([]);
  });

  it('muterar inte sina argument', () => {
    const matches = [
      sched('b', '2026-06-11T22:00:00.000Z'),
      sched('a', '2026-06-11T16:00:00.000Z'),
    ];
    const before = matches.map((m) => m.id);
    groupMatchesByDay(matches);
    expect(matches.map((m) => m.id)).toEqual(before);
  });
});
