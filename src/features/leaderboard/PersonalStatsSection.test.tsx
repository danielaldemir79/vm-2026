// Tester för den personliga statistik-sektionen (T23, #23): gating (ingen statistik /
// inte ready -> tyst), tomt-läget (inga avgjorda tips), nyckeltalen + bästa call med
// matchup-rubrik och joker-markering. Renderar mot en injicerad leaderboard-store
// (samma mönster som TipsScoreSummary-testet), så vyn testas utan provider/DB.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { Team } from '../../domain/types';
import { LeaderboardStoreContext, type LeaderboardStore } from './leaderboard-context';
import { PersonalStatsSection } from './PersonalStatsSection';
import type { PersonalStats } from './personal-stats';

const TEAMS: Team[] = [
  { id: 'bra', name: 'Brasilien', code: 'BRA', group: 'A' },
  { id: 'bih', name: 'Bosnien och Hercegovina', shortName: 'Bosnien', code: 'BIH', group: 'A' },
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
    currentUserId: 'u1',
    selfBreakdown: null,
    selfBadges: null,
    selfStats: null,
    ...partial,
  };
}

function renderSection(s: LeaderboardStore) {
  return render(
    <LeaderboardStoreContext.Provider value={s}>
      <PersonalStatsSection />
    </LeaderboardStoreContext.Provider>
  );
}

const STATS: PersonalStats = {
  decidedTips: 4,
  exactHits: 1,
  outcomeHits: 2,
  misses: 1,
  accuracy: 0.75,
  bestCall: {
    matchId: 'm1',
    homeTeamId: 'bra',
    awayTeamId: 'bih',
    kickoff: '2026-06-11T18:00:00Z',
    pointType: 'exact',
    points: 6,
    joker: true,
  },
};

describe('PersonalStatsSection', () => {
  it('renderar INGET utan en egen statistik-rad (selfStats null) -> tyst', () => {
    const { container } = renderSection(store({ selfStats: null }));
    expect(container.querySelector('[data-personal-stats]')).not.toBeInTheDocument();
  });

  it('renderar INGET när storen inte är ready (samma gate som summeringen)', () => {
    const { container } = renderSection(store({ status: 'loading', selfStats: STATS }));
    expect(container.querySelector('[data-personal-stats]')).not.toBeInTheDocument();
  });

  it('inga avgjorda tips än -> ärligt tomt-läge, inte falska nollor', () => {
    const empty: PersonalStats = {
      decidedTips: 0,
      exactHits: 0,
      outcomeHits: 0,
      misses: 0,
      accuracy: null,
      bestCall: null,
    };
    const { container } = renderSection(store({ selfStats: empty }));
    expect(container.querySelector('[data-personal-stats]')).toBeInTheDocument();
    expect(container.querySelector('[data-stats-empty]')).toBeInTheDocument();
    // Inga nyckeltal-rutor i tomt-läget.
    expect(container.querySelector('[data-stat="accuracy"]')).not.toBeInTheDocument();
  });

  it('visar träffsäkerhet (procent) + exakt/utfall-räkning', () => {
    const { container } = renderSection(store({ selfStats: STATS }));
    expect(container.querySelector('[data-stat="accuracy"]')?.textContent).toContain('75 %');
    expect(container.querySelector('[data-stat="exact"]')?.textContent).toContain('1');
    expect(container.querySelector('[data-stat="outcome"]')?.textContent).toContain('2');
  });

  it('visar bästa call med matchup-rubrik (kort namn), poäng-typ och joker-markering', () => {
    const { container } = renderSection(store({ selfStats: STATS }));
    const best = container.querySelector('[data-best-call]');
    expect(best).toBeInTheDocument();
    expect(best?.textContent).toContain('Brasilien mot Bosnien');
    expect(best?.textContent).toContain('Exakt resultat');
    expect(best?.textContent).toContain('6 p');
    expect(container.querySelector('[data-best-call-joker]')).toBeInTheDocument();
  });

  it('utelämnar bästa call-raden när inget tips gett poäng (bestCall null)', () => {
    const noBest: PersonalStats = { ...STATS, bestCall: null };
    const { container } = renderSection(store({ selfStats: noBest }));
    expect(container.querySelector('[data-best-call]')).not.toBeInTheDocument();
  });
});
