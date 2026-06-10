import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInstallPrompt } from './use-install-prompt';
import { INSTALL_DISMISSED_KEY } from './storage-keys';

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
    // jsdom: en vanlig (icke-iOS, icke-standalone) webbläsare som standard.
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux) Chrome/120');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
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
});
