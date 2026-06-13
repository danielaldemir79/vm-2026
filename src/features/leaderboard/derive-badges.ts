// REN härledning av STREAKS + MÄRKEN för gamification (T19, #19). Inget I/O, ingen
// React, fristående testbar. ANTI-BLOAT: streaks och märken har INGEN egen DB-tabell,
// de RÄKNAS FRAM ur exakt samma data topplistan redan har (en medlems match-tips +
// det härledda facit + lag-listan), precis som tabeller/träd/poäng (SPEC §6 "härledd
// state"). Ett märke är bara en observation om redan-känd data, så det behöver ingen
// persistens.
//
// ============================================================================
// REGLERNA (otvetydiga, dokumenterade i docs/decisions.md T19, gissas inte)
// ============================================================================
// Alla regler bedöms BARA på AVGJORDA matcher (status 'finished'), samma
// poäng-/avslöjande-modell som topplistan: ett märke delas ut när dess match(er)
// är avgjorda, aldrig på en gissning om en oavgjord match.
//
//  * STREAK = antal RAKA avgjorda match-tips (i AVSPARKS-ordning) som gav poäng
//    (> 0, dvs minst rätt utfall). En miss (0p) BRYTER streaken. Vi rapporterar
//    BÅDE nuvarande (efterföljande löpande svit) OCH längsta (bästa sviten någonsin).
//    KÄLLA: score.ts (scorePrediction > 0 = rätt utfall/exakt) + issue #19 ("streaks").
//    Ordningen är matchernas kickoff (en sanning för "raka matcher i tid"), inte
//    inmatnings-ordning, så streaken är deterministisk och delbar.
//
//  * "KALLADE SKRÄLLEN" = minst EN exakt-träff (3p, pointTypeOf==='exact') på en
//    match där det laget medlemmen tippade skulle VINNA hade en SÄMRE FIFA-ranking
//    (numeriskt HÖGRE rank-tal) än motståndaren, OCH det laget faktiskt vann. Alltså:
//    du prickade exakt resultat i en match där din tippade vinnare var underdog enligt
//    FIFA-rankingen, och skrällen slog in. KÄLLA till rankingen (gissas ALDRIG): FIFA/
//    Coca-Cola Men's World Ranking (juniutgåvan 2026-06-11, uppdaterad i T69), committad
//    i team-profiles-source.txt, exponerad som Team.fifaRanking (T10). Lägre tal = bättre lag, så
//    "tippad vinnare har högre rank-tal än förloraren" = en skräll. Ett oavgjort eller
//    en match utan känd ranking på något lag ger ALDRIG märket (fail-safe, ingen gissning).
//
//  * "PERFEKT OMGÅNG" = en SVENSK kalenderdag (Europe/Stockholm) där medlemmen
//    tippade MINST 2 matcher som ALLA är avgjorda OCH ALLA gav poäng (> 0, rätt utfall
//    eller bättre). "Omgång" = en dags matcher. Minst 2 matcher så en ensam rätt-tippad
//    match inte räknas som en hel "omgång". KÄLLA: localDateKey (samma svensk-dag-
//    gruppering som dagsvyn T7) + score.ts (> 0 = rätt). En dag med en otippad eller oavgjord match
//    räknas inte som perfekt (vi kräver alla MEDLEMMENS tips den dagen rätt; en dag där
//    hen inte tippade alla matcher kan ändå vara perfekt på de hen tippade, så länge
//    minst 2 och alla avgjorda+rätt , se exakt regel i isPerfectRound nedan).

import type { Match, Team } from '../../domain/types';
import type { Prediction } from '../../data/predictions';
import { pointTypeOf, scorePrediction } from '../../data/predictions';
import { localDateKey } from '../daily/group-matches-by-day';

/** Minsta antal tippade matcher en kalenderdag för att en "perfekt omgång" ska räknas. */
export const PERFECT_ROUND_MIN_MATCHES = 2;

/** Identitet för varje märke (stabil nyckel, driver ikon/etikett-uppslag i UI:t). */
export type BadgeId = 'streak' | 'called-upset' | 'perfect-round';

/** Streak-måttet: nuvarande löpande svit + längsta sviten någonsin. */
export interface StreakInfo {
  /** Nuvarande svit: raka rätt-tips räknat BAKLÄNGES från senaste avgjorda matchen. */
  current: number;
  /** Längsta sviten av raka rätt-tips genom hela turneringen. */
  longest: number;
}

/** En medlems härledda gamification-status (streak + vilka märken hen tjänat). */
export interface MemberBadges {
  streak: StreakInfo;
  /** Har medlemmen tjänat "kallade skrällen" (minst en skräll-exakt-träff)? */
  calledUpset: boolean;
  /** Har medlemmen en "perfekt omgång" (minst en dag med alla tips rätt, >= 2)? */
  perfectRound: boolean;
}

/* ------------------------------------------------------------------ *
 * Indexering av indata.
 * ------------------------------------------------------------------ */

/** En avgjord match med sitt facit-utfall, i avsparks-ordning. Internt arbets-form. */
interface FinishedTip {
  matchId: string;
  kickoff: string;
  /** Poängen tipset gav (0/1/3, rå match-poäng). */
  points: number;
  /** Den svenska kalenderdagen matchen spelades (för perfekt-omgång-grupperingen). */
  dayKey: string;
}

/**
 * Bygg listan av medlemmens AVGJORDA match-tips i AVSPARKS-ordning, var och en med
 * poängen den gav. Bara matcher som BÅDE är 'finished' OCH medlemmen tippade ingår
 * (en otippad eller oavgjord match är inte en länk i streaken). Sorteras på kickoff
 * (en sanning för "raka matcher i tid"), så ordningen är deterministisk.
 */
function buildFinishedTips(
  matchPredictions: readonly Prediction[],
  matchesById: ReadonlyMap<string, Match>
): FinishedTip[] {
  const predByMatchId = new Map(matchPredictions.map((p) => [p.matchId, p]));
  const tips: FinishedTip[] = [];
  for (const match of matchesById.values()) {
    if (match.status !== 'finished') {
      continue; // inget facit än -> ingen länk i streaken/omgången
    }
    const pred = predByMatchId.get(match.id);
    if (pred === undefined) {
      continue; // medlemmen tippade inte denna match
    }
    tips.push({
      matchId: match.id,
      kickoff: match.kickoff,
      points: scorePrediction(
        { homeGoals: pred.homeGoals, awayGoals: pred.awayGoals },
        match.result
      ),
      dayKey: localDateKey(match.kickoff),
    });
  }
  // Avsparks-ordning (tidigast först): streaken är "raka matcher i tid".
  tips.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  return tips;
}

/* ------------------------------------------------------------------ *
 * Streak.
 * ------------------------------------------------------------------ */

/**
 * Räkna nuvarande + längsta streak av raka rätt-tips (poäng > 0) i avsparks-ordning.
 * En miss (0p) nollställer den löpande räknaren. "Nuvarande" = den efterföljande
 * sviten (raka rätt fram till den SENASTE avgjorda matchen); bröts senaste matchen
 * är nuvarande 0 även om en längre svit finns tidigare.
 */
function computeStreak(tips: readonly FinishedTip[]): StreakInfo {
  let current = 0;
  let longest = 0;
  for (const tip of tips) {
    if (tip.points > 0) {
      current += 1;
      if (current > longest) {
        longest = current;
      }
    } else {
      current = 0; // miss bryter sviten
    }
  }
  return { current, longest };
}

/* ------------------------------------------------------------------ *
 * "Kallade skrällen".
 * ------------------------------------------------------------------ */

/**
 * Tjänade medlemmen "kallade skrällen"? Sant om det finns MINST en avgjord match där
 * medlemmen prickade EXAKT resultat (3p) OCH det tippade VINNANDE laget var underdog
 * enligt FIFA-rankingen (sämre = numeriskt högre rank-tal än motståndaren) OCH det
 * laget faktiskt vann i ordinarie tid. Ett oavgjort tips/facit, eller saknad ranking
 * på något lag, ger aldrig märket (fail-safe, ingen gissning om underdog-status).
 *
 * VARFÖR exakt-träff (inte bara rätt utfall): en skräll-bock ska vara en BEDRIFT. Att
 * pricka exakt resultat när din tippade vinnare var sämre rankad är det starkaste,
 * minst tursamma utfallet, så vi knyter märket till exakt-träffen (3p), inte till en
 * 1-poängs rätt-gissning som kan vara mer tur.
 */
function hasCalledUpset(
  matchPredictions: readonly Prediction[],
  matchesById: ReadonlyMap<string, Match>,
  teamsById: ReadonlyMap<string, Team>
): boolean {
  const predByMatchId = new Map(matchPredictions.map((p) => [p.matchId, p]));
  for (const match of matchesById.values()) {
    if (match.status !== 'finished' || match.homeTeamId === null || match.awayTeamId === null) {
      continue;
    }
    const pred = predByMatchId.get(match.id);
    if (pred === undefined) {
      continue;
    }
    // Kräv EXAKT träff (3p): den starkaste, minst tursamma bedriften.
    if (
      pointTypeOf({ homeGoals: pred.homeGoals, awayGoals: pred.awayGoals }, match.result) !==
      'exact'
    ) {
      continue;
    }
    // Vem vann i ordinarie tid (ett oavgjort kan inte vara en "skräll-VINST")?
    const { homeGoals, awayGoals } = match.result;
    if (homeGoals === awayGoals) {
      continue;
    }
    const winnerTeamId = homeGoals > awayGoals ? match.homeTeamId : match.awayTeamId;
    const loserTeamId = homeGoals > awayGoals ? match.awayTeamId : match.homeTeamId;
    const winnerRank = teamsById.get(winnerTeamId)?.fifaRanking;
    const loserRank = teamsById.get(loserTeamId)?.fifaRanking;
    // Saknad ranking på något lag => kan inte avgöra underdog => ingen gissning (fail-safe).
    if (winnerRank === undefined || loserRank === undefined) {
      continue;
    }
    // Skräll = vinnaren var SÄMRE rankad (högre rank-tal) än förloraren. (Exakt-träffen
    // garanterar redan att medlemmen tippade detta resultat, alltså denna vinnare.)
    if (winnerRank > loserRank) {
      return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * "Perfekt omgång".
 * ------------------------------------------------------------------ */

/**
 * Har medlemmen minst EN "perfekt omgång"? Sant om någon svensk kalenderdag har
 * MINST PERFECT_ROUND_MIN_MATCHES av medlemmens AVGJORDA tips OCH ALLA dem gav poäng
 * (> 0). Vi grupperar medlemmens avgjorda tips per dag och letar en dag där alla är
 * rätt och antalet >= tröskeln. (En dag där hen inte tippade en av dagens matcher kan
 * ändå vara perfekt på de hen tippade , vi bedömer MEDLEMMENS tips, inte hela dagens
 * spelschema, eftersom en otippad match aldrig kan ge poäng åt hen ändå och annars
 * vore "perfekt omgång" praktiskt taget omöjlig att nå.)
 */
function hasPerfectRound(tips: readonly FinishedTip[]): boolean {
  // Gruppera per dag: { hits: antal rätt, total: antal avgjorda tips den dagen }.
  const byDay = new Map<string, { hits: number; total: number }>();
  for (const tip of tips) {
    const day = byDay.get(tip.dayKey) ?? { hits: 0, total: 0 };
    day.total += 1;
    if (tip.points > 0) {
      day.hits += 1;
    }
    byDay.set(tip.dayKey, day);
  }
  for (const day of byDay.values()) {
    if (day.total >= PERFECT_ROUND_MIN_MATCHES && day.hits === day.total) {
      return true; // minst tröskeln tips den dagen, alla rätt
    }
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Publik härledning.
 * ------------------------------------------------------------------ */

/**
 * Härled en medlems gamification-status (streak + märken) ur hens match-tips, den
 * delade matchlistan (facit-källan) och lag-listan (FIFA-ranking för skräll-märket).
 * REN: samma indata topplistan redan har, ingen ny sanning, ingen DB. Streaks/märken
 * bedöms på RÅ match-poäng (en skräll/streak är en bedrift på det rå tipset).
 *
 * @param matchPredictions  medlemmens match-tips (T15).
 * @param matches           den DELADE matchlistan (officiellt facit invävt).
 * @param teams             lag-listan (för FIFA-ranking, skräll-märket).
 */
export function deriveMemberBadges(
  matchPredictions: readonly Prediction[],
  matches: readonly Match[],
  teams: readonly Team[]
): MemberBadges {
  const matchesById = new Map(matches.map((m) => [m.id, m]));
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const tips = buildFinishedTips(matchPredictions, matchesById);

  return {
    streak: computeStreak(tips),
    calledUpset: hasCalledUpset(matchPredictions, matchesById, teamsById),
    perfectRound: hasPerfectRound(tips),
  };
}
