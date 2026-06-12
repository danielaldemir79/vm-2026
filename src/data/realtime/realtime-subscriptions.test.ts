// Tester för realtids-seamen (T18, #18): att vi sätter upp postgres_changes på rätt
// tabeller, kör onChange vid händelse, river kanalen vid unsubscribe (idempotent),
// och ALDRIG läser payloadens rad-data (härledd state, sekretess via re-fetch).

import { describe, expect, it, vi } from 'vitest';
import { subscribeToTableChanges, type RealtimeSubscriptionConfig } from './realtime-subscriptions';
import type { VmSupabaseClient } from '../supabase-browser';

/**
 * En mock-realtidskanal som fångar postgres_changes-lyssnarna och låter testet
 * "fyra" en händelse manuellt (emit). Speglar supabase-js kanal-API:t (.on/.subscribe).
 */
interface PostgresChangesListener {
  config: { event: string; schema: string; table: string; filter?: string };
  callback: (payload: unknown) => void;
}

function makeMockClient() {
  const listeners: PostgresChangesListener[] = [];
  let subscribeStatusCb: ((status: string) => void) | undefined;
  const removeChannel = vi.fn(async () => 'ok');
  const setAuth = vi.fn(async () => {});

  const channel = {
    on: vi.fn(
      (
        event: string,
        config: PostgresChangesListener['config'],
        callback: PostgresChangesListener['callback']
      ) => {
        // Vi bryr oss bara om postgres_changes i denna seam.
        expect(event).toBe('postgres_changes');
        listeners.push({ config, callback });
        return channel; // chainbar (.on().on().subscribe())
      }
    ),
    subscribe: vi.fn((cb?: (status: string) => void) => {
      subscribeStatusCb = cb;
      return channel;
    }),
  };

  const client = {
    channel: vi.fn(() => channel),
    removeChannel,
    realtime: { setAuth },
  } as unknown as VmSupabaseClient;

  return {
    client,
    channel,
    removeChannel,
    setAuth,
    listeners,
    /** Fyra av en postgres_changes-händelse mot alla matchande tabell-lyssnare. */
    emit(table: string, payload: unknown = { eventType: 'INSERT', new: { secret: 'LÄCK' } }) {
      for (const l of listeners) {
        if (l.config.table === table) {
          l.callback(payload);
        }
      }
    },
    /** Driv subscribe-statusen (t.ex. 'SUBSCRIBED' eller ett fel). */
    setStatus(status: string) {
      subscribeStatusCb?.(status);
    },
  };
}

function baseConfig(
  client: VmSupabaseClient,
  onChange: () => void,
  overrides?: Partial<RealtimeSubscriptionConfig>
): RealtimeSubscriptionConfig {
  return {
    client,
    channelName: 'test-channel',
    tables: [{ table: 'official_match_results' }],
    onChange,
    ...overrides,
  };
}

describe('subscribeToTableChanges', () => {
  it('öppnar en kanal och registrerar postgres_changes per tabell', () => {
    const m = makeMockClient();
    const onChange = vi.fn();
    subscribeToTableChanges(
      baseConfig(m.client, onChange, {
        tables: [
          { table: 'room_match_results', filter: 'room_id=eq.r1' },
          { table: 'room_members', filter: 'room_id=eq.r1' },
        ],
      })
    );

    expect(m.client.channel).toHaveBeenCalledWith('test-channel');
    expect(m.listeners).toHaveLength(2);
    expect(m.listeners[0].config).toEqual({
      event: '*',
      schema: 'public',
      table: 'room_match_results',
      filter: 'room_id=eq.r1',
    });
    // Utan filter ska inget filter-fält skickas (annars tolkar Supabase '' som filter).
    expect(m.listeners[1].config.filter).toBe('room_id=eq.r1');
    expect(m.channel.subscribe).toHaveBeenCalledTimes(1);
  });

  it('utelämnar filter-fältet helt när inget filter ges', () => {
    const m = makeMockClient();
    subscribeToTableChanges(baseConfig(m.client, vi.fn()));
    expect(m.listeners[0].config).toEqual({
      event: '*',
      schema: 'public',
      table: 'official_match_results',
    });
    expect('filter' in m.listeners[0].config).toBe(false);
  });

  it('binder sessionens JWT (setAuth) före subscribe så RLS vet vem klienten är', () => {
    const m = makeMockClient();
    subscribeToTableChanges(baseConfig(m.client, vi.fn()));
    expect(m.setAuth).toHaveBeenCalledTimes(1);
  });

  it('kör onChange vid en postgres_changes-händelse', () => {
    const m = makeMockClient();
    const onChange = vi.fn();
    subscribeToTableChanges(baseConfig(m.client, onChange));
    expect(onChange).not.toHaveBeenCalled();
    m.emit('official_match_results');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('läser ALDRIG payloadens rad-data (härledd state, sekretess via re-fetch)', () => {
    // SEKRETESS-HARD-bevis: onChange tar INGA argument, så payloadens `new`/`old`
    // (som i värsta fall kunde bära en hemlighet) kan inte nå konsumenten. Vi fyrar
    // en payload med ett "läck"-fält och verifierar att onChange anropas helt utan args.
    const m = makeMockClient();
    const onChange = vi.fn();
    subscribeToTableChanges(baseConfig(m.client, onChange));
    m.emit('official_match_results', { eventType: 'INSERT', new: { secret: 'LÄCK' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(); // inga argument -> ingen payload vidare
  });

  it('river kanalen vid unsubscribe (removeChannel)', () => {
    const m = makeMockClient();
    const unsubscribe = subscribeToTableChanges(baseConfig(m.client, vi.fn()));
    expect(m.removeChannel).not.toHaveBeenCalled();
    unsubscribe();
    expect(m.removeChannel).toHaveBeenCalledTimes(1);
    expect(m.removeChannel).toHaveBeenCalledWith(m.channel);
  });

  it('är idempotent: dubbel unsubscribe river bara en gång', () => {
    const m = makeMockClient();
    const unsubscribe = subscribeToTableChanges(baseConfig(m.client, vi.fn()));
    unsubscribe();
    unsubscribe();
    expect(m.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('loggar fail-loud (warn) vid en icke-SUBSCRIBED-status men kraschar inte', () => {
    const m = makeMockClient();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    subscribeToTableChanges(baseConfig(m.client, vi.fn()));
    // En lyckad uppkoppling loggar inget.
    m.setStatus('SUBSCRIBED');
    expect(warn).not.toHaveBeenCalled();
    // Ett kanal-fel loggas (skyddsnäten tar över) men inget kastas.
    expect(() => m.setStatus('CHANNEL_ERROR')).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('CHANNEL_ERROR');
    warn.mockRestore();
  });
});
