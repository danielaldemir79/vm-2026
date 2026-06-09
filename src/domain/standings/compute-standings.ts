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
// kommer FÖRE total målskillnad, inte efter. Ordningen är:
//
//   1. Poäng (alla gruppmatcher)
//   2. Inbördes poäng        ] enbart matcher MELLAN de lag som står lika
//   3. Inbördes målskillnad   ] (head-to-head delgrupp)
//   4. Inbördes gjorda mål   ]
//   5. Total målskillnad (alla gruppmatcher)
//   6. Totalt gjorda mål (alla gruppmatcher)
//   7. Fair play-poäng (disciplin/kort)        <- EJ implementerad, se nedan
//   8. FIFA-ranking / lottning                  <- EJ implementerad, se nedan
//
// Källa: FIFA:s officiella VM 2026-regler, artikel 13 (bekräftad mot ESPN och
// FIFA.com 2026-06-09). Se docs/decisions.md för beslutet + varför.
//
// UTANFÖR T3:s SCOPE (implementeras INTE, gissas INTE):
//   - Kriterium 7 (fair play) kräver kort-/disciplindata som domänmodellen
//     inte modellerar (Match bär inga kort). Kan inte beräknas deterministiskt
//     ur matchresultaten.
//   - Kriterium 8 (lottning) är per definition slumpmässig, inte deterministisk.
// När alla deterministiska kriterier (1-6) ger exakt lika, kan denna funktion
// INTE avgöra ordningen FIFA-korrekt. För att ändå vara deterministisk och
// förutsägbar (samma indata -> samma utdata, aldrig "flaxig" sortering)
// faller den tillbaka på en STABIL sortering på teamId. Detta är uttryckligen
// INTE en FIFA-tiebreak, bara en deterministisk stabilitetsgaranti, och är
// kommenterad som sådan vid jämförelse-funktionen.

import type { FinishedMatch, GroupStanding, Match } from '../types';

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
 * Inbördes-statistik (kriterium 2-4): poäng, målskillnad och gjorda mål, men
 * BARA räknat på matcher MELLAN lagen i `tiedTeamIds`. Returnerar en map
 * teamId -> { points, goalDifference, goalsFor } för de lagen.
 *
 * Varför en egen delberäkning: inbördes-tabellen är en MINI-tabell över bara
 * de lika lagen, inte hela gruppen. FIFA tittar enbart på resultaten dem
 * emellan. Övriga gruppmatcher ignoreras helt i detta steg.
 */
function headToHeadStats(
  tiedTeamIds: readonly string[],
  countedMatches: readonly (FinishedMatch & {
    homeTeamId: string;
    awayTeamId: string;
  })[]
): Map<string, { points: number; goalDifference: number; goalsFor: number }> {
  const tied = new Set(tiedTeamIds);
  const stats = new Map<string, { points: number; goalDifference: number; goalsFor: number }>();
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
 * Jämför två lag-rader enligt FIFA-tiebreak-ordningen för VM 2026.
 *
 * Returnerar < 0 om `a` ska rankas före `b`, > 0 om efter, 0 om de inte kan
 * skiljas av de DETERMINISTISKA kriterierna (1-6). Inbördes-kriterierna (2-4)
 * tas in via `h2h`, som redan är beräknad på den aktuella delgruppen av lika
 * lag (se sortGroup, som bygger h2h-mapen för delgruppen via headToHeadStats).
 *
 * Sista raden (teamId-jämförelsen) är INTE en FIFA-tiebreak: den ger bara en
 * stabil, förutsägbar ordning när lag står HELT lika efter alla beräkningsbara
 * kriterier (FIFA skulle här gå vidare till fair play/lottning, vilket är
 * utanför T3:s scope, se filhuvudet). Utan den vore ordningen icke-determinis-
 * tisk mellan körningar, vilket är värre än en tydligt dokumenterad stabilitet.
 */
function compareByFifaOrder(
  a: GroupStanding,
  b: GroupStanding,
  h2h: Map<string, { points: number; goalDifference: number; goalsFor: number }> | null
): number {
  // 1. Poäng (alla gruppmatcher).
  if (a.points !== b.points) {
    return b.points - a.points;
  }

  // 2-4. Inbördes (bara när vi jämför inom en delgrupp av lika lag).
  if (h2h) {
    const ha = h2h.get(a.teamId);
    const hb = h2h.get(b.teamId);
    if (ha && hb) {
      if (ha.points !== hb.points) {
        return hb.points - ha.points; // 2. inbördes poäng
      }
      if (ha.goalDifference !== hb.goalDifference) {
        return hb.goalDifference - ha.goalDifference; // 3. inbördes målskillnad
      }
      if (ha.goalsFor !== hb.goalsFor) {
        return hb.goalsFor - ha.goalsFor; // 4. inbördes gjorda mål
      }
    }
  }

  // 5. Total målskillnad.
  if (a.goalDifference !== b.goalDifference) {
    return b.goalDifference - a.goalDifference;
  }
  // 6. Totalt gjorda mål.
  if (a.goalsFor !== b.goalsFor) {
    return b.goalsFor - a.goalsFor;
  }

  // 7-8 (fair play, lottning) ligger utanför T3:s scope. Stabil fallback på
  // teamId, INTE en FIFA-tiebreak, bara deterministisk förutsägbarhet.
  return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0;
}

/**
 * Sortera en grupp lag enligt FIFA-ordningen och lös inbördes-tiebreak rätt
 * även när 3+ lag står lika.
 *
 * Knepet: FIFA-inbördes (kriterium 2-4) ska bara räknas på matcher MELLAN de
 * lag som faktiskt står lika på poäng. Vi grupperar därför lagen på poäng,
 * och inom varje sådan poäng-delgrupp beräknas en inbördes-tabell över just de
 * lagen och sorteringen sker mot den. Det hanterar både 2-lags- och 3+-lags-
 * tiebreaks korrekt: delgruppen är exakt de lika lagen.
 *
 * Notera: efter inbördes (2-4) faller lika lag vidare till total MS/mål (5-6).
 * Vi räknar inte om inbördes-tabellen för en eventuell mindre kvar-lika under-
 * mängd (FIFA itererar i teorin om), eftersom det kräver upprepad omräkning
 * och i praktiken är extremt sällsynt; total MS/mål + stabil fallback ger ett
 * deterministiskt och rimligt resultat. Detta är en medveten KISS-avgränsning,
 * dokumenterad här så den inte tas för en FIFA-komplett iteration.
 */
function sortGroup(
  rows: GroupStanding[],
  countedMatches: readonly (FinishedMatch & {
    homeTeamId: string;
    awayTeamId: string;
  })[]
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
    if (bucket.length === 1) {
      sorted.push(bucket[0]);
      continue;
    }
    // 2+ lag lika på poäng: beräkna inbördes-tabell över just dem och sortera.
    const tiedIds = bucket.map((r) => r.teamId);
    const h2h = headToHeadStats(tiedIds, countedMatches);
    bucket.sort((a, b) => compareByFifaOrder(a, b, h2h));
    sorted.push(...bucket);
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
