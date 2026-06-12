import { describe, expect, it } from 'vitest';
import {
  detectIos,
  detectStandalone,
  resolveInstallButtonAction,
  type InstallButtonContext,
} from './install-prompt';

/** Bas-kontext för knapp-beslutet: ej installerad, ej iOS, inget event. */
function btnCtx(overrides: Partial<InstallButtonContext> = {}): InstallButtonContext {
  return {
    isStandalone: false,
    isIos: false,
    hasPromptEvent: false,
    ...overrides,
  };
}

describe('resolveInstallButtonAction, den kompakta knappens tre klick-grenar (T63, #113)', () => {
  it('NATIVE-PROMPT när ett beforeinstallprompt-event finns (ett klick = äkta prompt)', () => {
    expect(resolveInstallButtonAction(btnCtx({ hasPromptEvent: true }))).toBe('native-prompt');
  });

  it('GUIDE-IOS på iOS utan event (Apple saknar install-API, öppna iPhone-fliken)', () => {
    expect(resolveInstallButtonAction(btnCtx({ isIos: true }))).toBe('guide-ios');
  });

  it('GUIDE som fallback på icke-iOS UTAN event (aldrig en död knapp, #113-AC)', () => {
    // Prompten ej tillgänglig (kriterier ej uppfyllda / nyligen avvisad): visa guiden
    // i stället för att göra ingenting.
    expect(resolveInstallButtonAction(btnCtx())).toBe('guide');
  });

  it('HIDDEN bara i standalone (Daniels skarpa krav: inget surr i app-läge)', () => {
    // Standalone vinner över BÅDE event och iOS, knappen ska försvinna helt.
    expect(resolveInstallButtonAction(btnCtx({ isStandalone: true, hasPromptEvent: true }))).toBe(
      'hidden'
    );
    expect(resolveInstallButtonAction(btnCtx({ isStandalone: true, isIos: true }))).toBe('hidden');
  });

  it('prioriterar NATIVE-PROMPT över iOS-guiden (en riktig prompt slår en instruktion)', () => {
    // Teoretiskt kantfall (iOS rapporterar normalt aldrig ett event); prioriteringen
    // är ändå explicit testad så regeln är entydig.
    expect(resolveInstallButtonAction(btnCtx({ isIos: true, hasPromptEvent: true }))).toBe(
      'native-prompt'
    );
  });
});

describe('detectIos, plattforms-sniff', () => {
  function nav(userAgent: string, maxTouchPoints = 0): Navigator {
    return { userAgent, maxTouchPoints } as Navigator;
  }

  it('känner igen iPhone/iPad/iPod', () => {
    expect(detectIos(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'))).toBe(true);
    expect(detectIos(nav('Mozilla/5.0 (iPad; CPU OS 17_0)'))).toBe(true);
  });

  it('känner igen iPadOS 13+ som maskerar sig som macOS (touch-punkter)', () => {
    expect(detectIos(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 5))).toBe(true);
  });

  it('är false för en riktig Mac (macOS UTAN touch)', () => {
    expect(detectIos(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 0))).toBe(false);
  });

  it('är false för Android/Windows-Chrome', () => {
    expect(detectIos(nav('Mozilla/5.0 (Linux; Android 14) Chrome/120'))).toBe(false);
    expect(detectIos(nav('Mozilla/5.0 (Windows NT 10.0) Chrome/120'))).toBe(false);
  });
});

describe('detectStandalone, redan installerad?', () => {
  it('är true när display-mode: standalone matchar', () => {
    const win = {
      matchMedia: (q: string) => ({ matches: q.includes('standalone') }),
      navigator: {} as Navigator,
    } as unknown as Window;
    expect(detectStandalone(win)).toBe(true);
  });

  it('är true via iOS navigator.standalone även utan matchMedia-träff', () => {
    const win = {
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: true } as Navigator & { standalone?: boolean },
    } as unknown as Window;
    expect(detectStandalone(win)).toBe(true);
  });

  it('är true via android-app://-referrer (TWA / Android-app-wrapper, T39)', () => {
    const win = {
      matchMedia: () => ({ matches: false }),
      navigator: {} as Navigator,
      document: { referrer: 'android-app://com.vm2026.twa' } as Document,
    } as unknown as Window;
    expect(detectStandalone(win)).toBe(true);
  });

  it('är false för en vanlig http-referrer (inte en app-wrapper, T39)', () => {
    const win = {
      matchMedia: () => ({ matches: false }),
      navigator: {} as Navigator,
      document: { referrer: 'https://vm-2026.pages.dev/' } as Document,
    } as unknown as Window;
    expect(detectStandalone(win)).toBe(false);
  });

  it('är false i vanligt webbläsar-läge', () => {
    const win = {
      matchMedia: () => ({ matches: false }),
      navigator: {} as Navigator,
    } as unknown as Window;
    expect(detectStandalone(win)).toBe(false);
  });

  it('kraschar inte om matchMedia saknas/kastar (faller till iOS-flaggan)', () => {
    const win = {
      matchMedia: () => {
        throw new Error('ingen matchMedia');
      },
      navigator: { standalone: false } as Navigator & { standalone?: boolean },
    } as unknown as Window;
    expect(detectStandalone(win)).toBe(false);
  });
});
