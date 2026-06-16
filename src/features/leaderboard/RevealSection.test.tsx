import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { RevealSection } from './RevealSection';
import { LeaderboardStoreContext, type LeaderboardStore } from './leaderboard-context';
import type { RevealedMatch } from './reveal';
import {
  MatchDetailContext,
  type MatchDetailContextValue,
} from '../match-detail/match-detail-context';
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
    selfBreakdown: null,
    selfBadges: null,
    selfStats: null,
    ...partial,
  };
}

/** Render RevealSection under en stub-leaderboard-store + en stub-drill-in-seam (spy openMatch). */
function renderSection(
  s: LeaderboardStore,
  openMatch: MatchDetailContextValue['openMatch'] = vi.fn()
) {
  const detail: MatchDetailContextValue = { openMatchId: null, openMatch, closeMatch: vi.fn() };
  return render(
    <MatchDetailContext.Provider value={detail}>
      <LeaderboardStoreContext.Provider value={s}>
        <RevealSection />
      </LeaderboardStoreContext.Provider>
    </MatchDetailContext.Provider>
  );
}

/** En FÄRDIG avslöjad match med en pick för "me" (för egen-rad + ditt-resultat). */
function finished(matchId: string, kickoff: string, myPoints: number | null = 3): RevealedMatch {
  const picks: RevealedMatch['picks'] = [
    {
      userId: 'other',
      displayName: 'Annan',
      predicted: { homeGoals: 0, awayGoals: 0 },
      points: 0,
      pointType: 'miss',
    },
  ] as never;
  if (myPoints !== null) {
    (picks as unknown[]).push({
      userId: 'me',
      displayName: 'Jag',
      predicted: { homeGoals: 2, awayGoals: 1 },
      points: myPoints,
      pointType: myPoints === 3 ? 'exact' : 'outcome',
    });
  }
  return {
    matchId,
    status: 'finished',
    homeTeamId: 'mex',
    awayTeamId: 'kor',
    kickoff,
    actual: { homeGoals: 2, awayGoals: 1 },
    picks,
  };
}

describe('RevealSection, gating (tyst tills det finns något att avslöja)', () => {
  it('renderar INGET innan storen är ready', () => {
    const { container } = renderSection(
      store({ enabled: false, status: 'idle', reveal: [finished('m1', '2026-06-12T18:00:00Z')] })
    );
    expect(container.querySelector('[data-reveal-section]')).not.toBeInTheDocument();
  });

  it('renderar INGET när det inte finns några avslöjade matcher', () => {
    const { container } = renderSection(store({ reveal: [] }));
    expect(container.querySelector('[data-reveal-section]')).not.toBeInTheDocument();
  });
});

describe('RevealSection, EN sektions-kollaps (ihopfälld default)', () => {
  it('är IHOPFÄLLD default: rubriken + EN expandera-kontroll, INGEN matchlista', () => {
    const { container } = renderSection(
      store({ reveal: [finished('m1', '2026-06-12T18:00:00Z')] })
    );
    expect(screen.getByRole('heading', { name: 'Vad alla tippade' })).toBeInTheDocument();
    // Ihopfälld => listan finns inte i DOM:en än, bara expandera-kontrollen.
    expect(container.querySelector('[data-reveal-row-list]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-reveal-toggle]')).toBeInTheDocument();
  });

  it('utfäller till den paginerade listan och kan fällas ihop igen (EN kollaps)', () => {
    const { container } = renderSection(
      store({ reveal: [finished('m1', '2026-06-12T18:00:00Z')] })
    );
    const expandBtn = container.querySelector('[data-reveal-toggle]') as HTMLButtonElement;
    fireEvent.click(expandBtn);
    expect(container.querySelector('[data-reveal-row-list]')).toBeInTheDocument();
    // En enda kollaps-kontroll (den sticky följ-med "Dölj"), inte två konkurrerande.
    const collapse = container.querySelector('[data-reveal-toggle]') as HTMLButtonElement;
    fireEvent.click(collapse);
    expect(container.querySelector('[data-reveal-row-list]')).not.toBeInTheDocument();
  });
});

describe('RevealSection, ordning + paginering', () => {
  // 14 matcher => 2 sidor (PAGE_SIZE 12). Senaste kickoff först.
  const many = Array.from({ length: 14 }, (_, i) =>
    finished(
      `m${String(i).padStart(2, '0')}`,
      `2026-06-${String(10 + i).padStart(2, '0')}T18:00:00Z`,
      null
    )
  );

  function expandedSection(s: LeaderboardStore) {
    const r = renderSection(s);
    fireEvent.click(r.container.querySelector('[data-reveal-toggle]') as HTMLButtonElement);
    return r;
  }

  it('sida 1 visar de SENASTE spelade matcherna först (kickoff fallande)', () => {
    const { container } = expandedSection(store({ reveal: many }));
    const rows = Array.from(container.querySelectorAll('[data-reveal-row]'));
    // m13 har senaste kickoff (2026-06-23), så den ska ligga FÖRST på sida 1.
    expect(rows[0].getAttribute('data-match-id')).toBe('m13');
    expect(rows).toHaveLength(12); // PAGE_SIZE
  });

  it('paginering: nästa sida visar resten, status speglar sidnumret', () => {
    const { container } = expandedSection(store({ reveal: many }));
    expect(container.querySelector('[data-reveal-page-status]')).toHaveTextContent('Sida 1 av 2');
    fireEvent.click(container.querySelector('[data-reveal-page-next]') as HTMLButtonElement);
    expect(container.querySelector('[data-reveal-page-status]')).toHaveTextContent('Sida 2 av 2');
    // Sida 2 har de 2 sista (14 - 12).
    expect(container.querySelectorAll('[data-reveal-row]')).toHaveLength(2);
  });

  it('INGEN paginering renderas när allt får plats på en sida', () => {
    const { container } = expandedSection(store({ reveal: many.slice(0, 5) }));
    expect(container.querySelector('[data-reveal-pagination]')).not.toBeInTheDocument();
  });
});

describe('RevealSection, drill-in (T86-wiring: tap på matchrad -> openMatch)', () => {
  it('en matchrad är en knapp som anropar openMatch(matchId)', () => {
    const openMatch = vi.fn();
    const { container } = renderSection(
      store({ reveal: [finished('g-A-1', '2026-06-12T18:00:00Z')] }),
      openMatch
    );
    fireEvent.click(container.querySelector('[data-reveal-toggle]') as HTMLButtonElement);
    const rowButton = container.querySelector('[data-reveal-row] [data-match-detail-trigger]');
    expect(rowButton).toBeInTheDocument();
    fireEvent.click(rowButton as HTMLButtonElement);
    expect(openMatch).toHaveBeenCalledWith('g-A-1');
  });
});

describe('RevealSection, egen rad markerad + ditt resultat (del E)', () => {
  function expanded(s: LeaderboardStore) {
    const r = renderSection(s);
    fireEvent.click(r.container.querySelector('[data-reveal-toggle]') as HTMLButtonElement);
    return r;
  }

  it('markerar raden (data-self) + visar DU-bricka när DU tippade matchen', () => {
    const { container } = expanded(
      store({ reveal: [finished('m1', '2026-06-12T18:00:00Z', 3)], currentUserId: 'me' })
    );
    const row = container.querySelector('[data-reveal-row]') as HTMLElement;
    expect(row.getAttribute('data-self')).toBe('true');
    expect(within(row).getByText('Du')).toBeInTheDocument();
    // Ditt resultat: din ställning (2-1) + varför + poäng (exakt +3).
    const result = row.querySelector('[data-reveal-row-self-result]');
    expect(result).toHaveTextContent('2-1');
    expect(result).toHaveTextContent('+3');
  });

  it('markerar INTE raden när du inte tippade matchen (negativ-kontroll)', () => {
    const { container } = expanded(
      // "me" finns inte i picks (myPoints null), så ingen egen rad.
      store({ reveal: [finished('m1', '2026-06-12T18:00:00Z', null)], currentUserId: 'me' })
    );
    const row = container.querySelector('[data-reveal-row]') as HTMLElement;
    expect(row.getAttribute('data-self')).toBeNull();
    expect(within(row).queryByText('Du')).not.toBeInTheDocument();
    expect(row.querySelector('[data-reveal-row-self-result]')).toHaveTextContent('Du tippade inte');
  });

  it('utan identitet (currentUserId null) markeras ingen rad (edge: ingen identitet)', () => {
    const { container } = expanded(
      store({ reveal: [finished('m1', '2026-06-12T18:00:00Z', 3)], currentUserId: null })
    );
    const row = container.querySelector('[data-reveal-row]') as HTMLElement;
    expect(row.getAttribute('data-self')).toBeNull();
  });
});
