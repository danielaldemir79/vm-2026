// Härledd state: beräkna en GRUPPtabell från en lista matchresultat.
//
// REN funktion, inga sido-effekter, inget I/O. Detta är arkitekturens ryggrad
// (SPEC §6): tabellen LAGRAS aldrig, den härleds av denna funktion från
// Match-resultaten, så det finns en enda sanning. Hela funktionen är därför
// hårt enhetstestad (compute-standings.test.ts).
//
// AVGRÄNSNING (gruppmatcher ONLY): funktionen beräknar uttryckligen en
// GRUPPtabell, så den räknar BARA in gruppspelsmatcher (stage === 'group' OCH
// satt groupId). Slutspelsmatcher (round-of-32 ... final) ignoreras helt, även
// om deras lag råkar finnas i `teamIds`. Annars skulle en blandad matchlista
// (en call-site som skickar in både grupp- och slutspelsmatcher) förorena
// grupptabellen med slutspelsresultat. En gruppmatch UTAN groupId ignoreras
// också (data-defekt). Att en gruppmatch har en grupp är ett DATAKONTRAKT
// från datakällan, INTE en typgaranti: Match.groupId är `GroupId | null`
// oavsett stage (slutspelsmatcher har null), så typen tvingar inte fram en
// grupp för stage === 'group'. Den rena funktionen litar därför inte blint på
// källan utan filtrerar defensivt på `groupId !== null` i isCounted nedan.
//
// ============================================================================
// FIFA-tiebreak-ordning (VM 2026, gissas ALDRIG, källa nedan)
// ============================================================================
// Lag i en grupp rangordnas enligt FIFA:s regler för VM 2026 (artikel 13). VM
// 2026 ÄNDRADE ordningen mot tidigare mästerskap: inbördes möte (head-to-head)
// kommer FÖRE total målskillnad, inte efter. FIFA:s artikel 13 är uppdelad i
// STEG (verbatim ur regelverket):
//
//   Steg 1 (på de lag som står lika på poäng):
//     a) inbördes poäng        ] enbart matcher MELLAN de lika lagen
//     b) inbördes målskillnad   ] (head-to-head mini-tabell)
//     c) inbördes gjorda mål   ]
//   Steg 2 (RE-ITERATION + fallback):
//     - "If, after having applied criteria a) to c) above, teams still have an
//       equal ranking ... criteria a) to c) above are applied to the matches
//       between the REMAINING teams only." Dvs om a-c separerar NÅGRA men inte
//       alla, RÄKNAS a-c OM på enbart den kvar-lika delmängdens inbördes-matcher.
//     - "If no decision can be made through this procedure":
//         d) total målskillnad (alla gruppmatcher)
//         e) totalt gjorda mål (alla gruppmatcher)
//         f) fair play / disciplin (kort)            <- EJ implementerad, se nedan
//   Steg 3:
//         g/h) FIFA-ranking                          <- EJ implementerad, se nedan
//
// Källa: Regulations for the FIFA World Cup 26 (May 2026), Article 13, sid. 26-27
//   https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf
//   (Korskollad mot ESPN + FIFA.com 2026-06-09.) Se docs/decisions.md.
//
// RE-ITERATIONEN (steg 2, F1-beslutet i T4): T3 lämnade re-iterationen som en
// medveten KISS-avgränsning. Mot FIFA:s officiella ordalydelse är den OBLIGA-
// TORISK, så T4 implementerar den (se resolveTiedGroup nedan): när a-c skiljer
// av några lag räknas a-c om på enbart den kvar-lika delmängden, rekursivt.
//
// UTANFÖR SCOPE (implementeras INTE, gissas INTE):
//   - Kriterium f (fair play) kräver kort-/disciplindata som domänmodellen inte
//     modellerar (Match bär inga kort). Kan inte beräknas deterministiskt ur
//     matchresultaten.
//   - Kriterium g/h (FIFA-ranking) finns inte tillgänglig deterministiskt här.
// När alla beräkningsbara kriterier (a-e) ger exakt lika, kan funktionen INTE
// avgöra ordningen FIFA-korrekt. För att ändå vara deterministisk och förut-
// sägbar (samma indata -> samma utdata, aldrig "flaxig" sortering) faller den
// tillbaka på en STABIL sortering på teamId. Detta är uttryckligen INTE en
// FIFA-tiebreak, bara en deterministisk stabilitetsgaranti, kommenterad som sådan.

import type { FinishedMatch, GroupStanding, Match } from '../types';

/**
 * En räknad gruppmatch: färdigspelad med kända lag (efter isCounted-filtret).
 * Egen typ-alias så signaturerna nedan blir korta och en sanning.
 */
type CountedMatch = FinishedMatch & { homeTeamId: string; awayTeamId: string };

/** Inbördes mini-tabell: teamId -> { poäng, målskillnad, gjorda mål } (a-c). */
type H2HStats = Map<string, { points: number; goalDifference: number; goalsFor: number }>;

/** Poäng per utfall enligt fotbollens standard (3-1-0). */
const POINTS_WIN = 3;
const POINTS_DRAW = 1;
const POINTS_LOSS = 0;

/**
 * En tom statistik-rad för ett lag (noll spelade matcher). Används som start
 * vid ackumulering så ett lag UTAN spelade matcher ändå får en rad med nollor
 * (edge-fall: grupp där inga matcher spelats än, SPEC §4 "uppdateras live").
 */
function emptyStanding(teamId: string): GroupStanding {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    rank: 0,
  };
}

/**
 * En match räknas in i GRUPPtabellen bara om ALLA dessa gäller:
 *   - den är en gruppspelsmatch (stage === 'group') med satt groupId,
 *   - den är färdigspelad (status === 'finished'),
 *   - båda lagen är kända.
 *
 * Slutspelsmatcher (round-of-32 ... final) ignoreras helt, även om båda lagen
 * råkar finnas i `teamIds`: funktionen beräknar en grupptabell och får aldrig
 * förorenas av slutspelsresultat om en call-site skickar in en blandad lista
 * (dataintegritet, se filhuvudet). En gruppmatch utan groupId är en data-defekt
 * och hoppas också över: att en gruppmatch har en grupp är ett DATAKONTRAKT
 * från datakällan, inte en typgaranti (Match.groupId är `GroupId | null` oavsett
 * stage), så `groupId !== null`-kollen nedan är en avsiktligt DEFENSIV filtrering
 * av källan, inte en redundant koll mot en typ som redan utesluter null.
 * En match som inte är färdigspelad (kommande/pågående) bidrar inte, så en
 * ofullständig grupp ger korrekta delsummor (edge-fall).
 *
 * Vi narrowar på `status === 'finished'`, inte på `result !== null`: tack vare
 * att Match är en diskriminerad union på status räcker status-kollen för att TS
 * ska veta att `result` är icke-null (FinishedMatch.result: MatchResult). Det
 * binder ihop "räknas in" med matchens faktiska livscykel-läge i stället för en
 * fristående null-koll (Copilot C7/C8).
 */
function isCounted(match: Match): match is FinishedMatch & {
  stage: 'group';
  groupId: NonNullable<Match['groupId']>;
  homeTeamId: string;
  awayTeamId: string;
} {
  return (
    match.stage === 'group' &&
    match.groupId !== null &&
    match.status === 'finished' &&
    match.homeTeamId !== null &&
    match.awayTeamId !== null
  );
}

/** Uppdatera ett lags statistik med ett enskilt matchresultat (sett från lagets sida). */
function applyResult(row: GroupStanding, scored: number, conceded: number): void {
  row.played += 1;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  row.goalDifference = row.goalsFor - row.goalsAgainst;
  if (scored > conceded) {
    row.won += 1;
    row.points += POINTS_WIN;
  } else if (scored === conceded) {
    row.drawn += 1;
    row.points += POINTS_DRAW;
  } else {
    row.lost += 1;
    row.points += POINTS_LOSS;
  }
}

/**
 * Inbördes-statistik (kriterium a-c): poäng, målskillnad och gjorda mål, men
 * BARA räknat på matcher MELLAN lagen i `tiedTeamIds`. Returnerar en map
 * teamId -> { points, goalDifference, goalsFor } för de lagen.
 *
 * Varför en egen delberäkning: inbördes-tabellen är en MINI-tabell över bara
 * de lika lagen, inte hela gruppen. FIFA tittar enbart på resultaten dem
 * emellan. Övriga gruppmatcher ignoreras helt i detta steg. Vid steg 2:s
 * re-iteration anropas funktionen om med en MINDRE `tiedTeamIds` (de kvar-lika),
 * så mini-tabellen då räknas på enbart den delmängdens inbördes-matcher.
 */
function headToHeadStats(
  tiedTeamIds: readonly string[],
  countedMatches: readonly CountedMatch[]
): H2HStats {
  const tied = new Set(tiedTeamIds);
  const stats: H2HStats = new Map();
  for (const id of tiedTeamIds) {
    stats.set(id, { points: 0, goalDifference: 0, goalsFor: 0 });
  }

  for (const match of countedMatches) {
    // Bara matcher där BÅDA lagen är bland de lika räknas in.
    if (!tied.has(match.homeTeamId) || !tied.has(match.awayTeamId)) {
      continue;
    }
    const home = stats.get(match.homeTeamId)!;
    const away = stats.get(match.awayTeamId)!;
    const { homeGoals, awayGoals } = match.result;

    home.goalsFor += homeGoals;
    home.goalDifference += homeGoals - awayGoals;
    away.goalsFor += awayGoals;
    away.goalDifference += awayGoals - homeGoals;

    if (homeGoals > awayGoals) {
      home.points += POINTS_WIN;
    } else if (homeGoals === awayGoals) {
      home.points += POINTS_DRAW;
      away.points += POINTS_DRAW;
    } else {
      away.points += POINTS_WIN;
    }
  }

  return stats;
}

/**
 * Jämför två lag på STEG 1:s inbördes-kriterier (a-c) givet en h2h-mini-tabell.
 * Returnerar < 0 om `a` före `b`, > 0 om efter, 0 om a-c inte skiljer dem.
 * h2h är beräknad på exakt den delmängd matcher som steget gäller (hela den
 * lika gruppen i steg 1, eller den kvar-lika delmängden vid re-iteration).
 */
function compareHeadToHead(a: GroupStanding, b: GroupStanding, h2h: H2HStats): number {
  const ha = h2h.get(a.teamId);
  const hb = h2h.get(b.teamId);
  if (!ha || !hb) {
    return 0; // ett lag saknas i mini-tabellen: a-c kan inte skilja dem.
  }
  if (ha.points !== hb.points) {
    return hb.points - ha.points; // a) inbördes poäng
  }
  if (ha.goalDifference !== hb.goalDifference) {
    return hb.goalDifference - ha.goalDifference; // b) inbördes målskillnad
  }
  if (ha.goalsFor !== hb.goalsFor) {
    return hb.goalsFor - ha.goalsFor; // c) inbördes gjorda mål
  }
  return 0;
}

/**
 * Jämför två lag på de ÖVERGRIPANDE kriterierna (steg 2 d-e) + stabil fallback.
 * Anropas bara när steg 1 (a-c) och dess re-iteration inte kunnat skilja lagen.
 *
 * Sista raden (teamId) är INTE en FIFA-tiebreak: den ger bara en stabil,
 * förutsägbar ordning när lag står HELT lika efter alla beräkningsbara
 * kriterier (FIFA skulle här gå vidare till fair play / FIFA-ranking, utanför
 * scope, se filhuvudet). Utan den vore ordningen icke-deterministisk mellan
 * körningar, vilket är värre än en tydligt dokumenterad stabilitet.
 */
function compareOverall(a: GroupStanding, b: GroupStanding): number {
  if (a.goalDifference !== b.goalDifference) {
    return b.goalDifference - a.goalDifference; // d) total målskillnad
  }
  if (a.goalsFor !== b.goalsFor) {
    return b.goalsFor - a.goalsFor; // e) totalt gjorda mål
  }
  // f (fair play) + g/h (FIFA-ranking) utanför scope. Stabil teamId-fallback.
  return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0;
}

/**
 * Lös ordningen inom en mängd lag som står lika på POÄNG, enligt FIFA artikel
 * 13 steg 1 + steg 2:s RE-ITERATION (F1-beslutet, se filhuvudet).
 *
 * Procedur:
 *   1. Beräkna inbördes-mini-tabellen (a-c) över matcher MELLAN exakt `tied`.
 *   2. Sortera `tied` på a-c och dela upp i delmängder som a-c INTE kunde skilja.
 *   3. För varje delmängd:
 *        - 1 lag: klart.
 *        - är delmängden MINDRE än `tied` (a-c separerade några): RE-ITERERA,
 *          dvs anropa proceduren igen på enbart delmängden (ny mini-tabell över
 *          den mindre mängdens inbördes-matcher). Detta är FIFA steg 2.
 *        - är delmängden lika stor som `tied` (a-c skilde INGEN): a-c är uttömt,
 *          fall till de övergripande kriterierna (d-e) + stabil fallback.
 *
 * Rekursionen terminerar: re-iteration sker bara när delmängden är STRIKT
 * mindre än `tied`, så storleken minskar varje gång; gör a-c ingen skillnad
 * faller vi till compareOverall i stället för att rekursera.
 */
function resolveTiedGroup(
  tied: GroupStanding[],
  countedMatches: readonly CountedMatch[]
): GroupStanding[] {
  if (tied.length <= 1) {
    return tied;
  }

  const h2h = headToHeadStats(
    tied.map((r) => r.teamId),
    countedMatches
  );
  const ordered = [...tied].sort((a, b) => compareHeadToHead(a, b, h2h));

  // Dela upp i sammanhängande delmängder som a-c inte kunde skilja (rang lika).
  const result: GroupStanding[] = [];
  let i = 0;
  while (i < ordered.length) {
    let j = i + 1;
    while (j < ordered.length && compareHeadToHead(ordered[i], ordered[j], h2h) === 0) {
      j += 1;
    }
    const subset = ordered.slice(i, j);
    if (subset.length === 1) {
      result.push(subset[0]);
    } else if (subset.length < tied.length) {
      // Steg 2 re-iteration: a-c separerade NÅGRA, räkna om a-c på enbart de
      // kvar-lika lagens inbördes-matcher (rekursivt, mindre mängd varje gång).
      result.push(...resolveTiedGroup(subset, countedMatches));
    } else {
      // a-c skilde ingen i denna mängd: kriteriet uttömt, fall till d-e + fallback.
      result.push(...[...subset].sort(compareOverall));
    }
    i = j;
  }

  return result;
}

/**
 * Sortera en grupp lag enligt FIFA-ordningen.
 *
 * Lagen grupperas först på POÄNG (kriterium före steg 1). Inom varje poäng-
 * delgrupp löses ordningen av resolveTiedGroup, som kör steg 1 (inbördes a-c)
 * och steg 2:s re-iteration på kvar-lika delmängder, och faller till de över-
 * gripande kriterierna (d-e) + stabil teamId-fallback när inbördes är uttömt.
 */
function sortGroup(
  rows: GroupStanding[],
  countedMatches: readonly CountedMatch[]
): GroupStanding[] {
  // Gruppera på poäng (delgrupper av potentiellt lika lag).
  const byPoints = new Map<number, GroupStanding[]>();
  for (const row of rows) {
    const bucket = byPoints.get(row.points);
    if (bucket) {
      bucket.push(row);
    } else {
      byPoints.set(row.points, [row]);
    }
  }

  const sorted: GroupStanding[] = [];
  // Högsta poäng först.
  const pointValues = [...byPoints.keys()].sort((x, y) => y - x);
  for (const points of pointValues) {
    const bucket = byPoints.get(points)!;
    sorted.push(...resolveTiedGroup(bucket, countedMatches));
  }

  return sorted;
}

/**
 * Beräkna grupptabellen för en uppsättning lag och deras matcher.
 *
 * @param teamIds  Lagen i gruppen (Team.id). Lag utan spelade matcher får en
 *                 noll-rad, så tabellen alltid har en rad per lag i gruppen.
 * @param matches  Matcherna att räkna på. Bara färdigspelade GRUPPmatcher (med
 *                 satt groupId, resultat och kända lag) räknas, slutspelsmatcher
 *                 och matcher utan resultat ignoreras, så en blandad eller
 *                 ofullständig lista ändå ger korrekta grupp-delsummor (se
 *                 isCounted + filhuvudet).
 * @returns        Lag-rader sorterade enligt FIFA-tiebreak-ordningen (VM 2026),
 *                 bästa laget först, med 1-baserad rank ifylld.
 *
 * Funktionen muterar inte sina argument (bygger nya rader), så den är säker att
 * anropa om och om vid varje resultatinmatning.
 */
export function computeStandings(
  teamIds: readonly string[],
  matches: readonly Match[]
): GroupStanding[] {
  // En rad per lag i gruppen, från nollor (hanterar "inga matcher spelade").
  const rowsById = new Map<string, GroupStanding>();
  for (const teamId of teamIds) {
    rowsById.set(teamId, emptyStanding(teamId));
  }

  const countedMatches = matches.filter(isCounted);

  for (const match of countedMatches) {
    const home = rowsById.get(match.homeTeamId);
    const away = rowsById.get(match.awayTeamId);
    // En match vars lag inte tillhör de angivna teamIds hör inte till gruppen
    // och hoppas över (fail-safe: räkna inte in främmande lag i tabellen).
    if (!home || !away) {
      continue;
    }
    const { homeGoals, awayGoals } = match.result;
    applyResult(home, homeGoals, awayGoals);
    applyResult(away, awayGoals, homeGoals);
  }

  const sorted = sortGroup([...rowsById.values()], countedMatches);
  // Sätt 1-baserad rank efter slutlig ordning.
  sorted.forEach((row, index) => {
    row.rank = index + 1;
  });
  return sorted;
}
