import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInstallPrompt } from './use-install-prompt';
import { INSTALL_DISMISSED_KEY } from './storage-keys';
import {
  registerInstallPromptCapture,
  resetInstallPromptCaptureForTest,
} from './install-prompt-capture';

/**
 * Bygg och fyra ett fejk-beforeinstallprompt-event. Returnerar event:et så
 * testet kan inspektera preventDefault/prompt-anropen.
 */
function fireBeforeInstallPrompt() {
  const event = new Event('beforeinstallprompt') as Event & {
    preventDefault: ReturnType<typeof vi.fn>;
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.preventDefault = vi.fn();
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe('useInstallPrompt, beforeinstallprompt-flöde', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Den TIDIGA capture-lyssnaren registreras i produktionen från main.tsx före
    // mount; i test gör vi det i beforeEach så event:et fångas av samma väg.
    resetInstallPromptCaptureForTest();
    registerInstallPromptCapture();
    // jsdom: en vanlig (icke-iOS, icke-standalone) webbläsare som standard.
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux) Chrome/120');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    resetInstallPromptCaptureForTest();
  });

  it('är dold tills ett beforeinstallprompt-event fångats', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.mode).toBe('hidden');
  });

  it('går till PROMPT-läge när event:et fångas, och hindrar webbläsarens default', () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = fireBeforeInstallPrompt();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(result.current.mode).toBe('prompt');
  });

  it('surfar ett event som fångades FÖRE mount (rotorsaken till T39, regressionsvakt)', () => {
    // Detta är exakt buggen: webbläsaren fyrar beforeinstallprompt "usually on
    // page load" (MDN), ofta INNAN React-hooken monterats. Den tidiga capture-
    // lyssnaren (registrerad i beforeEach, som main.tsx gör före mount) ska ha
    // fångat det, och hooken ska läsa det redan vid mount, inte tappa det.
    const event = fireBeforeInstallPrompt(); // fyras INNAN renderHook
    const { result } = renderHook(() => useInstallPrompt());
    expect(event.preventDefault).toHaveBeenCalled();
    expect(result.current.mode).toBe('prompt');
    // Och klick på den ska kunna trigga prompt() på det tidigt-fångade event:et.
    act(() => result.current.promptInstall());
    expect(event.prompt).toHaveBeenCalledTimes(1);
  });

  it('promptInstall() anropar event.prompt() och nollar läget (engångs-event)', () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = fireBeforeInstallPrompt();
    act(() => result.current.promptInstall());
    expect(event.prompt).toHaveBeenCalledTimes(1);
    // Event:et kan bara användas en gång -> läget döljs efter prompten.
    expect(result.current.mode).toBe('hidden');
  });

  it('dismiss() persistar avfärdandet och döljer bannern (visas inte igen)', () => {
    const { result } = renderHook(() => useInstallPrompt());
    fireBeforeInstallPrompt();
    expect(result.current.mode).toBe('prompt');
    act(() => result.current.dismiss());
    expect(result.current.mode).toBe('hidden');
    expect(window.localStorage.getItem(INSTALL_DISMISSED_KEY)).toBe('1');
  });

  it('förblir dold vid en ny mount efter avfärdande (persistensen respekteras)', () => {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    const { result } = renderHook(() => useInstallPrompt());
    fireBeforeInstallPrompt();
    // Även om ett event kommer in ska ett tidigare avfärdande hålla bannern dold.
    expect(result.current.mode).toBe('hidden');
  });

  it('döljer bannern när appen installeras (appinstalled-event)', () => {
    const { result } = renderHook(() => useInstallPrompt());
    fireBeforeInstallPrompt();
    expect(result.current.mode).toBe('prompt');
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(result.current.mode).toBe('hidden');
  });

  it('visar iOS-instruktion på iOS Safari (inget beforeinstallprompt finns där)', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari'
    );
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.mode).toBe('ios-instructions');
  });

  // T63 (#113): hooken exponerar nu också den kompakta knappens beslut (buttonAction)
  // + isStandalone, härlett ur SAMMA event/plattform. Direkta kontrakt-tester här
  // (InstallButton.test.tsx täcker end-to-end), särskilt den subtila regeln att
  // `dismissed` INTE påverkar buttonAction (knappen är ingen avfärdbar banner).
  it('buttonAction = native-prompt när ett event finns (T63)', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.buttonAction).toBe('guide'); // ingen prompt än
    fireBeforeInstallPrompt();
    expect(result.current.buttonAction).toBe('native-prompt');
  });

  it('buttonAction = guide-ios på iOS (T63)', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari'
    );
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.buttonAction).toBe('guide-ios');
  });

  it('buttonAction PÅVERKAS INTE av dismiss (knappen är ingen avfärdbar banner, T63)', () => {
    // Avfärdande döljer den GAMLA bannern (mode -> hidden) men den kompakta knappen ska
    // fortsatt fungera: en avvisad native-prompt faller till guiden, knappen försvinner inte.
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.mode).toBe('hidden'); // gamla banner-läget döljs
    expect(result.current.buttonAction).toBe('guide'); // men knappen lever (guide-fallback)
  });

  it('isStandalone + buttonAction=hidden i app-läge (standalone, T63)', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('standalone'),
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList
    );
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.isStandalone).toBe(true);
    expect(result.current.buttonAction).toBe('hidden');
  });
});
