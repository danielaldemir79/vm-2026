// GLOBAL (cross-rum) topplista: rangordna VARJE deltagare EN gång på deras BÄSTA
// enskilda rum-poäng (T90, #183, RÄTTVIS modell). REN funktion, inget I/O, ingen
// React, fristående testbar.
//
// ============================================================================
// AGGREGERINGS-REGELN (RÄTTVIS, dokumenterad i docs/decisions.md T90)
// ============================================================================
// En deltagares GLOBALA poäng = deras BÄSTA ENSKILDA rum-poäng. Antal rum ger
// INGEN fördel (det var T82-del-3-buggen: summa-över-rum lät fler rum = fler poäng
// = fusk, ägarens ord). Vi RÄKNAR INTE poäng på nytt här (DRY, HARD, en sanning):
// vi kör den befintliga, redan testade poäng-motorn (buildLeaderboard) PER RUM och
// väljer sedan, per distinkt deltagare, det BÄSTA rummets rad. Så match-/grupp-/
// bracket-/mästar-reglerna, facit-mappningen och tiebreak-måttet ärvs oförändrade
// ur aggregate-scores.
//
// VARFÖR BÄSTA RUM (inte summa, inte sammanslagna tips): en deltagare kan vara med
// i flera rum och tippa SAMMA match i flera. Skulle vi summera (gamla regeln) får en
// deltagare i tre rum tre gångers poäng för exakt samma skicklighet , orättvist mot
// en lika skicklig deltagare i ett rum. "Bästa rum" mäter SKICKLIGHET (det bästa
// utfallet deltagaren visat), oberoende av hur många rum hen råkar vara med i. Två
// identiska tips-uppsättningar i N rum ger då EXAKT samma globala poäng som i 1 rum.
//
// "BÄST" = den rad som vinner enligt SAMMA prioritet som rangordningen (compareEntries
// i aggregate-scores: poäng, sedan exakta träffar). Så "bästa rum" och "global rank"
// vilar på en sanning för vad som gör en rad bättre , de kan aldrig säga emot varandra.
//
// N i "X:a av N" = antalet DISTINKTA deltagare i den globala listan (varje deltagare
// EN gång, oavsett rum-antal).
//
// RHODOS (+ alla andra rum) läses som vilket rum som helst: aggregeringen är READ-only
// och rör ingen data. Special-hantering av ett enskilt rum sker ALDRIG tyst här.

// DEEP imports (inte '../leaderboard'-barrel): barrel:n re-exporterar React-komponenter
// + CSS, vilket annars bundlas in i edge-funktionens genererade mirror (T90). De rena
// modulerna importeras direkt, så scoring-grafen förblir ren och bundlingsbar för Deno.
import {
  buildLeaderboard,
  type LeaderboardEntry,
  type MemberPredictions,
} from '../leaderboard/aggregate-scores';
import type { RoomMember } from '../../data/rooms';
import type { PoolFacit } from '../leaderboard/derive-facit';

/**
 * Ett rums bidrag till den globala listan: dess medlemmar + deras tips, keyad på
 * userId. Exakt den form per-rums-motorn (buildLeaderboard) redan tar, så vi matar
 * in den orörd.
 */
export interface RoomContribution {
  /** Rummets id (för spårbarhet/debug; påverkar inte poängen). */
  roomId: string;
  /** Rummets medlemmar (userId + visningsnamn). En medlem utan tips bidrar med 0p. */
  members: readonly RoomMember[];
  /** Medlemmarnas tips (de tre typerna), keyad på userId. */
  predictionsByUser: ReadonlyMap<string, MemberPredictions>;
}

/** En rad i den GLOBALA topplistan: en distinkt deltagare med sin BÄSTA rum-poäng. */
export interface TotalLeaderboardEntry {
  userId: string;
  displayName: string;
  /** Deltagarens BÄSTA enskilda rum-poäng (antal rum ger ingen fördel). */
  points: number;
  /** 1-baserad GLOBAL placering. DELAD vid lika poäng (samma "1224"-stil som per rum). */
  rank: number;
  /** EXAKTA match-träffar i det BÄSTA rummet (tiebreak-mått, ärvt per rum). */
  exactHits: number;
}

/** En deltagares hittills BÄSTA rum-rad medan vi går igenom rummen. */
interface BestRoom {
  userId: string;
  displayName: string;
  points: number;
  exactHits: number;
}

/**
 * Är rad `candidate` BÄTTRE än `current` enligt rangordnings-prioriteten? SAMMA
 * prioritet som per rum (en sanning för "vad gör en rad bättre", compareEntries i
 * aggregate-scores): primärt högre poäng, sedan fler EXAKTA träffar. (Namn är inte en
 * KVALITETS-skiljare , det är bara en stabil visnings-ordning vid HELT lika , så det
 * ingår inte i "bästa rum"-valet; två rum med samma poäng + exactHits är likvärdiga och
 * först-sedda behålls deterministiskt.)
 */
function isBetterRoom(candidate: LeaderboardEntry, current: BestRoom): boolean {
  if (candidate.points !== current.points) {
    return candidate.points > current.points;
  }
  return candidate.exactHits > current.exactHits;
}

/**
 * Slå in ett rums poängsatta rader i "bästa rum"-kartan: för varje deltagare, behåll
 * deras BÄSTA rum-rad sett hittills. FÖRSTA visningsnamnet vi ser för en deltagare
 * vinner (stabilt, deterministiskt över rums-ordningen, samma val som per-rums-vyn).
 */
function accumulateBest(
  best: Map<string, BestRoom>,
  room: RoomContribution,
  facit: PoolFacit
): void {
  const perRoom = buildLeaderboard(room.members, room.predictionsByUser, facit);
  for (const entry of perRoom) {
    const existing = best.get(entry.userId);
    if (existing === undefined) {
      best.set(entry.userId, {
        userId: entry.userId,
        displayName: entry.displayName,
        points: entry.points,
        exactHits: entry.exactHits,
      });
      continue;
    }
    if (isBetterRoom(entry, existing)) {
      // Behåll det FÖRST sedda visningsnamnet (existing.displayName), byt bara poäng/
      // exactHits till det bättre rummets , namnet ska inte hoppa mellan renderingar.
      existing.points = entry.points;
      existing.exactHits = entry.exactHits;
    }
  }
}

/**
 * Jämför två globala rader för sortering. SAMMA prioritetsordning som per rum (en
 * sanning för "vad gör en rad bättre"): primärt poäng (fallande), sedan fler EXAKTA
 * match-träffar (kvalitets-tiebreak), sist visningsnamn alfabetiskt (svensk locale) så
 * listan aldrig flaxar mellan renderingar.
 */
function compareTotals(a: BestRoom, b: BestRoom): number {
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
function assignTotalRanks(sorted: readonly BestRoom[]): TotalLeaderboardEntry[] {
  const entries: TotalLeaderboardEntry[] = [];
  let previousPoints: number | null = null;
  let currentRank = 0;
  sorted.forEach((best, index) => {
    if (previousPoints === null || best.points !== previousPoints) {
      currentRank = index + 1;
      previousPoints = best.points;
    }
    entries.push({
      userId: best.userId,
      displayName: best.displayName,
      points: best.points,
      rank: currentRank,
      exactHits: best.exactHits,
    });
  });
  return entries;
}

/**
 * Bygg den GLOBALA topplistan: poängsätt varje rum med per-rums-motorn, behåll varje
 * distinkt deltagares BÄSTA rum-poäng, och rangordna globalt med delad placering.
 *
 * @param rooms  Varje rums bidrag (medlemmar + tips). Ett tomt rum bidrar med inget.
 * @param facit  Det DELADE, globala facit (en sanning för alla rum, derivePoolFacit).
 * @returns      Den globala topplistan, högsta bästa-rum-poäng först, delad rank vid lika.
 */
export function buildTotalLeaderboard(
  rooms: readonly RoomContribution[],
  facit: PoolFacit
): TotalLeaderboardEntry[] {
  const best = new Map<string, BestRoom>();
  for (const room of rooms) {
    accumulateBest(best, room, facit);
  }
  const sorted = [...best.values()].sort(compareTotals);
  return assignTotalRanks(sorted);
}

/** En global-rads sammanfattning för "din placering"-hjälten. */
export interface TotalSelfSummary {
  points: number;
  rank: number;
  /** Antal DISTINKTA deltagare i listan (N i "X:a av N"). */
  totalParticipants: number;
}

/**
 * Härled aktuell deltagares sammanfattning ur den GLOBALA topplistan (samma en-sanning-
 * princip som per-rums deriveSelfSummary): läs ut raden, räkna aldrig om. null om vi inte
 * kan peka ut en egen rad (ingen identitet, eller identiteten finns inte i listan) , då
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
  };
}

export type { LeaderboardEntry };
