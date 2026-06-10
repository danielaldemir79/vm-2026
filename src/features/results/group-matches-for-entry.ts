// Gruppera inmatnings-listans matcher per SVENSK kalenderdag (REN funktion).
//
// PROBLEM (Daniels feedback 2, #42/T28): i resultatinmatningens lista ser man
// bara lagen, sammanhanget (vilken dag, vilken tid, vilken grupp/runda) tappas,
// särskilt i den expanderade listan. Den här modulen ger listan dag-grupper med
// rubrik, så varje match står under sin svenska speldag.
//
// DRY (PRINCIPLES §4): dag-grupperingen ÅTERANVÄNDER `groupMatchesByDay` från
// features/daily, EN sanning för "matcher per svensk kalenderdag" (off-by-one-
// säker via localDateKey, känd fälla `utc-datum-anvant-som-lokalt-datum`). Vi
// uppfinner ingen egen datum-gruppering här.
//
// SKILLNAD mot daily/groupMatchesByDay: den fyller i VILODAGAR (tomma dagar) för
// datumnavigeringen i den dagliga vyn. Inmatningslistan vill INTE ha tomma dag-
// rubriker (en dag utan inmatnings-matcher ska inte ge en tom rubrik), så vi
// filtrerar bort dagar utan matcher här. Samma källa, annan presentation.
//
// VARFÖR en egen ren modul (inte inline i vyn): urvalet är ren datum-logik utan
// React-beroende, så den kan enhetstestas fristående (dag-gränsen kring midnatt,
// slutspels-dag, tom indata) och vyn blir tunn. Samma uppdelning som
// result-window.ts och deriveGroupTables (härledd-state-mönstret, patterns.md).

import type { Match } from '../../domain/types';
import { groupMatchesByDay, type MatchDay } from '../daily';

/**
 * En dag i inmatningslistan: dag-nyckeln + dagens matcher (sorterade på
 * avsparkstid, tidigast först, ärvt från groupMatchesByDay). Samma form som
 * daily/MatchDay, men listan innehåller ALDRIG en tom dag (se nedan).
 */
export type EntryMatchDay = MatchDay;

/**
 * Gruppera inmatnings-matcherna per svensk kalenderdag, i kronologisk ordning,
 * UTAN tomma vilodagar.
 *
 * Återanvänder daily/groupMatchesByDay (en sanning för dag-grupperingen) och tar
 * bort de dagar som saknar matcher. Inmatningslistan vill bara visa en dag-rubrik
 * när det FINNS matcher att mata in den dagen, till skillnad från den dagliga
 * vyns datumnavigering som behöver kunna stega även till en vilodag.
 *
 * @param matches  Matcherna som ska grupperas (här: de inmatningsbara matcherna,
 *                 dvs de med båda lag kända). Ordning spelar ingen roll, daily
 *                 sorterar dagarna och matcherna deterministiskt. Tom -> [].
 * @param timeZone Zonen dagar mäts i (default svensk tid via daily). Injicerbar för test.
 */
export function groupMatchesForEntry(
  matches: readonly Match[],
  timeZone?: string
): EntryMatchDay[] {
  return groupMatchesByDay(matches, timeZone).filter((day) => day.matches.length > 0);
}
