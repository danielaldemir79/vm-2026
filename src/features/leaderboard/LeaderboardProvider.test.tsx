import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { LeaderboardProvider } from './LeaderboardProvider';
import { useLeaderboardStore } from './leaderboard-context';
import type { Prediction } from '../../data/predictions';
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
  tipsRefreshNonce: 0,
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
      <span data-testid="self-breakdown">
        {store.selfBreakdown
          ? `${store.selfBreakdown.total}:${store.selfBreakdown.bySource.match}/${store.selfBreakdown.bySource.group}/${store.selfBreakdown.bySource.bracket}/${store.selfBreakdown.bySource.champion}`
          : 'null'}
      </span>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  roomsState.members = [];
  roomsState.activeRoom = { id: 'r1' };
  roomsState.userId = null;
  roomsState.tipsRefreshNonce = 0;
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

  it('exponerar AKTUELL användares käll-uppdelning (selfBreakdown) ur samma scoreMember-väg (T58)', async () => {
    // Grupp C färdigspelad (facit 1:a BRA, 2:a MAR), Anna = aktuell användare (userId u1).
    const groupC = WC2026_GROUPS.find((g) => g.id === 'C')!;
    const [bra, mar, hai, sco] = groupC.teamIds;
    dataState.matches = [
      groupMatch('C', bra, mar, 1, 0),
      groupMatch('C', bra, hai, 2, 0),
      groupMatch('C', bra, sco, 3, 0),
      groupMatch('C', mar, hai, 2, 0),
      groupMatch('C', mar, sco, 1, 0),
      groupMatch('C', hai, sco, 0, 0),
    ];
    roomsState.members = [{ userId: 'u1', displayName: 'Anna' }];
    roomsState.userId = 'u1'; // jag ÄR Anna
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
    // total 5, all i grupp-källan (match/bracket/champion = 0). Summan === topplistans tal.
    expect(screen.getByTestId('self-breakdown')).toHaveTextContent('5:0/5/0/0');
  });

  it('selfBreakdown är null utan känd identitet (currentUserId null) -> ingen egen detalj', async () => {
    roomsState.members = [{ userId: 'u1', displayName: 'Anna' }];
    roomsState.userId = null; // ingen identitet
    renderProvider(new Date('2026-06-13T00:00:00Z'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('self-breakdown')).toHaveTextContent('null');
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

describe('LeaderboardProvider, T55 (#96): avspark-triggad re-fetch är TYST', () => {
  // ROTORSAK 2-fyndet (copilot R2): fetch-effekten satte ALLTID 'loading' vid start, så
  // en avspark-triggad re-fetch (lockedMatchCount ändras) flimrade "Laddar..." och tömde
  // topplistan/avslöjandet trots att giltig data redan fanns. Fixen: 'loading' visas BARA
  // vid INITIAL hämtning (ingen data) och RUMSBYTE (datan hör till fel rum); en avspark-
  // re-fetch i SAMMA rum behåller data + 'ready' och byter bara ut datat när svaret kommer.

  /** En styrbar promise (resolve/reject utifrån), för att hålla en hämtning "i flykten". */
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  /** Probe som SPÅRAR varje status-värde över tid (för flimmer-bevis), inte bara nuet. */
  const statusLog: string[] = [];
  function TrackingProbe() {
    const store = useLeaderboardStore();
    statusLog.push(store.status);
    return (
      <div>
        <span data-testid="status">{store.status}</span>
        <span data-testid="reveal">{store.reveal.length}</span>
        <span data-testid="board">
          {store.leaderboard.map((e) => `${e.displayName}:${e.points}`).join('|')}
        </span>
      </div>
    );
  }

  it('avspark-trigger flimrar INTE loading: status förblir ready, gamla picks kvar tills nya satts', async () => {
    vi.useFakeTimers();
    statusLog.length = 0;
    try {
      const start = new Date('2026-06-12T17:45:00Z');
      vi.setSystemTime(start);
      // Två avgjorda+låsta matcher. g-A-1 låst vid start (initial), g-A-2 låses 18:00Z.
      // Båda finished så reveal får data att visa (gamla picks ska synas under re-fetch).
      dataState.matches = [
        matchAt('g-A-1', '2026-06-12T17:30:00Z', 'finished'),
        matchAt('g-A-2', '2026-06-12T18:00:00Z', 'finished'),
      ];
      roomsState.members = [{ userId: 'u1', displayName: 'Anna' }];

      // Initial-svaret: en match-pick (ger 3p exakt + reveal-rad). Avspark-svaret hålls
      // i flykten via en deferred, så vi kan observera status MEDAN re-fetchen pågår.
      const initial = [
        { matchId: 'g-A-1', userId: 'u1', homeGoals: 1, awayGoals: 0, updatedAt: '' },
      ];
      const second = deferred<typeof initial>();
      api.listRoomPredictions.mockReturnValueOnce(Promise.resolve(initial));
      api.listRoomPredictions.mockReturnValueOnce(second.promise);

      render(
        <LeaderboardProvider env={env} client={fakeClient} activeRoomId="r1" now={start}>
          <TrackingProbe />
        </LeaderboardProvider>
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      // Initial hämtning klar: ready, 3p, en avslöjad match.
      expect(screen.getByTestId('status')).toHaveTextContent('ready');
      expect(screen.getByTestId('board')).toHaveTextContent('Anna:3');
      expect(screen.getByTestId('reveal')).toHaveTextContent('1');
      expect(api.listRoomPredictions).toHaveBeenCalledTimes(1);

      const seenReadyAt = statusLog.length;

      // Passera g-A-2:s avspark (18:00Z): lockedMatchCount går 1 -> 2, re-fetch triggas.
      // Andra-svaret HÄNGER (deferred ej löst), så vi ser läget MITT i re-fetchen.
      await act(async () => {
        vi.setSystemTime(new Date('2026-06-12T18:01:00Z'));
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(api.listRoomPredictions).toHaveBeenCalledTimes(2);
      // FLIMMER-BEVIS: status är fortfarande 'ready' (aldrig 'loading'), och de GAMLA
      // tips-DATAT (board-poängen, härledd ur predictions) står kvar på 3p medan re-
      // fetchen pågår, det töms inte. (reveal räknas separat ur data.matches+evalNow och
      // går 1 -> 2 när g-A-2 låses; det är just det T55:s avslöjande SKA göra oberoende
      // av tips-laddningen, så reveal är inte flimmer-måttet här, board-datat är det.)
      expect(screen.getByTestId('status')).toHaveTextContent('ready');
      expect(screen.getByTestId('board')).toHaveTextContent('Anna:3');
      expect(statusLog.slice(seenReadyAt)).not.toContain('loading');

      // Lös re-fetchen med UTÖKAD data (en till pick, +3p): nu byts tips-datat ut.
      await act(async () => {
        second.resolve([
          { matchId: 'g-A-1', userId: 'u1', homeGoals: 1, awayGoals: 0, updatedAt: '' },
          { matchId: 'g-A-2', userId: 'u1', homeGoals: 1, awayGoals: 0, updatedAt: '' },
        ]);
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByTestId('status')).toHaveTextContent('ready');
      expect(screen.getByTestId('board')).toHaveTextContent('Anna:6'); // 3 + 3
      // Hela förloppet efter första ready: aldrig en 'loading' (ingen flimmer).
      expect(statusLog.slice(seenReadyAt)).not.toContain('loading');
    } finally {
      vi.useRealTimers();
    }
  });

  it('en misslyckad TYST re-fetch kastar inte bort befintlig data (behåller ready + gamla picks)', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const start = new Date('2026-06-12T17:45:00Z');
      vi.setSystemTime(start);
      dataState.matches = [
        matchAt('g-A-1', '2026-06-12T17:30:00Z', 'finished'),
        matchAt('g-A-2', '2026-06-12T18:00:00Z', 'finished'),
      ];
      roomsState.members = [{ userId: 'u1', displayName: 'Anna' }];

      api.listRoomPredictions.mockReturnValueOnce(
        Promise.resolve([
          { matchId: 'g-A-1', userId: 'u1', homeGoals: 1, awayGoals: 0, updatedAt: '' },
        ])
      );
      // Avspark-re-fetchen FAILAR. Deferred + reject INNE i act, så rejectionen alltid
      // har en konsument (effektens .catch) och aldrig blir en "unhandled rejection".
      // Den TOMMA .catch:en nedan tystar bara node:s unhandled-rejection-vakt för den
      // RÅA second-promisen (mocken delar ut den innan effektens Promise.all hinner
      // koppla sin handler); den fångar inget testet bryr sig om.
      const second = deferred<never>();
      second.promise.catch(() => {});
      api.listRoomPredictions.mockReturnValueOnce(second.promise);

      renderProvider(start);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByTestId('status')).toHaveTextContent('ready');
      expect(screen.getByTestId('board')).toHaveTextContent('Anna:3:1');

      // Passera andra avsparken -> tyst re-fetch som failar.
      await act(async () => {
        vi.setSystemTime(new Date('2026-06-12T18:01:00Z'));
        await vi.advanceTimersByTimeAsync(60_000);
        second.reject(new Error('RLS nekade'));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(api.listRoomPredictions).toHaveBeenCalledTimes(2);
      // BEFINTLIG DATA KVAR: inte 'error', inte tom, gamla picksen står kvar.
      expect(screen.getByTestId('status')).toHaveTextContent('ready');
      expect(screen.getByTestId('error')).toHaveTextContent('');
      expect(screen.getByTestId('board')).toHaveTextContent('Anna:3:1');
      // Felet loggas (fail-loud i konsolen), inte sväljs helt tyst.
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it('RUMSBYTE visar loading som idag (datan hör till fel rum, ska blankas)', async () => {
    statusLog.length = 0;
    roomsState.members = [{ userId: 'u1', displayName: 'Anna' }];
    api.listRoomPredictions.mockResolvedValue([
      { matchId: 'g-A-1', userId: 'u1', homeGoals: 1, awayGoals: 0, updatedAt: '' },
    ]);

    const view = render(
      <LeaderboardProvider env={env} client={fakeClient} activeRoomId="r1" now={new Date()}>
        <TrackingProbe />
      </LeaderboardProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    const beforeSwitch = statusLog.length;

    // Byt rum: datan tillhör r1, så det NYA rummet ska visa loading (blanka), inte
    // tyst behålla r1:s data.
    view.rerender(
      <LeaderboardProvider env={env} client={fakeClient} activeRoomId="r2" now={new Date()}>
        <TrackingProbe />
      </LeaderboardProvider>
    );
    // Rumsbytet passerade 'loading' (till skillnad från en avspark-re-fetch).
    expect(statusLog.slice(beforeSwitch)).toContain('loading');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
  });

  it('INITIAL hämtning visar loading som idag (ingen data än)', async () => {
    statusLog.length = 0;
    roomsState.members = [{ userId: 'u1', displayName: 'Anna' }];
    const gate = deferred<[]>();
    api.listRoomPredictions.mockReturnValueOnce(gate.promise as unknown as Promise<[]>);
    api.listRoomGroupPredictions.mockResolvedValue([]);
    api.listRoomBracketPredictions.mockResolvedValue([]);

    render(
      <LeaderboardProvider env={env} client={fakeClient} activeRoomId="r1" now={new Date()}>
        <TrackingProbe />
      </LeaderboardProvider>
    );
    // Före svaret: status är 'loading' (initial, ingen data än).
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('loading'));
    expect(statusLog).toContain('loading');

    await act(async () => {
      gate.resolve([]);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
  });
});

describe('LeaderboardProvider, T61 (#110): kopierings-invalidering hämtar om rummets aggregerade tips', () => {
  // ROTORSAK (#110): en kopiering IN i det aktiva rummet skrev nya tips-rader, men
  // topplistan/avslöjandet hämtades bara vid mount/rum-byte/avspark. Fixen: tipsRefreshNonce
  // i fetch-deps -> en TYST re-fetch när nonce bumpas (samma loadedRoomIdRef-mönster som
  // T55:s avspark-re-fetch, så ingen "Laddar..."-blink och topplistan inte töms).

  /** En styrbar promise (resolve utifrån), för att hålla en re-fetch "i flykten". */
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  /** Probe som SPÅRAR varje status-värde (flimmer-bevis). */
  const statusLog: string[] = [];
  function TrackingProbe() {
    const store = useLeaderboardStore();
    statusLog.push(store.status);
    return (
      <div>
        <span data-testid="status">{store.status}</span>
        <span data-testid="board">
          {store.leaderboard.map((e) => `${e.displayName}:${e.points}`).join('|')}
        </span>
      </div>
    );
  }

  /** Harness som bumpar den INJICERADE tipsRefreshNonce (simulerar en lyckad kopiering). */
  function Harness() {
    const [nonce, setNonce] = useState(0);
    return (
      <LeaderboardProvider
        env={env}
        client={fakeClient}
        activeRoomId="r1"
        tipsRefreshNonce={nonce}
        now={new Date('2026-06-12T20:00:00Z')}
      >
        <TrackingProbe />
        <button onClick={() => setNonce((n) => n + 1)}>bump</button>
      </LeaderboardProvider>
    );
  }

  it('nonce-bump hämtar om rummets tips: 1 initial + 1 efter copy, nya poängen syns utan rum-byte', async () => {
    // Avgjord match (g-A-1 = 2-1). Initialt har Anna inget tips (0p); efter "kopieringen"
    // har hon ett exakt tips (3p), vilket dyker upp i topplistan utan rum-byte.
    dataState.matches = [groupMatch('A', 'mex', 'kor', 2, 1)];
    roomsState.members = [{ userId: 'u1', displayName: 'Anna' }];
    api.listRoomPredictions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { matchId: 'A-mex-kor', userId: 'u1', homeGoals: 2, awayGoals: 1, updatedAt: '' },
      ]);

    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(api.listRoomPredictions).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('board')).toHaveTextContent('Anna:0');

    await act(async () => {
      screen.getByText('bump').click();
    });
    await waitFor(() => expect(screen.getByTestId('board')).toHaveTextContent('Anna:3'));
    expect(api.listRoomPredictions).toHaveBeenCalledTimes(2);
  });

  it('kopierings-re-fetchen är TYST: status förblir ready, gamla poängen kvar tills nya satts', async () => {
    statusLog.length = 0;
    dataState.matches = [groupMatch('A', 'mex', 'kor', 2, 1)];
    roomsState.members = [{ userId: 'u1', displayName: 'Anna' }];
    const second = deferred<Prediction[]>();
    api.listRoomPredictions
      .mockReturnValueOnce(
        Promise.resolve([
          { matchId: 'A-mex-kor', userId: 'u1', homeGoals: 2, awayGoals: 1, updatedAt: '' },
        ])
      )
      .mockReturnValueOnce(second.promise);

    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('board')).toHaveTextContent('Anna:3');
    const seenReadyAt = statusLog.length;

    // Bumpa nonce -> re-fetch startar men HÄNGER (deferred ej löst).
    await act(async () => {
      screen.getByText('bump').click();
    });
    expect(api.listRoomPredictions).toHaveBeenCalledTimes(2);
    // FLIMMER-BEVIS: status är fortfarande 'ready', gamla poängen står kvar under re-fetchen.
    expect(screen.getByTestId('status')).toHaveTextContent('ready');
    expect(screen.getByTestId('board')).toHaveTextContent('Anna:3');
    expect(statusLog.slice(seenReadyAt)).not.toContain('loading');

    await act(async () => {
      second.resolve([]); // tippet "togs bort" i kopieringen -> 0p
      await second.promise;
    });
    expect(screen.getByTestId('status')).toHaveTextContent('ready');
    expect(statusLog.slice(seenReadyAt)).not.toContain('loading');
  });
});
