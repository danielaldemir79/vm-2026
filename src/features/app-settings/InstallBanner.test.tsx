import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallBanner } from './InstallBanner';
import { INSTALL_DISMISSED_KEY } from './storage-keys';
import {
  registerInstallPromptCapture,
  resetInstallPromptCaptureForTest,
} from './install-prompt-capture';

/** Fyra ett fejk-beforeinstallprompt-event (Chrome/Android-vägen). */
function fireBeforeInstallPrompt() {
  const event = new Event('beforeinstallprompt') as Event & {
    preventDefault: () => void;
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

describe('InstallBanner', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetInstallPromptCaptureForTest();
    registerInstallPromptCapture();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux) Chrome/120');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    resetInstallPromptCaptureForTest();
  });

  it('renderar inget när det inte finns någon install-väg (dold)', () => {
    const { container } = render(<InstallBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('visar en install-KNAPP i Chrome/Android när ett event fångats', () => {
    render(<InstallBanner />);
    fireBeforeInstallPrompt();
    expect(screen.getByRole('button', { name: 'Installera' })).toBeInTheDocument();
  });

  it('visar den ärliga Play Protect-noten i Android-prompt-läget (T30, C4)', () => {
    // Play Protect-noten är Android-specifik, så testet måste köra Android-UA
    // (annars verifierar det inte gaten, default-UA i beforeEach är desktop).
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/120 Mobile'
    );
    render(<InstallBanner />);
    fireBeforeInstallPrompt();
    const note = document.querySelector('[data-install-play-protect-note]');
    expect(note).toBeInTheDocument();
    expect(note).toHaveTextContent(/Play Protect/);
    expect(note).toHaveTextContent(/installera ändå/i);
  });

  it('visar INTE Play Protect-noten på desktop-Chrome-prompt (Android-specifik, C4)', () => {
    // beforeEach sätter en desktop-UA (X11; Linux). Desktop-Chrome fyrar samma
    // beforeinstallprompt-event som Android, men noten ska inte visas där, den
    // gäller bara Androids WebAPK-mintning.
    render(<InstallBanner />);
    fireBeforeInstallPrompt();
    // Install-knappen finns (prompt-läget aktivt), men noten är gate:ad bort.
    expect(screen.getByRole('button', { name: 'Installera' })).toBeInTheDocument();
    expect(document.querySelector('[data-install-play-protect-note]')).not.toBeInTheDocument();
  });

  it('klick på Installera triggar webbläsarens prompt', () => {
    render(<InstallBanner />);
    const event = fireBeforeInstallPrompt();
    fireEvent.click(screen.getByRole('button', { name: 'Installera' }));
    expect(event.prompt).toHaveBeenCalled();
  });

  it('"Inte nu" avfärdar permanent (bannern försvinner, flaggan persistas)', () => {
    render(<InstallBanner />);
    fireBeforeInstallPrompt();
    fireEvent.click(screen.getByRole('button', { name: /Inte nu/ }));
    expect(screen.queryByRole('button', { name: 'Installera' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(INSTALL_DISMISSED_KEY)).toBe('1');
  });

  it('döljer HELA install-ytan i app-läge (standalone), inget event, ingen Play Protect-not (T39)', () => {
    // I installerat läge (display-mode: standalone) ska INGEN install-affordans
    // visas, varken Chrome-knappen, iOS-instruktionen eller Play Protect-noten.
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
    const { container } = render(<InstallBanner />);
    // Även om ett event skulle fyra ska standalone vinna och allt förbli dolt.
    fireBeforeInstallPrompt();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: 'Installera' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-install-play-protect-note]')).not.toBeInTheDocument();
  });

  it('visar iOS-INSTRUKTIONEN (Dela -> Lägg till på hemskärmen) på iOS Safari, ingen install-knapp', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari'
    );
    render(<InstallBanner />);
    expect(screen.getByText(/Lägg till på hemskärmen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Installera' })).not.toBeInTheDocument();
    // Play Protect-noten gäller bara Android-mintning, inte iOS-vägen.
    expect(document.querySelector('[data-install-play-protect-note]')).not.toBeInTheDocument();
  });
});
