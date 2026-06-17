// PRELIMINÄR (live) resultat-overlay för topplistan (T84, #176). REN funktion, inget
// I/O, ingen React, ingen Supabase-klient, fristående testbar.
//
// ============================================================================
// VAD DEN GÖR
// ============================================================================
// Lägg den LÖPANDE live-ställningen (match_live_data.home_goals/away_goals) ovanpå den
// OFFICIELLA matchlistan, BARA för matcher som PÅGÅR just nu (live/paus) och ännu inte
// har ett officiellt facit. Resultatet är en NY Match[] där varje sådan match är en
// 'finished'-match med live-ställningen som ett PROVISORISKT resultat. Den listan matas
// sedan genom EXAKT samma facit-/poäng-väg som vanligt (derivePoolFacit -> buildLeaderboard),
// så topplistans placeringar rör sig i realtid medan mål trillar , utan en parallell
// poäng-motor (DRY, HARD: en sanning för hur ett tips poängsätts).
//
// ============================================================================
// DATA-INTEGRITET (HARD, T84-direktivet): live-lagret är PRELIMINÄRT och får ALDRIG
// skriva/ersätta det officiella facit.
// ============================================================================
// Denna modul är en REN funktion: Match[] (officiell) + live-data IN -> en NY Match[] UT.
// Den tar ingen Supabase-klient, har ingen skriv-väg, och MUTERAR aldrig sina indata
// (applyMatchResult ger en ny array, övriga referenser behålls). Den kan strukturellt
// inte röra official_match_results , det enda den producerar är ett härlett VISNINGS-värde
// som lever i React-minnet tills nästa render. Bevisat i apply-live-results.test.ts
// (overlayn returnerar nya objekt, indata oförändrade, ingen mutation).
//
// ============================================================================
// KONVERGENS-GARANTIN (acceptanskriterium: preliminär == officiell när facit landat)
// ============================================================================
// Vi lägger BARA på live-ställningen för en match vars OFFICIELLA status INTE redan är
// 'finished'. Så snart admin (T42) matat in det officiella resultatet är matchen
// 'finished' i `officialMatches`, och då hoppar overlayn över den (officiellt vinner
// ALLTID över live). Eftersom poängen härleds ur matchlistan via samma derivePoolFacit
// blir den preliminära topplistan då BITVIS identisk med den officiella , overlayn rör
// inte längre den matchen. Detta är konvergens by construction, inte en extra avstämning.
//
// VARFÖR ÅTERANVÄNDA applyMatchResult (inte en egen mappning): det är T6:s redan
// validerade state-transition (gammal match + inmatning -> ny, diskriminerat korrekt
// Match), exakt det applyRoomResults (det officiella facit-vävandet) bygger på. Att gå via
// den ger GRATIS samma validering (icke-negativa heltal, status<->resultat-kontraktet) och
// samma immutabla "ny array, samma övriga referenser"-garanti , så den preliminära listan
// är formad EXAKT som den officiella, bara med live-ställningar för pågående matcher.

import type { Match } from '../../domain/types';
import { isMatchInProgress, type LiveData } from '../../data/livescore';
import { applyMatchResult } from '../results/apply-match-result';
import type { ResultEntry } from '../results/validate-result';

/**
 * Får live-raden för match `matchId` bidra med en preliminär ställning ovanpå den
 * officiella matchen `official`?
 *
 * Villkor (alla måste hålla):
 *   1. Matchen PÅGÅR enligt live-datan (isMatchInProgress: 'live' eller 'paus'). En frusen
 *      (FT) live-rad är INTE preliminär , den väntar bara på sitt officiella facit, och en
 *      'scheduled'/'postponed'-rad har ingen ställning att visa.
 *   2. Den officiella matchen är INTE redan 'finished' (KONVERGENS: officiellt facit vinner
 *      alltid; när det landat rör vi aldrig matchen, så preliminär == officiell).
 *   3. Live-ställningen är känd (home/away goals icke-null). Mycket tidigt i en match kan
 *      API:t ännu inte ha satt mål , då finns inget provisoriskt resultat att lägga på
 *      (vi GISSAR aldrig en 0-0, en okänd ställning är inte "noll", lessons tyst-noll).
 */
function liveOverlayApplies(
  official: Match,
  live: LiveData
): live is LiveData & { homeGoals: number; awayGoals: number } {
  return (
    isMatchInProgress(live.status) &&
    official.status !== 'finished' &&
    live.homeGoals !== null &&
    live.awayGoals !== null
  );
}

/**
 * Bygg inmatnings-formen (ResultEntry) för en preliminär live-ställning. ALLTID 'finished'
 * med live-målen, INGA straffar: live-ställningen är den ordinarie löpande ställningen
 * (samma plan som match-tipset poängsätts på, score.ts §2), och en pågående match kan inte
 * vara straff-avgjord. Straffar tillhör bara ett FÄRDIGT slutspel (officiellt facit).
 */
function toPreliminaryEntry(
  live: LiveData & { homeGoals: number; awayGoals: number }
): ResultEntry {
  return {
    homeGoals: live.homeGoals,
    awayGoals: live.awayGoals,
    status: 'finished',
    penalties: null,
  };
}

/**
 * Pågår NÅGON av de officiella matcherna live just nu (med en preliminär ställning att
 * visa)? Driver "live/preliminär"-indikatorn: den ska synas ENDAST när minst en match
 * faktiskt pågår, annars visar topplistan det officiella läget exakt som vanligt (inget
 * live-lager, ingen indikator). Samma reachbarhets-villkor som overlayn (liveOverlayApplies),
 * så indikatorn aldrig kan tändas utan att overlayn faktiskt lägger på något (och tvärtom).
 *
 * @param officialMatches  Den officiella matchlistan (facit invävt, useLeaderboardData).
 * @param liveByMatchId    Live-data per appens match-id (useLiveData.byMatchId).
 */
export function hasLivePreliminaryMatch(
  officialMatches: readonly Match[],
  liveByMatchId: ReadonlyMap<string, LiveData>
): boolean {
  if (liveByMatchId.size === 0) {
    return false;
  }
  return officialMatches.some((match) => {
    const live = liveByMatchId.get(match.id);
    return live !== undefined && liveOverlayApplies(match, live);
  });
}

/**
 * Lägg den preliminära live-ställningen ovanpå den officiella matchlistan, BARA för matcher
 * som pågår och ännu saknar officiellt facit (se liveOverlayApplies + konvergens-garantin i
 * modul-doc:en). Returnerar en NY Match[] (eller den oförändrade indata-listan när inget
 * live-lager gäller, så referensen är stabil för React-memoisering).
 *
 * @param officialMatches  Den officiella matchlistan (facit invävt). DEN ENDA BASEN , den
 *                         muteras aldrig (immutabelt, applyMatchResult ger en ny array).
 * @param liveByMatchId    Live-data per appens match-id (useLiveData.byMatchId).
 * @returns                En matchlista där pågående matcher fått sin live-ställning som ett
 *                         PROVISORISKT 'finished'-resultat. Redan officiellt avgjorda matcher
 *                         är OFÖRÄNDRADE (officiellt vinner), liksom matcher utan live-rad.
 */
export function applyLiveResults(
  officialMatches: Match[],
  liveByMatchId: ReadonlyMap<string, LiveData>
): Match[] {
  if (liveByMatchId.size === 0) {
    return officialMatches; // inget live-lager: officiella listan oförändrad (stabil referens)
  }
  let next = officialMatches;
  for (const match of officialMatches) {
    const live = liveByMatchId.get(match.id);
    if (live === undefined || !liveOverlayApplies(match, live)) {
      continue; // ingen live-rad, inte pågående, redan officiellt klar, eller okänd ställning
    }
    try {
      next = applyMatchResult(next, match.id, toPreliminaryEntry(live));
    } catch {
      // En live-ställning som mot förmodan inte validerar (t.ex. ett negativt API-värde) får
      // ALDRIG välta hela topplistan , vi isolerar matchen och behåller resten (fail-safe,
      // exakt samma hållning som applyRoomResults mot en trasig delad rad). Den officiella
      // matchen står då kvar oförändrad (ingen preliminär ställning), aldrig en trasig lista.
    }
  }
  return next;
}
