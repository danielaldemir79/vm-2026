import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  requestNotificationPermission,
  sendTestNotification,
  storeSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from './push-client';
import type { VmSupabaseClient } from '../../data/supabase-browser';

// ensureSession mockas (samma mönster som predictions-api.test): testerna fokuserar på
// push-stegen + fel-vägarna, inte auth-skapandet (det testas i rooms/auth.test).
vi.mock('../../data/rooms/auth', () => ({
  ensureSession: vi.fn().mockResolvedValue({ userId: 'me', isAnonymous: true }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/** Chainbar query-builder-fake (samma mönster som group-predictions-api.test). */
function builder(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain as never;
  for (const m of ['select', 'eq', 'upsert', 'insert', 'delete', 'order']) {
    chain[m] = vi.fn(self);
  }
  (chain as { then: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return chain;
}

function mockClient(over: Partial<Record<'from' | 'functions', unknown>>): VmSupabaseClient {
  return over as unknown as VmSupabaseClient;
}

/** En fake PushSubscription med toJSON i KÄLL-form + en spionerbar unsubscribe. */
function fakeSubscription(endpoint: string) {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  const sub = {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'P256', auth: 'AUTH' } }),
    unsubscribe,
  } as unknown as PushSubscription;
  return { sub, unsubscribe };
}

/** En fake registration vars pushManager vi kan styra. */
function fakeRegistration(opts: {
  existing?: PushSubscription | null;
  subscribeResult?: PushSubscription;
}) {
  const subscribe = vi.fn().mockResolvedValue(opts.subscribeResult);
  const getSubscription = vi.fn().mockResolvedValue(opts.existing ?? null);
  return {
    registration: {
      pushManager: { subscribe, getSubscription },
    } as unknown as ServiceWorkerRegistration,
    subscribe,
    getSubscription,
  };
}

describe('requestNotificationPermission', () => {
  it('delegerar till Notification.requestPermission och returnerar läget', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    const win = { Notification: { requestPermission } } as unknown as Window;
    await expect(requestNotificationPermission(win)).resolves.toBe('granted');
    expect(requestPermission).toHaveBeenCalledOnce();
  });
});

describe('subscribeToPush', () => {
  it('skapar en ny prenumeration med userVisibleOnly + den publika VAPID-nyckeln', async () => {
    const { sub } = fakeSubscription('https://push/new');
    const { registration, subscribe } = fakeRegistration({ existing: null, subscribeResult: sub });
    const result = await subscribeToPush(registration);
    expect(result).toBe(sub);
    expect(subscribe).toHaveBeenCalledOnce();
    const arg = subscribe.mock.calls[0][0];
    expect(arg.userVisibleOnly).toBe(true);
    // applicationServerKey ska vara en Uint8Array (den konverterade publika nyckeln),
    // inte en sträng , det är vad pushManager.subscribe kräver.
    expect(arg.applicationServerKey).toBeInstanceOf(Uint8Array);
    expect(arg.applicationServerKey.length).toBe(65);
  });

  it('återanvänder en befintlig prenumeration (idempotent, ingen ny subscribe)', async () => {
    const { sub } = fakeSubscription('https://push/existing');
    const { registration, subscribe } = fakeRegistration({ existing: sub });
    const result = await subscribeToPush(registration);
    expect(result).toBe(sub);
    expect(subscribe).not.toHaveBeenCalled();
  });
});

describe('storeSubscription', () => {
  it('upsertar de serialiserade fälten på endpoint-konflikt', async () => {
    const chain = builder({ data: null, error: null });
    const from = vi.fn(() => chain);
    const { sub } = fakeSubscription('https://push/abc');
    await storeSubscription(mockClient({ from }), sub, 'TestUA/1.0');
    expect(from).toHaveBeenCalledWith('push_subscriptions');
    expect(chain.upsert).toHaveBeenCalledWith(
      { endpoint: 'https://push/abc', p256dh: 'P256', auth_key: 'AUTH', user_agent: 'TestUA/1.0' },
      { onConflict: 'endpoint' }
    );
  });

  it('fail loud: ett RLS-/DB-fel kastar med svensk text', async () => {
    const from = vi.fn(() => builder({ data: null, error: { message: 'rls deny' } }));
    const { sub } = fakeSubscription('https://push/abc');
    await expect(storeSubscription(mockClient({ from }), sub, null)).rejects.toThrow(
      /Kunde inte spara push-prenumerationen: rls deny/
    );
  });
});

describe('unsubscribeFromPush', () => {
  it('raderar DB-raden på endpoint OCH avregistrerar i browsern (i den ordningen)', async () => {
    const { sub, unsubscribe } = fakeSubscription('https://push/del');
    const chain = builder({ data: null, error: null });
    const from = vi.fn(() => chain);
    const { registration } = fakeRegistration({ existing: sub });
    await unsubscribeFromPush(mockClient({ from }), registration);
    expect(from).toHaveBeenCalledWith('push_subscriptions');
    expect(chain.delete).toHaveBeenCalledOnce();
    expect(chain.eq).toHaveBeenCalledWith('endpoint', 'https://push/del');
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('ingen befintlig prenumeration -> no-op (ingen radering, ingen krasch)', async () => {
    const from = vi.fn(() => builder({ data: null, error: null }));
    const { registration } = fakeRegistration({ existing: null });
    await expect(unsubscribeFromPush(mockClient({ from }), registration)).resolves.toBeUndefined();
    expect(from).not.toHaveBeenCalled();
  });

  it('fail loud: ett radera-fel kastar och browser-unsubscribe körs INTE (raden kvar)', async () => {
    // Bevisar ordningen + fail-loud: misslyckas DB-raderingen ska vi INTE avregistrera i
    // browsern (annars en levande DB-rad mot en glömd endpoint).
    const { sub, unsubscribe } = fakeSubscription('https://push/del');
    const from = vi.fn(() => builder({ data: null, error: { message: 'boom' } }));
    const { registration } = fakeRegistration({ existing: sub });
    await expect(unsubscribeFromPush(mockClient({ from }), registration)).rejects.toThrow(
      /Kunde inte ta bort push-prenumerationen: boom/
    );
    expect(unsubscribe).not.toHaveBeenCalled();
  });
});

describe('sendTestNotification', () => {
  it('anropar push-sender med {mode:"test"}', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    await sendTestNotification(mockClient({ functions: { invoke } }));
    expect(invoke).toHaveBeenCalledWith('push-sender', { body: { mode: 'test' } });
  });

  it('fail loud: ett funktionsfel (500) kastar med svensk text', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { message: 'no subs' } });
    await expect(sendTestNotification(mockClient({ functions: { invoke } }))).rejects.toThrow(
      /Kunde inte skicka test-notisen: no subs/
    );
  });
});
