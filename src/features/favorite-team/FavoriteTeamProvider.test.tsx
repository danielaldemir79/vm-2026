// Tester för favoritlags-providern (T23, #23): lazy-init ur localStorage, setter
// persistar + uppdaterar storen, clear rensar. Den toleranta hooken (ingen provider
// -> inget favoritlag, no-op-setter) testas också.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FavoriteTeamProvider } from './FavoriteTeamProvider';
import { useFavoriteTeam } from './favorite-team-context';
import { FAVORITE_TEAM_KEY } from './favorite-team-storage';

/** Liten testkonsument som visar storen + exponerar knappar för set/clear. */
function Probe() {
  const { favoriteTeamId, setFavoriteTeam, clearFavoriteTeam } = useFavoriteTeam();
  return (
    <div>
      <span data-testid="value">{favoriteTeamId ?? 'none'}</span>
      <button onClick={() => setFavoriteTeam('bra')}>set</button>
      <button onClick={clearFavoriteTeam}>clear</button>
    </div>
  );
}

describe('FavoriteTeamProvider', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('lazy-init: läser det sparade laget ur localStorage vid mount', () => {
    window.localStorage.setItem(FAVORITE_TEAM_KEY, 'arg');
    render(
      <FavoriteTeamProvider>
        <Probe />
      </FavoriteTeamProvider>
    );
    expect(screen.getByTestId('value').textContent).toBe('arg');
  });

  it('setFavoriteTeam uppdaterar storen OCH persistar i localStorage', () => {
    render(
      <FavoriteTeamProvider>
        <Probe />
      </FavoriteTeamProvider>
    );
    fireEvent.click(screen.getByText('set'));
    expect(screen.getByTestId('value').textContent).toBe('bra');
    expect(window.localStorage.getItem(FAVORITE_TEAM_KEY)).toBe('bra');
  });

  it('clearFavoriteTeam nollar storen OCH rensar nyckeln', () => {
    window.localStorage.setItem(FAVORITE_TEAM_KEY, 'bra');
    render(
      <FavoriteTeamProvider>
        <Probe />
      </FavoriteTeamProvider>
    );
    fireEvent.click(screen.getByText('clear'));
    expect(screen.getByTestId('value').textContent).toBe('none');
    expect(window.localStorage.getItem(FAVORITE_TEAM_KEY)).toBeNull();
  });

  it('utan provider: tolerant fallback (inget favoritlag, no-op-setter kastar inte)', () => {
    render(<Probe />);
    expect(screen.getByTestId('value').textContent).toBe('none');
    // No-op-setter får inte krascha en konsument utan provider.
    expect(() => fireEvent.click(screen.getByText('set'))).not.toThrow();
    expect(screen.getByTestId('value').textContent).toBe('none');
  });
});
