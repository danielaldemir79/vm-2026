import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RoomsProvider } from '../rooms/RoomsProvider';
import { useRoomsStore } from '../rooms/rooms-context';
import { ResultsProvider } from './ResultsProvider';
import { useResultsStore } from './results-context';
import type { VmSupabaseClient } from '../../data/supabase-browser';
import type { RoomMatchResult } from '../../data/rooms';

// ============================================================================
// INTEGRATIONSTEST: KA-F3 (WIRE) , delade rums-resultat end-to-end genom BÅDA
// providrarna i samma träd-ordning som appen (RoomsProvider OMSLUTER
// ResultsProvider, se App.tsx). Bevisar de tre acceptanskriterierna:
//   (a) en inmatning i RUM-läge når rummet (upsertRoomResult anropas),
//   (b) ett inläst rums-resultat VÄVS IN i den delade matchlistan (store.matches),
//   (c) UTAN rum är allt LOKALT (rooms-API:t rörs aldrig).
// ResultsProvider körs i FIXTURES-läge (tom env) så dess matcher är den statiska
// VM-planen (72 gruppmatcher med id 'g-<grupp>-<n>' + 32 slutspel 'M73'..'M104');
// rums-lagret mockas på data/rooms-nivå (som RoomsProvider-testet). Vi driver mot
// en GRUPPMATCH (id 'g-A-1', den första i planen) så testet speglar de faktiska id:na.
// ============================================================================

const api = {
  ensureSession: vi.fn(),
  listMyRooms: vi.fn(),
  listMembers: vi.fn(),
  listRoomResults: vi.fn(),
  createRoom: vi.fn(),
  joinRoomByCode: vi.fn(),
  leaveRoom: vi.fn(),
  upsertRoomResult: vi.fn(),
};

vi.mock('../../data/rooms', () => ({
  ensureSession: (...a: unknown[]) => api.ensureSession(...a),
  listMyRooms: (...a: unknown[]) => api.listMyRooms(...a),
  listMembers: (...a: unknown[]) => api.listMembers(...a),
  listRoomResults: (...a: unknown[]) => api.listRoomResults(...a),
  createRoom: (...a: unknown[]) => api.createRoom(...a),
  joinRoomByCode: (...a: unknown[]) => api.joinRoomByCode(...a),
  leaveRoom: (...a: unknown[]) => api.leaveRoom(...a),
  upsertRoomResult: (...a: unknown[]) => api.upsertRoomResult(...a),
}));

// Attrapp-klient med den MINIMALA realtids-ytan (T18, #18): rooms-API:t är mockat,
// men RoomsProvider öppnar nu en realtidskanal (useRealtimeSubscription) i live-läge,
// vilket rör client.channel()/realtime.setAuth(). Vi ger en no-op-stub så den RIKTIGA
// prenumerations-vägen körs utan att krascha (testet handlar om resultat-wiringen, inte
// realtid; realtids-seamen har egna tester). En chainbar kanal-attrapp speglar
// supabase-js (.on().on().subscribe()).
const fakeChannel = {
  on: () => fakeChannel,
  subscribe: () => fakeChannel,
};
const fakeClient = {
  channel: () => fakeChannel,
  removeChannel: () => Promise.resolve('ok'),
  realtime: { setAuth: () => Promise.resolve() },
} as unknown as VmSupabaseClient;

function liveEnv(): ImportMetaEnv {
  return {
    VITE_SUPABASE_URL: 'https://x.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key',
  } as ImportMetaEnv;
}

// Sonder för båda storarna, så testet kan driva inmatning + läsa matchläget.
let roomsStore: ReturnType<typeof useRoomsStore>;
let resultsStore: ReturnType<typeof useResultsStore>;
function Probe() {
  roomsStore = useRoomsStore();
  resultsStore = useResultsStore();
  const m1 = resultsStore.matches.find((m) => m.id === 'g-A-1');
  return (
    <output
      data-testid="probe"
      data-rooms-status={roomsStore.status}
      data-results-status={resultsStore.status}
      data-m1-status={m1?.status ?? 'none'}
      data-m1-score={
        m1 && m1.status === 'finished' ? `${m1.result.homeGoals}-${m1.result.awayGoals}` : 'none'
      }
    />
  );
}

// RoomsProvider OMSLUTER ResultsProvider, exakt som App.tsx. ResultsProvider i
// fixtures-läge (tom env) så matcherna är den statiska planen.
function renderApp(roomsLiveEnv: ImportMetaEnv) {
  return render(
    <RoomsProvider env={roomsLiveEnv} liveReady={true} client={fakeClient}>
      <ResultsProvider env={{} as ImportMetaEnv}>
        <Probe />
      </ResultsProvider>
    </RoomsProvider>
  );
}

function finishedRoomResult(matchId: string, home: number, away: number): RoomMatchResult {
  return {
    matchId,
    homeGoals: home,
    awayGoals: away,
    penalties: null,
    status: 'finished',
    updatedBy: 'annan-medlem',
    updatedAt: '2026-06-12T20:00:00Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.ensureSession.mockResolvedValue({ userId: 'me', isAnonymous: true });
  api.listMyRooms.mockResolvedValue([]);
  api.listMembers.mockResolvedValue([]);
  api.listRoomResults.mockResolvedValue([]);
});

async function waitReady() {
  await waitFor(() => {
    expect(screen.getByTestId('probe')).toHaveAttribute('data-rooms-status', 'ready');
    expect(screen.getByTestId('probe')).toHaveAttribute('data-results-status', 'ready');
  });
}

describe('KA-F3 (a): en inmatning i RUM-läge når rummet', () => {
  it('submitResult skriver även till rummet (upsertRoomResult) när ett rum är aktivt', async () => {
    api.joinRoomByCode.mockResolvedValue({ id: 'r1', name: 'Vänner', code: 'aaa11' });
    api.upsertRoomResult.mockResolvedValue(finishedRoomResult('g-A-1', 2, 1));

    renderApp(liveEnv());
    await waitReady();

    // Gå med i ett rum (blir aktivt).
    await act(async () => {
      await roomsStore.joinRoom('aaa11', 'Bob');
    });
    await waitFor(() => expect(roomsStore.activeRoom?.id).toBe('r1'));

    // Mata in ett resultat lokalt; eftersom ett rum är aktivt ska det DELAS.
    await act(async () => {
      resultsStore.submitResult('g-A-1', { homeGoals: 2, awayGoals: 1, status: 'finished' });
    });

    // (a) Resultatet nådde rummet.
    await waitFor(() =>
      expect(api.upsertRoomResult).toHaveBeenCalledWith(fakeClient, 'r1', {
        matchId: 'g-A-1',
        homeGoals: 2,
        awayGoals: 1,
        status: 'finished',
        penalties: null,
      })
    );
    // Lokala matchlistan uppdaterades optimistiskt direkt.
    expect(screen.getByTestId('probe')).toHaveAttribute('data-m1-score', '2-1');
  });
});

describe('KA-F3 (b): inläst rums-resultat vävs in i den delade matchlistan', () => {
  it('ett rums delade resultat syns i store.matches när man går med i rummet', async () => {
    api.joinRoomByCode.mockResolvedValue({ id: 'r1', name: 'Vänner', code: 'aaa11' });
    // En ANNAN medlem har redan fyllt i g-A-1 = 4-0; det ska synas hos oss vid laddning.
    api.listRoomResults.mockResolvedValue([finishedRoomResult('g-A-1', 4, 0)]);

    renderApp(liveEnv());
    await waitReady();

    // Innan vi går med: g-A-1 är den statiska planens scheduled-match (inget resultat).
    expect(screen.getByTestId('probe')).toHaveAttribute('data-m1-status', 'scheduled');

    await act(async () => {
      await roomsStore.joinRoom('aaa11', 'Bob');
    });

    // (b) Efter join vävs rummets delade g-A-1-resultat in i matchlistan.
    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveAttribute('data-m1-status', 'finished');
      expect(screen.getByTestId('probe')).toHaveAttribute('data-m1-score', '4-0');
    });
  });
});

describe('KA-F3 (c): utan rum är allt lokalt', () => {
  it('submitResult utan aktivt rum rör ALDRIG rooms-API:t (lokalt läge)', async () => {
    renderApp(liveEnv());
    await waitReady();

    // Inget rum aktivt (vi gick inte med någonstans).
    expect(roomsStore.activeRoom).toBeNull();

    await act(async () => {
      resultsStore.submitResult('g-A-1', { homeGoals: 1, awayGoals: 0, status: 'finished' });
    });

    // Lokalt uppdaterat, men INGET delades.
    expect(screen.getByTestId('probe')).toHaveAttribute('data-m1-score', '1-0');
    expect(api.upsertRoomResult).not.toHaveBeenCalled();
  });
});
