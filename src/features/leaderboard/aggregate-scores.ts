// Aggregera poäng per rumsmedlem + rangordna topplistan (T17, #17).
// REN funktion, inget I/O, ingen React, fristående testbar. Detta är topplistans
// kärna och HÖG-RISK-delen (poäng-aggregering + rangordning).
//
// ============================================================================
// POÄNG-/AVSLÖJANDE-MODELLEN (dokumenterad i docs/decisions.md T17)
// ============================================================================
// En medlems totalpoäng = summan över ALLA tre tips-typer, var och en poängsatt
// mot FAKTISKT utfall (facit), med de redan testade RENA poängfunktionerna:
//   * Match-tips  -> scorePrediction       (mot avgjord matchs ordinarie mål)
//   * Grupp-tips  -> scoreGroupPrediction  (mot klar grupps 1:a/2:a)
//   * Bracket-tips-> scoreBracketAdvance    (mot avgjord slots avancerare)
//   * Mästar-tips -> scoreChampionPrediction(mot final-vinnaren)
// Vi RÄKNAR INTE om poänglogiken här (DRY): vi delegerar till bonus-score/score.
//
// Poäng räknas BARA på AVGJORDA/låsta utfall: ett tips ger poäng först när dess
// match/grupp/slot är avgjord (facit innehåller bara avgjorda utfall, se
// derive-facit.ts). Det gör topplistan meningsfull LÖPANDE (poäng tickar in när
// matcher avgörs) utan att avslöja andras OAVGJORDA tips-innehåll (RLS döljer
// andras tips-RADER tills deadline; topplistans poäng kommer ur facit, inte ur
// att läsa andras tips). Tips-INNEHÅLLET avslöjas separat (reveal.ts).
//
// ============================================================================
// LAG-IDENTITET: tips OCH facit är BÅDA i CODE-rymden här (versal). derive-facit
// mappade id -> code vid källan (T16 F1), så poängfunktionerna jämför code mot
// code. bonus-score normaliserar dessutom själv (defense-in-depth).
// ============================================================================

import type { RoomMember } from '../../data/rooms';
import type { Prediction, GroupPrediction, BracketPrediction } from '../../data/predictions';
import {
  scorePrediction,
  scoreGroupPrediction,
  scoreBracketAdvance,
  scoreChampionPrediction,
  // Den maximala match-tips-poängen (exakt resultat) avgör vad som räknas som en
  // "exakt träff" för tiebreaket. Härleds ur poängregeln (score.ts), ingen magisk 3.
  PREDICTION_POINTS,
} from '../../data/predictions';
import type { PoolFacit, MatchFacit, GroupFacit, BracketFacit } from './derive-facit';
import { CHAMPION_SLOT_ID } from './derive-facit';

/** Alla en medlems tips (de tre typerna) i ett rum, för aggregeringen. */
export interface MemberPredictions {
  userId: string;
  /** Match-resultat-tips (T15), keyade på matchId vid aggregering. */
  matchPredictions: readonly Prediction[];
  /** Grupp-tips (T16), keyade på groupId. */
  groupPredictions: readonly GroupPrediction[];
  /** Bracket-/slutspels-tips inkl. mästaren (T16), keyade på slotId. */
  bracketPredictions: readonly BracketPrediction[];
}

/** En rad i den rangordnade topplistan. */
export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  /** Total bonuspoäng (alla tre tips-typer, mot avgjort facit). */
  points: number;
  /** 1-baserad placering. DELAD vid lika poäng (samma rank, se tiebreak nedan). */
  rank: number;
  /** Hur många EXAKTA match-resultat (3-poängare) medlemmen prickat (tiebreak-mått). */
  exactHits: number;
}

/* ------------------------------------------------------------------ *
 * Poäng per medlem (summa över de tre tips-typerna mot facit).
 * ------------------------------------------------------------------ */

/** Detalj-summa för en medlem: total + antal exakta match-träffar (för tiebreak). */
interface MemberScore {
  points: number;
  exactHits: number;
}

/** Indexera facit-listorna för O(1)-uppslag per nyckel. */
interface FacitIndex {
  matchByMatchId: ReadonlyMap<string, MatchFacit>;
  groupByGroupId: ReadonlyMap<string, GroupFacit>;
  bracketBySlotId: ReadonlyMap<string, BracketFacit>;
  champion: PoolFacit['champion'];
}

function indexFacit(facit: PoolFacit): FacitIndex {
  return {
    matchByMatchId: new Map(facit.matches.map((f) => [f.matchId, f])),
    groupByGroupId: new Map(facit.groups.map((f) => [f.groupId, f])),
    bracketBySlotId: new Map(facit.bracketSlots.map((f) => [f.slotId, f])),
    champion: facit.champion,
  };
}

/**
 * Summera en medlems poäng över de tre tips-typerna mot facit. Ett tips bidrar
 * BARA om dess utfall finns i facit (= är avgjort); annars 0 (inget facit än).
 */
function scoreMember(member: MemberPredictions, index: FacitIndex): MemberScore {
  let points = 0;
  let exactHits = 0;

  // 1) Match-resultat-tips (T15): mot avgjord matchs ordinarie mål.
  for (const pred of member.matchPredictions) {
    const facit = index.matchByMatchId.get(pred.matchId);
    if (!facit) {
      continue; // matchen ännu inte avgjord -> inget facit, inga poäng än
    }
    const p = scorePrediction(
      { homeGoals: pred.homeGoals, awayGoals: pred.awayGoals },
      facit.actual
    );
    points += p;
    if (p === PREDICTION_POINTS.exact) {
      exactHits += 1;
    }
  }

  // 2) Grupp-tips (T16): mot klar grupps 1:a/2:a.
  for (const pred of member.groupPredictions) {
    const facit = index.groupByGroupId.get(pred.groupId);
    if (!facit) {
      continue; // gruppen ännu inte klar
    }
    points += scoreGroupPrediction(
      { winnerTeamId: pred.winnerTeamId, runnerUpTeamId: pred.runnerUpTeamId },
      facit.actual
    );
  }

  // 3) Bracket-/slutspels-tips (T16) + mästaren: mot avgjord slots avancerare.
  for (const pred of member.bracketPredictions) {
    if (pred.slotId === CHAMPION_SLOT_ID) {
      // Mästar-tipset: mot final-vinnaren (mästaren), om finalen är avgjord.
      if (index.champion !== null) {
        points += scoreChampionPrediction(pred.advancingTeamId, index.champion);
      }
      continue;
    }
    const facit = index.bracketBySlotId.get(pred.slotId);
    if (!facit) {
      continue; // slotten ännu inte avgjord
    }
    points += scoreBracketAdvance(facit.stage, pred.advancingTeamId, facit.advancingTeam);
  }

  return { points, exactHits };
}

/* ------------------------------------------------------------------ *
 * Rangordning (sortering + tiebreak + delad placering).
 * ------------------------------------------------------------------ */

/**
 * Jämför två topplistrader för sortering. PRIMÄRT total poäng (fallande).
 * TIEBREAK vid lika poäng (dokumenterat val, docs/decisions.md T17):
 *   1) fler EXAKTA match-resultat (3-poängare) först, en KVALITETS-skillnad
 *      som speglar skickligare tippande (mer specifikt rätt, samma anda som
 *      poängregelns "exakt > utfall"), inte bara summan.
 *   2) därefter visningsnamn ALFABETISKT (svensk locale), en stabil, förut-
 *      sägbar slut-ordning så listan aldrig "flaxar" mellan renderingar.
 * OBS: tiebreaket avgör bara SORTERINGS-ordningen i listan. Själva PLACERINGEN
 * (rank) är DELAD vid lika poäng (assignRanks nedan): lika poäng = samma rank,
 * oavsett tiebreak. Tiebreaket är alltså ett VISNINGS-ordnings-mått, inte en
 * poäng-skiljare som bryter den delade placeringen.
 */
function compareEntries(a: MemberLine, b: MemberLine): number {
  if (a.points !== b.points) {
    return b.points - a.points; // högre poäng först
  }
  if (a.exactHits !== b.exactHits) {
    return b.exactHits - a.exactHits; // fler exakta träffar först
  }
  return a.displayName.localeCompare(b.displayName, 'sv'); // stabil alfabetisk
}

/** En medlemsrad före rank tilldelats (intern). */
interface MemberLine {
  userId: string;
  displayName: string;
  points: number;
  exactHits: number;
}

/**
 * Tilldela DELAD placering: lag med samma POÄNG får samma rank, och nästa
 * distinkta poäng hoppar fram till sin absoluta position ("1224"-stilen, standard
 * för delade placeringar). Tiebreak (exactHits/namn) påverkar bara ordningen
 * INOM en delad grupp, inte själva rank-numret.
 */
function assignRanks(sorted: readonly MemberLine[]): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];
  let previousPoints: number | null = null;
  let currentRank = 0;
  sorted.forEach((line, index) => {
    if (previousPoints === null || line.points !== previousPoints) {
      // Ny poäng-nivå: rank = absolut position (1-baserad), så delade placeringar
      // konsumerar sina positioner (två 1:or -> nästa är 3:a, inte 2:a).
      currentRank = index + 1;
      previousPoints = line.points;
    }
    entries.push({
      userId: line.userId,
      displayName: line.displayName,
      points: line.points,
      rank: currentRank,
      exactHits: line.exactHits,
    });
  });
  return entries;
}

/* ------------------------------------------------------------------ *
 * Publik aggregering.
 * ------------------------------------------------------------------ */

/**
 * Bygg den rangordnade topplistan: poängsätt varje medlem mot facit och
 * rangordna med delad placering vid lika poäng.
 *
 * @param members            Rummets medlemmar (userId + visningsnamn). En medlem
 *                           UTAN tips får 0 poäng och rankas med (visas inte bort).
 * @param predictionsByUser  Varje medlems tre tips-typer, keyad på userId.
 * @param facit              Det härledda facit (derive-facit), allt i CODE-rymden.
 * @returns                  Topplistan, högsta poäng först, med delad rank.
 */
export function buildLeaderboard(
  members: readonly RoomMember[],
  predictionsByUser: ReadonlyMap<string, MemberPredictions>,
  facit: PoolFacit
): LeaderboardEntry[] {
  const index = indexFacit(facit);

  const lines: MemberLine[] = members.map((member) => {
    const preds = predictionsByUser.get(member.userId);
    const score = preds ? scoreMember(preds, index) : { points: 0, exactHits: 0 }; // medlem utan tips: 0 poäng, men med i listan
    return {
      userId: member.userId,
      displayName: member.displayName,
      points: score.points,
      exactHits: score.exactHits,
    };
  });

  const sorted = [...lines].sort(compareEntries);
  return assignRanks(sorted);
}
