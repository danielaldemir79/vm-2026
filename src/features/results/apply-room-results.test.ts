import { describe, expect, it } from 'vitest';
import type { Match } from '../../domain/types';
import type { RoomMatchResult } from '../../data/rooms';
import { applyRoomResults } from './apply-room-results';

// Minimala matcher (bara fälten applyMatchResult/buildMatch behöver). En gruppmatch
// (oavgjort står sig) och en slutspelsmatch (straffar kan krävas, FIFA Article 14).
function groupMatch(id: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: 't1',
    awayTeamId: 't2',
    kickoff: '2026-06-12T18:00:00Z',
    venue: 'Arena',
    status: 'scheduled',
    result: null,
  };
}

function knockoutMatch(id: string): Match {
  return {
    id,
    stage: 'round-of-16',
    groupId: null,
    homeTeamId: 't3',
    awayTeamId: 't4',
    kickoff: '2026-07-01T18:00:00Z',
    venue: 'Arena',
    status: 'scheduled',
    result: null,
  };
}

function roomResult(partial: Partial<RoomMatchResult> & { matchId: string }): RoomMatchResult {
  return {
    homeGoals: 0,
    awayGoals: 0,
    penalties: null,
    status: 'finished',
    updatedBy: 'someone',
    updatedAt: '2026-06-12T20:00:00Z',
    ...partial,
  };
}

describe('applyRoomResults, väv in delade rums-resultat', () => {
  it('returnerar matcherna OFÖRÄNDRADE när det inte finns några delade resultat (lokalt läge)', () => {
    const matches = [groupMatch('M1'), groupMatch('M2')];
    const result = applyRoomResults(matches, []);
    // Samma referens: ingen onödig ny array när inget ska vävas (KISS).
    expect(result).toBe(matches);
  });

  it('skriver in ett delat FINISHED-resultat på rätt match (alla medlemmar ser samma)', () => {
    const matches = [groupMatch('M1'), groupMatch('M2')];
    const shared = [roomResult({ matchId: 'M1', homeGoals: 3, awayGoals: 1 })];
    const result = applyRoomResults(matches, shared);

    const m1 = result.find((m) => m.id === 'M1')!;
    expect(m1.status).toBe('finished');
    expect(m1.result).toEqual({ homeGoals: 3, awayGoals: 1 });
    // M2 orörd (samma referens bevarad).
    expect(result.find((m) => m.id === 'M2')).toBe(matches[1]);
  });

  it('bevarar straffar för ett delat slutspelsresultat (FIFA Article 14)', () => {
    const matches = [knockoutMatch('M90')];
    const shared = [
      roomResult({
        matchId: 'M90',
        homeGoals: 1,
        awayGoals: 1,
        penalties: { homeGoals: 4, awayGoals: 2 },
      }),
    ];
    const result = applyRoomResults(matches, shared);
    const m90 = result.find((m) => m.id === 'M90')!;
    expect(m90.status).toBe('finished');
    expect(m90.result).toEqual({
      homeGoals: 1,
      awayGoals: 1,
      penalties: { homeGoals: 4, awayGoals: 2 },
    });
  });

  it('nollar mål för en icke-finished delad status (status<->resultat-kontraktet)', () => {
    // En delad rad med status 'live' bär 0-0 i DB (NOT NULL), men en live-match
    // får INTE bära ett resultat. Vävningen ska ge status live + result null.
    const matches = [groupMatch('M1')];
    const shared = [roomResult({ matchId: 'M1', status: 'live', homeGoals: 0, awayGoals: 0 })];
    const result = applyRoomResults(matches, shared);
    const m1 = result.find((m) => m.id === 'M1')!;
    expect(m1.status).toBe('live');
    expect(m1.result).toBeNull();
  });

  it('HOPPAR tyst över en delad rad med okänt match_id (fail-safe, väver resten)', () => {
    const matches = [groupMatch('M1')];
    const shared = [
      roomResult({ matchId: 'M999', homeGoals: 5, awayGoals: 0 }), // okänd, ska hoppas
      roomResult({ matchId: 'M1', homeGoals: 2, awayGoals: 0 }),
    ];
    const result = applyRoomResults(matches, shared);
    // M1 vävdes in trots den okända raden före den (en dålig rad isoleras).
    const m1 = result.find((m) => m.id === 'M1')!;
    expect(m1.status).toBe('finished');
    expect(m1.result).toEqual({ homeGoals: 2, awayGoals: 0 });
    expect(result).toHaveLength(1);
  });

  it('är IDEMPOTENT: samma delade resultat ger samma matchläge (sista-skrivet-vinner)', () => {
    const matches = [groupMatch('M1')];
    const once = applyRoomResults(matches, [
      roomResult({ matchId: 'M1', homeGoals: 2, awayGoals: 2 }),
    ]);
    const twice = applyRoomResults(once, [
      roomResult({ matchId: 'M1', homeGoals: 2, awayGoals: 2 }),
    ]);
    expect(twice.find((m) => m.id === 'M1')).toEqual(once.find((m) => m.id === 'M1'));
  });
});
