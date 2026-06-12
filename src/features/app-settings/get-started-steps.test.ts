import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GET_STARTED_PATHS,
  IOS_SAFARI_REQUIREMENT,
  WEB_MODE_FACTS,
  getPathFor,
  resolveDefaultPlatform,
  resolveGetStartedState,
  type GetStartedPlatform,
} from './get-started-steps';
import { ANDROID_PLAY_PROTECT_NOTE } from './install-prompt';

// Mocka standalone-läget (display-mode) via matchMedia, och plattformen via
// navigator.userAgent, exakt samma grepp som use-install-prompt-testerna (T39)
// och install-prompt-detektorerna. resolveGetStartedState läser ETT riktigt Window,
// så vi mockar window/navigator i stället för att skicka in en stub (testar samma
// väg som produktionen).

/** Tvinga (display-mode: standalone) att matcha (eller inte) i matchMedia. */
function mockStandalone(isStandalone: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    return {
      matches: isStandalone && query === '(display-mode: standalone)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
  });
}

/** Spoofa navigator.userAgent (iOS/Android/desktop). */
function mockUserAgent(ua: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
}

const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Safari/604';
const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537 Chrome/120 Mobile Safari/537';
const DESKTOP_CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537 Chrome/120';

describe('resolveDefaultPlatform, ren plattformsgren (varje kombination)', () => {
  it('iOS -> ios (även om android-flaggan vore satt, en enhet är inte båda)', () => {
    expect(resolveDefaultPlatform({ isStandalone: false, isIos: true, isAndroid: false })).toBe(
      'ios'
    );
  });

  it('Android -> android', () => {
    expect(resolveDefaultPlatform({ isStandalone: false, isIos: false, isAndroid: true })).toBe(
      'android'
    );
  });

  it('varken iOS eller Android -> desktop (ärlig fallback, adressfälts-vägen)', () => {
    expect(resolveDefaultPlatform({ isStandalone: false, isIos: false, isAndroid: false })).toBe(
      'desktop'
    );
  });

  it('iOS prioriteras före Android när BÅDA råkar matcha (medveten ordning)', () => {
    expect(resolveDefaultPlatform({ isStandalone: false, isIos: true, isAndroid: true })).toBe(
      'ios'
    );
  });
});

describe('resolveGetStartedState, härlett ur ett riktigt Window (mockad UA/standalone)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('iPhone Safari -> defaultPlatform ios, inte standalone', () => {
    mockStandalone(false);
    mockUserAgent(IPHONE_SAFARI_UA);
    const state = resolveGetStartedState(window);
    expect(state.isStandalone).toBe(false);
    expect(state.defaultPlatform).toBe('ios');
  });

  it('Android Chrome -> defaultPlatform android', () => {
    mockStandalone(false);
    mockUserAgent(ANDROID_CHROME_UA);
    expect(resolveGetStartedState(window).defaultPlatform).toBe('android');
  });

  it('desktop Chrome -> defaultPlatform desktop', () => {
    mockStandalone(false);
    mockUserAgent(DESKTOP_CHROME_UA);
    expect(resolveGetStartedState(window).defaultPlatform).toBe('desktop');
  });

  it('standalone-läge upptäcks (display-mode: standalone) oavsett plattform', () => {
    mockStandalone(true);
    mockUserAgent(ANDROID_CHROME_UA);
    expect(resolveGetStartedState(window).isStandalone).toBe(true);
  });
});

describe('GET_STARTED_PATHS, dataintegritet (steg + noter källhänvisade)', () => {
  it('har exakt de tre vägarna (ios, android, desktop)', () => {
    const platforms = GET_STARTED_PATHS.map((p) => p.platform);
    expect(platforms).toEqual(['ios', 'android', 'desktop']);
  });

  it('varje väg har minst ett numrerat steg med icke-tom text', () => {
    for (const path of GET_STARTED_PATHS) {
      expect(path.steps.length).toBeGreaterThan(0);
      for (const step of path.steps) {
        expect(step.text.trim().length).toBeGreaterThan(0);
        expect(step.id.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('steg-id:n är unika över alla vägar (stabila React-keys/test-krokar)', () => {
    const ids = GET_STARTED_PATHS.flatMap((p) => p.steps.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Android-vägens not ÅTERANVÄNDER install-bannerns Play Skydd-text (en sanning)', () => {
    expect(getPathFor('android')?.note).toBe(ANDROID_PLAY_PROTECT_NOTE);
  });

  it('iOS-vägens not rekommenderar Safari UTAN att påstå exklusivitet (review-F1)', () => {
    expect(getPathFor('ios')?.note).toBe(IOS_SAFARI_REQUIREMENT);
    // Safari ska rekommenderas (enklaste vägen) men texten får inte längre påstå att
    // andra webbläsare inte funkar (sedan iOS 16.4 funkar Dela-menyn även i Chrome).
    expect(IOS_SAFARI_REQUIREMENT).toMatch(/Safari/);
    expect(IOS_SAFARI_REQUIREMENT).not.toMatch(/fungerar bara|inte i Chrome/);
  });

  it('desktop-vägen har ingen extra not (ingen plattforms-varning behövs där)', () => {
    expect(getPathFor('desktop')?.note).toBeNull();
  });

  it('getPathFor är total över unionen (varje plattform finns i datan)', () => {
    const platforms: GetStartedPlatform[] = ['ios', 'android', 'desktop'];
    for (const platform of platforms) {
      expect(getPathFor(platform)).toBeDefined();
    }
  });
});

describe('WEB_MODE_FACTS, ärlig webb-läges-info', () => {
  it('har en intro, minst en varnings-punkt och en rekommendation', () => {
    expect(WEB_MODE_FACTS.intro.trim().length).toBeGreaterThan(0);
    expect(WEB_MODE_FACTS.cautions.length).toBeGreaterThan(0);
    expect(WEB_MODE_FACTS.recommendation.trim().length).toBeGreaterThan(0);
  });

  it('nämner de tre ärliga riskerna (privat läge, rensa data, iOS-självrensning)', () => {
    const all = WEB_MODE_FACTS.cautions.join(' ').toLowerCase();
    expect(all).toContain('privat läge');
    expect(all).toContain('rensa');
    // iOS-webbens ~1-veckas-självrensning ska nämnas (Daniels feedback-poäng).
    expect(all).toMatch(/vecka|iphone/);
  });
});
