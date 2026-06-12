import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallButton } from './InstallButton';
import {
  registerInstallPromptCapture,
  resetInstallPromptCaptureForTest,
} from './install-prompt-capture';

// Den kompakta install-knappen (T63, #113). Tre klick-grenar + standalone-negativ-kontroll.
// Plattform mockas via userAgent; standalone via matchMedia (samma grepp som
// InstallBanner.test.tsx + GetStartedDialog.test.tsx). Ett event mockas genom att
// dispatcha ett fejk-beforeinstallprompt EFTER mount (capture-modulen fångar det och
// notifierar hooken via useSyncExternalStore).

const DESKTOP_CHROME_UA = 'Mozilla/5.0 (X11; Linux) Chrome/120';
const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile';
const IPHONE_SAFARI_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604';

/** Fyra ett fejk-beforeinstallprompt-event (Chrome/Android-vägen) och returnera det. */
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

/** Mocka standalone (display-mode: standalone) via matchMedia. */
function mockStandalone() {
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
}

describe('InstallButton, den kompakta install-knappen (T63, #113)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetInstallPromptCaptureForTest();
    registerInstallPromptCapture();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(DESKTOP_CHROME_UA);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    resetInstallPromptCaptureForTest();
  });

  it('GREN (a): klick triggar webbläsarens NATIVE-prompt direkt när ett event finns', () => {
    // Android-UA + ett fångat event => native-vägen. Klick ska anropa event.prompt()
    // (T39:s mekanik), INTE öppna guide-dialogen.
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID_CHROME_UA);
    render(<InstallButton />);
    const event = fireBeforeInstallPrompt();
    const button = screen.getByRole('button', { name: /Installera som app/i });
    expect(button).toHaveAttribute('data-install-button', 'native');
    fireEvent.click(button);
    expect(event.prompt).toHaveBeenCalled();
    // Native-grenen öppnar ingen guide-dialog.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('GREN (b): på iOS öppnar klick kom-igång-guiden PÅ iPhone-fliken (ingen native-prompt)', async () => {
    // iOS saknar beforeinstallprompt, så knappen ska öppna guiden. Den ska dessutom
    // starta på iPhone-fliken (initialPlatform='ios'), så en iPhone-vän ser sina steg
    // direkt utan att leta.
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI_UA);
    render(<InstallButton />);
    const button = screen.getByRole('button', { name: /Installera som app/i });
    fireEvent.click(button);

    const dialog = await screen.findByRole('dialog', { name: /Använd appen direkt/i });
    // iPhone-fliken är vald (aria-selected=true), så stegen som visas är iOS-stegen.
    const iphoneTab = within(dialog).getByRole('tab', { name: /iPhone/i });
    expect(iphoneTab).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('[data-get-started-steps="ios"]')).toBeInTheDocument();
  });

  it('GREN (c): icke-iOS UTAN event öppnar guiden (ärlig fallback, ALDRIG en död knapp)', async () => {
    // Desktop-Chrome utan event (kriterier ej uppfyllda / prompt avvisad). Knappen får
    // inte vara död, den ska öppna guiden i stället för att göra ingenting.
    render(<InstallButton />);
    const button = screen.getByRole('button', { name: /Installera som app/i });
    // Ingen native-markör (det är guide-grenen, inte native).
    expect(button).not.toHaveAttribute('data-install-button', 'native');
    fireEvent.click(button);
    expect(await screen.findByRole('dialog', { name: /Använd appen direkt/i })).toBeInTheDocument();
  });

  it('STANDALONE: renderar INGENTING i app-läge (Daniels skarpa krav, negativ kontroll)', () => {
    // I installerat läge ska HELA install-ytan döljas, även om ett event skulle fyra.
    mockStandalone();
    const { container } = render(<InstallButton />);
    fireBeforeInstallPrompt();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: /Installera som app/i })).not.toBeInTheDocument();
  });
});
