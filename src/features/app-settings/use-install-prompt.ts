// Hook som kopplar den rena install-logiken (install-prompt.ts) till de faktiska
// webbläsar-event:en. Den äger sido-effekterna (event-lyssnare, prompt-anrop); beslutet
// OM vad den kompakta knappen ska göra görs av resolveInstallButtonAction.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { detectIos, detectStandalone, resolveInstallButtonAction } from './install-prompt';
import type { InstallButtonAction } from './install-prompt';
import {
  consumeDeferredPrompt,
  getDeferredPrompt,
  subscribeDeferredPrompt,
} from './install-prompt-capture';

export interface InstallPromptApi {
  /**
   * Vad den KOMPAKTA install-knappen (T63, #113) ska göra vid klick: native-prompt,
   * öppna guiden på iPhone-fliken, öppna guiden (fallback), eller dölj knappen helt
   * (bara standalone). Härlett ur det fångade event:et + plattform.
   */
  buttonAction: InstallButtonAction;
  /**
   * Visa webbläsarens native install-prompt (bara meningsfullt i läge 'native-prompt').
   * Efter ett val nollas event:et (det kan bara användas en gång).
   */
  promptInstall: () => void;
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
  const isIos = detectIos(window.navigator);

  // När appen installeras ska knappen försvinna direkt även om standalone-media-
  // frågan inte hunnit slå om. appinstalled nollar event:et i capture-modulen
  // (-> omrendering); här speglar vi även isStandalone så buttonAction blir 'hidden'
  // på en gång.
  useEffect(() => {
    const onAppInstalled = () => setIsStandalone(true);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => window.removeEventListener('appinstalled', onAppInstalled);
  }, []);

  const promptInstall = useCallback(() => {
    // Event:et kan bara användas en gång; capture-modulen nollar det direkt efter
    // prompt() (-> omrendering -> knappen faller till guide-läget). No-op om inget event.
    consumeDeferredPrompt();
  }, []);

  const hasPromptEvent = promptEvent !== null;

  const buttonAction = resolveInstallButtonAction({
    isStandalone,
    isIos,
    hasPromptEvent,
  });

  return { buttonAction, promptInstall };
}
