// LIVE-INVÄVT SEAM-TEST (T77, #161): bevisar att HELA kedjan
//   listRoomMatchComments (API) -> MatchCommentsProvider (gruppering) -> MatchComments (UI)
// faktiskt RENDERAR kommentarerna FÖR MATCHEN på matchkortets affordans, inte bara en
// fixtur i ett isolerat lager. Bara nät-/kanal-gränsen mockas (listRoomMatchComments +
// realtids-seamen); provider, gruppering (match-comments-aggregate) och komponenten är de
// RIKTIGA. Detta är "byggd men ej inkopplad"-buggklassens skydd (lessons handoff-pastar-
// ett-krav-levererat...): ett render-test på den faktiska ytan, inte ett påstående.
//
// PLUS: bevisar att den här provider:n INTE rör rums-chatten (T66) , den hämtar bara MATCH-
// trådar (listRoomMatchComments, match_id IS NOT NULL), aldrig listRoomComments (rums-
// chatten, match_id IS NULL), så T66-ytan är oförändrad.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MatchCommentsProvider } from './MatchCommentsProvider';
import { MatchComments } from './MatchComments';
import type { VmSupabaseClient } from '../../data/supabase-browser';

// Mocka BARA nät-/kanal-gränsen. Provider + gruppering + komponent är de riktiga.
const api = vi.hoisted(() => ({
  listRoomComments: vi.fn(), // rums-chatten (T66) , ska ALDRIG anropas av den här provider:n
  listRoomMatchComments: vi.fn(),
  addComment: vi.fn(),
  deleteMyComment: vi.fn(),
}));
vi.mock('../../data/rooms', () => ({
  listRoomComments: api.listRoomComments,
  listRoomMatchComments: api.listRoomMatchComments,
  addComment: api.addComment,
  deleteMyComment: api.deleteMyComment,
  COMMENT_MAX_LEN: 500,
}));
vi.mock('../../data', () => ({
  isSupabaseConfigured: () => true,
  LIVE_READY: true,
}));
vi.mock('../../data/supabase-browser', () => ({
  getSupabaseClient: () => ({}) as VmSupabaseClient,
}));
vi.mock('../../data/realtime', () => ({
  useRealtimeSubscription: () => {},
}));

const fakeClient = {} as VmSupabaseClient;

function renderSeam(matchId: string) {
  return render(
    <MatchCommentsProvider
      client={fakeClient}
      activeRoomId="room1"
      userId="me"
      members={[
        { userId: 'u1', displayName: 'Alice' } as never,
        { userId: 'u2', displayName: 'Bob' } as never,
      ]}
    >
      <MatchComments matchId={matchId} />
    </MatchCommentsProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('seam: MatchCommentsProvider -> MatchComments', () => {
  it('renderar FÖR MATCHEN de faktiska match-kommentarerna (inte en fixtur), rätt match', async () => {
    // Två matchers kommentarer i samma rum: bara g-A-1:s ska synas i g-A-1-affordansen.
    api.listRoomMatchComments.mockResolvedValue([
      {
        id: 'm1',
        userId: 'u1',
        body: 'A-snack',
        createdAt: '2026-06-12T20:00:00Z',
        matchId: 'g-A-1',
      },
      {
        id: 'm2',
        userId: 'u2',
        body: 'B-snack',
        createdAt: '2026-06-12T20:01:00Z',
        matchId: 'g-B-2',
      },
    ]);
    renderSeam('g-A-1');

    // Affordansen visar matchens antal (1 för g-A-1), inte totalen (2).
    const toggle = await screen.findByRole('button', { name: /kommentarer \(1\)/i });
    fireEvent.click(toggle);

    // Den utfällda tråden renderar g-A-1:s kommentar, INTE g-B-2:s.
    expect(screen.getByText('A-snack')).toBeInTheDocument();
    expect(screen.queryByText('B-snack')).toBeNull();
    // Författarnamnet kommer ur medlemslistan (room_members), inte ur en denormaliserad rad.
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('en match UTAN kommentarer visar "Kommentera" och en tom-hint (ingen tom ruta hopfälld)', async () => {
    api.listRoomMatchComments.mockResolvedValue([
      {
        id: 'm1',
        userId: 'u1',
        body: 'A-snack',
        createdAt: '2026-06-12T20:00:00Z',
        matchId: 'g-A-1',
      },
    ]);
    renderSeam('g-Z-9'); // ingen kommentar för denna match

    const toggle = await screen.findByRole('button', { name: /kommentera/i });
    // Hopfälld default: ingen tom panel-ruta tar plats förrän man trycker.
    expect(document.querySelector('[data-match-comments-panel]')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText(/Var först med att snacka/i)).toBeInTheDocument();
  });

  it('RÖR INTE rums-chatten (T66): provider:n anropar listRoomMatchComments, ALDRIG listRoomComments', async () => {
    api.listRoomMatchComments.mockResolvedValue([]);
    renderSeam('g-A-1');
    await waitFor(() =>
      expect(api.listRoomMatchComments).toHaveBeenCalledWith(fakeClient, 'room1')
    );
    // T66-regressionsskyddet: den här provider:n hämtar BARA match-trådar.
    expect(api.listRoomComments).not.toHaveBeenCalled();
  });
});
