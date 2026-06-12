// Persistens av PINNAT FAVORITLAG (T23, #23).
//
// VARFÖR localStorage (medvetet val, dokumenterat i docs/decisions.md T23): ett
// favoritlag är en REN PER-ENHETS-PREFERENS (som tema, haptik, ljud, aktivt rum),
// inte delad data. Att lägga den i Supabase skulle kräva en ny tabell + RLS-yta +
// en migration, för noll delnings-värde (ingen annan behöver se mitt favoritlag).
// Vi följer därför safe-storage-mönstret (samma `vm2026-`-prefix som THEME_STORAGE_KEY
// och app-settings storage-keys), robust mot blockerad/privat storage (ingen krasch,
// persistensen hoppas bara över). YAGNI + lägsta yta (PRINCIPLES §0, §3, §7).
//
// EN sanning för nyckeln, så läs- och skriv-sidan aldrig kan stava den olika.
// Lagrar Team.ID (gemen intern nyckel, samma rymd som favoriteTeamId i domänmodellen,
// SPEC §6 "User: pinnat favoritlag (Team.id)"), INTE code: konsumenten matchar mot
// Team.id (match.homeTeamId/awayTeamId, teams[].id), så id är rätt jämförelse-rymd.

import { readStoredString, writeStoredString, getLocalStorage } from '../../lib/safe-storage';

/** Nyckeln för det pinnade favoritlagets id (Team.id). */
export const FAVORITE_TEAM_KEY = 'vm2026-favorite-team';

/** Läs det sparade favoritlagets id (null = inget pinnat / storage onåbar). */
export function readFavoriteTeamId(): string | null {
  return readStoredString(FAVORITE_TEAM_KEY);
}

/** Pinna ett favoritlag (Team.id). Skriv-fel sväljs inte tyst (loggas i safe-storage). */
export function writeFavoriteTeamId(teamId: string): void {
  writeStoredString(FAVORITE_TEAM_KEY, teamId);
}

/**
 * Avpinna favoritlaget (rensa nyckeln). Fail loud men inte fatalt (samma kontrakt
 * som safe-storage + active-room-storage): logga, krascha aldrig appen för att en
 * städning av en localStorage-rad misslyckades.
 */
export function clearFavoriteTeamId(): void {
  const storage = getLocalStorage();
  if (storage === null) {
    return;
  }
  try {
    storage.removeItem(FAVORITE_TEAM_KEY);
  } catch (error) {
    console.warn(`Kunde inte rensa "${FAVORITE_TEAM_KEY}" ur localStorage:`, error);
  }
}
