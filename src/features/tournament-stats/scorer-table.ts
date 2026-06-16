// REN AGGREGERING för skytteligan + assist-ligan (T87, #179). Ingen IO, inget React, ingen
// Date.now() , rent in (alla matchers events) -> rent ut (rankade rader), så reglerna är
// trivialt enhetstestbara (samma anda som live-feed.ts / poll-budget.ts).
//
// ÅTERANVÄNDNING (PRINCIPLES §4, G5): vi parsar ALDRIG events själva här. Den DELADE
// projektionen (match-stats: extractGoals) äger "vad är ett mål / vem är skytt / är det
// straff / är det egenmål", redan hårt testad. Vi AGGREGERAR bara dess utdata över ALLA
// matcher: kör extractGoals per match och summerar per spelar-id. T88 (turneringsstatistik)
// återanvänder samma delade extraktorer (extractCards/normalizeTeamStats) på samma sätt.
//
// =====================================================================================
// DOMÄNREGLER (KÄLLHÄNVISADE , gissas aldrig, lessons "lattgissad-domanregel"; se även
// docs/decisions.md 2026-06-16 och match-stats-header):
//
//  R1. SKYTT-TALLY EXKLUDERAR EGENMÅL. Ett egenmål är ALDRIG skyttens mål , den regeln är
//      universell och provider-oberoende (till skillnad från egenmålets LAG-kreditering,
//      som de stora fotbolls-API:erna är oeniga om och vi därför aldrig tolkar om). Vi
//      filtrerar isOwnGoal === false innan vi räknar en spelares mål. KÄLLA: match-stats-
//      types.ts MatchGoal-doc + isOwnGoalDetail (API-Football detail "Own Goal").
//
//  R2. STRAFFMÅL RÄKNAS SOM MÅL. Ett straffmål är ett mål i skytteligan (det är så FIFA:s
//      officiella skyttekung-statistik räknar , straffar i öppet spel ingår; bara
//      straffläggning EFTER 120 min, dvs penalty shoot-out, räknas inte som mål, och de
//      kommer aldrig in här eftersom de inte är 'goal'-events i ordinarie events-strömmen).
//      Vi räknar straffmålet men noterar antalet straff separat (isPenalty), så vyn kan
//      visa "varav straff". KÄLLA: match-stats isPenaltyGoal (detail "Penalty").
//
//  R3. GRUPPERINGS-NYCKEL = SPELAR-ID, inte namn. Namn kan stavas olika mellan API-svar
//      ("Mbappé"/"K. Mbappe"); id:t är stabilt. En MÅL/ASSIST utan känt spelar-id (id null)
//      HOPPAS , vi slår aldrig ihop okända skyttar under ett gemensamt null (det vore att
//      gissa att de är samma spelare). KÄLLA: live-types LiveEvent.playerId-doc ("STABIL
//      nyckel för cross-match-aggregering").
//
//  R4. RANKNING (sortering). Skytteligan: flest MÅL först. Tie-break (rimlig, deterministisk):
//      (a) FÄRRE matcher (effektivare , en spelare med 5 mål på 3 matcher rankas före 5 mål
//      på 5 matcher), sedan (b) FLER assists (mer inblandad), sedan (c) namn (stabil, så
//      ordningen aldrig flimrar mellan renders vid total likhet). Assist-ligan: flest assists
//      först, samma tie-break-anda (färre matcher, fler mål, namn). Detta är en PRESENTATIONS-
//      konvention (inte en officiell FIFA-regel), så den motiveras men hävdas inte som
//      "källhänvisad sanning".
// =====================================================================================

import { extractGoals } from '../../data/match-stats';
import type { MatchGoal } from '../../data/match-stats';
import type { LiveMatchEvents } from '../../data/livescore';

/** En rad i skytteligan: en spelare, dess lag, och dess mål-statistik aggregerad över VM. */
export interface ScorerRow {
  /** Spelarens stabila API-id (grupperings-nyckel, R3). */
  playerId: number;
  /** Spelarens namn (senast sedda stavning, för visning). */
  playerName: string;
  /** Lagets API-id (för flagg-disc-uppslag via team-bridge). */
  teamApiId: number;
  /** Lagets namn (för visning). */
  teamName: string;
  /** Antal mål (straff INKLUDERAT, egenmål EXKLUDERAT , R1+R2). */
  goals: number;
  /** Varav straffmål (delmängd av goals, för "varav straff"-noteringen). */
  penalties: number;
  /** Antal assists spelaren STÅR FÖR (egen rad i assist-ligan; här som sekundär kolumn). */
  assists: number;
  /** Antal distinkta matcher spelaren gjort mål i (tie-break + "X mål på Y matcher"). */
  matches: number;
}

/** En rad i assist-ligan: en spelare rankad på assists. */
export interface AssistRow {
  playerId: number;
  playerName: string;
  teamApiId: number;
  teamName: string;
  /** Antal assists (egenmål kan inte ha assist, så ingen egenmåls-fråga här). */
  assists: number;
  /** Spelarens egna mål (sekundär kolumn + tie-break). */
  goals: number;
  /** Antal distinkta matcher spelaren assisterat i. */
  matches: number;
}

/** Det aggregerade resultatet: skytteliga + assist-liga, båda färdig-rankade. */
export interface TournamentScoring {
  scorers: ScorerRow[];
  assisters: AssistRow[];
}

/** Föränderlig ackumulator per spelare medan vi aggregerar (matchId-set => distinkta matcher). */
interface ScorerAcc {
  playerId: number;
  playerName: string;
  teamApiId: number;
  teamName: string;
  goals: number;
  penalties: number;
  assists: number;
  /** Matcher spelaren var INBLANDAD i (mål ELLER assist), distinkt via matchId. */
  matchIds: Set<string>;
}

/** Hämta/skapa ackumulatorn för en spelare (id-nyckel, R3). Bevarar senast sedda namn/lag. */
function accFor(
  byPlayer: Map<number, ScorerAcc>,
  playerId: number,
  playerName: string,
  teamApiId: number,
  teamName: string
): ScorerAcc {
  const existing = byPlayer.get(playerId);
  if (existing) {
    // Senast sedda stavning vinner (en senare match kan ha en renare/mer komplett form).
    existing.playerName = playerName;
    existing.teamApiId = teamApiId;
    existing.teamName = teamName;
    return existing;
  }
  const fresh: ScorerAcc = {
    playerId,
    playerName,
    teamApiId,
    teamName,
    goals: 0,
    penalties: 0,
    assists: 0,
    matchIds: new Set(),
  };
  byPlayer.set(playerId, fresh);
  return fresh;
}

/**
 * Räkna in ETT mål i ackumulatorn (R1: egenmål är redan bortfiltrerat av anroparen; R2:
 * straff räknas som mål + noteras). Skytten måste ha ett känt id + namn (R3); saknas något
 * hoppar anroparen målet (vi gissar aldrig en skytt).
 */
function tallyGoal(byPlayer: Map<number, ScorerAcc>, goal: MatchGoal, matchId: string): void {
  if (goal.scorerId === null || goal.scorerName === null) {
    return; // okänd skytt -> hoppa (gissa aldrig, R3)
  }
  const acc = accFor(byPlayer, goal.scorerId, goal.scorerName, goal.teamApiId, goal.teamName);
  acc.goals += 1;
  if (goal.isPenalty) {
    acc.penalties += 1;
  }
  acc.matchIds.add(matchId);
}

/**
 * Räkna in EN assist i ackumulatorn. Assistens lag = MÅLETS lag (assisten kommer från samma
 * lag som målet , det är så API:t attribuerar event.assist). En assist utan känt id/namn
 * hoppas (R3). Egenmål har ingen meningsfull "assist" till skytten, så vi räknar assist BARA
 * för icke-egenmål (anroparen skickar bara icke-egenmål hit).
 */
function tallyAssist(byPlayer: Map<number, ScorerAcc>, goal: MatchGoal, matchId: string): void {
  if (goal.assistId === null || goal.assistName === null) {
    return; // ingen/okänd assist -> hoppa (vanligt: de flesta mål saknar assist)
  }
  const acc = accFor(byPlayer, goal.assistId, goal.assistName, goal.teamApiId, goal.teamName);
  acc.assists += 1;
  acc.matchIds.add(matchId);
}

/**
 * Bygg den lag-/spelar-nyckade ackumulatorn ur ALLA matchers events. För varje match körs
 * den DELADE extractGoals (en sanning för måltolkning), egenmål filtreras bort ur skytt-
 * tally:n (R1), och varje mål bidrar dels med en skytt-träff dels en ev. assist-träff.
 */
function accumulate(matches: readonly LiveMatchEvents[]): Map<number, ScorerAcc> {
  const byPlayer = new Map<number, ScorerAcc>();
  for (const { matchId, events } of matches) {
    for (const goal of extractGoals(events)) {
      if (goal.isOwnGoal) {
        // R1: ett egenmål är ALDRIG skyttens mål. Vi krediterar det varken som mål eller
        // assist till någon spelare i ligorna (lag-krediteringen tolkar vi aldrig om).
        continue;
      }
      tallyGoal(byPlayer, goal, matchId);
      tallyAssist(byPlayer, goal, matchId);
    }
  }
  return byPlayer;
}

/** Skytteligans sortering (R4): mål desc, sedan färre matcher, fler assists, namn. */
function byScorerRank(a: ScorerRow, b: ScorerRow): number {
  if (a.goals !== b.goals) {
    return b.goals - a.goals;
  }
  if (a.matches !== b.matches) {
    return a.matches - b.matches; // färre matcher = effektivare = högre
  }
  if (a.assists !== b.assists) {
    return b.assists - a.assists;
  }
  return a.playerName.localeCompare(b.playerName, 'sv');
}

/** Assist-ligans sortering (R4): assists desc, sedan färre matcher, fler mål, namn. */
function byAssistRank(a: AssistRow, b: AssistRow): number {
  if (a.assists !== b.assists) {
    return b.assists - a.assists;
  }
  if (a.matches !== b.matches) {
    return a.matches - b.matches;
  }
  if (a.goals !== b.goals) {
    return b.goals - a.goals;
  }
  return a.playerName.localeCompare(b.playerName, 'sv');
}

/**
 * Aggregera skytteliga + assist-liga över ALLA matchers events.
 *
 * Skytteligan: spelare med minst ETT mål (egenmål exkluderat, straff inkluderat), rankade
 * per R4. Assist-ligan: spelare med minst EN assist, rankade per R4. En spelare kan stå i
 * båda (en målskytt som också assisterat). Tom input / inga mål än -> två tomma listor
 * (edge: före turneringens första mål), ingen krasch.
 *
 * @param matches  events per match (useCrossMatchEvents.matches / getLiveEvents-utdata).
 */
export function aggregateScoring(matches: readonly LiveMatchEvents[]): TournamentScoring {
  const byPlayer = accumulate(matches);
  const scorers: ScorerRow[] = [];
  const assisters: AssistRow[] = [];
  for (const acc of byPlayer.values()) {
    const matchCount = acc.matchIds.size;
    if (acc.goals > 0) {
      scorers.push({
        playerId: acc.playerId,
        playerName: acc.playerName,
        teamApiId: acc.teamApiId,
        teamName: acc.teamName,
        goals: acc.goals,
        penalties: acc.penalties,
        assists: acc.assists,
        matches: matchCount,
      });
    }
    if (acc.assists > 0) {
      assisters.push({
        playerId: acc.playerId,
        playerName: acc.playerName,
        teamApiId: acc.teamApiId,
        teamName: acc.teamName,
        assists: acc.assists,
        goals: acc.goals,
        matches: matchCount,
      });
    }
  }
  scorers.sort(byScorerRank);
  assisters.sort(byAssistRank);
  return { scorers, assisters };
}
