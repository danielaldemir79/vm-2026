// Hook som kopplar den rena install-logiken (install-prompt.ts) till de faktiska
// webbläsar-event:en. Den äger sido-effekterna (event-lyssnare, prompt-anrop,
// persistens av avfärdande); beslutet OM vad som ska visas görs av resolveInstallMode.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { readStoredFlag, writeStoredFlag } from '../../lib/safe-storage';
import { INSTALL_DISMISSED_KEY } from './storage-keys';
import {
  detectIos,
  detectStandalone,
  resolveInstallButtonAction,
  resolveInstallMode,
  type InstallButtonAction,
  type InstallUiMode,
} from './install-prompt';
import {
  consumeDeferredPrompt,
  getDeferredPrompt,
  subscribeDeferredPrompt,
} from './install-prompt-capture';

export interface InstallPromptApi {
  /** Vad install-ytan ska visa just nu (hidden/prompt/ios-instructions). */
  mode: InstallUiMode;
  /**
   * Vad den KOMPAKTA install-knappen (T63, #113) ska göra vid klick: native-prompt,
   * öppna guiden på iPhone-fliken, öppna guiden (fallback), eller dölj knappen helt
   * (bara standalone). Härlett ur SAMMA fångade event + plattform som `mode`, så de
   * aldrig kan drifta isär.
   */
  buttonAction: InstallButtonAction;
  /**
   * true om appen körs installerat/standalone. Exponeras separat (utöver `mode`) så den
   * kompakta knappen kan dölja HELA ytan i app-läge, skild från `mode === 'hidden'` som
   * också gäller för avfärdad/ingen-väg (T63, #113: bara standalone döljer knappen).
   */
  isStandalone: boolean;
  /**
   * Visa webbläsarens native install-prompt (bara meningsfullt i läge 'prompt').
   * Efter ett val nollas event:et (det kan bara användas en gång).
   */
  promptInstall: () => void;
  /** Avfärda bannern permanent (persistas, visas inte igen). */
  dismiss: () => void;
}

export function useInstallPrompt(): InstallPromptApi {
  // Det fångade event:et läses ur den TIDIGA capture-modulen (install-prompt-
  // capture.ts), inte ur en egen sen lyssnare. useSyncExternalStore läser värdet
  // SYNKRONT vid mount, så ett event som fångats FÖRE React-mount (vanligt, MDN:
  // "usually happens on page load") syns direkt, och prenumerationen ger en
  // omrendering när ett senare event dyker upp eller nollas. Detta är rotfixen
  // för T39: knappen kan inte längre missa ett tidigt event. getSnapshot
  // returnerar event:et självt (stabil referens medan det inte ändras), så
  // useSyncExternalStore referens-likhet inte loopar.
  const promptEvent = useSyncExternalStore(subscribeDeferredPrompt, getDeferredPrompt);
  // Standalone/iOS är stabila per session, läs en gång (lazy init).
  const [isStandalone, setIsStandalone] = useState(() => detectStandalone(window));
  const [dismissed, setDismissed] = useState(() => readStoredFlag(INSTALL_DISMISSED_KEY));
  const isIos = detectIos(window.navigator);

  // När appen installeras ska bannern försvinna direkt även om standalone-
  // media-frågan inte hunnit slå om. appinstalled nollar event:et i capture-
  // modulen (-> omrendering); här speglar vi även isStandalone så läget blir
  // 'hidden' på en gång.
  useEffect(() => {
    const onAppInstalled = () => setIsStandalone(true);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => window.removeEventListener('appinstalled', onAppInstalled);
  }, []);

  const promptInstall = useCallback(() => {
    // Event:et kan bara användas en gång; capture-modulen nollar det direkt efter
    // prompt() (-> omrendering -> knappen döljs). No-op om inget event finns.
    consumeDeferredPrompt();
  }, []);

  const dismiss = useCallback(() => {
    writeStoredFlag(INSTALL_DISMISSED_KEY, true);
    setDismissed(true);
  }, []);

  const hasPromptEvent = promptEvent !== null;

  const mode = resolveInstallMode({
    isStandalone,
    isIos,
    hasPromptEvent,
    dismissed,
  });

  // Knapp-beslutet läser INTE `dismissed` (den kompakta knappen är ingen avfärdbar
  // banner, den är en alltid-nåbar CTA), bara standalone/iOS/event, se
  // resolveInstallButtonAction.
  const buttonAction = resolveInstallButtonAction({
    isStandalone,
    isIos,
    hasPromptEvent,
  });

  return { mode, buttonAction, isStandalone, promptInstall, dismiss };
}
