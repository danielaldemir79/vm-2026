import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RoomsProvider } from './RoomsProvider';
import { useRoomsStore } from './rooms-context';
import { ACTIVE_ROOM_KEY } from './active-room-storage';
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

// T52 (#91): kopiera-tips-engine:n mockas så copyMyTips-glimmet kan testas isolerat
// (att rätt klient, KÄLLrum + MÅLrum (= aktivt) och en fungerande lås-klassificerare
// skickas in). Vi behåller modulens ÖVRIGA exporter (importActual), så deriveCopyLocks
// (som importerar isMatchLocked/bracketDeadlineMatchId härifrån) fortfarande funkar.
const copyApi = { copyMyPredictions: vi.fn() };
vi.mock('../../data/predictions', async (importActual) => {
  const actual = await importActual<typeof import('../../data/predictions')>();
  return { ...actual, copyMyPredictions: (...a: unknown[]) => copyApi.copyMyPredictions(...a) };
});

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
    <output
      data-testid="probe"
      data-status={store.status}
      data-enabled={String(store.enabled)}
      data-members={store.members.map((m) => m.displayName).join(',')}
    >
      rooms:{store.myRooms.length} active:{store.activeRoom?.name ?? 'none'} members:
      {store.members.length} results:{store.results.length}
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
  // Rensa persistens-nyckeln mellan testerna (jsdoms localStorage delas annars),
  // så rum-persistens-testerna är isolerade.
  window.localStorage.clear();
  api.ensureSession.mockResolvedValue({ userId: 'me', isAnonymous: true });
  api.listMyRooms.mockResolvedValue([]);
  api.listMembers.mockResolvedValue([]);
  api.listRoomResults.mockResolvedValue([]);
});

afterEach(() => {
  // Återställ ev. localStorage-spioner (kastande-storage-testet) så de inte läcker.
  vi.restoreAllMocks();
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

describe('RoomsProvider, copyMyTips kopierar IN till det aktiva rummet (T52, #91)', () => {
  it('skickar klient, KÄLLrum + MÅLrum (= aktivt) och en lås-klassificerare till engine:n', async () => {
    const report = {
      items: [],
      total: { copied: 1, skippedLocked: 0, skippedExisting: 0, failed: 0 },
      byCategory: {},
    };
    copyApi.copyMyPredictions.mockResolvedValue(report);
    // Gå med i målrummet (gör det aktivt).
    api.joinRoomByCode.mockResolvedValue({ id: 'rB', name: 'Jobbet', code: 'bbb22' });
    renderProvider(liveEnv());
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-status', 'ready')
    );
    await act(async () => {
      await store.joinRoom('bbb22', 'Bob');
    });

    let got: unknown;
    await act(async () => {
      got = await store.copyMyTips('rA');
    });

    expect(got).toBe(report);
    // Engine:n fick klienten, KÄLLrummet (rA) och MÅLrummet (= aktivt rum rB), plus en
    // funktion (lås-klassificeraren). Argumenten bevisar att UI:t inte kan kopiera till
    // fel rum: målet är alltid det aktiva rummet, inte ett UI-angivet id.
    expect(copyApi.copyMyPredictions).toHaveBeenCalledWith(
      fakeClient,
      'rA',
      'rB',
      expect.any(Function)
    );
  });

  it('fail loud: kastar utan aktivt rum (inget mål att kopiera till)', async () => {
    renderProvider(liveEnv());
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-status', 'ready')
    );
    // Inget aktivt rum valt -> copyMyTips ska kasta (inte tyst no-op).
    await expect(store.copyMyTips('rA')).rejects.toThrow(/inget aktivt rum att kopiera till/);
    expect(copyApi.copyMyPredictions).not.toHaveBeenCalled();
  });
});

describe('RoomsProvider, cancellation-guard vid snabba rumsbyten (KA-F2)', () => {
  // En manuellt löst promise, så testet styr EXAKT när ett listMembers-svar landar.
  function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  it('ignorerar ett FÖRÅLDRAT svar: slutstate speglar det SENAST valda rummet', async () => {
    // Två rum man redan är med i (så selectRoom kan byta mellan dem).
    api.listMyRooms.mockResolvedValue([
      { id: 'rA', name: 'Rum A', code: 'aaa11' },
      { id: 'rB', name: 'Rum B', code: 'bbb22' },
    ]);

    // listMembers för A är LÅNGSAM (löses manuellt EFTER B), B är snabb. Detta
    // är race:t: väljer man A och sedan B snabbt får A:s sena svar ALDRIG skriva
    // över B:s medlemmar. listRoomResults löser direkt för båda (vi mäter medlemmar).
    const aMembers = deferred<{ userId: string; displayName: string }[]>();
    api.listMembers.mockImplementation((_client: unknown, roomId: string) => {
      if (roomId === 'rA') {
        return aMembers.promise; // hänger tills vi löser den nedan
      }
      return Promise.resolve([{ userId: 'b1', displayName: 'Bertil-B' }]);
    });

    renderProvider(liveEnv());
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-status', 'ready')
    );

    // Välj A (svaret hänger), sedan B direkt (B:s svar landar först).
    await act(async () => {
      void store.selectRoom('rA');
      await store.selectRoom('rB');
    });

    // B:s medlemmar ska synas (B valdes sist).
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-members', 'Bertil-B')
    );

    // NU landar A:s FÖRÅLDRADE svar. Cancellation-guarden ska kasta det, så
    // medlemmarna FORTSÄTTER vara B:s, inte A:s (annars vore det A-svar-vinner-buggen).
    await act(async () => {
      aMembers.resolve([{ userId: 'a1', displayName: 'Anna-A' }]);
      await aMembers.promise;
    });

    expect(screen.getByTestId('probe')).toHaveAttribute('data-members', 'Bertil-B');
    expect(screen.getByTestId('probe')).toHaveTextContent('active:Rum B');
  });
});

describe('RoomsProvider, saveResult når rummet (KA-F3 (a))', () => {
  it('skriver resultatet till det aktiva rummet och lägger det i delade resultat', async () => {
    api.joinRoomByCode.mockResolvedValue({ id: 'r1', name: 'Vänner', code: 'aaa11' });
    api.upsertRoomResult.mockResolvedValue({
      matchId: 'M1',
      homeGoals: 2,
      awayGoals: 1,
      penalties: null,
      status: 'finished',
      updatedBy: 'me',
      updatedAt: '2026-06-11T10:00:00Z',
    });
    renderProvider(liveEnv());
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-status', 'ready')
    );

    await act(async () => {
      await store.joinRoom('aaa11', 'Bob');
    });
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('active:Vänner'));

    await act(async () => {
      await store.saveResult({ matchId: 'M1', homeGoals: 2, awayGoals: 1, status: 'finished' });
    });

    // API:t anropades med rummets id + inmatningen.
    expect(api.upsertRoomResult).toHaveBeenCalledWith(fakeClient, 'r1', {
      matchId: 'M1',
      homeGoals: 2,
      awayGoals: 1,
      status: 'finished',
    });
    // Det sparade resultatet syns optimistiskt i de delade resultaten.
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('results:1'));
  });

  it('är en no-op (rör inte API:t) utan aktivt rum (lokalt läge)', async () => {
    renderProvider(liveEnv());
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-status', 'ready')
    );

    await act(async () => {
      await store.saveResult({ matchId: 'M1', homeGoals: 2, awayGoals: 1, status: 'finished' });
    });

    expect(api.upsertRoomResult).not.toHaveBeenCalled();
    expect(screen.getByTestId('probe')).toHaveTextContent('results:0');
  });
});

describe('RoomsProvider, rum-persistens över sidladdning (T38, #67)', () => {
  it('PERSISTERAR valet vid create + join (sparar rummets id i localStorage)', async () => {
    api.createRoom.mockResolvedValue({ id: 'rNew', name: 'Nytt', code: 'bbb22' });
    renderProvider(liveEnv());
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-status', 'ready')
    );

    await act(async () => {
      await store.createRoom('Nytt', 'Daniel');
    });
    // Auto-vald OCH persistat efter create.
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('active:Nytt'));
    expect(window.localStorage.getItem(ACTIVE_ROOM_KEY)).toBe('rNew');

    // Gå sedan med i ett ANNAT rum: persistensen ska följa det senast valda.
    api.joinRoomByCode.mockResolvedValue({ id: 'rJoin', name: 'Gäng', code: 'ccc33' });
    await act(async () => {
      await store.joinRoom('ccc33', 'Daniel');
    });
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('active:Gäng'));
    expect(window.localStorage.getItem(ACTIVE_ROOM_KEY)).toBe('rJoin');
  });

  it('ÅTERSTÄLLER det sparade rummet vid (re)mount: aktivt + laddar dess data', async () => {
    // Ett sparat id som motsvarar ett rum man fortfarande är medlem i.
    window.localStorage.setItem(ACTIVE_ROOM_KEY, 'rB');
    api.listMyRooms.mockResolvedValue([
      { id: 'rA', name: 'Rum A', code: 'aaa11' },
      { id: 'rB', name: 'Rum B', code: 'bbb22' },
    ]);
    api.listMembers.mockResolvedValue([{ userId: 'me', displayName: 'Daniel' }]);

    renderProvider(liveEnv());

    // Det sparade rummet (rB) blir aktivt direkt vid mount, utan användar-klick,
    // och dess medlemmar laddas (man hamnar inte i "inget rum").
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('active:Rum B'));
    expect(screen.getByTestId('probe')).toHaveTextContent('members:1');
    expect(api.listMembers).toHaveBeenCalledWith(fakeClient, 'rB');
  });

  it('multi-rum: SENAST valda rummet (selectRoom) är det som persisteras', async () => {
    api.listMyRooms.mockResolvedValue([
      { id: 'rA', name: 'Rum A', code: 'aaa11' },
      { id: 'rB', name: 'Rum B', code: 'bbb22' },
    ]);
    renderProvider(liveEnv());
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-status', 'ready')
    );

    await act(async () => {
      await store.selectRoom('rA');
    });
    expect(window.localStorage.getItem(ACTIVE_ROOM_KEY)).toBe('rA');

    await act(async () => {
      await store.selectRoom('rB');
    });
    // Senast valda vinner.
    expect(window.localStorage.getItem(ACTIVE_ROOM_KEY)).toBe('rB');
  });

  it('STALE id (rummet finns inte / man är inte medlem): faller rent till no-room + rensar id:t', async () => {
    // Sparat id pekar på ett rum som INTE finns i mina rum längre (borttaget /
    // lämnat på en annan enhet).
    window.localStorage.setItem(ACTIVE_ROOM_KEY, 'rGhost');
    api.listMyRooms.mockResolvedValue([{ id: 'rA', name: 'Rum A', code: 'aaa11' }]);

    renderProvider(liveEnv());
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-status', 'ready')
    );

    // Inget rum aktiveras (ingen gissning), och det döda id:t rensas så vi inte
    // försöker återställa det igen vid nästa start.
    expect(screen.getByTestId('probe')).toHaveTextContent('active:none');
    expect(window.localStorage.getItem(ACTIVE_ROOM_KEY)).toBeNull();
    // Det stale rummets data hämtas aldrig (vi väljer aldrig ett dött rum).
    expect(api.listMembers).not.toHaveBeenCalledWith(fakeClient, 'rGhost');
  });

  it('lämna det aktiva rummet RENSAR det persistade id:t', async () => {
    window.localStorage.setItem(ACTIVE_ROOM_KEY, 'r1');
    api.listMyRooms.mockResolvedValue([{ id: 'r1', name: 'Vänner', code: 'aaa11' }]);
    api.leaveRoom.mockResolvedValue(undefined);

    renderProvider(liveEnv());
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('active:Vänner'));

    await act(async () => {
      await store.leaveRoom('r1');
    });

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('active:none'));
    expect(window.localStorage.getItem(ACTIVE_ROOM_KEY)).toBeNull();
  });

  it('KASTANDE storage kraschar inte: appen blir ready, inget rum återställs tyst', async () => {
    // localStorage-åtkomsten kastar (privat läge / sandbox). Persistens-läsningen
    // ska falla rent (safe-storage sväljer felet) utan att krascha providern.
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    api.listMyRooms.mockResolvedValue([{ id: 'rA', name: 'Rum A', code: 'aaa11' }]);

    renderProvider(liveEnv());

    // Providern blir ready trots kastande storage (ingen krasch), inget rum
    // återställs (ingen läsbar persistens), appen fungerar lokalt.
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-status', 'ready')
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('active:none');
  });
});

describe('useRoomsStore, fail loud utan provider', () => {
  it('kastar om hooken används utan en RoomsProvider', () => {
    expect(() => render(<Probe />)).toThrow(/RoomsProvider/);
  });
});
