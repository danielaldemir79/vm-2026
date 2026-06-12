// Tester för useRealtimeSubscription (T18, #18): livscykeln (subscribe vid mount,
// unsubscribe vid unmount + rum-byte, ingen re-subscribe bara för att onChange byter
// identitet, ingen kanal i vilande läge).

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useRealtimeSubscription } from './use-realtime-subscription';
import type { VmSupabaseClient } from '../supabase-browser';

// Mocka kärn-seamen: vi testar BARA hookens livscykel, inte kanal-API:t (det har
// realtime-subscriptions.test.ts). subscribeToTableChanges returnerar en spion-
// unsubscribe så vi kan verifiera att den körs vid cleanup.
const core = vi.hoisted(() => ({
  unsubscribe: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock('./realtime-subscriptions', () => ({
  subscribeToTableChanges: (...args: unknown[]) => {
    core.subscribe(...args);
    return core.unsubscribe;
  },
}));

const fakeClient = {} as VmSupabaseClient;

beforeEach(() => {
  vi.clearAllMocks();
});

function Harness(props: Parameters<typeof useRealtimeSubscription>[0]) {
  useRealtimeSubscription(props);
  return null;
}

describe('useRealtimeSubscription', () => {
  it('öppnar en prenumeration vid mount när enabled + klient finns', () => {
    render(
      <Harness
        enabled
        client={fakeClient}
        channelName="ch"
        tables={[{ table: 'official_match_results' }]}
        onChange={vi.fn()}
      />
    );
    expect(core.subscribe).toHaveBeenCalledTimes(1);
    const passed = core.subscribe.mock.calls[0][0] as { channelName: string; client: unknown };
    expect(passed.channelName).toBe('ch');
    expect(passed.client).toBe(fakeClient);
  });

  it('öppnar INGEN prenumeration i vilande läge (enabled=false eller ingen klient)', () => {
    const { rerender } = render(
      <Harness
        enabled={false}
        client={fakeClient}
        channelName="ch"
        tables={[]}
        onChange={vi.fn()}
      />
    );
    expect(core.subscribe).not.toHaveBeenCalled();
    rerender(<Harness enabled client={null} channelName="ch" tables={[]} onChange={vi.fn()} />);
    expect(core.subscribe).not.toHaveBeenCalled();
  });

  it('river prenumerationen vid unmount', () => {
    const { unmount } = render(
      <Harness
        enabled
        client={fakeClient}
        channelName="ch"
        tables={[{ table: 'official_match_results' }]}
        onChange={vi.fn()}
      />
    );
    expect(core.unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(core.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('river och öppnar en NY prenumeration när subscriptionKey ändras (rum-byte)', () => {
    const { rerender } = render(
      <Harness
        enabled
        client={fakeClient}
        channelName="ch"
        subscriptionKey="room-A"
        tables={[{ table: 'room_members', filter: 'room_id=eq.room-A' }]}
        onChange={vi.fn()}
      />
    );
    expect(core.subscribe).toHaveBeenCalledTimes(1);
    expect(core.unsubscribe).not.toHaveBeenCalled();

    rerender(
      <Harness
        enabled
        client={fakeClient}
        channelName="ch"
        subscriptionKey="room-B"
        tables={[{ table: 'room_members', filter: 'room_id=eq.room-B' }]}
        onChange={vi.fn()}
      />
    );
    // Gamla kanalen revs, en ny öppnades.
    expect(core.unsubscribe).toHaveBeenCalledTimes(1);
    expect(core.subscribe).toHaveBeenCalledTimes(2);
  });

  it('re-prenumererar INTE bara för att onChange byter identitet per render', () => {
    const { rerender } = render(
      <Harness
        enabled
        client={fakeClient}
        channelName="ch"
        subscriptionKey="room-A"
        tables={[{ table: 'room_members' }]}
        onChange={() => {}}
      />
    );
    expect(core.subscribe).toHaveBeenCalledTimes(1);
    // Ny onChange-identitet, samma nyckel -> ingen ny prenumeration.
    rerender(
      <Harness
        enabled
        client={fakeClient}
        channelName="ch"
        subscriptionKey="room-A"
        tables={[{ table: 'room_members' }]}
        onChange={() => {}}
      />
    );
    expect(core.subscribe).toHaveBeenCalledTimes(1);
    expect(core.unsubscribe).not.toHaveBeenCalled();
  });

  it('anropar den SENASTE onChange via ref (stabil callback, ingen stale closure)', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <Harness
        enabled
        client={fakeClient}
        channelName="ch"
        subscriptionKey="room-A"
        tables={[{ table: 'room_members' }]}
        onChange={first}
      />
    );
    rerender(
      <Harness
        enabled
        client={fakeClient}
        channelName="ch"
        subscriptionKey="room-A"
        tables={[{ table: 'room_members' }]}
        onChange={second}
      />
    );
    // Hämta den onChange som hooken gav kärn-seamen och fyra den: den ska peka på
    // den SENASTE (second), inte den första (ref-indirektionen).
    const passed = core.subscribe.mock.calls[0][0] as { onChange: () => void };
    passed.onChange();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
