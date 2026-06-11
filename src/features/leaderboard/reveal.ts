// Tips-AVSLÖJANDE: vilka tips visas, för vilken match/slot, och med vad (T17, #17).
// REN funktion, inget I/O, ingen React, fristående testbar.
//
// ============================================================================
// AVSLÖJANDE-MODELLEN (HARD, sekretess, dokumenterad i docs/decisions.md T17)
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

import type { Match } from '../../domain/types';
import type { Prediction } from '../../data/predictions';
import { isMatchLocked, scorePrediction, type Scoreline } from '../../data/predictions';
import type { MatchFacit } from './derive-facit';

/** Ett enskilt avslöjat match-tips: vem, vad de gissade, och hur många poäng det gav. */
export interface RevealedMatchPick {
  userId: string;
  displayName: string;
  /** Medlemmens tippade ordinarie målställning. */
  predicted: Scoreline;
  /** Poäng tipset gav mot facit (3 exakt / 1 utfall / 0 miss). */
  points: number;
}

/** Avslöjandet för EN avgjord match: facit + alla synliga medlemmars tips + poäng. */
export interface RevealedMatch {
  matchId: string;
  /** Lag-id (Team.id) för hemma/borta, för UI:ts namn-/flagg-rendering. */
  homeTeamId: string | null;
  awayTeamId: string | null;
  /** Avsparkstid (ISO), för UI:t (när låstes tipsen). */
  kickoff: string;
  /** Det faktiska ordinarie resultatet (facit). */
  actual: Scoreline;
  /** Alla synliga medlemmars tips på matchen (sorterade på poäng fallande). */
  picks: RevealedMatchPick[];
}

/** Visningsnamn-uppslag (userId -> displayName) för avslöjande-raderna. */
export type DisplayNames = ReadonlyMap<string, string>;

/**
 * Bygg avslöjande-vyn: för varje match som BÅDE är låst (deadline passerad) OCH
 * har ett facit (avgjord), lista alla synliga medlemmars tips + poäng.
 *
 * Att kräva BÅDE låst OCH avgjort är medvetet:
 *   - LÅST (now >= kickoff): sekretess-gaten, annars visas tips-innehåll för tidigt.
 *   - AVGJORD (finns i facit): först då finns ett faktiskt resultat att jämföra
 *     tipsen mot och visa poäng. En låst men ej spelad match (avspark passerad,
 *     matchen pågår) har inget slutresultat än, så den hör inte i avslöjande-vyn.
 *
 * @param matches    Den delade matchlistan (för lag-id + kickoff per match).
 * @param facit      Avgjorda matchers facit (derive-facit.matches).
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
    const matchFacit = facitByMatchId.get(match.id);
    if (!matchFacit) {
      continue; // ej avgjord -> inget att avslöja poäng mot
    }
    // SEKRETESS-GATEN: bara om avspark passerat (samma lås som tips-skrivningen).
    if (!isMatchLocked(match.kickoff, now)) {
      continue;
    }

    const picks: RevealedMatchPick[] = (predictionsByMatchId.get(match.id) ?? []).map((pred) => {
      const predicted: Scoreline = { homeGoals: pred.homeGoals, awayGoals: pred.awayGoals };
      return {
        userId: pred.userId,
        displayName: names.get(pred.userId) ?? pred.userId,
        predicted,
        points: scorePrediction(predicted, matchFacit.actual),
      };
    });
    // Sortera picks på poäng fallande, sen namn (stabil, förutsägbar ordning).
    picks.sort((a, b) =>
      b.points !== a.points ? b.points - a.points : a.displayName.localeCompare(b.displayName, 'sv')
    );

    revealed.push({
      matchId: match.id,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      kickoff: match.kickoff,
      actual: matchFacit.actual,
      picks,
    });
  }
  return revealed;
}
