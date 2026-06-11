import { describe, expect, it } from 'vitest';
import { render, within } from '@testing-library/react';
import { LeaderboardSummary } from './LeaderboardSummary';
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
    currentUserId: null,
    ...partial,
  };
}

function renderView(s: LeaderboardStore) {
  return render(
    <LeaderboardStoreContext.Provider value={s}>
      <LeaderboardSummary />
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

const board: LeaderboardEntry[] = [
  entry('u1', 'Anna', 12, 1, 2),
  entry('u2', 'Bertil', 12, 1, 1),
  entry('u3', 'Cecilia', 5, 3),
];

describe('LeaderboardSummary, egen-poäng-panel (ÖVERST)', () => {
  it('visar AKTUELL användares poäng + placering ("Plats N av M")', () => {
    const { container } = renderView(store({ leaderboard: board, currentUserId: 'u3' }));
    const panel = container.querySelector('[data-leaderboard-self-summary]');
    expect(panel).not.toBeNull();
    // Data-seam: rank + poäng på panelen (för design-frontend + test).
    expect(panel?.getAttribute('data-rank')).toBe('3');
    expect(panel?.getAttribute('data-points')).toBe('5');
    // Synlig text (läses även av skärmläsare).
    expect(within(panel as HTMLElement).getByText(/Plats 3 av 3/)).toBeInTheDocument();
    expect(within(panel as HTMLElement).getByText(/5 poäng/)).toBeInTheDocument();
  });

  it('speglar DELAD placering (rank 1 för Bertil fast han står på rad 2)', () => {
    const { container } = renderView(store({ leaderboard: board, currentUserId: 'u2' }));
    const panel = container.querySelector('[data-leaderboard-self-summary]');
    expect(panel?.getAttribute('data-rank')).toBe('1');
    expect(within(panel as HTMLElement).getByText(/Plats 1 av 3/)).toBeInTheDocument();
  });

  it('utan känd identitet (currentUserId null) visas INGEN egen-poäng-panel', () => {
    const { container } = renderView(store({ leaderboard: board, currentUserId: null }));
    expect(container.querySelector('[data-leaderboard-self-summary]')).toBeNull();
  });

  it('när användaren inte finns i listan visas INGEN egen-poäng-panel (ingen gissning)', () => {
    const { container } = renderView(store({ leaderboard: board, currentUserId: 'u-finns-ej' }));
    expect(container.querySelector('[data-leaderboard-self-summary]')).toBeNull();
  });

  it('renderar INGET innan storen är ready (laddar/utan rum)', () => {
    const { container } = renderView(
      store({ enabled: false, status: 'idle', leaderboard: board, currentUserId: 'u3' })
    );
    expect(container.querySelector('[data-leaderboard-summary]')).toBeNull();
  });
});

describe('LeaderboardSummary, "Så funkar poängen"-förklaring', () => {
  it('förklarar match-poängen 3 / 1 / 0 i klartext', () => {
    const { container } = renderView(store({ leaderboard: board, currentUserId: 'u3' }));
    const legend = container.querySelector('[data-leaderboard-score-legend]');
    expect(legend).not.toBeNull();
    const text = (legend as HTMLElement).textContent ?? '';
    expect(text).toContain('3 p');
    expect(text).toContain('exakt resultat');
    expect(text).toContain('1 p');
    expect(text).toContain('rätt vinnare');
    expect(text).toContain('0 p');
  });

  it('NÄMNER att special-tips (gruppvinnare, VM-vinnare) finns/kommer', () => {
    const { container } = renderView(store({ leaderboard: board, currentUserId: 'u3' }));
    const legend = container.querySelector('[data-leaderboard-score-legend]');
    const text = (legend as HTMLElement).textContent ?? '';
    expect(text).toContain('gruppvinnare');
    expect(text).toContain('VM-vinnare');
  });

  it('förklaringen visas även UTAN en känd egen rad (currentUserId null)', () => {
    // "Så funkar poängen" hör inte ihop med den egna raden, den ska finnas oavsett.
    const { container } = renderView(store({ leaderboard: board, currentUserId: null }));
    expect(container.querySelector('[data-leaderboard-self-summary]')).toBeNull();
    expect(container.querySelector('[data-leaderboard-score-legend]')).not.toBeNull();
  });
});
