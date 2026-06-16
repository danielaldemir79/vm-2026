// REN tidslinje-modell för den rika matchvyn (T86, #178): slår ihop mål/kort/byten/övrigt
// till EN kronologisk, hemma/borta-sidad lista som tidslinjen ritar. Ingen IO, inget React.
//
// Bygger ovanpå den DELADE projektionen (match-stats): extractGoals/Cards/Subs/Other ger
// redan team-nycklade, kronologiskt sorterade poster. Här lägger vi BARA till det matchvyn
// behöver utöver aggregeringen: en SIDA (home/away ur homeApiId) + en enad typ-union, så en
// enda <ol> kan rendera hela förloppet i tidsordning. Sid-regeln är samma som live-card-
// model.sideForTeam (en sanning för "vilket lag är hemma"), återanvänd genom samma villkor.

import {
  extractCards,
  extractGoals,
  extractOtherEvents,
  extractSubs,
  type MatchCardEvent,
  type MatchGoal,
  type MatchOtherEvent,
  type MatchSub,
} from '../../data/match-stats';
import type { LiveEvent } from '../../data/livescore';

/** Ena sidan i tidslinjen (samma vokabulär som live-card-model.MatchSide). */
export type TimelineSide = 'home' | 'away';

/**
 * En tidslinje-post, diskriminerad på `entryKind` (uttömmande union, ingen tyst default).
 *
 * VARFÖR `entryKind` och inte `kind`: MatchOtherEvent bär REDAN ett eget `kind`-fält
 * ('var'|'other'), så en wrapper-diskriminant döpt `kind` skulle KOLLIDERA , spreaden
 * `...o` skriver över wrapper-kind:en med 'var', och narrowingen blir fel (en VAR-post fick
 * kind 'var' i stället för wrapper-värdet). Ett distinkt namn (`entryKind`) kan aldrig
 * krockas av en spread, så diskriminanten är robust oavsett vilka fält den spreadade typen
 * råkar bära. (MatchOtherEvent.kind bevaras kvar som det är, för en neutral typ-etikett.)
 */
export type TimelineEntry =
  | ({ entryKind: 'goal'; side: TimelineSide } & MatchGoal)
  | ({ entryKind: 'card'; side: TimelineSide } & MatchCardEvent)
  | ({ entryKind: 'subst'; side: TimelineSide } & MatchSub)
  | ({ entryKind: 'other'; side: TimelineSide } & MatchOtherEvent);

/**
 * Avgör SIDA ur ett API-team-id (samma regel som live-card-model.sideForTeam, en sanning):
 * matchar id mot hemma-id -> 'home', annars 'away'. homeApiId null (fixtures utan känt id)
 * -> allt blir 'away' (positions-fallbacken i statistik/lineup tar rollen där; för en ren
 * tidslinje finns ingen positions-fallback, så vi sidar konsekvent 'away' när id saknas i
 * stället för att gissa hemma fel).
 */
function sideFor(teamApiId: number, homeApiId: number | null): TimelineSide {
  return homeApiId !== null && teamApiId === homeApiId ? 'home' : 'away';
}

/**
 * Bygg den enade, kronologiska tidslinjen ur en matchs händelser. Mål/kort/byten/övrigt
 * slås ihop och sorteras på (minut, tillägg), så förloppet läses uppifrån och ned i
 * tidsordning oavsett typ. Varje post bär sin SIDA (hemma/borta).
 *
 * @param events    de parsade händelserna (LiveData.events).
 * @param homeApiId hemmalagets API-id (ur matchen via bryggan), null -> allt 'away'.
 */
export function buildTimeline(
  events: readonly LiveEvent[],
  homeApiId: number | null
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...extractGoals(events).map(
      (g): TimelineEntry => ({ ...g, entryKind: 'goal', side: sideFor(g.teamApiId, homeApiId) })
    ),
    ...extractCards(events).map(
      (c): TimelineEntry => ({ ...c, entryKind: 'card', side: sideFor(c.teamApiId, homeApiId) })
    ),
    ...extractSubs(events).map(
      (s): TimelineEntry => ({ ...s, entryKind: 'subst', side: sideFor(s.teamApiId, homeApiId) })
    ),
    ...extractOtherEvents(events).map(
      (o): TimelineEntry => ({ ...o, entryKind: 'other', side: sideFor(o.teamApiId, homeApiId) })
    ),
  ];
  // Stabil kronologisk ordning: minut, sedan tillägg (null = 0). Inom samma minut behålls
  // insättnings-ordningen (mål före kort före byte före övrigt), en rimlig, deterministisk
  // tie-break (Array.prototype.sort är stabil i moderna motorer/Node).
  return entries.sort((a, b) =>
    a.minute !== b.minute ? a.minute - b.minute : (a.extra ?? 0) - (b.extra ?? 0)
  );
}
