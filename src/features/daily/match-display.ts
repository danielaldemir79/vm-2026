// Visnings-hjälpare för matchkortet (RENA funktioner): stage-etikett + lagnamn.
//
// Håller presentations-text på ETT ställe så MatchCard blir tunn och texterna är
// enhetstestbara. Svenska etiketter (projektets språk). Lagnamn slås upp ur
// teams.ts via id; för slutspelsmatcher där laget ÄNNU är okänt (homeTeamId null
// tills seedningen i T9, SPEC §6) visas en tydlig platshållare i stället för att
// gissa ett lag (gissa aldrig, PRINCIPLES).

import type { Match, MatchStage, Team } from '../../domain/types';
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
