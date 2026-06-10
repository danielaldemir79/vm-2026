// Väv in ett rums DELADE resultat i den lokala matchlistan (REN funktion, T14 KA-F3).
//
// KA-F3 (WIRE): rummet lovar "ni fyller i matchresultaten TILLSAMMANS". För att
// alla medlemmar ska se SAMMA tabell/träd måste de delade resultaten (lagrade i
// Supabase, room_match_results) appliceras ovanpå den statiska, källåkrade
// matchplanen som varje klient bär lokalt. Den här funktionen är vävningen: den
// tar de seedade matcherna + rummets delade resultat och ger en NY matchlista där
// varje delat resultat skrivit över sin match.
//
// VARFÖR ÅTERANVÄNDA applyMatchResult (inte en egen mappning): applyMatchResult är
// redan T6:s validerade state-transition (gammal match + inmatning -> ny, diskriminerat
// korrekt Match). Att gå via den ger oss GRATIS samma validering (icke-negativa heltal,
// status<->resultat-kontraktet, slutspels-straffar/FIFA Article 14) och samma immutabla
// "ny array, samma övriga referenser"-garanti. DRY: en sanning för hur ett resultat blir
// en match, oavsett om det kom från lokal inmatning eller från rummet.
//
// FAIL-SAFE mot en ENSKILD trasig delad rad: ett rum är delat och muterbart av flera
// klienter (och DB:ns match_id-format härdades i en separat migration först i KA-SA2).
// En enda ogiltig/okänd delad rad (okänt match_id, ett värde som inte validerar) får
// INTE välta hela tabellen för alla. Vi hoppar därför tyst över en rad som inte går att
// tillämpa och väver in resten, så en dålig rad isoleras i stället för att fail-loud:a
// hela vyn (till skillnad från LOKAL inmatning, som fail-loud:ar vid källan i submitResult,
// där felet är åtgärdbart av den som matar in). Sista-skrivet-vinner gäller redan på
// server-sidan (upsert på (room_id, match_id), updated_at), så listan vi får är konflikt-löst.

import type { Match } from '../../domain/types';
import type { RoomMatchResult } from '../../data/rooms';
import { applyMatchResult } from './apply-match-result';
import type { ResultEntry } from './validate-result';

/**
 * Mappa ett delat rums-resultat till en ResultEntry (inmatnings-formen).
 *
 * STATUS<->RESULTAT-KONTRAKTET (domänens Match-union, validate-result steg 3): bara
 * en 'finished'-match får bära mål; en 'scheduled'/'live'-match får INTE. Rummets
 * lagrade rad bär ALLTID home_goals/away_goals (DB-kolumnerna är NOT NULL, default 0
 * för en ej spelad match), så vi nollar dem till null för en icke-finished status,
 * annars skulle vävningen avvisas av 'result-without-finished'. Straffar tas med bara
 * för en finished match (de gäller bara avgjort slutspel, FIFA Article 14).
 */
function toEntry(result: RoomMatchResult): ResultEntry {
  if (result.status !== 'finished') {
    return { homeGoals: null, awayGoals: null, status: result.status, penalties: null };
  }
  return {
    homeGoals: result.homeGoals,
    awayGoals: result.awayGoals,
    status: 'finished',
    penalties: result.penalties
      ? { homeGoals: result.penalties.homeGoals, awayGoals: result.penalties.awayGoals }
      : null,
  };
}

/**
 * Applicera ett rums delade resultat på de (lokalt seedade) matcherna.
 *
 * @param matches       De seedade matcherna (statisk plan), den enda BASEN.
 * @param roomResults   Rummets delade resultat (Supabase). Tom lista -> matcherna
 *                      returneras oförändrade (lokalt läge / rum utan resultat).
 * @returns             En NY matchlista där varje TILLÄMPBART delat resultat skrivit
 *                      över sin match. Övriga matcher behåller sin referens. En delad
 *                      rad som inte går att tillämpa (okänt match_id, ogiltigt värde)
 *                      hoppas tyst över (fail-safe, se modul-kommentaren).
 */
export function applyRoomResults(matches: Match[], roomResults: RoomMatchResult[]): Match[] {
  if (roomResults.length === 0) {
    return matches;
  }
  // Bygg ett snabbt id-uppslag EN gång, så en okänd match_id kan hoppas utan att
  // applyMatchResult behöver kasta (den kastar på okänt id, det vill vi isolera här).
  const knownIds = new Set(matches.map((m) => m.id));
  let next = matches;
  for (const result of roomResults) {
    if (!knownIds.has(result.matchId)) {
      // Okänt match_id i en delad rad (t.ex. en gammal/trasig klient): hoppa, väv resten.
      continue;
    }
    try {
      next = applyMatchResult(next, result.matchId, toEntry(result));
    } catch {
      // En enskild delad rad som inte validerar (ogiltigt värde) ska inte välta
      // hela den delade tabellen för alla. Isolera raden, behåll resten (fail-safe).
    }
  }
  return next;
}
