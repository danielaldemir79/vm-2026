// REN urvalslogik: vilka matcher kan tippas, och är de låsta? (T15, #15).
//
// Ingen React, inget I/O, fristående testbar. Tipsvyn är tunn ovanpå denna.
//
// REGLER:
//   * En match är TIPPBAR bara om BÅDA lag är kända (homeTeamId + awayTeamId satta).
//     Slutspelsmatcher har okända lag tills seedningen löst dem (T4/T9), då går de
//     inte att tippa ett vettigt resultat på (man vet inte vilka som möts). De
//     filtreras bort, precis som resultatinmatningen bara visar matcher med kända lag.
//   * LÅST = avspark passerad (now >= kickoff). Server-RLS upprätthåller låset; här
//     härleder vi det bara för VISNINGEN (disabla fält, visa låst-etikett). Klockan
//     är injicerbar (now), default nuet, samma anda som appens övriga tids-kod.
//
// Vi sorterar tidigast först (kommande matcher överst) så de mest akuta tipsen
// (snart avspark) ligger högst.

import type { Match } from '../../domain/types';

/** En tippbar match + dess härledda låst-status (för visning). */
export interface PredictableMatch {
  match: Match;
  /** true om avspark passerat (now >= kickoff): tipset är låst (server-RLS gäller). */
  locked: boolean;
}

/** Har matchen båda lag kända? Bara då går den att tippa ett resultat på. */
function bothTeamsKnown(match: Match): boolean {
  return match.homeTeamId !== null && match.awayTeamId !== null;
}

/**
 * Välj de tippbara matcherna (båda lag kända), sorterade på avspark (tidigast
 * först), var och en med sin härledda låst-status mot `now`.
 *
 * @param matches  hela matchplanen.
 * @param now      nuet (default new Date()), injicerbart för test/determinism.
 */
export function selectPredictableMatches(
  matches: readonly Match[],
  now: Date = new Date()
): PredictableMatch[] {
  const nowMs = now.getTime();
  return matches
    .filter(bothTeamsKnown)
    .slice()
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
    .map((match) => ({
      match,
      locked: nowMs >= new Date(match.kickoff).getTime(),
    }));
}

/**
 * Bara de matcher som ÄNNU GÅR ATT TIPPA (inte låsta), tidigast först. För
 * default-vyn "kommande matcher att tippa". En separat selektor så vyn kan välja
 * att visa antingen alla (med låsta synliga) eller bara de öppna.
 */
export function selectOpenPredictableMatches(
  matches: readonly Match[],
  now: Date = new Date()
): PredictableMatch[] {
  return selectPredictableMatches(matches, now).filter((p) => !p.locked);
}
