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
    currentUserId: null,
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

describe('RevealView, FÄRG-OBEROENDE facit-markörer (premium-finish)', () => {
  const threePicks: RevealedMatch = {
    ...revealedMatch,
    picks: [
      { userId: 'u1', displayName: 'Anna', predicted: { homeGoals: 2, awayGoals: 1 }, points: 3 },
      { userId: 'u2', displayName: 'Bo', predicted: { homeGoals: 3, awayGoals: 1 }, points: 1 },
      { userId: 'u3', displayName: 'Cia', predicted: { homeGoals: 0, awayGoals: 0 }, points: 0 },
    ],
  };

  it('härleder utfalls-kategori ur poängen (3=exakt, 1=utfall, 0=miss) via data-outcome', () => {
    const { container } = renderView(store({ reveal: [threePicks] }));
    const picks = Array.from(container.querySelectorAll('[data-reveal-pick]'));
    expect(picks.map((p) => p.getAttribute('data-outcome'))).toEqual(['exact', 'outcome', 'miss']);
  });

  it('varje pick bär en markör som skiljer sig i FORM/IKON, inte bara färg', () => {
    const { container } = renderView(store({ reveal: [threePicks] }));
    const marks = Array.from(container.querySelectorAll('.vm-reveal-mark'));
    // Tre olika markör-klasser (form) + tre olika glyfer (ikon) = färg-oberoende.
    expect(marks[0].classList.contains('vm-reveal-mark--exact')).toBe(true);
    expect(marks[1].classList.contains('vm-reveal-mark--outcome')).toBe(true);
    expect(marks[2].classList.contains('vm-reveal-mark--miss')).toBe(true);
    const glyphs = marks.map((m) => m.textContent);
    expect(new Set(glyphs).size).toBe(3); // tre DISTINKTA glyfer
  });

  it('ger skärmläsaren utfallet i ORD (sr-only), inte bara visuellt', () => {
    renderView(store({ reveal: [threePicks] }));
    // De dolda ord-etiketterna finns i DOM:en (färg-oberoende för skärmläsare).
    expect(screen.getByText(/Exakt rätt/)).toBeInTheDocument();
    expect(screen.getByText(/Rätt utfall/)).toBeInTheDocument();
    expect(screen.getByText(/Bom/)).toBeInTheDocument();
  });
});
