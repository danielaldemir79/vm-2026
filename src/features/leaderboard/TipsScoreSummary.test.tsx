// Tester för poäng-summeringen + käll-detaljen överst i tips-vyn (T58, #99). FOKUS:
// total + placering (samma härledning som topplistan), käll-detaljens summa === totalen,
// och de tysta gate-fallen (ingen egen rad -> ingen panel).

import { describe, expect, it } from 'vitest';
import { render, within } from '@testing-library/react';
import { TipsScoreSummary } from './TipsScoreSummary';
import { LeaderboardStoreContext, type LeaderboardStore } from './leaderboard-context';
import type { LeaderboardEntry, ScoreBySource } from './aggregate-scores';

function entry(
  userId: string,
  displayName: string,
  points: number,
  rank: number,
  exactHits = 0
): LeaderboardEntry {
  return { userId, displayName, points, rank, exactHits };
}

function store(partial: Partial<LeaderboardStore>): LeaderboardStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    activeRoomId: 'r1',
    leaderboard: [],
    livePreliminary: false,
    reveal: [],
    teams: [],
    currentUserId: null,
    selfBreakdown: null,
    selfBadges: null,
    selfStats: null,
    ...partial,
  };
}

function renderView(s: LeaderboardStore) {
  return render(
    <LeaderboardStoreContext.Provider value={s}>
      <TipsScoreSummary />
    </LeaderboardStoreContext.Provider>
  );
}

// Anna delar rank 1 med Bertil (delad placering, T17), Cecilia rank 3.
const BOARD: LeaderboardEntry[] = [
  entry('u1', 'Anna', 29, 1, 1),
  entry('u2', 'Bertil', 29, 1, 0),
  entry('u3', 'Cecilia', 5, 3),
];

const FULL_BY_SOURCE: ScoreBySource = { match: 3, group: 5, bracket: 1, champion: 20 };

describe('TipsScoreSummary, summering överst i tips-vyn', () => {
  it('renderar INGET utan en känd egen rad (ingen identitet) -> tyst', () => {
    const { container } = renderView(store({ leaderboard: BOARD, currentUserId: null }));
    expect(container.querySelector('[data-tips-score-summary]')).not.toBeInTheDocument();
  });

  it('renderar INGET innan storen är ready (laddar/utan rum)', () => {
    const { container } = renderView(
      store({ enabled: false, status: 'idle', leaderboard: BOARD, currentUserId: 'u1' })
    );
    expect(container.querySelector('[data-tips-score-summary]')).not.toBeInTheDocument();
  });

  it('renderar INGET när identiteten inte finns i listan (inte medlem) -> ingen gissad rad', () => {
    const { container } = renderView(store({ leaderboard: BOARD, currentUserId: 'u-finns-ej' }));
    expect(container.querySelector('[data-tips-score-summary]')).not.toBeInTheDocument();
  });

  it('visar total + placering ur topplistan (samma härledning, ingen omräkning)', () => {
    const { container } = renderView(
      store({
        leaderboard: BOARD,
        currentUserId: 'u1',
        selfBreakdown: { bySource: FULL_BY_SOURCE, total: 29 },
      })
    );
    const panel = container.querySelector('[data-tips-score-summary]');
    expect(panel).toBeInTheDocument();
    expect(panel?.getAttribute('data-points')).toBe('29');
    expect(panel?.getAttribute('data-rank')).toBe('1');
    expect(container.querySelector('[data-tips-summary-rank]')).toHaveTextContent('Plats 1 av 3');
    expect(container.querySelector('[data-tips-summary-points]')).toHaveTextContent('29 p');
  });

  it('speglar DELAD placering troget (rank 1 även på rad 2 i sorteringen)', () => {
    // Bertil delar rank 1 med Anna men står på rad 2: panelen visar RANK (1), inte index.
    const { container } = renderView(
      store({
        leaderboard: BOARD,
        currentUserId: 'u2',
        selfBreakdown: { bySource: FULL_BY_SOURCE, total: 29 },
      })
    );
    expect(container.querySelector('[data-tips-summary-rank]')).toHaveTextContent('Plats 1 av 3');
  });

  it('visar käll-detaljen per källa (match/grupp/slutspel/VM-vinnare) i ordning', () => {
    const { container } = renderView(
      store({
        leaderboard: BOARD,
        currentUserId: 'u1',
        selfBreakdown: { bySource: FULL_BY_SOURCE, total: 29 },
      })
    );
    const rows = Array.from(container.querySelectorAll('[data-source-row]'));
    expect(rows.map((r) => r.getAttribute('data-source-row'))).toEqual([
      'match',
      'group',
      'bracket',
      'champion',
    ]);
    expect(rows.map((r) => within(r as HTMLElement).getByText(/p$/).textContent)).toEqual([
      '3 p',
      '5 p',
      '1 p',
      '20 p',
    ]);
  });

  it('käll-detaljens summa === totalen som visas överst (ingen drift)', () => {
    const { container } = renderView(
      store({
        leaderboard: BOARD,
        currentUserId: 'u1',
        selfBreakdown: { bySource: FULL_BY_SOURCE, total: 29 },
      })
    );
    const rowPoints = Array.from(container.querySelectorAll('[data-source-points]')).map((d) =>
      Number(d.textContent?.replace(' p', ''))
    );
    const sum = rowPoints.reduce((a, b) => a + b, 0);
    const total = Number(
      container.querySelector('[data-tips-score-summary]')?.getAttribute('data-points')
    );
    expect(sum).toBe(total);
    expect(sum).toBe(29);
  });

  it('visar totalen men UTELÄMNAR käll-detaljen om selfBreakdown saknas (total ur listan)', () => {
    // Total/placering kan plockas ur topplistan även utan uppdelning; då visas ingen detalj.
    const { container } = renderView(
      store({ leaderboard: BOARD, currentUserId: 'u3', selfBreakdown: null })
    );
    expect(container.querySelector('[data-tips-score-summary]')).toBeInTheDocument();
    expect(container.querySelector('[data-tips-summary-points]')).toHaveTextContent('5 p');
    expect(container.querySelector('[data-tips-source-breakdown]')).not.toBeInTheDocument();
  });

  it('alla källor 0 ger fyra 0-rader och total 0', () => {
    const { container } = renderView(
      store({
        leaderboard: [entry('u1', 'Anna', 0, 1)],
        currentUserId: 'u1',
        selfBreakdown: { bySource: { match: 0, group: 0, bracket: 0, champion: 0 }, total: 0 },
      })
    );
    expect(container.querySelector('[data-tips-summary-points]')).toHaveTextContent('0 p');
    const rowPoints = Array.from(container.querySelectorAll('[data-source-points]')).map(
      (d) => d.textContent
    );
    expect(rowPoints).toEqual(['0 p', '0 p', '0 p', '0 p']);
  });

  // ---- MÄRKES-RADEN (T19, #19) ----------------------------------------------

  it('visar märkes-raden med tjänade märken (streak + skräll + perfekt omgång)', () => {
    const { container } = renderView(
      store({
        leaderboard: [entry('u1', 'Anna', 12, 1)],
        currentUserId: 'u1',
        selfBadges: {
          streak: { current: 3, longest: 4 },
          calledUpset: true,
          perfectRound: true,
        },
      })
    );
    const row = container.querySelector('[data-badge-row]');
    expect(row).toBeInTheDocument();
    const ids = Array.from(row!.querySelectorAll('[data-badge]')).map((el) =>
      el.getAttribute('data-badge')
    );
    expect(ids).toEqual(['streak', 'called-upset', 'perfect-round']);
    expect(within(row as HTMLElement).getByText('3 i rad')).toBeInTheDocument();
  });

  it('utelämnar märkes-raden helt när inga märken tjänats (ingen tom etikett)', () => {
    const { container } = renderView(
      store({
        leaderboard: [entry('u1', 'Anna', 0, 1)],
        currentUserId: 'u1',
        selfBadges: { streak: { current: 1, longest: 1 }, calledUpset: false, perfectRound: false },
      })
    );
    expect(container.querySelector('[data-badge-row]')).not.toBeInTheDocument();
  });

  it('utelämnar märkes-raden när selfBadges är null (ingen härledning än)', () => {
    const { container } = renderView(
      store({ leaderboard: [entry('u1', 'Anna', 5, 1)], currentUserId: 'u1', selfBadges: null })
    );
    expect(container.querySelector('[data-badge-row]')).not.toBeInTheDocument();
  });
});
