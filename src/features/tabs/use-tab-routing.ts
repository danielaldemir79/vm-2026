// React-hooken som binder den aktiva fliken till URL:en (T83, #175).
//
// ANSVAR: håll den aktiva fliken i synk med location.hash i BÅDA riktningar:
//   - URL -> state: lyssna på `hashchange` (och `popstate` för bakåt-knappen) och
//     härled aktiv flik ur hashen (tabFromHash). Så en delbar länk + bakåt-knapp +
//     djuplänk vid kall-laddning alla landar rätt flik.
//   - state -> URL: när användaren byter flik via flik-raden skriver vi en ny hash
//     med history.pushState, så bakåt-knappen tar dig till föregående flik (en ny
//     history-post per flik-byte), och den synliga URL:en är delbar.
//
// VARFÖR pushState (inte location.hash =): att sätta location.hash skapar OCKSÅ en
// history-post OCH triggar `hashchange` , men pushState ger oss full kontroll (en
// post, ingen dubbel-event-loop) och är samma verktyg en router skulle använt.
// Vi normaliserar dessutom en tom/ogiltig hash vid kall-laddning till den kanoniska
// `#/idag` med replaceState (ingen extra history-post), så adressfältet alltid visar
// var man är utan att smutsa ner historiken.

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_TAB, type TabId } from './tab-config';
import { hashForTab, tabFromHash } from './tab-routing';

export interface TabRouting {
  /** Den aktiva fliken (härledd ur URL:en, fail-safe till default). */
  activeTab: TabId;
  /** Byt flik: uppdaterar state OCH skriver en ny history-post (delbar/bakåt-bar URL). */
  selectTab: (id: TabId) => void;
}

/**
 * Driv aktiv flik via URL-hash + history. SSR-/test-säker: läser window bara i
 * effekter och via en lat initial-läsning (jsdom har window, så test fungerar).
 */
export function useTabRouting(): TabRouting {
  // Initial flik = hashen vid kall-laddning (djuplänk fungerar direkt). Lat init så
  // den bara läses en gång; om window saknas (defensivt) faller vi till default.
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_TAB;
    }
    return tabFromHash(window.location.hash);
  });

  // Normalisera en tom/ogiltig hash till den kanoniska formen EN gång vid montering,
  // utan en extra history-post (replaceState), så adressfältet visar var man är.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const canonical = hashForTab(tabFromHash(window.location.hash));
    if (window.location.hash !== canonical) {
      window.history.replaceState(null, '', canonical);
    }
  }, []);

  // URL -> state: bakåt-knapp (popstate) + manuell hash-ändring (hashchange).
  // Båda kan flytta aktiv flik, så vi lyssnar på båda och härleder ur hashen.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const sync = () => setActiveTab(tabFromHash(window.location.hash));
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  // state -> URL: en ny history-post per flik-byte (bakåt-knappen fungerar). Vi
  // skjuter hashen (pushState triggar INTE hashchange, så ingen dubbel-uppdatering)
  // och uppdaterar state direkt (responsiv UI). Idempotent: byte till samma flik
  // skriver ingen ny history-post.
  const selectTab = useCallback((id: TabId) => {
    if (typeof window !== 'undefined') {
      const nextHash = hashForTab(id);
      if (window.location.hash !== nextHash) {
        window.history.pushState(null, '', nextHash);
      }
    }
    setActiveTab(id);
  }, []);

  return { activeTab, selectTab };
}
