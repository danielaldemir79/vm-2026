import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomPanel } from './RoomPanel';
import { RoomsStoreContext, type RoomsStore } from './rooms-context';
import type { ReactNode } from 'react';

// share-room mockas så kopiera-/dela-knapparna når sin timeout-gren deterministiskt
// (lyckad kopp -> "Kopierad!" -> auto-återställning), utan att röra riktiga webb-API:er.
vi.mock('./share-room', () => ({
  buildInviteText: () => 'inbjudan',
  copyText: vi.fn(async () => true),
  shareInvite: vi.fn(async () => 'unsupported' as const),
}));

// RoomPanel är en ren konsument av rums-storen. Vi ger en STUB-store direkt via
// context, så panelen kan testas isolerat (utan Supabase / provider-init). Det
// håller testet på presentation + a11y, provider-logiken testas separat.
function stubStore(overrides: Partial<RoomsStore> = {}): RoomsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    userId: 'me',
    myRooms: [],
    activeRoom: null,
    members: [],
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

function renderWith(store: RoomsStore, children: ReactNode = <RoomPanel />) {
  return render(<RoomsStoreContext.Provider value={store}>{children}</RoomsStoreContext.Provider>);
}

describe('RoomPanel', () => {
  it('renderar inget när rummen är inaktiva (enabled=false, lokalt läge)', () => {
    const { container } = renderWith(stubStore({ enabled: false }));
    expect(container).toBeEmptyDOMElement();
  });

  it('renderar skapa- och gå-med-formulären med etiketterade fält (a11y)', () => {
    renderWith(stubStore());
    expect(screen.getByRole('heading', { name: /Rum med kompisarna/i })).toBeInTheDocument();
    // Båda formulären har etiketterade fält (label-for kopplade via useId).
    expect(screen.getByLabelText(/Rummets namn/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Rumskod/i)).toBeInTheDocument();
    // Två "Ditt visningsnamn"-fält (ett per formulär).
    expect(screen.getAllByLabelText(/Ditt visningsnamn/i)).toHaveLength(2);
    expect(screen.getByRole('button', { name: /^Skapa rum$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Gå med$/i })).toBeInTheDocument();
  });

  it('listar mina rum som valbara knappar (aria-pressed speglar aktivt rum)', () => {
    renderWith(
      stubStore({
        myRooms: [
          { id: 'r1', name: 'Vänner', code: 'aaa11' },
          { id: 'r2', name: 'Jobbet', code: 'bbb22' },
        ],
        activeRoom: { id: 'r1', name: 'Vänner', code: 'aaa11' },
      })
    );
    const activeBtn = screen.getByRole('button', { name: /Välj rummet Vänner/i });
    expect(activeBtn).toHaveAttribute('aria-pressed', 'true');
    const otherBtn = screen.getByRole('button', { name: /Välj rummet Jobbet/i });
    expect(otherBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('visar aktivt rum med medlemmar, delad resultat-räknare och lämna-knapp', () => {
    renderWith(
      stubStore({
        activeRoom: { id: 'r1', name: 'Vänner', code: 'aaa11' },
        members: [
          { userId: 'me', displayName: 'Daniel' },
          { userId: 'u2', displayName: 'Bob' },
        ],
        results: [
          {
            matchId: 'M1',
            homeGoals: 2,
            awayGoals: 1,
            penalties: null,
            status: 'finished',
            updatedBy: 'u2',
            updatedAt: '2026-06-10T00:00:00Z',
          },
        ],
      })
    );
    // Egen medlem märks som "(du)".
    expect(screen.getByText(/Daniel/)).toBeInTheDocument();
    expect(screen.getByText(/\(du\)/)).toBeInTheDocument();
    // Delad resultat-räknare.
    expect(screen.getByText(/1 delade resultat/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lämna rummet/i })).toBeInTheDocument();
  });

  it('visar fel-meddelandet (role=alert) vid status error (fail loud)', async () => {
    renderWith(stubStore({ status: 'error', error: 'Kunde inte ladda rummen.' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Kunde inte ladda rummen/i);
    });
  });

  // C3 (Copilot-runda 1): ett rumsbyte som FALLER (nät/RLS) får inte bli en tyst
  // unhandled rejection. Klicket ska visa ett fel-notis (fail loud), inte svälja det.
  it('visar ett fel-notis när byt-rum FALLER (C3, ingen tyst miss)', async () => {
    const selectRoom = async () => {
      throw new Error('Nätfel vid rumsbyte.');
    };
    renderWith(
      stubStore({
        myRooms: [{ id: 'r1', name: 'Vänner', code: 'aaa22' }],
        selectRoom,
      })
    );

    fireEvent.click(screen.getByRole('button', { name: /Välj rummet Vänner/i }));

    await waitFor(() => {
      const notice = document.querySelector('[data-rooms-notice]');
      expect(notice).toHaveTextContent(/Nätfel vid rumsbyte/i);
      expect(notice).toHaveAttribute('data-rooms-notice-tone', 'error');
    });
  });

  // C4 (Copilot-runda 1): att LÄMNA ett rum som faller ska likaså visa ett fel,
  // inte bli en tyst unhandled rejection utan UI-återkoppling.
  it('visar ett fel-notis när lämna-rum FALLER (C4, ingen tyst miss)', async () => {
    const leaveRoom = async () => {
      throw new Error('RLS nekade lämnandet.');
    };
    renderWith(
      stubStore({
        activeRoom: { id: 'r1', name: 'Vänner', code: 'aaa22' },
        leaveRoom,
      })
    );

    fireEvent.click(screen.getByRole('button', { name: /Lämna rummet/i }));

    await waitFor(() => {
      const notice = document.querySelector('[data-rooms-notice]');
      expect(notice).toHaveTextContent(/RLS nekade lämnandet/i);
      expect(notice).toHaveAttribute('data-rooms-notice-tone', 'error');
    });
  });

  // C12/C13 (Copilot-runda 2): kopiera-/dela-knapparnas auto-återställning körde
  // window.setTimeout utan cleanup, så setState kunde ticka EFTER unmount (React-
  // varning + flaky test). Timeout-id:t hålls nu i en ref och rensas vid unmount.
  describe('kopiera/dela auto-återställning städas (C12/C13)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    function renderActiveRoom() {
      return renderWith(stubStore({ activeRoom: { id: 'r1', name: 'Vänner', code: 'aaa11' } }));
    }

    it('kopiera-knappen visar Kopierad! och återställer etiketten efter timeouten', async () => {
      renderActiveRoom();
      const copyBtn = screen.getByRole('button', { name: /Kopiera rumskoden/i });

      // Klicket är async (await copyText) -> spola mikrotasks innen vi mäter.
      await act(async () => {
        fireEvent.click(copyBtn);
      });
      expect(screen.getByRole('button', { name: /kopierad/i })).toBeInTheDocument();

      // Timeouten (2200 ms) återställer etiketten till "Kopiera kod".
      await act(async () => {
        vi.advanceTimersByTime(2200);
      });
      expect(screen.getByRole('button', { name: /Kopiera rumskoden/i })).toBeInTheDocument();
    });

    it('unmount före timeouten ger ingen setState-efter-unmount-varning', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { unmount } = renderActiveRoom();

      // Tänd BÅDA knapparnas timeout (kopiera + dela), unmounta sedan medan de tickar.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Kopiera rumskoden/i }));
        fireEvent.click(screen.getByRole('button', { name: /Dela rummet/i }));
      });
      unmount();

      // Brinner en städad timeout ändå av rör den ingen avmonterad komponent.
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
