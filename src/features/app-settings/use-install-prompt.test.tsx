import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInstallPrompt } from './use-install-prompt';
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

  it('faller till GUIDE tills ett beforeinstallprompt-event fångats (aldrig en död knapp)', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.buttonAction).toBe('guide');
  });

  it('går till NATIVE-PROMPT när event:et fångas, och hindrar webbläsarens default', () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = fireBeforeInstallPrompt();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(result.current.buttonAction).toBe('native-prompt');
  });

  it('surfar ett event som fångades FÖRE mount (rotorsaken till T39, regressionsvakt)', () => {
    // Detta är exakt buggen: webbläsaren fyrar beforeinstallprompt "usually on
    // page load" (MDN), ofta INNAN React-hooken monterats. Den tidiga capture-
    // lyssnaren (registrerad i beforeEach, som main.tsx gör före mount) ska ha
    // fångat det, och hooken ska läsa det redan vid mount, inte tappa det.
    const event = fireBeforeInstallPrompt(); // fyras INNAN renderHook
    const { result } = renderHook(() => useInstallPrompt());
    expect(event.preventDefault).toHaveBeenCalled();
    expect(result.current.buttonAction).toBe('native-prompt');
    // Och klick på den ska kunna trigga prompt() på det tidigt-fångade event:et.
    act(() => result.current.promptInstall());
    expect(event.prompt).toHaveBeenCalledTimes(1);
  });

  it('promptInstall() anropar event.prompt() och nollar event:et (engångs-event -> guide)', () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = fireBeforeInstallPrompt();
    act(() => result.current.promptInstall());
    expect(event.prompt).toHaveBeenCalledTimes(1);
    // Event:et kan bara användas en gång -> knappen faller till guide-läget efteråt.
    expect(result.current.buttonAction).toBe('guide');
  });

  it('faller till GUIDE när appen installeras (appinstalled-event nollar event:et)', () => {
    const { result } = renderHook(() => useInstallPrompt());
    fireBeforeInstallPrompt();
    expect(result.current.buttonAction).toBe('native-prompt');
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    // appinstalled speglar isStandalone -> hela ytan döljs (Daniels skarpa krav, #113).
    expect(result.current.buttonAction).toBe('hidden');
  });

  it('GUIDE-IOS på iOS Safari (inget beforeinstallprompt finns där)', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari'
    );
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.buttonAction).toBe('guide-ios');
  });

  it('HIDDEN i app-läge (standalone): inget surr när appen redan är installerad, #113', () => {
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
    expect(result.current.buttonAction).toBe('hidden');
  });
});
