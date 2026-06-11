import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeDeferredPrompt,
  getDeferredPrompt,
  registerInstallPromptCapture,
  resetInstallPromptCaptureForTest,
  subscribeDeferredPrompt,
  type BeforeInstallPromptEvent,
} from './install-prompt-capture';

/** Fyra ett fejk-beforeinstallprompt-event på window. Returnerar event:et. */
function fireBeforeInstallPrompt() {
  const event = new Event('beforeinstallprompt') as Event & {
    preventDefault: ReturnType<typeof vi.fn>;
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.preventDefault = vi.fn();
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(event);
  return event;
}

describe('install-prompt-capture, tidig fångst av beforeinstallprompt', () => {
  beforeEach(() => {
    resetInstallPromptCaptureForTest();
  });
  afterEach(() => {
    resetInstallPromptCaptureForTest();
  });

  it('fångar event:et och hindrar webbläsarens default (preventDefault)', () => {
    registerInstallPromptCapture();
    const event = fireBeforeInstallPrompt();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(getDeferredPrompt()).toBe(event);
  });

  it('utan registrering fångas inget (lyssnaren MÅSTE registreras, t.ex. i main.tsx)', () => {
    // Bevisar att fångsten kräver registrering, dvs varför main.tsx-anropet finns.
    fireBeforeInstallPrompt();
    expect(getDeferredPrompt()).toBeNull();
  });

  it('är idempotent: dubbel registrering lägger inte dubbla lyssnare', () => {
    registerInstallPromptCapture();
    registerInstallPromptCapture();
    const event = fireBeforeInstallPrompt();
    // En enda lyssnare -> preventDefault anropas exakt en gång, inte två.
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('notifierar prenumeranter när ett event fångas och när det förbrukas', () => {
    registerInstallPromptCapture();
    const listener = vi.fn();
    const unsubscribe = subscribeDeferredPrompt(listener);

    fireBeforeInstallPrompt();
    expect(listener).toHaveBeenCalledTimes(1);

    consumeDeferredPrompt();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    fireBeforeInstallPrompt();
    // Efter avregistrering ska prenumeranten inte längre notifieras.
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('consumeDeferredPrompt anropar prompt() EN gång och nollar event:et (engångs)', () => {
    registerInstallPromptCapture();
    const event = fireBeforeInstallPrompt();

    consumeDeferredPrompt();
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(getDeferredPrompt()).toBeNull();

    // Ett andra anrop är en no-op (event:et är förbrukat), prompt() körs inte igen.
    consumeDeferredPrompt();
    expect(event.prompt).toHaveBeenCalledTimes(1);
  });

  it('consumeDeferredPrompt är en no-op utan fångat event (inget kastas)', () => {
    registerInstallPromptCapture();
    expect(() => consumeDeferredPrompt()).not.toThrow();
    expect(getDeferredPrompt()).toBeNull();
  });

  it('appinstalled nollar det fångade event:et (installerat -> inget att visa)', () => {
    registerInstallPromptCapture();
    fireBeforeInstallPrompt();
    expect(getDeferredPrompt()).not.toBeNull();

    window.dispatchEvent(new Event('appinstalled'));
    expect(getDeferredPrompt()).toBeNull();
  });

  it('det fångade event:et bär den typade prompt-ytan (prompt + userChoice)', async () => {
    registerInstallPromptCapture();
    fireBeforeInstallPrompt();
    const captured = getDeferredPrompt() as BeforeInstallPromptEvent;
    expect(typeof captured.prompt).toBe('function');
    await expect(captured.userChoice).resolves.toMatchObject({ outcome: 'accepted' });
  });
});
