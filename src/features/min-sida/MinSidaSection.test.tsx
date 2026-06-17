// Tester för MinSidaSection (T97): profil-hubben i Mer. Stub:ar de tre stores via context
// (samma isolerings-mönster som RoomPanel.test / LeaderboardSummary.test), så vyn testas
// på presentation + a11y + den honest-gatning briefen kräver (fixtures/ingen-identitet/
// inget-rum -> inget, ingen ställning -> lugn "gå med"-rad, inte tomma stat-rutor).

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { MinSidaSection } from './MinSidaSection';
import { LeaderboardStoreContext, type LeaderboardStore } from '../leaderboard';
import { RoomsStoreContext, type RoomsStore } from '../rooms/rooms-context';
import {
  FavoriteTeamContext,
  type FavoriteTeamStore,
} from '../favorite-team/favorite-team-context';
import { ResultsStoreContext, type ResultsStore } from '../results/results-context';
import type { LeaderboardEntry, PersonalStats } from '../leaderboard';
import type { RoomMember, RoomSummary } from '../../data/rooms';
import type { Team } from '../../domain/types';

const room = (id: string, name: string): RoomSummary => ({ id, name, code: id.toUpperCase() });
const member = (userId: string, displayName: string): RoomMember => ({ userId, displayName });
const entry = (
  userId: string,
  displayName: string,
  points: number,
  rank: number,
  exactHits = 0
): LeaderboardEntry => ({ userId, displayName, points, rank, exactHits });

const TEAMS: Team[] = [
  { id: 't-bra', name: 'Brasilien', code: 'BRA', group: 'A' as Team['group'] },
  { id: 't-swe', name: 'Sverige', code: 'SWE', group: 'B' as Team['group'] },
];

const personalStats = (accuracy: number | null, decidedTips = 4): PersonalStats => ({
  decidedTips,
  exactHits: 0,
  outcomeHits: 0,
  misses: 0,
  accuracy,
  bestCall: null,
});

function roomsStore(overrides: Partial<RoomsStore> = {}): RoomsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    userId: 'me',
    myRooms: [room('r1', 'Kompisgänget'), room('r2', 'Jobbet')],
    activeRoom: room('r1', 'Kompisgänget'),
    members: [member('me', 'Daniel Aldemir'), member('u2', 'Anna')],
    results: [],
    tipsRefreshNonce: 0,
    createRoom: async () => {},
    joinRoom: async () => true,
    selectRoom: async () => {},
    leaveRoom: async () => {},
    refresh: async () => {},
    saveResult: async () => {},
    copyMyTips: async () => ({
      items: [],
      total: { copied: 0, skippedLocked: 0, skippedExisting: 0, failed: 0 },
      byCategory: {
        match: { copied: 0, skippedLocked: 0, skippedExisting: 0, failed: 0 },
        group: { copied: 0, skippedLocked: 0, skippedExisting: 0, failed: 0 },
        bracket: { copied: 0, skippedLocked: 0, skippedExisting: 0, failed: 0 },
      },
    }),
    ...overrides,
  };
}

function leaderboardStore(overrides: Partial<LeaderboardStore> = {}): LeaderboardStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    activeRoomId: 'r1',
    leaderboard: [entry('u2', 'Anna', 12, 1), entry('me', 'Daniel Aldemir', 8, 2)],
    livePreliminary: false,
    reveal: [],
    teams: [],
    currentUserId: 'me',
    selfBreakdown: null,
    selfBadges: null,
    selfStats: personalStats(0.75),
    ...overrides,
  };
}

function favoriteStore(favoriteTeamId: string | null = null): FavoriteTeamStore {
  return { favoriteTeamId, setFavoriteTeam: () => {}, clearFavoriteTeam: () => {} };
}

// Minimal results-store: vyn läser BARA .teams. Resten cast:as (testet rör inte den ytan).
function resultsStore(teams: Team[] = TEAMS): ResultsStore {
  return { teams } as unknown as ResultsStore;
}

function panel(children: ReactNode): ReactNode {
  return <div data-test-panel="">{children}</div>;
}

interface RenderOpts {
  rooms?: Partial<RoomsStore>;
  leaderboard?: Partial<LeaderboardStore>;
  favoriteTeamId?: string | null;
  teams?: Team[];
}

function renderSection(opts: RenderOpts = {}) {
  return render(
    <RoomsStoreContext.Provider value={roomsStore(opts.rooms)}>
      <LeaderboardStoreContext.Provider value={leaderboardStore(opts.leaderboard)}>
        <ResultsStoreContext.Provider value={resultsStore(opts.teams)}>
          <FavoriteTeamContext.Provider value={favoriteStore(opts.favoriteTeamId ?? null)}>
            <MinSidaSection surface={panel} />
          </FavoriteTeamContext.Provider>
        </ResultsStoreContext.Provider>
      </LeaderboardStoreContext.Provider>
    </RoomsStoreContext.Provider>
  );
}

describe('MinSidaSection, honest-gatning', () => {
  it('renderar INGET i fixtures/lokalt läge (rummen inaktiva)', () => {
    const { container } = renderSection({ rooms: { enabled: false } });
    expect(container.querySelector('[data-min-sida-section]')).toBeNull();
  });

  it('renderar INGET utan identitet och utan rum (inget att visa)', () => {
    const { container } = renderSection({
      rooms: { userId: null, myRooms: [], activeRoom: null, members: [] },
      leaderboard: { currentUserId: null, leaderboard: [] },
    });
    expect(container.querySelector('[data-min-sida-section]')).toBeNull();
  });

  it('renderar profilen inuti den injicerade yt-formen (Panel), inte naken', () => {
    const { container } = renderSection();
    const panelEl = container.querySelector('[data-test-panel]');
    expect(panelEl?.querySelector('[data-min-sida-section]')).not.toBeNull();
  });
});

describe('MinSidaSection, profil-topp', () => {
  it('visar användarens namn som rubrik (avataren är aria-hidden)', () => {
    renderSection();
    expect(screen.getByRole('heading', { name: 'Daniel Aldemir' })).toBeInTheDocument();
  });

  it('faller till en neutral topp utan identitet men med rum', () => {
    renderSection({
      rooms: { userId: null, members: [] },
      leaderboard: { currentUserId: null, leaderboard: [] },
    });
    // Generell rubrik, inte ett gissat namn.
    expect(screen.getByRole('heading', { name: 'Din profil' })).toBeInTheDocument();
  });
});

describe('MinSidaSection, ställning (kompakt, inte hela panelen)', () => {
  it('visar placering + total + träffsäkerhet ur topplistan', () => {
    const { container } = renderSection();
    const standing = container.querySelector('[data-min-sida-standing]');
    expect(standing).not.toBeNull();
    expect(standing?.getAttribute('data-rank')).toBe('2');
    expect(standing?.getAttribute('data-points')).toBe('8');
    // Placeringen läses i ord för skärmläsaren.
    expect(within(standing as HTMLElement).getByText(/Plats 2 av 2/)).toBeInTheDocument();
    expect(within(standing as HTMLElement).getByText(/8 poäng/)).toBeInTheDocument();
    expect(within(standing as HTMLElement).getByText('75 %')).toBeInTheDocument();
  });

  it('utelämnar träffsäkerheten när inga avgjorda tips finns (ingen falsk 0 %)', () => {
    const { container } = renderSection({ leaderboard: { selfStats: personalStats(null, 0) } });
    expect(container.querySelector('[data-min-sida-accuracy]')).toBeNull();
  });

  it('märker ställningen som preliminär när topplistan är live', () => {
    const { container } = renderSection({ leaderboard: { livePreliminary: true } });
    expect(container.querySelector('[data-min-sida-live]')).not.toBeNull();
    expect(screen.getByText(/Preliminär ställning/)).toBeInTheDocument();
  });

  it('visar en lugn "gå med i ett rum"-rad i stället för tomma stat-rutor utan egen rad', () => {
    const { container } = renderSection({
      rooms: { activeRoom: null },
      leaderboard: { leaderboard: [], currentUserId: 'me' },
    });
    expect(container.querySelector('[data-min-sida-standing]')).toBeNull();
    expect(container.querySelector('[data-min-sida-no-standing]')).not.toBeNull();
    expect(
      screen.getByRole('heading', { name: /Gå med i ett rum för att se din ställning/i })
    ).toBeInTheDocument();
  });
});

describe('MinSidaSection, dina rum', () => {
  it('listar användarens rum, det aktiva pinnat först + markerat', () => {
    const { container } = renderSection({
      rooms: { myRooms: [room('r2', 'Jobbet'), room('r1', 'Kompisgänget')] },
    });
    const items = container.querySelectorAll('[data-min-sida-room]');
    expect(items).toHaveLength(2);
    expect(items[0]?.getAttribute('data-active')).toBe('true');
    expect(within(items[0] as HTMLElement).getByText('Kompisgänget')).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText('Aktivt')).toBeInTheDocument();
    expect(items[1]?.getAttribute('data-active')).toBe('false');
  });
});

describe('MinSidaSection, favoritlag', () => {
  it('visar det pinnade laget med emblem + namn', () => {
    const { container } = renderSection({ favoriteTeamId: 't-bra' });
    const fav = container.querySelector('[data-min-sida-favorite]');
    expect(fav?.getAttribute('data-has-favorite')).toBe('true');
    expect(within(fav as HTMLElement).getByText('Brasilien')).toBeInTheDocument();
  });

  it('visar en lugn uppmaning när inget lag är pinnat', () => {
    const { container } = renderSection({ favoriteTeamId: null });
    const fav = container.querySelector('[data-min-sida-favorite]');
    expect(fav?.getAttribute('data-has-favorite')).toBe('false');
    expect(within(fav as HTMLElement).getByText(/Inget favoritlag pinnat än/)).toBeInTheDocument();
  });
});
