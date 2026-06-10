import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RoomsProvider } from './RoomsProvider';
import { useRoomsStore } from './rooms-context';
import type { VmSupabaseClient } from '../../data/supabase-browser';

// Vi mockar rooms-API:t (data/rooms) så provider-testet fokuserar på React-
// koordinationen (state, aktivt rum, fail-loud), inte på Supabase-anropen (de
// testas i rooms-api.test.ts + RLS-integrationstestet).
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

// En attrapp-klient räcker (provider:n skickar bara vidare den till API:t, som
// är mockat). Injiceras via `client`-proppen så ingen riktig Supabase skapas.
const fakeClient = {} as VmSupabaseClient;

function liveEnv(): ImportMetaEnv {
  return {
    VITE_SUPABASE_URL: 'https://x.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key',
  } as ImportMetaEnv;
}

/** Liten sond som projicerar storen i DOM:en + exponerar handlingarna. */
let store: ReturnType<typeof useRoomsStore>;
function Probe() {
  store = useRoomsStore();
  return (
    <output data-testid="probe" data-status={store.status} data-enabled={String(store.enabled)}>
      rooms:{store.myRooms.length} active:{store.activeRoom?.name ?? 'none'} members:
      {store.members.length}
    </output>
  );
}

function renderProvider(env: ImportMetaEnv, liveReady = true) {
  return render(
    <RoomsProvider env={env} liveReady={liveReady} client={fakeClient}>
      <Probe />
    </RoomsProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.ensureSession.mockResolvedValue({ userId: 'me', isAnonymous: true });
  api.listMyRooms.mockResolvedValue([]);
  api.listMembers.mockResolvedValue([]);
  api.listRoomResults.mockResolvedValue([]);
});

describe('RoomsProvider, enabled-gind', () => {
  it('är INAKTIV (enabled=false) i fixtures-läge (ingen env), appen fungerar lokalt', async () => {
    render(
      <RoomsProvider env={{} as ImportMetaEnv} liveReady={true} client={fakeClient}>
        <Probe />
      </RoomsProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-enabled', 'false')
    );
    // Ingen session/laddning sker när rummen är inaktiva.
    expect(api.ensureSession).not.toHaveBeenCalled();
  });

  it('är INAKTIV när env finns men liveReady=false (tvåstegs-gaten)', async () => {
    renderProvider(liveEnv(), false);
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-enabled', 'false')
    );
  });

  it('är AKTIV (enabled) och säkrar session + laddar mina rum när env + liveReady', async () => {
    api.listMyRooms.mockResolvedValue([{ id: 'r1', name: 'Vänner', code: 'aaa11' }]);
    renderProvider(liveEnv());
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-status', 'ready')
    );
    expect(api.ensureSession).toHaveBeenCalled();
    expect(screen.getByTestId('probe')).toHaveTextContent('rooms:1');
  });
});

describe('RoomsProvider, fel-väg (fail loud)', () => {
  it('hamnar i error med meddelande om initieringen kastar', async () => {
    api.listMyRooms.mockRejectedValue(new Error('RLS nekad'));
    renderProvider(liveEnv());
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-status', 'error')
    );
    expect(store.error).toMatch(/RLS nekad/);
  });
});

describe('RoomsProvider, handlingar', () => {
  it('createRoom lägger till rummet, gör det aktivt och laddar dess data', async () => {
    api.createRoom.mockResolvedValue({ id: 'r1', name: 'Nytt', code: 'bbb22' });
    api.listMembers.mockResolvedValue([{ userId: 'me', displayName: 'Daniel' }]);
    renderProvider(liveEnv());
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-status', 'ready')
    );

    await act(async () => {
      await store.createRoom('Nytt', 'Daniel');
    });

    expect(api.createRoom).toHaveBeenCalledWith(fakeClient, 'Nytt', 'Daniel');
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('active:Nytt'));
    expect(screen.getByTestId('probe')).toHaveTextContent('members:1');
  });

  it('joinRoom returnerar false (utan att aktivera) när koden är okänd', async () => {
    api.joinRoomByCode.mockResolvedValue(null);
    renderProvider(liveEnv());
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-status', 'ready')
    );

    let result: boolean | undefined;
    await act(async () => {
      result = await store.joinRoom('zzzz9', 'Bob');
    });

    expect(result).toBe(false);
    expect(screen.getByTestId('probe')).toHaveTextContent('active:none');
  });

  it('leaveRoom tar bort rummet och nollställer aktivt om det var det aktiva', async () => {
    api.joinRoomByCode.mockResolvedValue({ id: 'r1', name: 'Vänner', code: 'aaa11' });
    api.leaveRoom.mockResolvedValue(undefined);
    renderProvider(liveEnv());
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-status', 'ready')
    );

    await act(async () => {
      await store.joinRoom('aaa11', 'Bob');
    });
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('active:Vänner'));

    await act(async () => {
      await store.leaveRoom('r1');
    });

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('active:none'));
    expect(screen.getByTestId('probe')).toHaveTextContent('rooms:0');
    expect(api.leaveRoom).toHaveBeenCalledWith(fakeClient, 'r1');
  });
});

describe('useRoomsStore, fail loud utan provider', () => {
  it('kastar om hooken används utan en RoomsProvider', () => {
    expect(() => render(<Probe />)).toThrow(/RoomsProvider/);
  });
});
