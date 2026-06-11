// Tips-AVSLÖJANDE: vilka tips visas, för vilken match/slot, och med vad (T17, #17).
// REN funktion, inget I/O, ingen React, fristående testbar.
//
// ============================================================================
// AVSLÖJANDE-MODELLEN (HARD, sekretess, dokumenterad i docs/decisions.md T17 + T55)
// ============================================================================
// Andras tips-INNEHÅLL får visas FÖRST efter respektive deadline (avspark/grupp-
// start/slot-avspark). FÖRE deadline ska bara mitt EGET tips synas. Detta är ett
// ANTI-FUSK-krav: ingen ska kunna se vad kompisarna gissat innan man själv låst.
//
// TVÅ LAGER skyddar det (samma modell som T15/T16):
//   1. SERVER-SIDE (RLS, det RIKTIGA skyddet, bevisat i T15/T16): andras tips-
//      RADER finns inte ens i svaret förrän deadline passerat. Så listRoom*-API:t
//      returnerar redan bara avslöjade (+ egna) tips. Klienten KAN inte se ett
//      dolt tips även om denna gate vore fel.
//   2. KLIENT-SIDAN (denna gate, för VISNINGEN): vi visar avslöjande-VYN bara för
//      matcher/slots vars deadline passerat, så UI:t inte påstår "alla har tippat
//      X" på en match där bara mitt eget tips råkar finnas i svaret. Gaten gör att
//      vyn är SANN mot låst-läget, den är inte säkerhetsspärren (RLS är det).
//
// Gaten jämför mot en INJICERBAR `now` (default nuet), samma mönster som
// isMatchLocked (T15) och tipsvyns useDeadlineTick, så UI-tester kan styra "nu"
// och låset flippar utan omladdning (minut-tick).
//
// ============================================================================
// T55 (#96): AVSLÖJA VID AVSPARK, INTE FÖRST VID SLUTSIGNAL
// ============================================================================
// BUGG (Daniels rapport, öppningsmatchen): "matchen startade men man ser inte vad
// de andra tippat". ROTORSAK: denna funktion krävde TIDIGARE BÅDE låst OCH avgjort
// (facit fanns), så en LÅST men PÅGÅENDE match (avspark passerad, status 'live')
// hoppades över, avslöjandet dök upp först efter SLUTSIGNAL. Men sekretessen
// släpper redan vid AVSPARK (RLS-villkoret är kickoff, inte slutresultat).
//
// FIX: avslöja varje LÅST match (avspark passerad). FACIT-delen är NULLABLE:
//   - PÅGÅR (låst, inget facit än): visa allas tips, status 'live', INGA poäng
//     (ärligt "pågår", vi gissar aldrig poäng på en oavgjord match, HARD T55).
//   - FÄRDIG (låst + facit finns): visa allas tips + facit + poäng + varför, som
//     förut.
// `status`-diskriminanten gör det STRUKTURELLT omöjligt att läsa poäng på en
// pågående match (en 'live'-RevealedMatch har inget `actual`, och dess picks har
// inga poäng-fält), samma typ-kontrakt-anda som domänens Match-union.

import type { Match } from '../../domain/types';
import type { Prediction } from '../../data/predictions';
import {
  isMatchLocked,
  scorePrediction,
  pointTypeOf,
  type MatchPointType,
  type Scoreline,
} from '../../data/predictions';
import type { MatchFacit } from './derive-facit';

/**
 * En medlems tips på en LÅST men PÅGÅENDE match: vem och vad de gissade. INGA poäng
 * (matchen är inte avgjord, så det finns inget facit att poängsätta mot, HARD T55).
 */
export interface PendingMatchPick {
  userId: string;
  displayName: string;
  /** Medlemmens tippade ordinarie målställning. */
  predicted: Scoreline;
}

/** Ett enskilt avslöjat match-tips på en FÄRDIG match: vem, vad, och hur många poäng. */
export interface RevealedMatchPick extends PendingMatchPick {
  /** Poäng tipset gav mot facit (3 exakt / 1 utfall / 0 miss). */
  points: number;
  /**
   * VARFÖR tipset gav sin poäng (T46): exakt resultat / rätt utfall / miss. Härledd ur
   * SAMMA sanning som `points` (pointTypeOf, score.ts), så siffran och orsaken aldrig
   * kan drifta. UI:t visar etiketten ("Exakt resultat +3") ur denna typ.
   */
  pointType: MatchPointType;
}

/** De fält ett avslöjande bär oavsett om matchen pågår eller är färdig. */
interface RevealedMatchBase {
  matchId: string;
  /** Lag-id (Team.id) för hemma/borta, för UI:ts namn-/flagg-rendering. */
  homeTeamId: string | null;
  awayTeamId: string | null;
  /** Avsparkstid (ISO), för UI:t (när låstes tipsen). */
  kickoff: string;
}

/**
 * En LÅST men PÅGÅENDE match (avspark passerad, ej avgjord): allas tips synliga,
 * MEN inget facit och INGA poäng (matchen är inte klar). 'live' diskriminerar.
 */
export interface PendingRevealedMatch extends RevealedMatchBase {
  status: 'live';
  /** Inget facit än (matchen pågår). Diskriminanten gör detta strukturellt tomt. */
  actual: null;
  /** Allas tips på matchen (sorterade på namn, ingen poäng att sortera på än). */
  picks: PendingMatchPick[];
}

/** Avslöjandet för EN FÄRDIG match: facit + alla synliga medlemmars tips + poäng. */
export interface FinishedRevealedMatch extends RevealedMatchBase {
  status: 'finished';
  /** Det faktiska ordinarie resultatet (facit). */
  actual: Scoreline;
  /** Alla synliga medlemmars tips på matchen (sorterade på poäng fallande). */
  picks: RevealedMatchPick[];
}

/**
 * Ett avslöjande, DISKRIMINERAT på `status` (samma anda som domänens Match-union):
 *   - 'live'     = låst men pågår, allas tips synliga, INGEN poäng (actual: null).
 *   - 'finished' = avgjord, allas tips + facit + poäng + varför.
 * En konsument narrowar på `status`, så poäng kan strukturellt bara läsas på en
 * färdig match (en 'live'-match har vare sig `actual` eller poäng-fält på sina picks).
 */
export type RevealedMatch = PendingRevealedMatch | FinishedRevealedMatch;

/** Visningsnamn-uppslag (userId -> displayName) för avslöjande-raderna. */
export type DisplayNames = ReadonlyMap<string, string>;

/** Slå upp visningsnamnet för ett userId, faller tillbaka på userId (ingen krasch). */
function nameFor(userId: string, names: DisplayNames): string {
  return names.get(userId) ?? userId;
}

/**
 * Bygg avslöjande-vyn: för varje LÅST match (avspark passerad) lista alla synliga
 * medlemmars tips. Facit/poäng-delen är NULLABLE (T55, #96):
 *   - LÅST men PÅGÅR (inget facit): status 'live', allas tips synliga, INGA poäng
 *     (sekretessen släpper vid avspark, men poäng gissas aldrig på oavgjort, HARD).
 *   - LÅST + AVGJORD (facit finns): status 'finished', allas tips + facit + poäng.
 *
 * SEKRETESS (HARD): en OLÅST match (avspark inte passerad) avslöjas ALDRIG, oavsett
 * om facit/tips råkar finnas i datan. now >= kickoff är den enda grinden för synlighet.
 *
 * @param matches    Den delade matchlistan (för lag-id + kickoff per match).
 * @param facit      Avgjorda matchers facit (derive-facit.matches). Saknad = pågår.
 * @param predictions Alla SYNLIGA match-tips i rummet (RLS gav bara avslöjade + egna).
 * @param names      userId -> visningsnamn.
 * @param now        Nuet (injicerbart för test/determinism), default = nuet.
 * @returns          Avslöjade matcher i matchlistans ordning, varje med sorterade picks.
 */
export function buildMatchReveal(
  matches: readonly Match[],
  facit: readonly MatchFacit[],
  predictions: readonly Prediction[],
  names: DisplayNames,
  now: Date = new Date()
): RevealedMatch[] {
  const facitByMatchId = new Map(facit.map((f) => [f.matchId, f]));
  const predictionsByMatchId = new Map<string, Prediction[]>();
  for (const pred of predictions) {
    const bucket = predictionsByMatchId.get(pred.matchId);
    if (bucket) {
      bucket.push(pred);
    } else {
      predictionsByMatchId.set(pred.matchId, [pred]);
    }
  }

  const revealed: RevealedMatch[] = [];
  for (const match of matches) {
    // SEKRETESS-GATEN (HARD): bara om avspark passerat (samma lås som tips-skrivningen).
    // En OLÅST match avslöjas aldrig, även om facit/tips råkar finnas i datan.
    if (!isMatchLocked(match.kickoff, now)) {
      continue;
    }

    const base = {
      matchId: match.id,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      kickoff: match.kickoff,
    };
    const matchPredictions = predictionsByMatchId.get(match.id) ?? [];
    const matchFacit = facitByMatchId.get(match.id);

    if (!matchFacit) {
      // LÅST men PÅGÅR: visa allas tips, INGA poäng (ärligt "pågår", HARD T55). Sortera
      // bara på namn (det finns ingen poäng att sortera på än).
      const picks: PendingMatchPick[] = matchPredictions.map((pred) => ({
        userId: pred.userId,
        displayName: nameFor(pred.userId, names),
        predicted: { homeGoals: pred.homeGoals, awayGoals: pred.awayGoals },
      }));
      picks.sort((a, b) => a.displayName.localeCompare(b.displayName, 'sv'));
      revealed.push({ ...base, status: 'live', actual: null, picks });
      continue;
    }

    // LÅST + AVGJORD: visa allas tips + facit + poäng + varför (som förut).
    const picks: RevealedMatchPick[] = matchPredictions.map((pred) => {
      const predicted: Scoreline = { homeGoals: pred.homeGoals, awayGoals: pred.awayGoals };
      return {
        userId: pred.userId,
        displayName: nameFor(pred.userId, names),
        predicted,
        points: scorePrediction(predicted, matchFacit.actual),
        // Samma facit, samma sanning: typen härleds ur pointTypeOf, inte ur points-siffran.
        pointType: pointTypeOf(predicted, matchFacit.actual),
      };
    });
    // Sortera picks på poäng fallande, sen namn (stabil, förutsägbar ordning).
    picks.sort((a, b) =>
      b.points !== a.points ? b.points - a.points : a.displayName.localeCompare(b.displayName, 'sv')
    );

    revealed.push({ ...base, status: 'finished', actual: matchFacit.actual, picks });
  }
  return revealed;
}
