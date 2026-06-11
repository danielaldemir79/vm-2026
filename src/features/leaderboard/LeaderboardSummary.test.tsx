import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

// "Så funkar poängen" vid topplistan är nu den DELADE ScoreGuide:n (T34, #62), samma
// komponent som vid tippningen, så den fulla förklaringen (match/grupp/slutspel/mästare
// med tal ur konstanterna) testas EN gång i ScoreGuide.test.tsx. Här vaktar vi bara
// integrationen: knappen finns, är nåbar oavsett egen rad, och öppnar dialogen.
describe('LeaderboardSummary, "Så funkar poängen" (delad ScoreGuide)', () => {
  it('visar ScoreGuide-knappen vid topplistan (surface "topplista")', () => {
    const { container } = renderView(store({ leaderboard: board, currentUserId: 'u3' }));
    expect(container.querySelector('[data-leaderboard-score-guide]')).not.toBeNull();
    const trigger = screen.getByRole('button', { name: /Så funkar poängen/i });
    expect(trigger).toHaveAttribute('data-score-guide-open', 'topplista');
  });

  it('knappen finns även UTAN en känd egen rad (currentUserId null)', () => {
    // "Så funkar poängen" hör inte ihop med den egna raden, den ska finnas oavsett.
    const { container } = renderView(store({ leaderboard: board, currentUserId: null }));
    expect(container.querySelector('[data-leaderboard-self-summary]')).toBeNull();
    expect(container.querySelector('[data-leaderboard-score-guide]')).not.toBeNull();
  });

  it('knappen öppnar förklarings-dialogen', async () => {
    renderView(store({ leaderboard: board, currentUserId: 'u3' }));
    fireEvent.click(screen.getByRole('button', { name: /Så funkar poängen/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
