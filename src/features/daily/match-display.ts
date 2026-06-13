// Visnings-hjälpare för matchkortet (RENA funktioner): stage-etikett + lagnamn.
//
// Håller presentations-text på ETT ställe så MatchCard blir tunn och texterna är
// enhetstestbara. Svenska etiketter (projektets språk). Lagnamn slås upp ur
// teams.ts via id; för slutspelsmatcher där laget ÄNNU är okänt (homeTeamId null
// tills seedningen i T9, SPEC §6) visas en tydlig platshållare i stället för att
// gissa ett lag (gissa aldrig, PRINCIPLES).

import type { FinishedMatch, Match, MatchResult, MatchStage, Team } from '../../domain/types';
import { teamShortName } from '../../domain';
// Direkt-import (inte barrel ../../data/wc2026): barrel:n re-exporterar även
// WC2026_MATCHES/WC2026_TEAMS m.fl., så en barrel-import länkar in all den statiska
// datan i varje konsument som bara behöver de 16 kapaciteterna. Direkt mot
// venue-capacities håller hjälparen lätt + kopplingen smal.
import { WC2026_VENUE_CAPACITIES } from '../../data/wc2026/venue-capacities';

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

/**
 * Det fasta mellanslag (no-break space, U+00A0) som svensk konvention använder som
 * tusentals-avgränsare, så talet aldrig radbryts mitt i sig. Vi binder det explicit som
 * den literala no-break-space-konstanten nedan i stället för att lita på vilket
 * grupperings-tecken Intl väljer (vissa Node-/ICU-versioner ger U+202F narrow no-break
 * space, andra vanligt mellanslag), så formateringen är DETERMINISTISK på alla
 * Node-versioner (CI kör en annan än lokalt).
 * EN sanning för avgränsaren.
 */
const SV_THOUSANDS_SEPARATOR = ' ';

/** Svensk heltals-formatering (för t.ex. åskådarkapacitet), grupperat med fast mellanslag. */
const svInteger = new Intl.NumberFormat('sv-SE', { useGrouping: true, maximumFractionDigits: 0 });

/**
 * Formatera ett heltal i svensk stil med fast mellanslag som tusentals-avgränsare, t.ex.
 * 80824 -> "80 824" (mellanslaget är U+00A0, no-break). EN sanning för siffer-formatering
 * (T4e #149), så kapacitet (och framtida tal) formateras likadant överallt. Vi normaliserar
 * ICU:s grupperings-tecken till U+00A0 så resultatet är deterministiskt oavsett Node-/ICU-
 * version. Negativt/icke-heltal hör inte hit (kapacitet är ett positivt heltal från källan).
 */
export function formatCapacity(value: number): string {
  // Normalisera ICU:s grupperings-tecken (kan vara U+0020/U+00A0/U+202F beroende på
  // version) till det fasta mellanslaget (\s matchar alla tre), så talet aldrig radbryts.
  return svInteger.format(value).replace(/\s/g, SV_THOUSANDS_SEPARATOR);
}

/**
 * Den läsbara kapacitets-etiketten för en arena, t.ex. "80 824 platser", eller null om
 * arenan saknar en verifierad kapacitet (då visar UI:t INGEN siffra, gissa aldrig). Slår
 * upp den källånkrade per-arena-kapaciteten (WC2026_VENUE_CAPACITIES, värde-låst mot
 * venue-source.txt) på den FULLA venue-strängen ("Arena, Stad, Land"), samma nyckel som
 * matchen bär. Platshållar-venue ("ej verifierad", #35) och okänd arena ger null tyst.
 * "platser" (inte "åskådare"/"säten") = etablerad svensk arena-term. T4e (#149).
 */
export function formatVenueCapacity(venue: string): string | null {
  if (isVenuePlaceholder(venue)) {
    return null;
  }
  const capacity = WC2026_VENUE_CAPACITIES.get(venue);
  if (capacity === undefined) {
    return null;
  }
  return `${formatCapacity(capacity)} platser`;
}

/**
 * FIFA-rankings-etiketten för ett lag, t.ex. "FIFA-ranking #14", eller null om laget är
 * okänt (slutspel innan seedningen, team undefined) eller saknar ranking
 * (Team.fifaRanking undefined). Läser BARA befintlig data (T10/T69), ingen ny källa, och
 * hanterar saknad ranking TYST (ingen "FIFA-ranking #undefined").
 *
 * VARFÖR hela ordet "FIFA-ranking" (inte bara "FIFA #14"): ett ensamt "#14" kan
 * misstolkas som grupp-/tabellplacering. Det fulla ordet gör otvetydigt att det är
 * lagets FIFA-världsranking (Daniels feedback 2026-06-13). T4e (#149).
 */
export function formatFifaRanking(team: Team | undefined): string | null {
  if (team === undefined || team.fifaRanking === undefined) {
    return null;
  }
  return `FIFA-ranking #${team.fifaRanking}`;
}
