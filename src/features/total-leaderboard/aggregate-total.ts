// TOTAL (cross-rum) topplista: summera varje deltagares poäng över ALLA rum de är
// med i, och rangordna globalt (T82 del 3, #173). REN funktion, inget I/O, ingen
// React, fristående testbar.
//
// ============================================================================
// AGGREGERINGS-REGELN (dokumenterad i docs/decisions.md, T82 del 3)
// ============================================================================
// En deltagares TOTALA poäng = SUMMAN av deras poäng över ALLA rum de är medlem i.
// Vi RÄKNAR INTE poäng på nytt här (DRY, HARD, en sanning): vi kör den befintliga,
// redan testade poäng-motorn (buildLeaderboard) PER RUM och summerar sedan varje
// distinkt deltagares per-rums-totaler. Så match-/grupp-/bracket-/mästar-reglerna,
// facit-mappningen och tiebreak-måttet ärvs oförändrade ur aggregate-scores.
//
// VARFÖR SUMMA PER RUM (inte sammanslagna tips-listor): en deltagare kan vara med i
// FLERA rum och tippa SAMMA match i båda. Regeln är "summan ÖVER ALLA RUM", så två
// rum ska ge poäng TVÅ gånger (en gång per rum). Att i stället slå ihop en deltagares
// tips-arrayer till EN lista och poängsätta en gång skulle tappa det andra rummets
// bidrag (en match räknas en gång i scoreMember). Vi poängsätter därför per rum och
// summerar totalerna, vilket också håller poäng-motorn orörd.
//
// N i "X:a av N" = antalet DISTINKTA deltagare i totalen (en deltagare som är med i
// tre rum räknas EN gång i N, men får sina tre rums poäng summerade).
//
// RHODOS (+ alla andra rum) läses som vilket rum som helst: aggregeringen är READ-only
// och rör ingen data. Special-hantering av ett enskilt rum sker ALDRIG tyst här (om en
// sådan regel behövs ska den vara explicit + dokumenterad, inte gömd i summeringen).

import { buildLeaderboard, type LeaderboardEntry, type MemberPredictions } from '../leaderboard';
import type { RoomMember } from '../../data/rooms';
import type { PoolFacit } from '../leaderboard';

/**
 * Ett rums bidrag till totalen: dess medlemmar + deras tips, keyad på userId. Exakt
 * den form per-rums-motorn (buildLeaderboard) redan tar, så vi matar in den orörd.
 */
export interface RoomContribution {
  /** Rummets id (för spårbarhet/debug; påverkar inte poängen). */
  roomId: string;
  /** Rummets medlemmar (userId + visningsnamn). En medlem utan tips bidrar med 0p. */
  members: readonly RoomMember[];
  /** Medlemmarnas tips (de tre typerna), keyad på userId. */
  predictionsByUser: ReadonlyMap<string, MemberPredictions>;
}

/** En rad i den TOTALA topplistan: en distinkt deltagare med sin summerade poäng. */
export interface TotalLeaderboardEntry {
  userId: string;
  displayName: string;
  /** Summerad totalpoäng över ALLA deltagarens rum. */
  points: number;
  /** 1-baserad GLOBAL placering. DELAD vid lika poäng (samma "1224"-stil som per rum). */
  rank: number;
  /** Summerade EXAKTA match-träffar över alla rum (tiebreak-mått, ärvt per rum). */
  exactHits: number;
  /** Hur många rum deltagaren bidrog med poäng från (för "med i N rum"-kontext i UI:t). */
  roomCount: number;
}

/** En deltagares ackumulerade total medan vi summerar över rummen. */
interface Accumulator {
  userId: string;
  displayName: string;
  points: number;
  exactHits: number;
  roomCount: number;
}

/**
 * Slå samman en deltagares per-rums-rad in i ackumulatorn. FÖRSTA visningsnamnet vi
 * ser för en deltagare vinner (stabilt, deterministiskt över rums-ordningen); samma
 * deltagare kan i teorin bära olika namn i olika rum, men totalen behöver ETT namn och
 * det första (rums-ordningen är stabil) är ett förutsägbart val.
 */
function accumulate(acc: Map<string, Accumulator>, room: RoomContribution, facit: PoolFacit): void {
  const perRoom = buildLeaderboard(room.members, room.predictionsByUser, facit);
  for (const entry of perRoom) {
    const existing = acc.get(entry.userId);
    if (existing === undefined) {
      acc.set(entry.userId, {
        userId: entry.userId,
        displayName: entry.displayName,
        points: entry.points,
        exactHits: entry.exactHits,
        roomCount: 1,
      });
      continue;
    }
    existing.points += entry.points;
    existing.exactHits += entry.exactHits;
    existing.roomCount += 1;
  }
}

/**
 * Jämför två total-rader för sortering. SAMMA prioritetsordning som per rum (en sanning
 * för "vad gör en rad bättre"): primärt total poäng (fallande), sedan fler EXAKTA
 * match-träffar (kvalitets-tiebreak), sist visningsnamn alfabetiskt (svensk locale) så
 * listan aldrig flaxar mellan renderingar.
 */
function compareTotals(a: Accumulator, b: Accumulator): number {
  if (a.points !== b.points) {
    return b.points - a.points;
  }
  if (a.exactHits !== b.exactHits) {
    return b.exactHits - a.exactHits;
  }
  return a.displayName.localeCompare(b.displayName, 'sv');
}

/**
 * Tilldela DELAD placering: deltagare med samma POÄNG får samma rank, nästa distinkta
 * poäng hoppar fram till sin absoluta position ("1224"-stilen, exakt som per rum). Detta
 * är medvetet en KOPIA av per-rums assignRanks-regeln (samma utfall) , vi exporterar inte
 * den interna hjälparen ur aggregate-scores; reglerna hålls i synk via testerna.
 */
function assignTotalRanks(sorted: readonly Accumulator[]): TotalLeaderboardEntry[] {
  const entries: TotalLeaderboardEntry[] = [];
  let previousPoints: number | null = null;
  let currentRank = 0;
  sorted.forEach((acc, index) => {
    if (previousPoints === null || acc.points !== previousPoints) {
      currentRank = index + 1;
      previousPoints = acc.points;
    }
    entries.push({
      userId: acc.userId,
      displayName: acc.displayName,
      points: acc.points,
      rank: currentRank,
      exactHits: acc.exactHits,
      roomCount: acc.roomCount,
    });
  });
  return entries;
}

/**
 * Bygg den TOTALA topplistan: poängsätt varje rum med per-rums-motorn, summera varje
 * distinkt deltagares poäng över alla rum, och rangordna globalt med delad placering.
 *
 * @param rooms  Varje rums bidrag (medlemmar + tips). Ett tomt rum bidrar med inget.
 * @param facit  Det DELADE, globala facit (en sanning för alla rum, derivePoolFacit).
 * @returns      Den totala topplistan, högsta summa först, delad rank vid lika.
 */
export function buildTotalLeaderboard(
  rooms: readonly RoomContribution[],
  facit: PoolFacit
): TotalLeaderboardEntry[] {
  const acc = new Map<string, Accumulator>();
  for (const room of rooms) {
    accumulate(acc, room, facit);
  }
  const sorted = [...acc.values()].sort(compareTotals);
  return assignTotalRanks(sorted);
}

/** En total-rads sammanfattning för "din placering"-hjälten. */
export interface TotalSelfSummary {
  points: number;
  rank: number;
  /** Antal DISTINKTA deltagare i totalen (N i "X:a av N"). */
  totalParticipants: number;
  /** Hur många rum deltagaren bidrog från (kontext i hjälte-kortet). */
  roomCount: number;
}

/**
 * Härled aktuell deltagares sammanfattning ur den TOTALA topplistan (samma en-sanning-
 * princip som per-rums deriveSelfSummary): läs ut raden, räkna aldrig om. null om vi inte
 * kan peka ut en egen rad (ingen identitet, eller identiteten finns inte i totalen) , då
 * visar UI:t ingen hjälte (hellre tyst än en gissad placering).
 */
export function deriveTotalSelfSummary(
  total: readonly TotalLeaderboardEntry[],
  currentUserId: string | null
): TotalSelfSummary | null {
  if (currentUserId === null) {
    return null;
  }
  const self = total.find((entry) => entry.userId === currentUserId);
  if (self === undefined) {
    return null;
  }
  return {
    points: self.points,
    rank: self.rank,
    totalParticipants: total.length,
    roomCount: self.roomCount,
  };
}

export type { LeaderboardEntry };
