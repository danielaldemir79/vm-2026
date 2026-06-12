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
  /**
   * JOKER-MATCHER (T19, #19): de matchId:n medlemmen satt som joker (en per omgång/dag).
   * Ett match-tips på en joker-match får sin poäng DUBBLAD (×JOKER_MULTIPLIER). VALFRITT:
   * default = inga jokrar (bakåtkompatibelt, en medlem utan joker poängsätts som förr).
   * Bara MATCH-tips dubblas (jokern pekar ut en match); grupp-/bracket-poäng rörs inte.
   */
  jokerMatchIds?: ReadonlySet<string>;
}

/**
 * Joker-multiplikatorn (T19, #19): en joker-matchs match-tips-poäng DUBBLAS. Stabil
 * konstant (inget magiskt 2 i koden) så UI-text och poänglogik delar EN sanning, och en
 * framtida justering (t.ex. ×3) sker på ETT ställe. KÄLLA: issue #19 ("joker-match dubblar
 * poängen") + docs/decisions.md T19.
 */
export const JOKER_MULTIPLIER = 2;

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

/**
 * Poäng UPPDELAD per tips-KÄLLA (T58, #99). En medlems total = summan av dessa fyra.
 * Vi bär uppdelningen så detalj-vyn ("var kommer poängen ifrån?") kan läsa den ur
 * SAMMA scoreMember-väg, i stället för en parallell omräkning (en sanning, HARD).
 * Invariant (testad): match + group + bracket + champion === total.
 */
export interface ScoreBySource {
  /** Match-resultat-tips (T15), poäng mot avgjorda matchers ordinarie mål. */
  match: number;
  /** Grupp-tips (T16), poäng mot klara gruppers 1:a/2:a. */
  group: number;
  /** Bracket-/slutspels-tips (T16), poäng mot avgjorda slotars avancerare (EXKL. mästaren). */
  bracket: number;
  /** VM-mästar-tipset (T16), poäng mot final-vinnaren. Skilt från bracket (egen rad i UI:t). */
  champion: number;
}

/** En medlem helt utan poäng (alla källor 0). Delad noll-form (DRY). */
const EMPTY_BY_SOURCE: ScoreBySource = { match: 0, group: 0, bracket: 0, champion: 0 };

/** Delad tom joker-mängd (T19): en medlem utan jokrar, undviker en allokering per anrop. */
const EMPTY_JOKER_SET: ReadonlySet<string> = new Set<string>();

/** Detalj-summa för en medlem: total + antal exakta match-träffar (för tiebreak) + käll-uppdelning. */
interface MemberScore {
  points: number;
  exactHits: number;
  /** Per-källa-uppdelning, summerar till points (T58, #99). */
  bySource: ScoreBySource;
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
 * Summera en medlems poäng över de tre tips-typerna mot facit, UPPDELAT per källa
 * (T58, #99). Ett tips bidrar BARA om dess utfall finns i facit (= är avgjort);
 * annars 0 (inget facit än). `points` HÄRLEDS ur källsummorna (en addition, samma
 * sanning som detalj-vyn läser), så totalen och käll-uppdelningen aldrig kan drifta.
 */
function scoreMember(member: MemberPredictions, index: FacitIndex): MemberScore {
  let matchPoints = 0;
  let groupPoints = 0;
  let bracketPoints = 0;
  let championPoints = 0;
  let exactHits = 0;

  // 1) Match-resultat-tips (T15): mot avgjord matchs ordinarie mål. JOKER (T19): om
  // matchen är medlemmens joker-match dubblas poängen (×JOKER_MULTIPLIER) INNAN den
  // läggs till matchPoints. exactHits räknas på det OBERÄKNADE utfallet (det är ett
  // ANTAL exakta träffar, ett kvalitets-mått för tiebreaket, inte poäng, så jokern
  // ändrar inte hur många exakta tips medlemmen prickat, bara deras poäng-tyngd).
  const jokerMatchIds = member.jokerMatchIds ?? EMPTY_JOKER_SET;
  for (const pred of member.matchPredictions) {
    const facit = index.matchByMatchId.get(pred.matchId);
    if (!facit) {
      continue; // matchen ännu inte avgjord -> inget facit, inga poäng än
    }
    const base = scorePrediction(
      { homeGoals: pred.homeGoals, awayGoals: pred.awayGoals },
      facit.actual
    );
    // Joker dubblar match-poängen för just denna match. En miss (0p) ×2 = 0 (en joker på
    // ett feltips ger ingen straff, bara ingen vinst), exakt som spelets risk fungerar.
    const isJoker = jokerMatchIds.has(pred.matchId);
    matchPoints += isJoker ? base * JOKER_MULTIPLIER : base;
    if (base === PREDICTION_POINTS.exact) {
      exactHits += 1;
    }
  }

  // 2) Grupp-tips (T16): mot klar grupps 1:a/2:a.
  for (const pred of member.groupPredictions) {
    const facit = index.groupByGroupId.get(pred.groupId);
    if (!facit) {
      continue; // gruppen ännu inte klar
    }
    groupPoints += scoreGroupPrediction(
      { winnerTeamId: pred.winnerTeamId, runnerUpTeamId: pred.runnerUpTeamId },
      facit.actual
    );
  }

  // 3) Bracket-/slutspels-tips (T16) + mästaren: mot avgjord slots avancerare. Mästaren
  // hålls i en EGEN summa (championPoints), inte bracketPoints: UI:t visar VM-vinnaren
  // som en egen detalj-rad, och CHAMPION_SLOT_ID är inte en riktig bracket-slot.
  for (const pred of member.bracketPredictions) {
    if (pred.slotId === CHAMPION_SLOT_ID) {
      // Mästar-tipset: mot final-vinnaren (mästaren), om finalen är avgjord.
      if (index.champion !== null) {
        championPoints += scoreChampionPrediction(pred.advancingTeamId, index.champion);
      }
      continue;
    }
    const facit = index.bracketBySlotId.get(pred.slotId);
    if (!facit) {
      continue; // slotten ännu inte avgjord
    }
    bracketPoints += scoreBracketAdvance(facit.stage, pred.advancingTeamId, facit.advancingTeam);
  }

  const bySource: ScoreBySource = {
    match: matchPoints,
    group: groupPoints,
    bracket: bracketPoints,
    champion: championPoints,
  };
  // Totalen HÄRLEDS ur källsummorna (inte en separat ackumulator), så invarianten
  // "summan av källorna === total" gäller per konstruktion (T58 #99, en sanning).
  const points = bySource.match + bySource.group + bySource.bracket + bySource.champion;
  return { points, exactHits, bySource };
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
    // Medlem utan tips: 0 poäng (alla källor 0), men med i listan.
    const score = preds
      ? scoreMember(preds, index)
      : { points: 0, exactHits: 0, bySource: EMPTY_BY_SOURCE };
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

/**
 * Aktuell medlems poäng UPPDELAD per tips-källa + totalen (T58, #99). Härleds ur
 * EXAKT samma scoreMember-väg som topplistan (samma poängfunktioner, samma facit),
 * så detalj-vyn aldrig räknar om i en parallell väg (HARD, en sanning). Invariant:
 * bySource.match + .group + .bracket + .champion === total (bevisat i testet).
 *
 * @param member  En medlems tre tips-typer (samma form aggregeringen tar).
 * @param facit   Det härledda facit (derive-facit), allt i CODE-rymden.
 * @returns       { bySource, total } för medlemmen mot facit.
 */
export function scoreMemberBreakdown(
  member: MemberPredictions,
  facit: PoolFacit
): { bySource: ScoreBySource; total: number } {
  const score = scoreMember(member, indexFacit(facit));
  return { bySource: score.bySource, total: score.points };
}
