// Visnings-hjälpare för matchkortet (RENA funktioner): stage-etikett + lagnamn.
//
// Håller presentations-text på ETT ställe så MatchCard blir tunn och texterna är
// enhetstestbara. Svenska etiketter (projektets språk). Lagnamn slås upp ur
// teams.ts via id; för slutspelsmatcher där laget ÄNNU är okänt (homeTeamId null
// tills seedningen i T9, SPEC §6) visas en tydlig platshållare i stället för att
// gissa ett lag (gissa aldrig, PRINCIPLES).

import type { FinishedMatch, Match, MatchResult, MatchStage, Team } from '../../domain/types';
import { teamShortName } from '../../domain';

/** Svensk etikett per slutspels-/gruppsteg (för matchkortets steg-märke). */
const STAGE_LABELS: Record<MatchStage, string> = {
  group: 'Gruppspel',
  'round-of-32': 'Sextondelsfinal',
  'round-of-16': 'Åttondelsfinal',
  'quarter-final': 'Kvartsfinal',
  'semi-final': 'Semifinal',
  'third-place': 'Bronsmatch',
  final: 'Final',
};

/** Läsbar svensk etikett för en matchs steg, med ev. grupp-bokstav för gruppspel. */
export function stageLabel(match: Pick<Match, 'stage' | 'groupId'>): string {
  if (match.stage === 'group' && match.groupId !== null) {
    return `Grupp ${match.groupId}`;
  }
  return STAGE_LABELS[match.stage];
}

/** Platshållartext för ett ännu icke-framräknat slutspelslag (gissas aldrig). */
export const UNKNOWN_TEAM_LABEL = 'Ej klart';

/**
 * Visningsnamnet för ett lag på en matchsida (matchkortet, slutspelsträdets celler).
 * Båda är TRÅNGA ytor (två lag som speglar varandra runt "mot" / smala bracket-celler),
 * så vi visar det KORTA namnet (teamShortName: shortName om satt, annars name), t.ex.
 * "Bosnien" i stället för "Bosnien och Hercegovina" (T50). Det fulla namnet står kvar
 * i lagprofilen där det finns plats. Är laget okänt (slutspel innan seedningen, teamId
 * null) eller saknas i uppslaget returneras en tydlig platshållare, inte ett gissat namn.
 */
export function teamDisplayName(
  teamId: string | null,
  teamsById: ReadonlyMap<string, Team>
): string {
  if (teamId === null) {
    return UNKNOWN_TEAM_LABEL;
  }
  const team = teamsById.get(teamId);
  return team ? teamShortName(team) : UNKNOWN_TEAM_LABEL;
}

/**
 * Är matchen färdigspelad (bär ett resultat)? En typ-narrowande vakt så
 * konsumenter (matchkortet) kan plocka ut `match.result` (icke-null) utan en egen
 * null-check, via det diskriminerade unions-kontraktet (status <-> result).
 */
export function isFinished(match: Match): match is FinishedMatch {
  return match.status === 'finished';
}

/**
 * Resultatet på formen "hemma-borta" i ordinarie tid, t.ex. "2-1". Bindestreck
 * (inte em-dash) per projektets svenska copy-regel (CLAUDE.md). Ren sträng-
 * formatering så matchkortets resultat-rad är enhetstestbar och konsekvent.
 */
export function formatScore(result: MatchResult): string {
  return `${result.homeGoals}-${result.awayGoals}`;
}

/**
 * Straffresultatet på formen "(X-Y på straffar)" när matchen avgjordes på straffar
 * (bara slutspel, oavgjort i ordinarie tid), annars null. Visas SEPARAT från
 * ordinarie-resultatet så ett slutspels-resultat inte är tvetydigt: "2-2" plus
 * "(4-3 på straffar)" säger exakt vad som hände, i stället för att gömma straffarna.
 */
export function formatPenalties(result: MatchResult): string | null {
  if (!result.penalties) {
    return null;
  }
  return `(${result.penalties.homeGoals}-${result.penalties.awayGoals} på straffar)`;
}

/**
 * Är venue-fältet en "ej verifierad"-platshållare snarare än en riktig arena?
 * Källan bär inte arena/stad (känd lucka, VENUE_UNKNOWN i parsern, #35), så vyn
 * ska INTE visa platshållaren som om den vore verifierad arena-data. Vi
 * detekterar den mönster-baserat (innehåller "ej verifierad", case-okänsligt) i
 * stället för exakt sträng-likhet, så den inte blir spröd mot små formuleringar
 * (lessons: data-vakt på exakt textmatchning blir falskt positiv/negativ).
 */
export function isVenuePlaceholder(venue: string): boolean {
  return /ej\s+verifierad/i.test(venue);
}
