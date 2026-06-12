import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
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
    currentUserId: null,
    selfBreakdown: null,
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

describe('LeaderboardView, premium-finish (podium + du + ledare)', () => {
  const board = [
    entry('u1', 'Anna', 12, 1, 2),
    entry('u2', 'Bertil', 8, 2),
    entry('u3', 'Cecilia', 5, 3),
    entry('u4', 'David', 2, 4),
  ];

  it('topp-3 bär pallplats-MEDALJER (guld/silver/brons), plats 4+ en neutral rank-bricka', () => {
    const { container } = renderView(store({ leaderboard: board }));
    const rows = Array.from(container.querySelectorAll('[data-leaderboard-row]'));
    const rankCell = (row: Element) => row.querySelector('[data-leaderboard-rank]');
    expect(rankCell(rows[0])?.classList.contains('vm-pool-medal--gold')).toBe(true);
    expect(rankCell(rows[1])?.classList.contains('vm-pool-medal--silver')).toBe(true);
    expect(rankCell(rows[2])?.classList.contains('vm-pool-medal--bronze')).toBe(true);
    // Plats 4: ingen medalj, neutral rank-bricka i stället.
    expect(rankCell(rows[3])?.classList.contains('vm-board-rank')).toBe(true);
    expect(rankCell(rows[3])?.classList.contains('vm-pool-medal')).toBe(false);
  });

  it('ledar-raden (rank 1) markeras färg-OBEROENDE via data-leader (dekor-hak)', () => {
    const { container } = renderView(store({ leaderboard: board }));
    const rows = container.querySelectorAll('[data-leaderboard-row]');
    expect(rows[0].getAttribute('data-leader')).toBe('true');
    expect(rows[1].getAttribute('data-leader')).toBeNull();
  });

  it('EGNA raden ("du") framhävs färg-OBEROENDE: data-self + en läsbar "Du"-bricka', () => {
    const { container } = renderView(store({ leaderboard: board, currentUserId: 'u3' }));
    const rows = Array.from(container.querySelectorAll('[data-leaderboard-row]'));
    const self = rows.find((r) => r.getAttribute('data-user-id') === 'u3');
    expect(self?.getAttribute('data-self')).toBe('true');
    // Brickan finns BARA på egna raden (en redundant TEXT-signal, inte bara färg).
    expect(self?.querySelector('[data-leaderboard-self]')?.textContent).toBe('Du');
    const others = rows.filter((r) => r.getAttribute('data-user-id') !== 'u3');
    for (const o of others) {
      expect(o.getAttribute('data-self')).toBeNull();
      expect(o.querySelector('[data-leaderboard-self]')).toBeNull();
    }
  });

  it('utan känd egen identitet (currentUserId null) markeras INGEN rad som "du"', () => {
    const { container } = renderView(store({ leaderboard: board, currentUserId: null }));
    expect(container.querySelector('[data-self="true"]')).toBeNull();
    expect(container.querySelector('[data-leaderboard-self]')).toBeNull();
  });
});

describe('LeaderboardView, placerings-puls (data-rank-changed nollas så den kan triggas igen)', () => {
  // C3-regression (Copilot): puls-flaggan måste NOLLAS efter att pulsen spelat, annars
  // står data-rank-changed kvar på 'true' och en SENARE omsortering av samma rad kan inte
  // tända CSS-pulsen igen (engångs-animationen startar bara om vid en av->på-toggling).
  // 1100 ms = pulsens längd (RANK_PULSE_MS i vyn, speglar vm-board-rank-pulse 1.1s i CSS).
  const rowAttr = (container: HTMLElement, userId: string) =>
    container
      .querySelector(`[data-leaderboard-row][data-user-id="${userId}"]`)
      ?.getAttribute('data-rank-changed') ?? null;

  it('flaggan tänds vid omsortering, nollas efter pulsen, och tänds IGEN vid nästa omsortering', () => {
    vi.useFakeTimers();
    try {
      // Anna 1:a, Bertil 2:a vid första laddningen (ingen puls första gången = inte brus).
      const before = [entry('u1', 'Anna', 12, 1), entry('u2', 'Bertil', 8, 2)];
      const { container, rerender } = renderView(store({ leaderboard: before }));
      const rerenderWith = (leaderboard: LeaderboardEntry[]) =>
        act(() => {
          rerender(
            <LeaderboardStoreContext.Provider value={store({ leaderboard })}>
              <LeaderboardView />
            </LeaderboardStoreContext.Provider>
          );
        });

      // Första laddningen pulsar INTE (ingen tidigare rank att jämföra mot).
      expect(rowAttr(container, 'u1')).toBeNull();
      expect(rowAttr(container, 'u2')).toBeNull();

      // OMSORTERING 1: Bertil går om Anna. Bertil (u2) bytte plats -> pulsen tänds.
      rerenderWith([entry('u2', 'Bertil', 14, 1), entry('u1', 'Anna', 12, 2)]);
      expect(rowAttr(container, 'u2')).toBe('true');

      // Pulsen spelar klart -> flaggan NOLLAS (annars kan den aldrig tändas igen).
      act(() => vi.advanceTimersByTime(1100));
      expect(rowAttr(container, 'u2')).toBeNull();

      // OMSORTERING 2: Anna går om Bertil igen. Bertil (u2) bytte plats PÅ NYTT.
      // Eftersom flaggan nollades kan pulsen triggas igen (av->på), det är hela poängen.
      rerenderWith([entry('u1', 'Anna', 20, 1), entry('u2', 'Bertil', 14, 2)]);
      expect(rowAttr(container, 'u2')).toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });
});
