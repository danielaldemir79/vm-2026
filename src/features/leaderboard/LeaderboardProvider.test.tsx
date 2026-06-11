import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { LeaderboardProvider } from './LeaderboardProvider';
import { useLeaderboardStore } from './leaderboard-context';
import type { VmSupabaseClient } from '../../data/supabase-browser';
import type { Group, Match, Team } from '../../domain/types';
import type { RoomMember } from '../../data/rooms';
import { WC2026_GROUPS, WC2026_TEAM_BASES } from '../../data/wc2026/team-refs';
import { asTeamCode } from '../../domain/team-code';

// Mocka de tre list-API:erna (vi testar provider-AGGREGERINGEN, inte Supabase-anropen).
const api = vi.hoisted(() => ({
  listRoomPredictions: vi.fn(),
  listRoomGroupPredictions: vi.fn(),
  listRoomBracketPredictions: vi.fn(),
}));
vi.mock('../../data/predictions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/predictions')>();
  return {
    ...actual,
    listRoomPredictions: api.listRoomPredictions,
    listRoomGroupPredictions: api.listRoomGroupPredictions,
    listRoomBracketPredictions: api.listRoomBracketPredictions,
  };
});

vi.mock('../../data', () => ({
  isSupabaseConfigured: () => true,
  LIVE_READY: true,
}));

// Rooms-storen: bara medlemmarna + aktivt rum behövs här.
const roomsState = vi.hoisted(() => ({
  members: [] as RoomMember[],
  activeRoom: { id: 'r1' } as { id: string } | null,
  userId: null as string | null,
}));
vi.mock('../rooms', () => ({
  useRoomsStore: () => roomsState,
}));

// Facit-källan (lag/grupper/vävda matcher): mockas, vi styr facit per test.
const dataState = vi.hoisted(() => ({
  status: 'ready' as 'loading' | 'ready' | 'error',
  teams: [] as Team[],
  groups: [] as Group[],
  matches: [] as Match[],
  error: null as string | null,
}));
vi.mock('./use-leaderboard-data', () => ({
  useLeaderboardData: () => dataState,
}));

const fakeClient = {} as unknown as VmSupabaseClient;
const env = {} as ImportMetaEnv;

/** Produktions-lagen + grupper (för id -> code-mappningen i facit). */
const TEAMS: Team[] = WC2026_TEAM_BASES.map((b) => ({
  id: b.id,
  name: b.name,
  code: b.code,
  group: b.group,
}));

/** En färdigspelad gruppmatch (gemena lag-id). */
function groupMatch(g: string, home: string, away: string, hg: number, ag: number): Match {
  return {
    id: `${g}-${home}-${away}`,
    stage: 'group',
    groupId: g as Group['id'],
    homeTeamId: home,
    awayTeamId: away,
    kickoff: '2026-06-12T18:00:00Z',
    venue: 'Arena',
    status: 'finished',
    result: { homeGoals: hg, awayGoals: ag },
  };
}

/** En match med valbar avspark + status (för lås-/re-fetch-testet, T55). */
function matchAt(id: string, kickoff: string, status: Match['status'] = 'live'): Match {
  const base = {
    id,
    stage: 'group' as const,
    groupId: 'A' as Group['id'],
    homeTeamId: 'mex',
    awayTeamId: 'kor',
    kickoff,
    venue: 'Arena',
  };
  return status === 'finished'
    ? { ...base, status: 'finished', result: { homeGoals: 1, awayGoals: 0 } }
    : { ...base, status, result: null };
}

function Probe() {
  const store = useLeaderboardStore();
  return (
    <div>
      <span data-testid="status">{store.status}</span>
      <span data-testid="enabled">{String(store.enabled)}</span>
      <span data-testid="board">
        {store.leaderboard.map((e) => `${e.displayName}:${e.points}:${e.rank}`).join('|')}
      </span>
      <span data-testid="reveal">{store.reveal.length}</span>
      <span data-testid="error">{store.error ?? ''}</span>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  roomsState.members = [];
  roomsState.activeRoom = { id: 'r1' };
  dataState.status = 'ready';
  dataState.teams = TEAMS;
  dataState.groups = WC2026_GROUPS;
  dataState.matches = [];
  dataState.error = null;
  api.listRoomPredictions.mockResolvedValue([]);
  api.listRoomGroupPredictions.mockResolvedValue([]);
  api.listRoomBracketPredictions.mockResolvedValue([]);
});

function renderProvider(now: Date) {
  return render(
    <LeaderboardProvider env={env} client={fakeClient} activeRoomId="r1" now={now}>
      <Probe />
    </LeaderboardProvider>
  );
}

describe('LeaderboardProvider, wiring + aggregering', () => {
  it('utan aktivt rum: storen är inaktiv (enabled=false), inga API-anrop', async () => {
    render(
      <LeaderboardProvider env={env} client={fakeClient} activeRoomId={null}>
        <Probe />
      </LeaderboardProvider>
    );
    expect(screen.getByTestId('enabled')).toHaveTextContent('false');
    expect(api.listRoomPredictions).not.toHaveBeenCalled();
  });

  it('CODE-VS-ID-SEAM end-to-end: ett code-lagrat grupp-tips poängsätts mot facit härlett ur den delade matchlistan', async () => {
    // Grupp C färdigspelad så facit (1:a BRA, 2:a MAR) härleds ur matcherna.
    const groupC = WC2026_GROUPS.find((g) => g.id === 'C')!;
    const [bra, mar, hai, sco] = groupC.teamIds; // gemena id
    dataState.matches = [
      groupMatch('C', bra, mar, 1, 0),
      groupMatch('C', bra, hai, 2, 0),
      groupMatch('C', bra, sco, 3, 0),
      groupMatch('C', mar, hai, 2, 0),
      groupMatch('C', mar, sco, 1, 0),
      groupMatch('C', hai, sco, 0, 0),
    ];
    roomsState.members = [{ userId: 'u1', displayName: 'Anna' }];
    // Anna tippade BRA 1:a, MAR 2:a (LAGRAT som versal code).
    api.listRoomGroupPredictions.mockResolvedValue([
      {
        groupId: 'C',
        userId: 'u1',
        winnerTeamId: asTeamCode('BRA'),
        runnerUpTeamId: asTeamCode('MAR'),
        updatedAt: '',
      },
    ]);

    renderProvider(new Date('2026-06-13T00:00:00Z'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    // Full grupp-poäng (3 + 2 = 5), INTE tyst 0, trots code-vs-id-rymderna.
    expect(screen.getByTestId('board')).toHaveTextContent('Anna:5:1');
  });

  it('rangordnar flera medlemmar med delad placering vid lika poäng', async () => {
    roomsState.members = [
      { userId: 'u1', displayName: 'Anna' },
      { userId: 'u2', displayName: 'Bertil' },
      { userId: 'u3', displayName: 'Cecilia' },
    ];
    // Avgjord match g-A-1 = 2-1. Anna + Bertil exakt (3p), Cecilia fel (0p).
    dataState.matches = [groupMatch('A', 'mex', 'kor', 2, 1)];
    api.listRoomPredictions.mockResolvedValue([
      { matchId: 'A-mex-kor', userId: 'u1', homeGoals: 2, awayGoals: 1, updatedAt: '' },
      { matchId: 'A-mex-kor', userId: 'u2', homeGoals: 2, awayGoals: 1, updatedAt: '' },
      { matchId: 'A-mex-kor', userId: 'u3', homeGoals: 0, awayGoals: 0, updatedAt: '' },
    ]);

    renderProvider(new Date('2026-06-12T20:00:00Z')); // efter avspark
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    // Anna + Bertil delar 1:a (3p), Cecilia 3:a (0p). (Anna/Bertil ordnas alfabetiskt.)
    expect(screen.getByTestId('board')).toHaveTextContent('Anna:3:1|Bertil:3:1|Cecilia:0:3');
  });

  it('avslöjandet syns FÖRST efter avspark (sekretess-gate via now)', async () => {
    roomsState.members = [{ userId: 'u1', displayName: 'Anna' }];
    dataState.matches = [groupMatch('A', 'mex', 'kor', 2, 1)]; // avspark 18:00Z
    api.listRoomPredictions.mockResolvedValue([
      { matchId: 'A-mex-kor', userId: 'u1', homeGoals: 2, awayGoals: 1, updatedAt: '' },
    ]);

    // FÖRE avspark: inget avslöjat.
    const before = renderProvider(new Date('2026-06-12T17:00:00Z'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('reveal')).toHaveTextContent('0');
    before.unmount();

    // EFTER avspark: matchen avslöjas.
    renderProvider(new Date('2026-06-12T19:00:00Z'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('reveal')).toHaveTextContent('1');
  });

  it('fail-loud: ett API-fel ger status=error + felmeddelande', async () => {
    api.listRoomPredictions.mockRejectedValue(new Error('RLS nekade'));
    renderProvider(new Date('2026-06-12T20:00:00Z'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    expect(screen.getByTestId('error')).toHaveTextContent('RLS nekade');
  });

  it('en medlem utan tips är ändå med i listan (0 poäng)', async () => {
    roomsState.members = [{ userId: 'u1', displayName: 'Anna' }];
    renderProvider(new Date('2026-06-12T20:00:00Z'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('board')).toHaveTextContent('Anna:0:1');
  });
});

describe('LeaderboardProvider, T55 (#96): re-fetch när en match passerar avspark', () => {
  // ROTORSAK 2: tipsen hämtades bara vid mount/rumsbyte, så en app som stått öppen
  // sedan FÖRE avspark fick aldrig in andras (RLS-)nyligen-släppta tips utan reload.
  // Härled "antal låsta matcher" ur minut-ticken (evalNow), lägg i fetch-deps -> en ny
  // hämtning körs PRECIS när en match låses, men INTE varje minut-tick (talet är stabilt).

  it('hämtar om tipsen NÄR en match passerar avspark (mock-klocka), inte bara vid mount', async () => {
    // Fake timers driver BÅDE Date.now() (lås-jämförelsen) OCH minut-tickens setInterval.
    // Vi undviker testing-librarys waitFor (den pollar och hänger sig under fake timers);
    // i stället flushar vi React-effekternas mikrotasks via advanceTimersByTimeAsync.
    vi.useFakeTimers();
    try {
      // Två matcher: en redan låst (17:30Z) och en som låses strax (18:00Z). Start 17:45Z.
      const start = new Date('2026-06-12T17:45:00Z');
      vi.setSystemTime(start);
      dataState.matches = [
        matchAt('g-A-1', '2026-06-12T17:30:00Z'), // redan låst vid start
        matchAt('g-A-2', '2026-06-12T18:00:00Z'), // låses 15 min in
      ];
      roomsState.members = [{ userId: 'u1', displayName: 'Anna' }];

      renderProvider(start);
      // Flusha mount-effektens promise-kedja (Promise.all -> setState).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      // Initial hämtning (1 låst match vid mount).
      expect(api.listRoomPredictions).toHaveBeenCalledTimes(1);

      // Innan andra avsparken: en minut-tick ska INTE ge en ny hämtning (lås-talet oförändrat).
      await act(async () => {
        vi.setSystemTime(new Date('2026-06-12T17:50:00Z'));
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(api.listRoomPredictions).toHaveBeenCalledTimes(1);

      // Passera andra avsparken (18:00Z): nu blir 2 matcher låsta -> EN ny hämtning.
      await act(async () => {
        vi.setSystemTime(new Date('2026-06-12T18:01:00Z'));
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(api.listRoomPredictions).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('en LÅST men PÅGÅENDE match avslöjas (status live), inte först vid slutsignal', async () => {
    roomsState.members = [{ userId: 'u1', displayName: 'Anna' }];
    // Matchen pågår (live, inget facit), avspark 18:00Z passerad.
    dataState.matches = [matchAt('g-A-1', '2026-06-12T18:00:00Z', 'live')];
    api.listRoomPredictions.mockResolvedValue([
      { matchId: 'g-A-1', userId: 'u1', homeGoals: 2, awayGoals: 1, updatedAt: '' },
    ]);

    renderProvider(new Date('2026-06-12T19:00:00Z')); // efter avspark, matchen pågår
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    // Avslöjandet visar den pågående matchen (T55), trots att den inte är avgjord.
    expect(screen.getByTestId('reveal')).toHaveTextContent('1');
  });
});
