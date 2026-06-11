import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RevealView } from './RevealView';
import { LeaderboardStoreContext, type LeaderboardStore } from './leaderboard-context';
import type { RevealedMatch } from './reveal';
import type { Team } from '../../domain/types';

const TEAMS: Team[] = [
  { id: 'mex', name: 'Mexiko', code: 'MEX', group: 'A' },
  { id: 'kor', name: 'Sydkorea', code: 'KOR', group: 'A' },
];

function store(partial: Partial<LeaderboardStore>): LeaderboardStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    activeRoomId: 'r1',
    leaderboard: [],
    reveal: [],
    teams: TEAMS,
    ...partial,
  };
}

function renderView(s: LeaderboardStore) {
  return render(
    <LeaderboardStoreContext.Provider value={s}>
      <RevealView />
    </LeaderboardStoreContext.Provider>
  );
}

const revealedMatch: RevealedMatch = {
  matchId: 'g-A-1',
  homeTeamId: 'mex',
  awayTeamId: 'kor',
  kickoff: '2026-06-12T18:00:00Z',
  actual: { homeGoals: 2, awayGoals: 1 },
  picks: [
    { userId: 'u1', displayName: 'Anna', predicted: { homeGoals: 2, awayGoals: 1 }, points: 3 },
    { userId: 'u2', displayName: 'Bertil', predicted: { homeGoals: 0, awayGoals: 0 }, points: 0 },
  ],
};

describe('RevealView, avslöjande-vyn', () => {
  it('renderar INGET när det inte finns något avgjort att avslöja (tyst)', () => {
    const { container } = renderView(store({ reveal: [] }));
    expect(container.querySelector('[data-reveal-view]')).not.toBeInTheDocument();
  });

  it('renderar INGET innan storen är ready (laddar/utan rum)', () => {
    const { container } = renderView(
      store({ enabled: false, status: 'idle', reveal: [revealedMatch] })
    );
    expect(container.querySelector('[data-reveal-view]')).not.toBeInTheDocument();
  });

  it('visar match-rubrik med lagnamn + facit', () => {
    renderView(store({ reveal: [revealedMatch] }));
    expect(screen.getByText('Mexiko mot Sydkorea')).toBeInTheDocument();
    const { container } = renderView(store({ reveal: [revealedMatch] }));
    expect(container.querySelector('[data-reveal-actual]')).toHaveTextContent('2-1');
  });

  it('listar allas tips med predikterad ställning + poäng', () => {
    const { container } = renderView(store({ reveal: [revealedMatch] }));
    const picks = container.querySelectorAll('[data-reveal-pick]');
    expect(picks).toHaveLength(2);
    const first = picks[0] as HTMLElement;
    expect(first.getAttribute('data-user-id')).toBe('u1');
    expect(first.getAttribute('data-points')).toBe('3');
    expect(within(first).getByText('Anna')).toBeInTheDocument();
    expect(within(first).getByText('2-1')).toBeInTheDocument();
  });

  it('visar "ingen tippade" när en avgjord match saknar picks', () => {
    const noPicks: RevealedMatch = { ...revealedMatch, picks: [] };
    const { container } = renderView(store({ reveal: [noPicks] }));
    expect(container.querySelector('[data-reveal-no-picks]')).toBeInTheDocument();
  });

  it('okänt lag-id faller tillbaka på "Okänt lag" (ingen krasch)', () => {
    const unknown: RevealedMatch = { ...revealedMatch, homeTeamId: null, awayTeamId: 'xyz' };
    renderView(store({ reveal: [unknown] }));
    expect(screen.getByText('Okänt lag mot xyz')).toBeInTheDocument();
  });
});
