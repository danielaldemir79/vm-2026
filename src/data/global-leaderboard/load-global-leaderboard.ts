// Klient-läsare för den GLOBALA, rättvisa topplistan (T90, #183). REN data-funktion
// (tar en klient, anropar edge-funktionen), ingen React.
//
// VARFÖR en edge-funktion (inte direktläsning som T82-del-3:s loadRoomContributions):
// den gamla vägen laddade bara DEN INLOGGADES rum (myRooms) -> "Global" visade ~54 av
// 200+. Och att läsa ALLA rums tips direkt i klienten vore ett RLS-läckage. Edge-
// funktionen kör server-side (service_role, förbi RLS), poängsätter ALLA rum med den
// DELADE TS-motorn, och returnerar BARA säkra rader (visningsnamn/poäng/rank/exakt) ,
// aldrig en rå tips-rad. Klienten konsumerar bara den färdiga, säkra listan.
//
// FAIL-LOUD: ett fel (nätfel, 500 ur funktionen, oväntad form) KASTAR med ett begripligt
// svenskt meddelande, så providern visar fel-vägen i stället för en tyst tom/fel lista.

import type { VmSupabaseClient } from '../supabase-browser';
import type { SafeGlobalEntry } from './build-global-leaderboard';

/** Namnet på edge-funktionen (en sanning, så klient + deploy refererar samma). */
export const GLOBAL_LEADERBOARD_FUNCTION = 'global-leaderboard';

/** Formen edge-funktionen svarar med (bara säkra fält + en räknare). */
interface GlobalLeaderboardResponse {
  leaderboard: SafeGlobalEntry[];
  participants: number;
}

/**
 * Är `value` en giltig SafeGlobalEntry (defensiv form-koll på funktionssvaret)? Vi litar
 * inte blint på en extern gräns , en oväntad form ska fail-loud:a, inte ge en trasig lista.
 */
function isSafeEntry(value: unknown): value is SafeGlobalEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const e = value as Record<string, unknown>;
  return (
    typeof e.userId === 'string' &&
    typeof e.displayName === 'string' &&
    typeof e.points === 'number' &&
    typeof e.rank === 'number' &&
    typeof e.exactHits === 'number'
  );
}

/**
 * Hämta den globala, rättvisa topplistan via edge-funktionen. Returnerar de säkra
 * raderna (redan rangordnade, högsta bästa-rum-poäng först, delad rank vid lika).
 *
 * @param client  Den autentiserade Supabase-klienten (anon-session räcker; funktionen
 *                kräver bara en giltig JWT, svaret är publika namn + poäng).
 * @returns       SafeGlobalEntry[] , aldrig råa tips.
 * @throws        Vid nätfel, funktionsfel (500) eller en oväntad svarsform (fail-loud).
 */
export async function loadGlobalLeaderboard(client: VmSupabaseClient): Promise<SafeGlobalEntry[]> {
  const { data, error } = await client.functions.invoke<GlobalLeaderboardResponse>(
    GLOBAL_LEADERBOARD_FUNCTION,
    { body: {} }
  );

  if (error) {
    throw new Error(
      `[VM2026] Kunde inte hämta den globala topplistan: ${error.message ?? String(error)}`
    );
  }
  const leaderboard = data?.leaderboard;
  if (!Array.isArray(leaderboard) || !leaderboard.every(isSafeEntry)) {
    throw new Error(
      '[VM2026] Den globala topplistan kom i en oväntad form (förväntade en lista med ' +
        'säkra rader). Avbryter hellre än att visa en gissad lista.'
    );
  }
  return leaderboard;
}
