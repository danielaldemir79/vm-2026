// REN gate för startsidans slutspels-påminnelse (2026-06-28, Daniels önskemål: en
// notis på Idag som påminner om att tippa slutspelsträdet, "får ligga några dagar").
//
// Skild från SlutspelReminder.tsx (komponenten) så react-refresh-regeln hålls ren (en
// .tsx exporterar bara komponenter) och fönster-logiken kan testas helt fristående.
//
// FÖNSTRET: påminnelsen visas runt slutspelet , från ett par dagar INNAN första
// slutspelsavsparken (en heads-up: deadlinen att tippa en slot är dess avspark) till
// ett dygn EFTER den sista (finalen), sedan är den borta av sig själv. Så den dyker
// inte upp under tidigt gruppspel och hänger inte kvar efter mästerskapet , men ligger
// kvar "några dagar" genom hela slutspelet (plus att den går att stänga, se komponenten).

import type { Match } from '../../domain/types';

const DAY_MS = 86_400_000;
/** Hur långt FÖRE första slutspelsavsparken påminnelsen tänds (heads-up). */
const LEAD_MS = 2 * DAY_MS;
/** Hur långt EFTER sista slutspelsavsparken den slocknar (efter finalen). */
const TAIL_MS = 1 * DAY_MS;

/**
 * Är vi i slutspels-fönstret just nu? True när `now` ligger mellan (första
 * slutspelsavsparken , LEAD) och (sista slutspelsavsparken + TAIL). Slutspelsmatcher
 * = stage !== 'group' (M73..M104). Finns inga slutspelsmatcher / ogiltiga tider ->
 * false (visa inget hellre än fel).
 */
export function knockoutWindowActive(matches: readonly Match[], now: number): boolean {
  let earliest = Infinity;
  let latest = -Infinity;
  for (const m of matches) {
    if (m.stage === 'group') {
      continue;
    }
    const t = Date.parse(m.kickoff);
    if (Number.isNaN(t)) {
      continue;
    }
    if (t < earliest) earliest = t;
    if (t > latest) latest = t;
  }
  if (earliest === Infinity) {
    return false;
  }
  return now >= earliest - LEAD_MS && now <= latest + TAIL_MS;
}
