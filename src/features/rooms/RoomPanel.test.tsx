import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RoomPanel } from './RoomPanel';
import { RoomsStoreContext, type RoomsStore } from './rooms-context';
import type { ReactNode } from 'react';

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
    createRoom: async () => {},
    joinRoom: async () => true,
    selectRoom: async () => {},
    leaveRoom: async () => {},
    refresh: async () => {},
    saveResult: async () => {},
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
});
