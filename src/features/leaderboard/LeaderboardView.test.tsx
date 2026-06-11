import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LeaderboardView } from './LeaderboardView';
import { LeaderboardStoreContext, type LeaderboardStore } from './leaderboard-context';
import type { LeaderboardEntry } from './aggregate-scores';

function store(partial: Partial<LeaderboardStore>): LeaderboardStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    activeRoomId: 'r1',
    leaderboard: [],
    reveal: [],
    teams: [],
    ...partial,
  };
}

function renderView(s: LeaderboardStore) {
  return render(
    <LeaderboardStoreContext.Provider value={s}>
      <LeaderboardView />
    </LeaderboardStoreContext.Provider>
  );
}

const entry = (
  userId: string,
  displayName: string,
  points: number,
  rank: number,
  exactHits = 0
): LeaderboardEntry => ({ userId, displayName, points, rank, exactHits });

describe('LeaderboardView, lägen', () => {
  it('renderar i ett etiketterat section-landmark', () => {
    renderView(store({ leaderboard: [entry('u1', 'Anna', 5, 1)] }));
    expect(screen.getByRole('heading', { name: 'Topplista' })).toBeInTheDocument();
  });

  it('UTAN aktivt rum visar "gå med i ett rum" (per rum)', () => {
    const { container } = renderView(store({ enabled: false, status: 'idle' }));
    expect(container.querySelector('[data-leaderboard-no-room]')).toBeInTheDocument();
    expect(container.querySelector('[data-leaderboard-list]')).not.toBeInTheDocument();
  });

  it('FEL-väg fail-loud:ar i en role=alert', () => {
    renderView(store({ status: 'error', error: 'Kunde inte ladda topplistan.' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Kunde inte ladda topplistan.');
  });

  it('LADDNING visar en role=status', () => {
    const { container } = renderView(store({ status: 'loading' }));
    expect(container.querySelector('[data-leaderboard-loading]')).toBeInTheDocument();
  });

  it('TOM lista (inga medlemmar) visar tom-text', () => {
    const { container } = renderView(store({ leaderboard: [] }));
    expect(container.querySelector('[data-leaderboard-empty]')).toBeInTheDocument();
  });
});

describe('LeaderboardView, rangordnad lista + data-seam', () => {
  const board = [
    entry('u1', 'Anna', 12, 1, 2),
    entry('u2', 'Bertil', 12, 1, 1),
    entry('u3', 'Cecilia', 5, 3),
  ];

  it('renderar en placerings-ordnad lista med rätt namn, poäng och rank', () => {
    const { container } = renderView(store({ leaderboard: board }));
    const rows = container.querySelectorAll('[data-leaderboard-row]');
    expect(rows).toHaveLength(3);
    // Rad 1: Anna, 12 poäng, rank 1.
    const first = rows[0];
    expect(first.getAttribute('data-user-id')).toBe('u1');
    expect(first.getAttribute('data-rank')).toBe('1');
    expect(first.getAttribute('data-points')).toBe('12');
    expect(within(first as HTMLElement).getByText('Anna')).toBeInTheDocument();
  });

  it('DELAD placering visas (två rank=1, en rank=3) via data-rank', () => {
    const { container } = renderView(store({ leaderboard: board }));
    const ranks = Array.from(container.querySelectorAll('[data-leaderboard-row]')).map((r) =>
      r.getAttribute('data-rank')
    );
    expect(ranks).toEqual(['1', '1', '3']);
  });

  it('placeringen är tillgänglig (aria-label "Placering N")', () => {
    renderView(store({ leaderboard: board }));
    // Två "Placering 1" (delad), en "Placering 3".
    expect(screen.getAllByLabelText('Placering 1')).toHaveLength(2);
    expect(screen.getByLabelText('Placering 3')).toBeInTheDocument();
  });

  it('varje rad har ett stabilt data-user-id (seam för rörelse-animationen)', () => {
    const { container } = renderView(store({ leaderboard: board }));
    const ids = Array.from(container.querySelectorAll('[data-leaderboard-row]')).map((r) =>
      r.getAttribute('data-user-id')
    );
    expect(ids).toEqual(['u1', 'u2', 'u3']);
  });
});
