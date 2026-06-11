// Persistens av DET SENAST VALDA rummet (T38, #67).
//
// VARFÖR: utan detta tappar appen vilket rum man står i vid en sidladdning, så
// efter en uppdatering står man i INGET rum och de delade inmatningarna syns inte
// (de finns kvar i molnet, men man är inte längre i rummet). Vi sparar därför det
// aktiva rummets id i localStorage när det väljs och återställer det vid app-start.
//
// EN sanning för nyckeln (samma `vm2026-`-prefix som THEME_STORAGE_KEY och
// app-settings storage-keys), så läs- och skriv-sidan aldrig kan stava den olika.
// Robust mot kastande/blockerad storage via safe-storage (T13): privat läge eller
// sandbox ger ingen krasch, persistensen hoppas bara över.

import { readStoredString, writeStoredString, getLocalStorage } from '../../lib/safe-storage';

/**
 * Det aktiva rummets id, persistat över sidladdning. Multi-rum: bara ETT id lagras
 * (det SENAST valda), så det är det rummet som återställs vid nästa start.
 */
export const ACTIVE_ROOM_KEY = 'vm2026-active-room';

/** Läs det sparade aktiva rum-id:t (null = inget sparat / storage onåbar). */
export function readActiveRoomId(): string | null {
  return readStoredString(ACTIVE_ROOM_KEY);
}

/** Spara id:t för det rum man valde, så det återställs vid nästa app-start. */
export function writeActiveRoomId(roomId: string): void {
  // Skriv-fel sväljs inte tyst av safe-storage (det loggas där); persistensen
  // hoppas bara över, appen fortsätter fungera utan den.
  writeStoredString(ACTIVE_ROOM_KEY, roomId);
}

/**
 * Rensa det sparade id:t. Anropas när man lämnar det aktiva rummet ELLER när ett
 * sparat id visar sig vara inaktuellt vid återställning (rummet finns inte / man
 * är inte längre medlem), så vi inte envist försöker återställa ett dött id.
 */
export function clearActiveRoomId(): void {
  const storage = getLocalStorage();
  if (storage === null) {
    return;
  }
  try {
    storage.removeItem(ACTIVE_ROOM_KEY);
  } catch (error) {
    // Fail loud men inte fatalt (samma kontrakt som safe-storage): logga, krascha
    // aldrig appen för att en städning av en localStorage-rad misslyckades.
    console.warn(`Kunde inte rensa "${ACTIVE_ROOM_KEY}" ur localStorage:`, error);
  }
}
