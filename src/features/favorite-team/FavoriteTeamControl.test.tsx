// Tester för favoritlags-väljaren (T23, #23): a11y-kopplad label, valet anropar
// onSelect, "Inget favoritlag" + Ta bort-knappen anropar onClear, och Ta bort visas
// bara när ett lag är pinnat.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Team } from '../../domain/types';
import { FavoriteTeamControl } from './FavoriteTeamControl';

const TEAMS: Team[] = [
  { id: 'bra', name: 'Brasilien', code: 'BRA', group: 'A' },
  { id: 'arg', name: 'Argentina', code: 'ARG', group: 'B' },
  { id: 'bih', name: 'Bosnien och Hercegovina', shortName: 'Bosnien', code: 'BIH', group: 'A' },
];

function renderControl(favoriteTeamId: string | null) {
  const onSelect = vi.fn();
  const onClear = vi.fn();
  render(
    <FavoriteTeamControl
      teams={TEAMS}
      favoriteTeamId={favoriteTeamId}
      onSelect={onSelect}
      onClear={onClear}
    />
  );
  return { onSelect, onClear };
}

describe('FavoriteTeamControl', () => {
  it('label är kopplad till select:en (a11y) och listar lagen', () => {
    renderControl(null);
    const select = screen.getByLabelText('Ditt favoritlag');
    expect(select.tagName).toBe('SELECT');
    // Visar det KORTA namnet i den trånga väljaren (Bosnien, inte hela namnet).
    expect(screen.getByRole('option', { name: 'Bosnien' })).toBeTruthy();
  });

  it('att välja ett lag anropar onSelect med lagets id', () => {
    const { onSelect } = renderControl(null);
    fireEvent.change(screen.getByLabelText('Ditt favoritlag'), { target: { value: 'arg' } });
    expect(onSelect).toHaveBeenCalledWith('arg');
  });

  it('att välja "Inget favoritlag" anropar onClear (inte onSelect)', () => {
    const { onSelect, onClear } = renderControl('bra');
    fireEvent.change(screen.getByLabelText('Ditt favoritlag'), { target: { value: '' } });
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Ta bort-knappen visas bara när ett lag är pinnat och anropar onClear', () => {
    const { onClear } = renderControl('bra');
    const clearButton = screen.getByRole('button', { name: 'Ta bort' });
    fireEvent.click(clearButton);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('Ta bort-knappen saknas när inget lag är pinnat', () => {
    renderControl(null);
    expect(screen.queryByRole('button', { name: 'Ta bort' })).toBeNull();
  });
});
