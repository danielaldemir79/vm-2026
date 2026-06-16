import { describe, expect, it } from 'vitest';
import {
  isPushSupported,
  readPushOptInContext,
  resolvePushOptInState,
  type PushOptInContext,
} from './push-support';

/** En fullt-stödd, ej-iOS, ej-prenumererad bas. Varje test muterar bara den gren det prövar. */
function baseCtx(overrides: Partial<PushOptInContext> = {}): PushOptInContext {
  return {
    isIos: false,
    isStandalone: false,
    isSupported: true,
    permission: 'default',
    isSubscribed: false,
    ...overrides,
  };
}

describe('resolvePushOptInState', () => {
  it('subscribable: stöds, default-behörighet, ej prenumererad -> visa aktivera-knappen', () => {
    expect(resolvePushOptInState(baseCtx())).toBe('subscribable');
  });

  it('subscribable: behörighet redan beviljad men ingen aktiv subscription -> aktivera ändå', () => {
    // granted men !isSubscribed (t.ex. avregistrerad i webbläsaren) ska visa aktivera, inte på.
    expect(resolvePushOptInState(baseCtx({ permission: 'granted', isSubscribed: false }))).toBe(
      'subscribable'
    );
  });

  it('subscribed: aktiv subscription finns -> visa på-läget (test + stäng av)', () => {
    expect(resolvePushOptInState(baseCtx({ permission: 'granted', isSubscribed: true }))).toBe(
      'subscribed'
    );
  });

  it('denied: behörighet nekad -> visa inställnings-vägen, ingen aktiv knapp', () => {
    expect(resolvePushOptInState(baseCtx({ permission: 'denied' }))).toBe('denied');
  });

  it('unsupported: grund-API saknas -> visa stöds-inte-rad', () => {
    expect(resolvePushOptInState(baseCtx({ isSupported: false }))).toBe('unsupported');
  });

  it('ios-not-installed: iOS i Safari-flik (ej standalone) -> hint, INTE en knapp', () => {
    expect(resolvePushOptInState(baseCtx({ isIos: true, isStandalone: false }))).toBe(
      'ios-not-installed'
    );
  });

  it('iOS-gaten vinner FÖRST: iOS ej-installerad ger hint även om allt annat ser klart ut', () => {
    // Bevisar gren-ORDNINGEN (regeln): web-push kan ALDRIG fungera på iOS i flik, så hinten
    // måste vinna över subscribable/subscribed. Vore ordningen fel skulle vi visa en knapp
    // som inte kan fungera (falsk autonomi). Detta är den lätt-fel-gissade biten.
    const looksReady = baseCtx({
      isIos: true,
      isStandalone: false,
      permission: 'granted',
      isSubscribed: true,
    });
    expect(resolvePushOptInState(looksReady)).toBe('ios-not-installed');
  });

  it('iOS INSTALLERAD (standalone) följer den normala vägen, ingen hint', () => {
    // Negativ kontroll till gaten ovan: en iPhone med appen PÅ hemskärmen ska kunna
    // aktivera notiser som vanligt. Annars hade hinten felaktigt blockerat det enda
    // läge där iOS-push faktiskt fungerar.
    expect(resolvePushOptInState(baseCtx({ isIos: true, isStandalone: true }))).toBe(
      'subscribable'
    );
    expect(
      resolvePushOptInState(
        baseCtx({ isIos: true, isStandalone: true, permission: 'granted', isSubscribed: true })
      )
    ).toBe('subscribed');
  });
});

describe('isPushSupported', () => {
  /** Bygg en Window-stub med valbara API:er närvarande. */
  function stubWin(opts: { sw?: boolean; pushManager?: boolean; notification?: boolean }): Window {
    const navigator: Record<string, unknown> = {};
    if (opts.sw) navigator.serviceWorker = {};
    const win: Record<string, unknown> = { navigator };
    if (opts.pushManager) win.PushManager = function () {};
    if (opts.notification) win.Notification = { permission: 'default' };
    return win as unknown as Window;
  }

  it('true när serviceWorker + PushManager + Notification ALLA finns', () => {
    expect(isPushSupported(stubWin({ sw: true, pushManager: true, notification: true }))).toBe(
      true
    );
  });

  it('false när serviceWorker saknas', () => {
    expect(isPushSupported(stubWin({ sw: false, pushManager: true, notification: true }))).toBe(
      false
    );
  });

  it('false när PushManager saknas', () => {
    expect(isPushSupported(stubWin({ sw: true, pushManager: false, notification: true }))).toBe(
      false
    );
  });

  it('false när Notification saknas (t.ex. iOS < 16.4)', () => {
    expect(isPushSupported(stubWin({ sw: true, pushManager: true, notification: false }))).toBe(
      false
    );
  });
});

describe('readPushOptInContext (läser den faktiska browser-kontexten)', () => {
  /** En fullständig Window-stub: ej-iOS, ej-standalone, push-stödd, valbar permission. */
  function fullWin(permission: NotificationPermission): Window {
    return {
      navigator: {
        serviceWorker: {},
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        maxTouchPoints: 0,
        standalone: undefined,
      },
      PushManager: function () {},
      Notification: { permission },
      matchMedia: () => ({ matches: false }),
      document: { referrer: '' },
    } as unknown as Window;
  }

  it('läser permission ur Notification när stöd finns', () => {
    const ctx = readPushOptInContext(fullWin('granted'), false);
    expect(ctx.isSupported).toBe(true);
    expect(ctx.permission).toBe('granted');
    expect(ctx.isIos).toBe(false);
  });

  it('faller till default-permission (läser inte Notification) när stöd saknas', () => {
    // Utan Notification skulle win.Notification.permission kasta; readPushOptInContext
    // måste gata det och ge 'default', inte krascha. Bevisar den defensiva läsningen.
    const win = {
      navigator: { userAgent: 'x', maxTouchPoints: 0 },
      matchMedia: () => ({ matches: false }),
      document: { referrer: '' },
    } as unknown as Window;
    const ctx = readPushOptInContext(win, false);
    expect(ctx.isSupported).toBe(false);
    expect(ctx.permission).toBe('default');
  });

  it('för-vidare isSubscribed-flaggan oförändrad', () => {
    expect(readPushOptInContext(fullWin('granted'), true).isSubscribed).toBe(true);
    expect(readPushOptInContext(fullWin('granted'), false).isSubscribed).toBe(false);
  });
});
