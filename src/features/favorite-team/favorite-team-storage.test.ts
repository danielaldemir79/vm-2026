// Tester för favoritlags-persistensen (T23, #23): skriv/läs/rensa över localStorage,
// plus fel-vägen där själva storage-åtkomsten kastar (blockerad/privat läge) , ingen
// krasch, persistensen hoppas bara över.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAVORITE_TEAM_KEY,
  readFavoriteTeamId,
  writeFavoriteTeamId,
  clearFavoriteTeamId,
} from './favorite-team-storage';

describe('favorite-team-storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('skriver och läser tillbaka ett pinnat favoritlag', () => {
    writeFavoriteTeamId('bra');
    expect(readFavoriteTeamId()).toBe('bra');
    expect(window.localStorage.getItem(FAVORITE_TEAM_KEY)).toBe('bra');
  });

  it('inget pinnat -> null', () => {
    expect(readFavoriteTeamId()).toBeNull();
  });

  it('rensar det pinnade laget', () => {
    writeFavoriteTeamId('arg');
    clearFavoriteTeamId();
    expect(readFavoriteTeamId()).toBeNull();
  });

  it('blockerad storage: läsning ger null utan att kasta (fail-safe)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(readFavoriteTeamId()).toBeNull();
  });

  it('blockerad storage: rensning kastar inte (fail loud men inte fatalt)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => clearFavoriteTeamId()).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});
