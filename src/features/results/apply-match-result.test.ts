import { describe, expect, it } from 'vitest';
import { applyMatchResult } from './apply-match-result';
import type { Match } from '../../domain/types';

/** En scheduled gruppmatch (kort). */
function scheduled(id: string, home: string, away: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: home,
    awayTeamId: away,
    kickoff: '2026-06-12T19:00:00Z',
    venue: 'Testarena',
    tvChannel: 'SVT1',
    trivia: 'kuriosa',
    result: null,
    status: 'scheduled',
  };
}

/** En finished gruppmatch (kort). */
function finished(id: string, home: string, away: string, hg: number, ag: number): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: home,
    awayTeamId: away,
    kickoff: '2026-06-12T19:00:00Z',
    venue: 'Testarena',
    result: { homeGoals: hg, awayGoals: ag },
    status: 'finished',
  };
}

/** En scheduled SLUTSPELSmatch (kort), för straff-fallen (FIFA Art. 14). */
function scheduledKnockout(id: string, home: string, away: string): Match {
  return {
    id,
    stage: 'round-of-32',
    groupId: null,
    homeTeamId: home,
    awayTeamId: away,
    kickoff: '2026-07-01T19:00:00Z',
    venue: 'Testarena',
    result: null,
    status: 'scheduled',
  };
}

describe('applyMatchResult, lyckad inmatning', () => {
  it('sätter ett finished-resultat på en scheduled match (ny diskriminerad form)', () => {
    const matches: Match[] = [scheduled('m1', 'mex', 'rsa'), scheduled('m2', 'kor', 'cze')];
    const next = applyMatchResult(matches, 'm1', {
      homeGoals: 2,
      awayGoals: 0,
      status: 'finished',
    });

    const m1 = next.find((m) => m.id === 'm1')!;
    expect(m1.status).toBe('finished');
    expect(m1.result).toEqual({ homeGoals: 2, awayGoals: 0 });
    // Gemensamma fält bevaras (groupId, lag, arena, tvChannel, trivia).
    expect(m1.groupId).toBe('A');
    expect(m1.homeTeamId).toBe('mex');
    expect(m1.tvChannel).toBe('SVT1');
    expect(m1.trivia).toBe('kuriosa');
  });

  it('returnerar en NY array och rör inte de andra matchernas referens (immutabelt)', () => {
    const m2 = scheduled('m2', 'kor', 'cze');
    const matches: Match[] = [scheduled('m1', 'mex', 'rsa'), m2];
    const next = applyMatchResult(matches, 'm1', {
      homeGoals: 1,
      awayGoals: 1,
      status: 'finished',
    });

    expect(next).not.toBe(matches); // ny array-referens (React ser ändringen)
    expect(next).toHaveLength(2);
    expect(next.find((m) => m.id === 'm2')).toBe(m2); // oförändrad match: samma referens
    // Ursprungslistan muteras inte.
    expect(matches.find((m) => m.id === 'm1')!.status).toBe('scheduled');
  });

  it('backar ett finished till live och NOLLAR resultatet (ingen stale result-rest)', () => {
    const matches: Match[] = [finished('m1', 'mex', 'rsa', 3, 1)];
    const next = applyMatchResult(matches, 'm1', {
      homeGoals: null,
      awayGoals: null,
      status: 'live',
    });
    const m1 = next.find((m) => m.id === 'm1')!;
    expect(m1.status).toBe('live');
    expect(m1.result).toBeNull();
  });

  it('redigerar ett befintligt finished-resultat', () => {
    const matches: Match[] = [finished('m1', 'mex', 'rsa', 1, 0)];
    const next = applyMatchResult(matches, 'm1', {
      homeGoals: 4,
      awayGoals: 2,
      status: 'finished',
    });
    expect(next[0].result).toEqual({ homeGoals: 4, awayGoals: 2 });
  });
});

// F1/penalties-pinnen (acceptanstest): en slutspelsmatch som avgörs på straffar
// måste BEVARA straffarna genom reducern (förr tappades de tyst).
describe('applyMatchResult, slutspels-straffar (F1-pinnen, FIFA Art. 14)', () => {
  it('sätter ett straff-avgjort slutspels-resultat och BEVARAR penalties', () => {
    const matches: Match[] = [scheduledKnockout('M73', 'mex', 'rsa')];
    const next = applyMatchResult(matches, 'M73', {
      homeGoals: 1,
      awayGoals: 1,
      status: 'finished',
      penalties: { homeGoals: 4, awayGoals: 2 },
    });
    const m = next.find((x) => x.id === 'M73')!;
    expect(m.status).toBe('finished');
    expect(m.result).toEqual({
      homeGoals: 1,
      awayGoals: 1,
      penalties: { homeGoals: 4, awayGoals: 2 },
    });
  });

  it('REDIGERAR ett finished straff-resultat och bevarar de nya straffarna', () => {
    // En finished slutspelsmatch (1-1, straffar 4-2) redigeras till andra straffar.
    const knockoutFinished: Match = {
      id: 'M73',
      stage: 'round-of-32',
      groupId: null,
      homeTeamId: 'mex',
      awayTeamId: 'rsa',
      kickoff: '2026-07-01T19:00:00Z',
      venue: 'Testarena',
      result: { homeGoals: 1, awayGoals: 1, penalties: { homeGoals: 4, awayGoals: 2 } },
      status: 'finished',
    };
    const next = applyMatchResult([knockoutFinished], 'M73', {
      homeGoals: 2,
      awayGoals: 2,
      status: 'finished',
      penalties: { homeGoals: 5, awayGoals: 6 },
    });
    expect(next[0].result).toEqual({
      homeGoals: 2,
      awayGoals: 2,
      penalties: { homeGoals: 5, awayGoals: 6 },
    });
  });

  it('kastar (fail loud) på en lika slutspelsmatch UTAN straff-vinnare', () => {
    const matches: Match[] = [scheduledKnockout('M73', 'mex', 'rsa')];
    expect(() =>
      applyMatchResult(matches, 'M73', { homeGoals: 1, awayGoals: 1, status: 'finished' })
    ).toThrow(/ogiltig inmatning/);
  });
});

describe('applyMatchResult, fel-vägar (fail loud)', () => {
  it('kastar på ett okänt matchId', () => {
    const matches: Match[] = [scheduled('m1', 'mex', 'rsa')];
    expect(() =>
      applyMatchResult(matches, 'saknas', { homeGoals: 1, awayGoals: 0, status: 'finished' })
    ).toThrow(/ingen match med id/);
  });

  it('kastar på en ogiltig inmatning (finished utan resultat) i stället för att korrumpera listan', () => {
    const matches: Match[] = [scheduled('m1', 'mex', 'rsa')];
    expect(() =>
      applyMatchResult(matches, 'm1', { homeGoals: null, awayGoals: null, status: 'finished' })
    ).toThrow(/ogiltig inmatning/);
  });

  it('kastar på negativa mål (skyddsnät även om UI redan validerat)', () => {
    const matches: Match[] = [scheduled('m1', 'mex', 'rsa')];
    expect(() =>
      applyMatchResult(matches, 'm1', { homeGoals: -1, awayGoals: 0, status: 'finished' })
    ).toThrow(/ogiltig inmatning/);
  });
});
