// Tester för RoomComments UI (T66, #121): säker (escapad) rendering, skicka anropar
// api + tömmer fältet, längdgräns, radera bara på MINA egna rader, tom-läge.
//
// RoomComments är en ren konsument av rums-storen (medlemmar + userId) OCH kommentar-
// storen. Vi ger STUB-stores direkt via context, så UI:t testas isolerat (presentation
// + a11y + interaktion), provider-logiken testas i CommentsProvider.test.tsx.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RoomComments } from './RoomComments';
import { RoomsStoreContext, type RoomsStore } from './rooms-context';
import { CommentsStoreContext, type CommentsStore } from './comments-context';
import type { RoomComment } from '../../data/rooms';

function stubRooms(overrides: Partial<RoomsStore> = {}): RoomsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    userId: 'me',
    myRooms: [],
    activeRoom: { id: 'room1', name: 'Gänget', code: 'abc23x' },
    members: [
      { userId: 'me', displayName: 'Daniel' },
      { userId: 'u2', displayName: 'Elin' },
    ],
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

function stubComments(overrides: Partial<CommentsStore> = {}): CommentsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    comments: [],
    userId: 'me',
    addComment: vi.fn(async () => {}),
    deleteComment: vi.fn(async () => {}),
    ...overrides,
  };
}

function renderWith(rooms: RoomsStore, comments: CommentsStore) {
  return render(
    <RoomsStoreContext.Provider value={rooms}>
      <CommentsStoreContext.Provider value={comments}>
        <RoomComments />
      </CommentsStoreContext.Provider>
    </RoomsStoreContext.Provider>
  );
}

const comment = (over: Partial<RoomComment> = {}): RoomComment => ({
  id: 'c1',
  userId: 'u2',
  body: 'Hej gänget',
  createdAt: '2026-06-12T10:00:00Z',
  // T77: rums-chatt-kommentarer är alltid match_id null (RoomComments är T66-rums-chatten).
  matchId: null,
  ...over,
});

describe('RoomComments', () => {
  it('renderar inget när kommentar-lagret är inaktivt (enabled=false)', () => {
    const { container } = renderWith(stubRooms(), stubComments({ enabled: false }));
    expect(container).toBeEmptyDOMElement();
  });

  it('visar ett vänligt tom-läge när det inte finns kommentarer', () => {
    renderWith(stubRooms(), stubComments({ comments: [] }));
    expect(screen.getByText(/Inga kommentarer än/i)).toBeInTheDocument();
  });

  it('listar kommentarer med författarnamn ur medlemslistan (room_members)', () => {
    renderWith(
      stubRooms(),
      stubComments({ comments: [comment({ userId: 'u2', body: 'Vilken match!' })] })
    );
    expect(screen.getByText('Vilken match!')).toBeInTheDocument();
    // u2 = Elin i medlemslistan.
    expect(screen.getByText('Elin')).toBeInTheDocument();
  });

  it('en författare som lämnat rummet (saknas i listan) faller till "Tidigare medlem"', () => {
    renderWith(
      stubRooms(),
      stubComments({ comments: [comment({ userId: 'ghost', body: 'spöke' })] })
    );
    expect(screen.getByText(/Tidigare medlem/i)).toBeInTheDocument();
  });

  it('renderar kommentar-text ESCAPAD (ingen HTML/JS-injektion)', () => {
    const evil = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    renderWith(stubRooms(), stubComments({ comments: [comment({ body: evil })] }));
    // Texten visas BOKSTAVLIGT (React-escaping), ingen <img>/<script> skapas i DOM:en.
    const body = screen.getByText(evil);
    expect(body).toBeInTheDocument();
    expect(body.querySelector('img')).toBeNull();
    expect(body.querySelector('script')).toBeNull();
    // Ingen injicerad nod nådde dokumentet alls.
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });

  it('skicka anropar addComment med trimmad text OCH tömmer fältet', async () => {
    const addComment = vi.fn(async () => {});
    renderWith(stubRooms(), stubComments({ addComment }));
    const input = screen.getByLabelText(/Skriv en kommentar/i) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '  Heja Sverige!  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Skicka/i }));

    await waitFor(() => expect(addComment).toHaveBeenCalledWith('Heja Sverige!'));
    await waitFor(() => expect(input.value).toBe('')); // fältet töms efter lyckad skickning
  });

  it('skicka-knappen är inaktiv på tom/whitespace-text (kan inte skicka tomt)', () => {
    const addComment = vi.fn(async () => {});
    renderWith(stubRooms(), stubComments({ addComment }));
    const send = screen.getByRole('button', { name: /Skicka/i });
    // Inget skrivet -> disabled.
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Skriv en kommentar/i), { target: { value: '   ' } });
    expect(send).toBeDisabled();
    fireEvent.click(send);
    expect(addComment).not.toHaveBeenCalled();
  });

  it('längdgräns: textfältet har maxLength = COMMENT_MAX_LEN (hård gräns i fältet)', () => {
    renderWith(stubRooms(), stubComments());
    const input = screen.getByLabelText(/Skriv en kommentar/i) as HTMLTextAreaElement;
    expect(input.maxLength).toBe(500);
  });

  it('teckenräknaren speglar trimmad längd', () => {
    renderWith(stubRooms(), stubComments());
    fireEvent.change(screen.getByLabelText(/Skriv en kommentar/i), { target: { value: 'hej' } });
    expect(screen.getByText('3/500')).toBeInTheDocument();
  });

  it('radera-knapp visas BARA på MINA egna rader, aldrig på andras', () => {
    renderWith(
      stubRooms(),
      stubComments({
        userId: 'me',
        comments: [
          comment({ id: 'mine', userId: 'me', body: 'Min kommentar' }),
          comment({ id: 'theirs', userId: 'u2', body: 'Elins kommentar' }),
        ],
      })
    );
    // Exakt EN radera-knapp (bara min rad).
    const deletes = screen.getAllByRole('button', { name: /Radera min kommentar/i });
    expect(deletes).toHaveLength(1);
  });

  it('radera-knappen anropar deleteComment med rätt id (egen rad)', async () => {
    const deleteComment = vi.fn(async () => {});
    renderWith(
      stubRooms(),
      stubComments({
        userId: 'me',
        comments: [comment({ id: 'mine', userId: 'me', body: 'Min kommentar' })],
        deleteComment,
      })
    );
    fireEvent.click(screen.getByRole('button', { name: /Radera min kommentar/i }));
    await waitFor(() => expect(deleteComment).toHaveBeenCalledWith('mine'));
  });

  it('visar storens fel-läge (fail loud, role=alert)', () => {
    renderWith(
      stubRooms(),
      stubComments({ status: 'error', error: 'Kunde inte ladda kommentarerna.' })
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/Kunde inte ladda kommentarerna/i);
  });

  it('ett fel vid skicka visas (role=status), addComment-felet bubblar inte', async () => {
    const addComment = vi.fn(async () => {
      throw new Error('RLS nekade');
    });
    renderWith(stubRooms(), stubComments({ addComment }));
    fireEvent.change(screen.getByLabelText(/Skriv en kommentar/i), { target: { value: 'hej' } });
    fireEvent.click(screen.getByRole('button', { name: /Skicka/i }));
    await waitFor(() => expect(screen.getByText(/RLS nekade/i)).toBeInTheDocument());
  });
});
