import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { AdminSection } from './AdminSection';
import { RoomsStoreContext, type RoomsStore } from '../rooms/rooms-context';
import {
  OfficialResultsStoreContext,
  type OfficialResultsStore,
} from '../official-results/official-results-context';
import type { VmSupabaseClient } from '../../data/supabase-browser';
import type { Match } from '../../domain/types';

// Mocka matchplan-laddningen så admin-inmatningen har matcher utan att slå mot
// getDataSource (vi testar UI-logiken: validering, save, gating).
const adminMatchesState = vi.hoisted(() => ({
  status: 'ready' as 'loading' | 'ready' | 'error',
  matches: [] as Match[],
  error: null as string | null,
}));
vi.mock('./use-admin-matches', () => ({
  useAdminMatches: () => ({
    ...adminMatchesState,
    teamName: (id: string | null) => id ?? 'TBD',
  }),
}));

// Mocka admin-auth så login-flödet inte slår mot Supabase.
const authState = vi.hoisted(() => ({ requestError: null as Error | null }));
vi.mock('../../data/rooms', () => ({
  requestAdminEmailUpgrade: vi.fn(async () => {
    if (authState.requestError) {
      throw authState.requestError;
    }
  }),
  confirmAdminEmailUpgrade: vi.fn(async () => 'anon-1'),
}));

const FINISHED_GROUP: Match = {
  id: 'g-A-1',
  stage: 'group',
  groupId: 'A',
  homeTeamId: 'mex',
  awayTeamId: 'kor',
  kickoff: '2026-06-11T18:00:00Z',
  venue: 'X',
  status: 'scheduled',
  result: null,
};

const KNOCKOUT: Match = {
  id: 'M73',
  stage: 'round-of-32',
  groupId: null,
  homeTeamId: 'mex',
  awayTeamId: 'kor',
  kickoff: '2026-07-04T18:00:00Z',
  venue: 'X',
  status: 'scheduled',
  result: null,
};

function roomsStore(): RoomsStore {
  return { enabled: true } as unknown as RoomsStore;
}

function officialStore(over: Partial<OfficialResultsStore>): OfficialResultsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    results: [],
    isAdmin: false,
    client: {} as VmSupabaseClient,
    saveOfficialResult: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    ...over,
  };
}

function renderSection(official: OfficialResultsStore) {
  return render(
    <RoomsStoreContext.Provider value={roomsStore()}>
      <OfficialResultsStoreContext.Provider value={official}>
        <AdminSection surface={(children) => <div>{children}</div>} />
      </OfficialResultsStoreContext.Provider>
    </RoomsStoreContext.Provider>
  );
}

beforeEach(() => {
  adminMatchesState.status = 'ready';
  adminMatchesState.matches = [FINISHED_GROUP];
  adminMatchesState.error = null;
  authState.requestError = null;
  vi.clearAllMocks();
});

describe('AdminSection, gating', () => {
  it('renderar inget i lokalt läge (rooms.enabled false)', () => {
    const { container } = render(
      <RoomsStoreContext.Provider value={{ enabled: false } as unknown as RoomsStore}>
        <OfficialResultsStoreContext.Provider value={officialStore({})}>
          <AdminSection surface={(c) => <div>{c}</div>} />
        </OfficialResultsStoreContext.Provider>
      </RoomsStoreContext.Provider>
    );
    expect(container.querySelector('[data-admin-entry]')).toBeNull();
    expect(container.querySelector('[data-admin-readonly]')).toBeNull();
  });

  it('icke-admin ser read-only-noten + arrangörs-inloggning, INTE inmatningen', () => {
    renderSection(officialStore({ isAdmin: false }));
    // Read-only-containern finns, login-flödet finns, men INTE admin-inmatningen.
    expect(document.querySelector('[data-admin-readonly]')).not.toBeNull();
    expect(screen.getByText(/poängen räknas ut åt dig/i)).toBeInTheDocument();
    expect(document.querySelector('[data-admin-login]')).not.toBeNull();
    expect(document.querySelector('[data-admin-entry]')).toBeNull();
  });

  it('admin ser facit-inmatningen, INTE read-only-noten', () => {
    renderSection(officialStore({ isAdmin: true }));
    expect(document.querySelector('[data-admin-entry]')).not.toBeNull();
    expect(document.querySelector('[data-admin-readonly]')).toBeNull();
  });
});

describe('AdminResultEntry, save mot global facit', () => {
  it('sparar ett giltigt resultat via saveOfficialResult och visar bekräftelse', async () => {
    const save = vi.fn(async () => {});
    renderSection(officialStore({ isAdmin: true, saveOfficialResult: save }));

    fireEvent.change(screen.getByLabelText('Match'), { target: { value: 'g-A-1' } });
    fireEvent.change(screen.getByLabelText('Mål hemma'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Mål borta'), { target: { value: '1' } });
    // status default 'finished'
    await act(async () => {
      fireEvent.click(screen.getByText('Spara officiellt resultat'));
    });

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ matchId: 'g-A-1', homeGoals: 2, awayGoals: 1, status: 'finished' })
    );
    expect(await screen.findByText(/gäller nu för alla rum/i)).toBeInTheDocument();
  });

  // Copilot R1: straff-fälten ska visas på lika-ställning i slutspel även när målen
  // skrivs med olika strängformat ("01" vs "1"), eftersom valideringen kräver straffar
  // vid lika. Lika räknas på parsade heltal, inte strängjämförelse.
  it('visar straff-fälten vid lika slutspelsställning med ledande nolla ("01" mot "1")', () => {
    adminMatchesState.matches = [KNOCKOUT];
    renderSection(officialStore({ isAdmin: true }));

    fireEvent.change(screen.getByLabelText('Match'), { target: { value: 'M73' } });
    fireEvent.change(screen.getByLabelText('Mål hemma'), { target: { value: '01' } });
    fireEvent.change(screen.getByLabelText('Mål borta'), { target: { value: '1' } });

    // status default 'finished'; "01" === "1" som tal -> lika -> straff-fälten visas.
    expect(document.querySelector('[data-admin-entry-penalties]')).not.toBeNull();
  });

  it('avvisar ogiltig inmatning (negativt mål) utan att anropa save', async () => {
    const save = vi.fn(async () => {});
    renderSection(officialStore({ isAdmin: true, saveOfficialResult: save }));

    fireEvent.change(screen.getByLabelText('Match'), { target: { value: 'g-A-1' } });
    fireEvent.change(screen.getByLabelText('Mål hemma'), { target: { value: '-1' } });
    fireEvent.change(screen.getByLabelText('Mål borta'), { target: { value: '0' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Spara officiellt resultat'));
    });

    expect(save).not.toHaveBeenCalled();
    expect(document.querySelector('[data-admin-entry-errors]')).not.toBeNull();
  });

  it('visar fel-meddelandet om save fail-loud:ar (RLS-avslag)', async () => {
    const save = vi.fn(async () => {
      throw new Error('icke-admin nekas');
    });
    renderSection(officialStore({ isAdmin: true, saveOfficialResult: save }));

    fireEvent.change(screen.getByLabelText('Match'), { target: { value: 'g-A-1' } });
    fireEvent.change(screen.getByLabelText('Mål hemma'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Mål borta'), { target: { value: '0' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Spara officiellt resultat'));
    });

    expect(await screen.findByText(/icke-admin nekas/i)).toBeInTheDocument();
  });
});

describe('AdminLogin, e-post-flöde (icke-admin)', () => {
  it('steg 1 -> steg 2: skickar koden och visar kod-fältet', async () => {
    renderSection(officialStore({ isAdmin: false }));
    fireEvent.change(screen.getByLabelText('E-postadress'), {
      target: { value: 'daniel@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Skicka inloggningskod'));
    });
    expect(await screen.findByLabelText('Inloggningskod')).toBeInTheDocument();
  });

  it('fail loud: ett fel i steg 1 visas (role=alert), stannar på e-post-steget', async () => {
    authState.requestError = new Error('rate limit');
    renderSection(officialStore({ isAdmin: false }));
    fireEvent.change(screen.getByLabelText('E-postadress'), {
      target: { value: 'daniel@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Skicka inloggningskod'));
    });
    expect(await screen.findByText(/rate limit/i)).toBeInTheDocument();
    // Stannar på e-post-steget (ingen kod-input).
    expect(screen.queryByLabelText('Inloggningskod')).toBeNull();
  });

  // Reviewer F1: onUpgraded får signaleras EXAKT en gång per uppgradering, även när
  // sessionen INTE blir admin (då unmountar AdminLogin aldrig och låg tidigare och
  // loopade refresh() vid varje förälder-render eftersom onUpgraded är en ny closure).
  it('signalerar uppgradering exakt en gång, ingen refresh-loop när isAdmin förblir false', async () => {
    const refresh = vi.fn(async () => {});
    const store = officialStore({ isAdmin: false, refresh });
    const { rerender } = renderSection(store);

    // Driv flödet hela vägen till 'done'.
    fireEvent.change(screen.getByLabelText('E-postadress'), {
      target: { value: 'daniel@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Skicka inloggningskod'));
    });
    fireEvent.change(await screen.findByLabelText('Inloggningskod'), {
      target: { value: '123456' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Logga in'));
    });

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    // Tvinga om-renderingar av föräldern: AdminSection skapar en NY onUpgraded-closure
    // varje render. Utan vakten skulle effekten re-fyra och loopa refresh().
    const tree = (
      <RoomsStoreContext.Provider value={roomsStore()}>
        <OfficialResultsStoreContext.Provider value={store}>
          <AdminSection surface={(children) => <div>{children}</div>} />
        </OfficialResultsStoreContext.Provider>
      </RoomsStoreContext.Provider>
    );
    rerender(tree);
    rerender(tree);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // Copilot R2: vid 'done' (uppgraderad men inte admin) ska vyn ge återkoppling, inte
  // vara tom. Bekräftelse + "logga in med en annan e-post" i stället för ett dött läge.
  it('vid done utan admin-behörighet visas bekräftelse + börja-om, inte ett tomt läge', async () => {
    renderSection(officialStore({ isAdmin: false }));

    fireEvent.change(screen.getByLabelText('E-postadress'), {
      target: { value: 'daniel@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Skicka inloggningskod'));
    });
    fireEvent.change(await screen.findByLabelText('Inloggningskod'), {
      target: { value: '123456' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Logga in'));
    });

    expect(document.querySelector('[data-admin-login-done]')).not.toBeNull();
    expect(screen.getByText(/Inloggningen lyckades/i)).toBeInTheDocument();
    expect(document.querySelector('[data-admin-login-restart]')).not.toBeNull();
  });
});
