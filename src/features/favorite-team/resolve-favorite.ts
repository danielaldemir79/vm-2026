// REN härledning kring favoritlaget (T23, #23). Inget I/O, ingen React, testbar.
//
// VARFÖR en ren resolve-funktion (inte validering i storage-lagret): storage-lagret
// ska vara DATA-OBEROENDE (det känner bara en sträng-nyckel, samma som active-room-
// storage). Giltigheten avgörs HÄR mot den FAKTISKA lag-listan (de 48 lagen), så ett
// pinnat id som inte längre finns (osannolikt för VM-lagen, men generiskt korrekt:
// stale/korrupt värde) tyst IGNORERAS i stället för att markera ett spöklag. Samma
// fail-safe som active-room-storage:s "rummet finns inte längre -> rensa".

import type { Team } from '../../domain/types';

/**
 * Slå upp det pinnade favoritlaget i lag-listan. Returnerar laget om id:t finns,
 * annars null (inget pinnat, ELLER ett okänt/inaktuellt id, som tyst ignoreras).
 *
 * @param favoriteTeamId  Det pinnade id:t (Team.id) ur favoritlags-storen, eller null.
 * @param teams           Lag-listan (de 48 lagen) att validera mot.
 */
export function resolveFavoriteTeam(
  favoriteTeamId: string | null,
  teams: readonly Team[]
): Team | null {
  if (favoriteTeamId === null) {
    return null;
  }
  return teams.find((team) => team.id === favoriteTeamId) ?? null;
}

/**
 * Spelar favoritlaget i den givna matchen (som hemma- eller bortalag)? Driver den
 * DISKRETA lyftningen av favoritlagets matcher i matchlistan (acceptanskriterium a).
 *
 * @param favoriteTeamId  Det pinnade id:t (Team.id), eller null (inget pinnat).
 * @param homeTeamId      Matchens hemmalag (Team.id) eller null (okänt slutspelslag).
 * @param awayTeamId      Matchens bortalag (Team.id) eller null.
 */
export function matchHasFavorite(
  favoriteTeamId: string | null,
  homeTeamId: string | null,
  awayTeamId: string | null
): boolean {
  if (favoriteTeamId === null) {
    return false;
  }
  return homeTeamId === favoriteTeamId || awayTeamId === favoriteTeamId;
}
