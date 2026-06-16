// KOMPAKTA AVSLÖJANDE-RADER (T92 del D, Daniels godkända lösning 2026-06-16). REN funktion,
// inget I/O, ingen React, fristående testbar.
//
// PROBLEM: tips-avslöjandet ("vad alla tippade") växte till en lång vägg , per match en hel
// kort med ALLAS tips inline. Med fler matcher OCH fler tävlande blev det rörigt. Daniels
// godkända lösning: en PAGINERAD PLATT lista av KOMPAKTA matchrader (senaste spelade först),
// där varje rad bara visar matchen + facit + DITT resultat, och ett tap drillar in till den
// rika matchvyn (T86) som visar allas tips. Ingen inline-expansion av allas tips i listan.
//
// DENNA MODUL bär den RENA projektionen + ordningen, så vyn (RevealSection) bara renderar:
//   1. ORDNING: senaste spelade matchen FÖRST. Vi sorterar på kickoff FALLANDE (avspark är
//      EN sanning för "när spelades matchen"; reveal-raden bär redan kickoff). Stabil
//      sekundär-nyckel (matchId) så ordningen aldrig flaxar mellan renderingar vid samma
//      kickoff (t.ex. två matcher med identisk avsparkstid).
//   2. "DITT RESULTAT" per match: hitta den inloggades pick (currentUserId) i match.picks.
//      Finns ingen identitet, eller tippade man inte matchen, är det null (vyn visar ", ").
//      Vi gissar ALDRIG ett resultat , null betyder "du tippade inte / okänd identitet".
//   3. PAGINERING: ren slice-matematik (sida 1..N), klampad, så vyn bara renderar en sida.
//
// Vi DUPLICERAR INTE facit-/pågår-markup:en här; den bor i RevealMatchCard (drill-in + matchvy
// delar den). Denna modul bär bara LIST-radens lilla projektion + ordning + sid-matematik.

import type { RevealedMatch } from './reveal';
import type { MatchPointType, Scoreline } from '../../data/predictions';

/** Den inloggades resultat för EN avslöjad match (för den kompakta radens "ditt resultat"). */
export interface SelfRevealResult {
  /** Din tippade ställning. */
  predicted: Scoreline;
  /**
   * Poäng + typ FINNS bara på en FÄRDIG match (status 'finished'). På en pågående match
   * (status 'live') har din pick inget facit att poängsättas mot än, så dessa är null
   * (ärligt "pågår", vi gissar aldrig poäng på oavgjort, samma HARD-regel som reveal.ts).
   */
  points: number | null;
  pointType: MatchPointType | null;
}

/** En kompakt rad i den paginerade avslöjande-listan: matchen + (om någon) ditt resultat. */
export interface RevealRow {
  /** Den underliggande avslöjade matchen (lag, facit/pågår, allas picks , för drill-in). */
  match: RevealedMatch;
  /** Den inloggades resultat för matchen, eller null (ingen identitet / du tippade inte). */
  self: SelfRevealResult | null;
}

/**
 * Hitta den inloggades resultat i en avslöjad matchs picks. null om ingen identitet getts
 * eller om användaren inte tippade matchen (gissa aldrig ett resultat). Poäng/typ bara på
 * en färdig match (en 'live'-picks bär inga poäng-fält, vilket typen redan garanterar).
 */
function selfResultFor(
  match: RevealedMatch,
  currentUserId: string | null
): SelfRevealResult | null {
  if (currentUserId === null) {
    return null;
  }
  // Narrowa på status FÖRST: på en 'finished'-match är picks RevealedMatchPick[] (bär
  // points + pointType), på en 'live'-match PendingMatchPick[] (ingen poäng). Diskriminanten
  // gör poäng-fälten strukturellt åtkomliga bara på den färdiga grenen (samma typ-kontrakt
  // som reveal.ts), ingen otrygg cast.
  if (match.status === 'finished') {
    const myPick = match.picks.find((p) => p.userId === currentUserId);
    if (myPick === undefined) {
      return null;
    }
    return { predicted: myPick.predicted, points: myPick.points, pointType: myPick.pointType };
  }
  // PÅGÅR: bara den gissade ställningen, inget facit/poäng än (ärligt "pågår", HARD).
  const myPick = match.picks.find((p) => p.userId === currentUserId);
  if (myPick === undefined) {
    return null;
  }
  return { predicted: myPick.predicted, points: null, pointType: null };
}

/**
 * Bygg de kompakta avslöjande-raderna i visningsordning: SENAST SPELADE matchen FÖRST
 * (kickoff fallande), med den inloggades resultat per rad (eller null).
 *
 * @param reveal         Avslöjade matcher (buildMatchReveal-utdata, valfri ordning).
 * @param currentUserId  Den inloggades id (för "ditt resultat" + egen-rad-markering), eller null.
 * @returns              Raderna, senaste spelade först.
 */
export function buildRevealRows(
  reveal: readonly RevealedMatch[],
  currentUserId: string | null
): RevealRow[] {
  // Kopiera innan sort (mutera aldrig storens array). Senaste avspark först (fallande);
  // matchId som stabil sekundär-nyckel vid identisk kickoff, så ordningen är deterministisk.
  const ordered = [...reveal].sort((a, b) => {
    if (a.kickoff !== b.kickoff) {
      return a.kickoff < b.kickoff ? 1 : -1;
    }
    return a.matchId.localeCompare(b.matchId);
  });
  return ordered.map((match) => ({ match, self: selfResultFor(match, currentUserId) }));
}

/** En sidas utsnitt ur de paginerade raderna. */
export interface RevealPage {
  /** Raderna på den aktuella sidan. */
  rows: RevealRow[];
  /** Aktuellt sidnummer (1-baserat, klampat i [1, pageCount]). */
  page: number;
  /** Totalt antal sidor (minst 1, även för en tom lista, så UI:t inte visar "sida 1 av 0"). */
  pageCount: number;
}

/**
 * Plocka ut EN sida ur raderna. Ren slice-matematik, klampad så ett sidnummer utanför
 * intervallet (t.ex. man stod på sista sidan och listan krympte) faller tillbaka till en
 * giltig sida i stället för en tom vy. pageSize måste vara >= 1 (kallar-kontrakt).
 *
 * @param rows      Alla rader (redan ordnade, buildRevealRows).
 * @param page      Önskat 1-baserat sidnummer (klampas).
 * @param pageSize  Rader per sida (>= 1).
 */
export function pageOfRevealRows(
  rows: readonly RevealRow[],
  page: number,
  pageSize: number
): RevealPage {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  // Klampa sidnumret i [1, pageCount] (off-by-one-säkert): ett ogiltigt/föråldrat sidnummer
  // ger en giltig sida, aldrig en tom slice (fail-safe, inte en krasch).
  const clamped = Math.min(Math.max(page, 1), pageCount);
  const start = (clamped - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    page: clamped,
    pageCount,
  };
}
