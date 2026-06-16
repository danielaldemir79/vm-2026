// Tester för turneringsstatistik-vyn (T88, #180; T100, #207). Mockar de tre datakällorna
// (useCrossMatchEvents, useCrossMatchStats, useResultsStore) så varje tillstånd drivs
// deterministiskt , vyn aggregerar via de RENA funktionerna (redan hårt testade), så här
// bevisar vi PRESENTATIONEN + wiringen:
//   - rubrik + intro renderas
//   - kort-liga, mål-fördelning renderas ur events
//   - "Flest mål per lag" + "Mål per match" + "Flest mål i en match" renderas ur OFFICIELLT
//     facit (planMatches), INTE events (T100, #207 , annars missas en match utan event-rad)
//   - lag-medel (innehav) renderas ur statistics
//   - clean sheets + skrällar renderas ur den resolvade matchplanen + ranking
//   - COVERAGE-NOT (T100): event-/statistik-täckta kort märks "Baseras på N matcher..."
//   - SIM-GRIND (F2): i what-if-läge döljs de facit-härledda korten (visar sim-notering)
//   - fel fail-loud:ar i en role=alert
//   - tom data ger lugna rader (ingen krasch)

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TournamentStatsView } from './TournamentStatsView';
import type { CrossMatchEventsResult } from './use-cross-match-events';
import type { CrossMatchStatsResult } from './use-cross-match-stats';
import type { LiveEvent, LiveMatchEvents, LiveMatchStats } from '../../data/livescore';
import type { Match, Team } from '../../domain/types';

const mockEvents = vi.fn<() => CrossMatchEventsResult>();
const mockStats = vi.fn<() => CrossMatchStatsResult>();
const mockResults = vi.fn();

vi.mock('./use-cross-match-events', () => ({
  useCrossMatchEvents: () => mockEvents(),
}));
vi.mock('./use-cross-match-stats', () => ({
  useCrossMatchStats: () => mockStats(),
}));
vi.mock('../results', () => ({
  useResultsStore: () => mockResults(),
}));

afterEach(() => {
  cleanup();
  mockEvents.mockReset();
  mockStats.mockReset();
  mockResults.mockReset();
});

/** teamApiId 6 = Brasilien, 5 = ... (5 finns ej i bryggan -> ingen disc, OK). */
function goal(over: Partial<LiveEvent> = {}): LiveEvent {
  return {
    minute: 10,
    extra: null,
    kind: 'goal',
    rawType: 'Goal',
    detail: 'Normal Goal',
    teamApiId: 6,
    teamName: 'Brasilien',
    playerId: 100,
    playerName: 'Stjärnskytten',
    assistId: null,
    assistName: null,
    cardColor: null,
    ...over,
  };
}

function card(over: Partial<LiveEvent> = {}): LiveEvent {
  return {
    ...goal(),
    kind: 'card',
    rawType: 'Card',
    detail: 'Yellow Card',
    cardColor: 'yellow',
    ...over,
  };
}

function eventsReady(matches: LiveMatchEvents[]): CrossMatchEventsResult {
  return { status: 'ready', matches, error: null };
}
function statsReady(matches: LiveMatchStats[]): CrossMatchStatsResult {
  return { status: 'ready', matches, error: null };
}

/** Minimal lag-lista (id/name/code/fifaRanking räcker för vyn). */
const TEAMS = [
  { id: 'bra', name: 'Brasilien', code: 'BRA', group: 'C', fifaRanking: 6 },
  { id: 'swe', name: 'Sverige', code: 'SWE', group: 'A', fifaRanking: 38 },
  { id: 'ksa', name: 'Saudiarabien', code: 'KSA', group: 'B', fifaRanking: 61 },
  { id: 'arg', name: 'Argentina', code: 'ARG', group: 'A', fifaRanking: 1 },
  { id: 'ger', name: 'Tyskland', code: 'GER', group: 'E', fifaRanking: 9 },
  { id: 'cuw', name: 'Curaçao', code: 'CUW', group: 'E', fifaRanking: 90 },
] as unknown as Team[];

function finishedMatch(
  id: string,
  homeTeamId: string,
  awayTeamId: string,
  homeGoals: number,
  awayGoals: number
): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId,
    awayTeamId,
    kickoff: '2026-06-11T19:00:00.000Z',
    venue: 'Test Arena, Test City, Testland',
    result: { homeGoals, awayGoals },
    status: 'finished',
  };
}

function resultsStore(over: Record<string, unknown> = {}) {
  return {
    teams: TEAMS,
    matches: [] as Match[],
    status: 'ready' as const,
    simulating: false,
    ...over,
  };
}

describe('TournamentStatsView , struktur + tillstånd', () => {
  it('renderar rubrik + intro', () => {
    mockEvents.mockReturnValue(eventsReady([]));
    mockStats.mockReturnValue(statsReady([]));
    mockResults.mockReturnValue(resultsStore());
    render(<TournamentStatsView />);
    expect(screen.getByRole('heading', { name: 'Turneringsstatistik' })).toBeInTheDocument();
  });

  it('FEL i events fail-loud:ar i en role=alert', () => {
    mockEvents.mockReturnValue({ status: 'error', matches: [], error: 'Nätfel' });
    mockStats.mockReturnValue(statsReady([]));
    mockResults.mockReturnValue(resultsStore());
    render(<TournamentStatsView />);
    expect(screen.getByRole('alert')).toHaveTextContent('Nätfel');
  });
});

describe('TournamentStatsView , events-härledda kort', () => {
  it('visar kort-ligan (spelare) ur events', () => {
    mockEvents.mockReturnValue(
      eventsReady([{ matchId: 'm1', events: [card({ playerId: 7, playerName: 'Bråkstaken' })] }])
    );
    mockStats.mockReturnValue(statsReady([]));
    mockResults.mockReturnValue(resultsStore());
    const { container } = render(<TournamentStatsView />);
    const playerCard = container.querySelector(
      '[data-tournament-stat-card][aria-label="Flest kort, spelare"]'
    );
    expect(playerCard).not.toBeNull();
    expect(playerCard).toHaveTextContent('Bråkstaken');
    expect(playerCard).toHaveTextContent('1 kort');
  });

  it('visar mål-fördelningen (15-min-staplar) ur events', () => {
    mockEvents.mockReturnValue(
      eventsReady([{ matchId: 'm1', events: [goal({ minute: 5 }), goal({ minute: 80 })] }])
    );
    mockStats.mockReturnValue(statsReady([]));
    mockResults.mockReturnValue(resultsStore());
    const { container } = render(<TournamentStatsView />);
    expect(container.querySelector('[data-tournament-timing-card]')).not.toBeNull();
    expect(container.querySelector('[data-tournament-timing-bars]')).not.toBeNull();
  });

  it('snabbaste mål-höjdpunkten visar minut + skytt', () => {
    mockEvents.mockReturnValue(
      eventsReady([{ matchId: 'm1', events: [goal({ minute: 3, playerName: 'Tidig' })] }])
    );
    mockStats.mockReturnValue(statsReady([]));
    mockResults.mockReturnValue(resultsStore());
    const { container } = render(<TournamentStatsView />);
    const highlights = container.querySelectorAll('[data-tournament-highlight]');
    const fastest = [...highlights].find((h) => h.textContent?.includes('Snabbaste mål'));
    expect(fastest).toHaveTextContent("3'");
    expect(fastest).toHaveTextContent('Tidig');
  });
});

describe('TournamentStatsView , statistics-härledda kort', () => {
  it('visar mest bollinnehav ur statistics', () => {
    mockEvents.mockReturnValue(eventsReady([]));
    mockStats.mockReturnValue(
      statsReady([
        {
          matchId: 'm1',
          statistics: [
            {
              teamApiId: 6,
              teamName: 'Brasilien',
              statistics: [{ type: 'Ball Possession', value: '65%' }],
            },
          ],
        },
      ])
    );
    mockResults.mockReturnValue(resultsStore());
    const { container } = render(<TournamentStatsView />);
    const card = container.querySelector(
      '[data-tournament-stat-card][aria-label="Mest bollinnehav"]'
    );
    expect(card).toHaveTextContent('Brasilien');
    expect(card).toHaveTextContent('65%');
  });
});

describe('TournamentStatsView , tabell-härledda kort (clean sheets + skrällar)', () => {
  it('visar clean sheets ur den resolvade matchplanen', () => {
    mockEvents.mockReturnValue(eventsReady([]));
    mockStats.mockReturnValue(statsReady([]));
    mockResults.mockReturnValue(
      resultsStore({ matches: [finishedMatch('m1', 'bra', 'swe', 2, 0)] })
    );
    const { container } = render(<TournamentStatsView />);
    const card = container.querySelector(
      '[data-tournament-stat-card][aria-label="Flest hållna nollor"]'
    );
    expect(card).toHaveTextContent('Brasilien');
    expect(card).toHaveTextContent('1 nolla');
  });

  it('visar skrällar (lågt rankat slår högt) med ranking-gap', () => {
    mockEvents.mockReturnValue(eventsReady([]));
    mockStats.mockReturnValue(statsReady([]));
    mockResults.mockReturnValue(
      resultsStore({ matches: [finishedMatch('m1', 'ksa', 'arg', 2, 1)] })
    );
    const { container } = render(<TournamentStatsView />);
    const card = container.querySelector(
      '[data-tournament-stat-card][aria-label="Största skrällarna"]'
    );
    expect(card).toHaveTextContent('Saudiarabien slog Argentina');
    expect(card).toHaveTextContent('+60'); // ranking 61 - 1
  });

  it('SIM-GRIND (F2): i what-if-läge döljs clean sheets/skrällar med en notering', () => {
    mockEvents.mockReturnValue(eventsReady([]));
    mockStats.mockReturnValue(statsReady([]));
    mockResults.mockReturnValue(
      resultsStore({ simulating: true, matches: [finishedMatch('m1', 'bra', 'swe', 2, 0)] })
    );
    const { container } = render(<TournamentStatsView />);
    const card = container.querySelector(
      '[data-tournament-stat-card][aria-label="Flest hållna nollor"]'
    );
    // Inga rader: sandlåde-resultat visas inte, en sim-notering står i stället.
    expect(card?.querySelector('[data-tournament-stat-row]')).toBeNull();
    expect(card).toHaveTextContent(/tänk-om-läge/);
  });
});

describe('TournamentStatsView , facit-härledda mål-stats (T100, #207)', () => {
  // Den centrala bugg-fixen: events-lagret saknade g-E-1 (7-1), så den events-härledda "Flest mål
  // per lag" missade 7-måls-laget och visade fel lag som etta. Här bevisar vi att vyn nu source:ar
  // ur planMatches (officiellt facit), så 7-måls-laget (Tyskland) hamnar överst , ÄVEN när events
  // bara känner till g-F-2 (Sverige 5), exakt prod-scenariot.
  it('"Flest mål per lag" source:ar ur facit, inte events: 7-måls-laget toppar', () => {
    // events ser BARA g-F-2 (Sverige 5-1 Tunisien) , g-E-1 saknar event-rad i prod.
    mockEvents.mockReturnValue(
      eventsReady([{ matchId: 'api-1', events: [goal({ teamApiId: 5, teamName: 'Sverige' })] }])
    );
    mockStats.mockReturnValue(statsReady([]));
    mockResults.mockReturnValue(
      resultsStore({
        matches: [
          finishedMatch('g-F-2', 'swe', 'tun', 5, 1),
          finishedMatch('g-E-1', 'ger', 'cuw', 7, 1), // FINNS i facit men INTE i events
        ],
      })
    );
    const { container } = render(<TournamentStatsView />);
    const card = container.querySelector(
      '[data-tournament-stat-card][aria-label="Flest mål per lag"]'
    );
    // Första raden (rank 1) ska vara Tyskland med 7 mål, INTE Sverige (5).
    const firstRow = card?.querySelector('[data-tournament-stat-row][data-rank="1"]');
    expect(firstRow).toHaveTextContent('Tyskland');
    expect(firstRow).toHaveTextContent('7 mål');
  });

  it('"Mål per match" source:ar ur facit (alla färdiga matcher), inte event-subsetet', () => {
    mockEvents.mockReturnValue(eventsReady([])); // inga events alls
    mockStats.mockReturnValue(statsReady([]));
    mockResults.mockReturnValue(
      resultsStore({
        matches: [
          finishedMatch('g-E-1', 'ger', 'cuw', 7, 1), // 8 mål
          finishedMatch('g-H-1', 'esp', 'bra', 0, 0), // 0 mål, räknas ändå
        ],
      })
    );
    const { container } = render(<TournamentStatsView />);
    const highlights = container.querySelectorAll('[data-tournament-highlight]');
    const perMatch = [...highlights].find((h) => h.textContent?.includes('Mål per match'));
    // 8 mål / 2 matcher = 4,00 (svenskt komma), detalj "8 mål på 2 matcher".
    expect(perMatch).toHaveTextContent('4,00');
    expect(perMatch).toHaveTextContent('8 mål på 2 matcher');
  });

  it('"Flest mål i en match" visar den största matchen ur facit (7-1)', () => {
    mockEvents.mockReturnValue(eventsReady([]));
    mockStats.mockReturnValue(statsReady([]));
    mockResults.mockReturnValue(
      resultsStore({
        matches: [
          finishedMatch('g-F-2', 'swe', 'tun', 5, 1),
          finishedMatch('g-E-1', 'ger', 'cuw', 7, 1),
        ],
      })
    );
    const { container } = render(<TournamentStatsView />);
    const highlights = container.querySelectorAll('[data-tournament-highlight]');
    const biggest = [...highlights].find((h) => h.textContent?.includes('Flest mål i en match'));
    expect(biggest).toHaveTextContent('7-1');
    expect(biggest).toHaveTextContent('Tyskland mot Curaçao');
  });

  it('SIM-GRIND (F2): i what-if-läge döljs de facit-höjdpunkterna med en sim-notering', () => {
    mockEvents.mockReturnValue(eventsReady([]));
    mockStats.mockReturnValue(statsReady([]));
    mockResults.mockReturnValue(
      resultsStore({ simulating: true, matches: [finishedMatch('g-E-1', 'ger', 'cuw', 7, 1)] })
    );
    const { container } = render(<TournamentStatsView />);
    const highlights = container.querySelectorAll('[data-tournament-highlight]');
    const biggest = [...highlights].find((h) => h.textContent?.includes('Flest mål i en match'));
    // Ingen siffra , en sim-notering i stället (samma anda som clean sheets/skrällar).
    expect(biggest).not.toHaveTextContent('7-1');
    expect(biggest).toHaveTextContent(/tänk-om-läge/);
  });
});

describe('TournamentStatsView , coverage-notering på event-täckta kort (T100, #207)', () => {
  it('märker event-täckta kort "Baseras på N matcher med detaljerad spelardata" (N härlett)', () => {
    // 2 matcher med event-data -> N = 2 (events.matches.length), aldrig hårdkodad.
    mockEvents.mockReturnValue(
      eventsReady([
        { matchId: 'api-1', events: [card({ playerId: 7, playerName: 'Bråkstaken' })] },
        { matchId: 'api-2', events: [card({ playerId: 8, playerName: 'Hårding' })] },
      ])
    );
    mockStats.mockReturnValue(statsReady([]));
    mockResults.mockReturnValue(resultsStore());
    const { container } = render(<TournamentStatsView />);
    const playerCard = container.querySelector(
      '[data-tournament-stat-card][aria-label="Flest kort, spelare"]'
    );
    const coverage = playerCard?.querySelector('[data-tournament-stat-coverage]');
    expect(coverage).toHaveTextContent('Baseras på 2 matcher med detaljerad spelardata.');
  });

  it('N=1 ger singular "1 match"', () => {
    mockEvents.mockReturnValue(
      eventsReady([{ matchId: 'api-1', events: [card({ playerId: 7, playerName: 'Ensam' })] }])
    );
    mockStats.mockReturnValue(statsReady([]));
    mockResults.mockReturnValue(resultsStore());
    const { container } = render(<TournamentStatsView />);
    const playerCard = container.querySelector(
      '[data-tournament-stat-card][aria-label="Flest kort, spelare"]'
    );
    expect(playerCard?.querySelector('[data-tournament-stat-coverage]')).toHaveTextContent(
      'Baseras på 1 match med detaljerad spelardata.'
    );
  });

  it('facit-kortet "Flest mål per lag" har INGEN coverage-not (det täcker alla matcher)', () => {
    mockEvents.mockReturnValue(
      eventsReady([{ matchId: 'api-1', events: [goal({ teamApiId: 5 })] }])
    );
    mockStats.mockReturnValue(statsReady([]));
    mockResults.mockReturnValue(
      resultsStore({ matches: [finishedMatch('g-E-1', 'ger', 'cuw', 7, 1)] })
    );
    const { container } = render(<TournamentStatsView />);
    const teamGoalsCard = container.querySelector(
      '[data-tournament-stat-card][aria-label="Flest mål per lag"]'
    );
    expect(teamGoalsCard?.querySelector('[data-tournament-stat-coverage]')).toBeNull();
  });

  it('ingen coverage-not när inga event-täckta matcher finns (inget att förklara)', () => {
    mockEvents.mockReturnValue(eventsReady([])); // 0 matcher med event-data
    mockStats.mockReturnValue(statsReady([]));
    mockResults.mockReturnValue(resultsStore());
    const { container } = render(<TournamentStatsView />);
    expect(container.querySelector('[data-tournament-stat-coverage]')).toBeNull();
  });
});
