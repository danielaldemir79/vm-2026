import { describe, expect, it } from 'vitest';
import { selectPredictableMatches, selectOpenPredictableMatches } from './predictable-matches';
import type { Match } from '../../domain/types';

/** Liten match-byggare för testerna (bara fälten selektorn bryr sig om). */
function match(partial: Partial<Match> & Pick<Match, 'id'>): Match {
  return {
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'mex',
    awayTeamId: 'rsa',
    kickoff: '2026-06-20T18:00:00.000Z',
    venue: 'x',
    result: null,
    status: 'scheduled',
    ...partial,
  } as Match;
}

describe('selectPredictableMatches', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('tar bara med matcher där BÅDA lag är kända (slutspel med okända lag filtreras)', () => {
    const matches = [
      match({ id: 'g-A-1' }),
      match({ id: 'M73', stage: 'round-of-32', groupId: null, homeTeamId: null, awayTeamId: null }),
      match({
        id: 'M74',
        stage: 'round-of-32',
        groupId: null,
        homeTeamId: 'mex',
        awayTeamId: null,
      }),
    ];
    const result = selectPredictableMatches(matches, now);
    expect(result.map((p) => p.match.id)).toEqual(['g-A-1']);
  });

  it('sorterar tidigast först (kommande matcher överst)', () => {
    const matches = [
      match({ id: 'late', kickoff: '2026-06-25T18:00:00.000Z' }),
      match({ id: 'early', kickoff: '2026-06-16T18:00:00.000Z' }),
      match({ id: 'mid', kickoff: '2026-06-20T18:00:00.000Z' }),
    ];
    expect(selectPredictableMatches(matches, now).map((p) => p.match.id)).toEqual([
      'early',
      'mid',
      'late',
    ]);
  });

  it('härleder LÅST (avspark passerad) mot now, OLÅST annars', () => {
    const matches = [
      match({ id: 'past', kickoff: '2026-06-14T18:00:00.000Z' }), // före now
      match({ id: 'future', kickoff: '2026-06-20T18:00:00.000Z' }), // efter now
    ];
    const byId = new Map(selectPredictableMatches(matches, now).map((p) => [p.match.id, p.locked]));
    expect(byId.get('past')).toBe(true);
    expect(byId.get('future')).toBe(false);
  });

  it('RANDFALL: exakt på avspark (now === kickoff) räknas som LÅST', () => {
    const m = match({ id: 'edge', kickoff: '2026-06-15T12:00:00.000Z' });
    expect(selectPredictableMatches([m], now)[0].locked).toBe(true);
  });

  it('tom indata -> tom lista', () => {
    expect(selectPredictableMatches([], now)).toEqual([]);
  });
});

describe('selectOpenPredictableMatches', () => {
  it('returnerar BARA de olåsta (kommande), inte de redan avsparkade', () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    const matches = [
      match({ id: 'past', kickoff: '2026-06-14T18:00:00.000Z' }),
      match({ id: 'future', kickoff: '2026-06-20T18:00:00.000Z' }),
    ];
    expect(selectOpenPredictableMatches(matches, now).map((p) => p.match.id)).toEqual(['future']);
  });
});
