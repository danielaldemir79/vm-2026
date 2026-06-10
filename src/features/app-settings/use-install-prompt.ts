// Hook som kopplar den rena install-logiken (install-prompt.ts) till de faktiska
// webbläsar-event:en. Den äger sido-effekterna (event-lyssnare, prompt-anrop,
// persistens av avfärdande); beslutet OM vad som ska visas görs av resolveInstallMode.

import { useCallback, useEffect, useState } from 'react';
import { readStoredFlag, writeStoredFlag } from '../../lib/safe-storage';
import { INSTALL_DISMISSED_KEY } from './storage-keys';
import {
  detectIos,
  detectStandalone,
  resolveInstallMode,
  type InstallUiMode,
} from './install-prompt';

/**
 * Det icke-standardiserade beforeinstallprompt-event:et (saknas i lib.dom.d.ts).
 * Vi typar bara de fält vi använder. Källa: MDN "BeforeInstallPromptEvent".
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallPromptApi {
  /** Vad install-ytan ska visa just nu (hidden/prompt/ios-instructions). */
  mode: InstallUiMode;
  /**
   * Visa webbläsarens native install-prompt (bara meningsfullt i läge 'prompt').
   * Efter ett val nollas event:et (det kan bara användas en gång).
   */
  promptInstall: () => void;
  /** Avfärda bannern permanent (persistas, visas inte igen). */
  dismiss: () => void;
}

export function useInstallPrompt(): InstallPromptApi {
  // Fångat event (eller null). Hålls i state så en omrendering sker när det dyker
  // upp/försvinner. beforeinstallprompt kan fyras NÄR SOM HELST efter mount.
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  // Standalone/iOS är stabila per session, läs en gång (lazy init).
  const [isStandalone, setIsStandalone] = useState(() => detectStandalone(window));
  const [dismissed, setDismissed] = useState(() => readStoredFlag(INSTALL_DISMISSED_KEY));
  const isIos = detectIos(window.navigator);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Hindra webbläsarens default-mini-infobar; vi visar en EGEN diskret yta.
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    // När appen installeras (eller redan är det) ska bannern försvinna direkt.
    const onAppInstalled = () => {
      setPromptEvent(null);
      setIsStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(() => {
    if (promptEvent === null) {
      return;
    }
    // Event:et kan bara användas en gång; nolla det direkt så knappen inte kan
    // dubbel-trigga. Vi väntar inte in userChoice (appinstalled-event:et städar
    // upp om installationen lyckas).
    void promptEvent.prompt();
    setPromptEvent(null);
  }, [promptEvent]);

  const dismiss = useCallback(() => {
    writeStoredFlag(INSTALL_DISMISSED_KEY, true);
    setDismissed(true);
  }, []);

  const mode = resolveInstallMode({
    isStandalone,
    isIos,
    hasPromptEvent: promptEvent !== null,
    dismissed,
  });

  return { mode, promptInstall, dismiss };
}
