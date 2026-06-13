// REN härledning av AKTUELL ANVÄNDARES PERSONLIGA TIPS-STATISTIK (T23, #23).
// Inget I/O, ingen React, fristående testbar.
//
// ============================================================================
// EN POÄNG-KÄLLA (HARD, samma anda som T58/#99): vi RÄKNAR INTE om poänglogiken
// ============================================================================
// Statistiken HÄRLEDS ur EXAKT samma poäng-väg som topplistan + märkena: de RENA
// poängfunktionerna i score.ts (scorePrediction/pointTypeOf, EN sanning för hur
// ett match-tips poängsätts) över den DELADE matchlistan (officiellt facit invävt,
// samma `matches` som deriveMemberBadges + facit-källan tar). Vi inför INGEN ny
// poäng-beräkning som kan drifta från topplistan. Den här filen är, precis som
// derive-badges.ts, en NY OBSERVATION om redan-känd data (SPEC §6 "härledd state"),
// ingen ny sanning och ingen DB (per-enhets-statistik kräver ingen persistens).
//
// Bedöms BARA på AVGJORDA matcher (status 'finished'), samma poäng-/avslöjande-
// modell som topplistan: ett tips räknas i statistiken först när dess match är
// avgjord (annars rör sig siffrorna på en gissning om en oavgjord match).
//
// ============================================================================
// DEFINITIONERNA (gissas inte, dokumenterade i docs/decisions.md T23)
// ============================================================================
//  * TRÄFFSÄKERHET (accuracy) = andelen av medlemmens AVGJORDA match-tips som gav
//    poäng (> 0, dvs minst rätt utfall). KÄLLA: score.ts (scorePrediction > 0 =
//    rätt utfall/exakt). 0 avgjorda tips => null (ingen träffsäkerhet att visa än,
//    hellre tyst än en falsk 0 %, samma fail-safe som deriveSelfSummary).
//  * EXAKTA / RÄTT UTFALL / MISS = antalet avgjorda tips per poäng-TYP, klassade
//    med pointTypeOf (samma exakt/utfall/miss-beslut som scorePrediction, en regel).
//  * BÄSTA CALL (bestCall) = det ENSKILDA avgjorda match-tips som gav HÖGST poäng. Bara
//    tips som gav poäng (> 0) kan vara bästa call; gav inget tips poäng är bestCall null.
//    Vid lika poäng vinner den TIDIGASTE matchen (kickoff), en stabil, deterministisk
//    regel så bästa call inte "flaxar".

import type { Match } from '../../domain/types';
import type { Prediction } from '../../data/predictions';
import { pointTypeOf, scorePrediction, type MatchPointType } from '../../data/predictions';

/** Identitet för bästa call: vilken match + vad tippet gav, så UI:t kan visa den. */
export interface BestCall {
  /** Matchens id (för UI:t att slå upp lagen/rubriken). */
  matchId: string;
  /** Matchens hemmalag (Team.id), eller null (okänt slutspelslag). För matchup-rubrik. */
  homeTeamId: string | null;
  /** Matchens bortalag (Team.id), eller null. För matchup-rubrik. */
  awayTeamId: string | null;
  /** Matchens avspark (ISO/UTC), för en stabil ordning + ev. visning. */
  kickoff: string;
  /** Poäng-typen tippet gav (exact/outcome), driver "varför"-etiketten i UI:t. */
  pointType: MatchPointType;
  /** Poängen tippet faktiskt gav. */
  points: number;
}

/** Aktuell användares personliga tips-statistik, härledd ur match-tipsen + facit. */
export interface PersonalStats {
  /** Antal AVGJORDA matcher medlemmen tippade (nämnaren i träffsäkerheten). */
  decidedTips: number;
  /** Antal exakta resultat-träffar (3p-typ, pointTypeOf === 'exact'). */
  exactHits: number;
  /** Antal rätt-utfall-träffar (1p-typ, pointTypeOf === 'outcome'), EXKL. exakta. */
  outcomeHits: number;
  /** Antal missar (0p, pointTypeOf === 'miss'). */
  misses: number;
  /**
   * Träffsäkerhet = (exakta + utfall) / avgjorda tips, ett tal 0-1, eller null när
   * medlemmen inte har NÅGOT avgjort tips än (ingen kvot att visa, hellre tyst än 0).
   */
  accuracy: number | null;
  /** Bästa enskilda call (högst poäng-satta tips), eller null. */
  bestCall: BestCall | null;
}

/** Ett avgjort, tippat match-tips med sin poäng-typ + poäng. Internt arbets-form. */
interface DecidedTip {
  matchId: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  kickoff: string;
  pointType: MatchPointType;
  /** Poäng (0/1/3) tippet gav, för exakt/utfall/miss-räkningen + bästa call. */
  points: number;
}

/**
 * Bygg listan av medlemmens AVGJORDA, TIPPADE match-tips, var och en med sin poäng-
 * typ + poäng. Bara matcher som BÅDE är 'finished' OCH medlemmen tippade ingår (en
 * otippad eller oavgjord match är inte ett tips i statistiken). Speglar buildFinishedTips
 * i derive-badges.ts (samma urvalsregel + samma score.ts-funktioner), men bär poäng-TYPEN
 * som statistiken behöver.
 */
function buildDecidedTips(
  matchPredictions: readonly Prediction[],
  matches: readonly Match[]
): DecidedTip[] {
  const predByMatchId = new Map(matchPredictions.map((p) => [p.matchId, p]));
  const tips: DecidedTip[] = [];
  for (const match of matches) {
    if (match.status !== 'finished') {
      continue; // inget facit än -> inget avgjort tips
    }
    const pred = predByMatchId.get(match.id);
    if (pred === undefined) {
      continue; // medlemmen tippade inte denna match
    }
    const predicted = { homeGoals: pred.homeGoals, awayGoals: pred.awayGoals };
    tips.push({
      matchId: match.id,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      kickoff: match.kickoff,
      pointType: pointTypeOf(predicted, match.result),
      points: scorePrediction(predicted, match.result),
    });
  }
  return tips;
}

/**
 * Välj bästa call: det avgjorda tips som gav HÖGST poäng (> 0). Vid lika poäng vinner
 * den TIDIGASTE matchen (kickoff), en stabil regel så bästa call är deterministisk och
 * inte beror på inmatnings-/iterations-ordning. Returnerar null om inget tips gav poäng
 * (alla missar / inga avgjorda tips).
 */
function pickBestCall(tips: readonly DecidedTip[]): BestCall | null {
  let best: DecidedTip | null = null;
  for (const tip of tips) {
    if (tip.points <= 0) {
      continue; // bara tips som gav poäng kan vara bästa call
    }
    if (
      best === null ||
      tip.points > best.points ||
      // Lika poäng: tidigast kickoff vinner (stabil, deterministisk tiebreak).
      (tip.points === best.points &&
        new Date(tip.kickoff).getTime() < new Date(best.kickoff).getTime())
    ) {
      best = tip;
    }
  }
  if (best === null) {
    return null;
  }
  return {
    matchId: best.matchId,
    homeTeamId: best.homeTeamId,
    awayTeamId: best.awayTeamId,
    kickoff: best.kickoff,
    pointType: best.pointType,
    points: best.points,
  };
}

/**
 * Härled aktuell användares personliga tips-statistik ur hens match-tips och den delade
 * matchlistan (officiellt facit invävt). REN: samma indata topplistan + märkena redan
 * har, samma score.ts-poängväg (ingen omräkning), ingen DB.
 *
 * EDGE-FALL (alla rena, inga kast): inga tips alls -> 0 avgjorda, accuracy null,
 * bestCall null. Tips men inga avgjorda matcher än -> samma. Alla missar -> accuracy 0,
 * bestCall null. Statistiken börjar alltså tom och fylls löpande när matcher avgörs.
 *
 * @param matchPredictions  medlemmens match-tips (T15).
 * @param matches           den DELADE matchlistan (officiellt facit invävt), facit-källan.
 */
export function derivePersonalStats(
  matchPredictions: readonly Prediction[],
  matches: readonly Match[]
): PersonalStats {
  const tips = buildDecidedTips(matchPredictions, matches);

  let exactHits = 0;
  let outcomeHits = 0;
  let misses = 0;
  for (const tip of tips) {
    if (tip.pointType === 'exact') {
      exactHits += 1;
    } else if (tip.pointType === 'outcome') {
      outcomeHits += 1;
    } else {
      misses += 1;
    }
  }

  const decidedTips = tips.length;
  // Träffsäkerhet = andel tips som gav poäng (exakt eller rätt utfall). null tills
  // det finns minst ett avgjort tips (ingen kvot att visa, undvik en falsk 0 %).
  const accuracy = decidedTips === 0 ? null : (exactHits + outcomeHits) / decidedTips;

  return {
    decidedTips,
    exactHits,
    outcomeHits,
    misses,
    accuracy,
    bestCall: pickBestCall(tips),
  };
}
