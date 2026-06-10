// Online/offline-status: läser navigator.onLine och lyssnar på online/offline-
// event:en, så användaren ser sitt läge.
//
// ÄRLIGHET om vad detta ÄR och INTE är (T13): appen är fixtures-driven idag (all
// data ligger i bundlen + precachas av service worker:n), så den FUNGERAR offline
// utan server. "Synkar vid återuppkoppling" är därför trivialt idag, det finns
// ingen server-data att synka förrän T14 (Supabase) kopplas in. Denna indikator
// visar bara nät-LÄGET, den lovar ingen synk-mekanik som inte finns än. När T14
// inför live-data hängs den faktiska om-hämtningen på samma online-seam.

import { useEffect, useState } from 'react';

/**
 * Läs aktuellt nät-läge säkert. navigator.onLine är en best-effort-signal (true =
 * webbläsaren TROR att den har nät), men en frånvarande/oläsbar navigator ska inte
 * krascha appen, då antar vi online (det neutrala, icke-larmande läget).
 */
function readOnline(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
    return true;
  }
  return navigator.onLine;
}

/**
 * @returns true om webbläsaren rapporterar nät-anslutning, annars false.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() => readOnline());

  useEffect(() => {
    // Synka en gång vid mount (läget kan ha hunnit ändras mellan lazy-init och
    // effekten), sen följ event:en.
    setOnline(readOnline());
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
