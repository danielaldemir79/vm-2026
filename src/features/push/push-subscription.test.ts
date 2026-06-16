import { describe, expect, it } from 'vitest';
import {
  buildTestNotificationPayload,
  serializePushSubscription,
  type PushSubscriptionRow,
} from './push-subscription';

/**
 * Bygg en minimal fake-PushSubscription med en injicerbar toJSON-form. Vi efterliknar
 * webbläsarens KÄLL-form (toJSON: { endpoint, keys: { p256dh, auth } }), inte vår egen
 * konsument-form, så serialiserings-skarven faktiskt bevisas (mock-foljer-konsumenttyp-
 * fällan: en mock som redan är konsument-formen testar ingenting).
 */
function fakeSubscription(json: {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}): PushSubscription {
  return { toJSON: () => json } as unknown as PushSubscription;
}

describe('serializePushSubscription', () => {
  it('plockar endpoint + p256dh + auth ur webbläsarens toJSON-form till lagrings-raden', () => {
    const sub = fakeSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      keys: { p256dh: 'BPublicKeyBase64Url', auth: 'AuthSecretBase64Url' },
    });
    const row: PushSubscriptionRow = serializePushSubscription(sub);
    expect(row).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      p256dh: 'BPublicKeyBase64Url',
      authKey: 'AuthSecretBase64Url',
    });
  });

  it('kastar fail-loud när endpoint saknas (oduglig prenumeration)', () => {
    const sub = fakeSubscription({ keys: { p256dh: 'x', auth: 'y' } });
    expect(() => serializePushSubscription(sub)).toThrow(/endpoint/i);
  });

  it('kastar fail-loud när p256dh-nyckeln saknas', () => {
    const sub = fakeSubscription({ endpoint: 'https://e', keys: { auth: 'y' } });
    expect(() => serializePushSubscription(sub)).toThrow();
  });

  it('kastar fail-loud när auth-nyckeln saknas', () => {
    const sub = fakeSubscription({ endpoint: 'https://e', keys: { p256dh: 'x' } });
    expect(() => serializePushSubscription(sub)).toThrow();
  });

  it('kastar fail-loud när keys-objektet helt saknas', () => {
    const sub = fakeSubscription({ endpoint: 'https://e' });
    expect(() => serializePushSubscription(sub)).toThrow();
  });
});

describe('buildTestNotificationPayload', () => {
  it('bygger en payload med title, body och url till appens rot (klick fokuserar appen)', () => {
    const payload = buildTestNotificationPayload();
    expect(payload.title).toBeTruthy();
    expect(payload.body).toBeTruthy();
    expect(payload.url).toBe('/');
  });

  it('använder inga em-dash i den svenska copyn (voice-regel)', () => {
    const payload = buildTestNotificationPayload();
    expect(payload.title).not.toContain('—');
    expect(payload.body).not.toContain('—');
  });
});
