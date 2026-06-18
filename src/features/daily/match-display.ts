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
 * (inte em-dash) per projektets svenska copy-regel. Ren sträng-
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

/**
 * Bygger en YouTube-SÖKLÄNK för en matchs höjdpunkter, t.ex.
 * "Mexiko Sydafrika VM 2026 höjdpunkter". REN funktion, ingen IO/nät: returnerar bara
 * sök-URL:en (en <a href> öppnar den), ingen ny API/nyckel/kostnad (Daniels val) , en
 * sökning funkar för VARJE match utan en klipp-databas, och officiella FIFA-/kanal-klipp
 * ligger nästan alltid överst i en sådan sökning.
 *
 * URL:en byggs mot YouTubes publika resultat-sida `/results` med sökningen i
 * `search_query`. Den enda parametern är delning av en sökning, så vi formar den med
 * URLSearchParams (korrekt URL-enkodning: mellanslag, å/ä/ö blir UTF-8-procent-enkodade),
 * i stället för manuell sträng-konkat som lätt enkodar fel. Lagnamnen kommer från
 * teamDisplayName (samma namn kortet redan visar), så sökningen matchar det användaren ser.
 */
export function buildHighlightsSearchUrl(homeName: string, awayName: string): string {
  const params = new URLSearchParams({
    search_query: `${homeName} ${awayName} VM 2026 höjdpunkter`,
  });
  return `https://www.youtube.com/results?${params.toString()}`;
}

/**
 * Lanseringsdagen (epoch-ms) för "Se höjdpunkter"-pillen, som UTC-midnatt. En FAST
 * konstant (inte "nu"): NYTT-markeringen ska räknas från en känd punkt, inte från när
 * koden råkar köra, så fönstret är deterministiskt och testbart. Datumet är 2026-06-18
 * (lanseringen). Vi använder UTC-midnatt som ankarpunkt så konstanten är en ren epoch-ms
 * oberoende av maskinens tidszon; fönstret är 14 DYGN brett, så en någon-timmes glidning
 * mellan UTC- och svensk midnatt är betydelselös för utfallet.
 */
export const HIGHLIGHTS_FEATURE_LAUNCH_MS = Date.UTC(2026, 5, 18); // månads-index 5 = juni

/** Hur länge NYTT-markeringen visas efter lanseringen: 14 dygn, sedan bara pillen. */
export const HIGHLIGHTS_FEATURE_NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Är "Se höjdpunkter"-funktionen fortfarande NY (ska NYTT-badgen visas)? REN funktion
 * med injicerat `now` (gissa aldrig en klocka inuti, lessons headline-tidsbeteende): true
 * från lanseringen (`launch`) och i `windowMs` framåt, sedan false för alltid. Så badgen
 * syns som nyhet vid lansering men blir aldrig inaktuell, och beteendet är bevisbart på
 * BÅDA sidor av fönstret med ett injicerat `now` (negativ-kontroll, lessons).
 *
 * Vänster gräns INKLUSIVE (now === launch är ny), höger gräns EXKLUSIVE (now === launch +
 * windowMs är INTE längre ny), så fönstret är exakt `windowMs` brett. Ett `now` FÖRE
 * lanseringen (klocka fel-ställd / förhandsvisning) räknas inte som nytt heller (badgen
 * hör till perioden EFTER lansering, inte före).
 *
 * @param now      Nuet (epoch-ms), injiceras av vyn (useTodayKey.nowMs), aldrig läst här.
 * @param launch   Lanseringsdagen (epoch-ms), default HIGHLIGHTS_FEATURE_LAUNCH_MS.
 * @param windowMs Fönstrets bredd i ms, default HIGHLIGHTS_FEATURE_NEW_WINDOW_MS (14 dygn).
 */
export function isHighlightsFeatureNew(
  now: number,
  launch: number = HIGHLIGHTS_FEATURE_LAUNCH_MS,
  windowMs: number = HIGHLIGHTS_FEATURE_NEW_WINDOW_MS
): boolean {
  return now >= launch && now < launch + windowMs;
}
