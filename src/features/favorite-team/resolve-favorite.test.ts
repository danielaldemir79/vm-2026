// Tester för favoritlags-härledningen (T23, #23): uppslag mot lag-listan (inkl. det
// fail-safe-fall där ett pinnat id inte längre finns) + matchnings-predikatet.

import { describe, expect, it } from 'vitest';
import type { Team } from '../../domain/types';
import { resolveFavoriteTeam, matchHasFavorite } from './resolve-favorite';

const TEAMS: Team[] = [
  { id: 'bra', name: 'Brasilien', code: 'BRA', group: 'A' },
  { id: 'arg', name: 'Argentina', code: 'ARG', group: 'B' },
];

describe('resolveFavoriteTeam', () => {
  it('slår upp laget när id:t finns i lag-listan', () => {
    expect(resolveFavoriteTeam('bra', TEAMS)?.name).toBe('Brasilien');
  });

  it('null in -> null ut (inget pinnat)', () => {
    expect(resolveFavoriteTeam(null, TEAMS)).toBeNull();
  });

  it('IGNORERAR ett okänt/inaktuellt id tyst (fail-safe, inget spöklag)', () => {
    expect(resolveFavoriteTeam('finns-inte', TEAMS)).toBeNull();
  });
});

describe('matchHasFavorite', () => {
  it('sant när favoritlaget är HEMMA-lag', () => {
    expect(matchHasFavorite('bra', 'bra', 'arg')).toBe(true);
  });

  it('sant när favoritlaget är BORTA-lag', () => {
    expect(matchHasFavorite('arg', 'bra', 'arg')).toBe(true);
  });

  it('falskt när favoritlaget inte spelar i matchen', () => {
    expect(matchHasFavorite('bra', 'arg', 'fra')).toBe(false);
  });

  it('falskt när inget favoritlag är pinnat (null)', () => {
    expect(matchHasFavorite(null, 'bra', 'arg')).toBe(false);
  });

  it('falskt mot okända slutspelslag (null hemma/borta), aldrig en falsk träff', () => {
    expect(matchHasFavorite('bra', null, null)).toBe(false);
  });
});
