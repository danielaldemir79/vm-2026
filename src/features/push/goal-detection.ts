// MÅL-DETEKTERING för push-notiser (T89, #182). REN logik (ingen IO, ingen Date.now(),
// ingen Deno-global), så den gissningskänsliga biten , "vilket mål är NYTT", "hur ska
// notisen formuleras", "vilket lag ska firas" , enhetstestas i Vitest mot diskriminerande
// data, och speglas till goal-push-dispatcher via den GENERERADE edge-mirror:n (edge-entry.ts).
//
// EN SANNING FÖR MÅL-HÄRLEDNING (SPEC §13.3 HARD, PRINCIPLES §4): vi parsar ALDRIG om
// event-strömmen här. Den DELADE extractGoals (data/match-stats) äger "vad är ett mål / vem
// är skytt / är det straff / är det egenmål" , exakt samma util som skytteligan (T87),
// live-topplistan och turneringsstatistiken (T88) konsumerar. Mål-push får ALDRIG visa en
// siffra som motsäger de vyerna, så den lutar sig mot samma extraktor (ingen parallell parse).
//
// =====================================================================================
// DOMÄNREGLER (KÄLLHÄNVISADE , gissas aldrig, lessons "lattgissad-domanregel"; se
// docs/decisions.md 2026-06-16 T89):
//
//  G1. NY MÅL = ett mål-event i NYA event-listan med en SIGNATUR som inte fanns i den GAMLA.
//      Signaturen (goalSignature) är STABIL över re-leverans/re-poll: minut + tillägg +
//      lag-id + skytt-id + skytt-namn + detail. Vi jämför signatur-MÄNGDER (gammal vs ny),
//      inte index , en re-poll som SKRIVER OM hela events-blobben (vanligt: API:t kompletterar
//      en tidigare match) får aldrig re-detektera ett redan känt mål. Detta är detekteringens
//      FÖRSTA dedup-lager (det andra, hårda, är notified_goals-tabellens UNIQUE i DB:n).
//
//  G2. SCORING-SIDAN HÄRLEDS UR STÄLLNINGS-DELTAT (home/away OLD->NEW), INTE ur event-lagets
//      id. VARFÖR: API-Footballs `goals.home/away` är det AUKTORITATIVA, redan korrekt
//      krediterade resultatet (egenmål inräknat åt det GYNNADE laget), medan ett egenmåls
//      event-lag pekar på det KONCEDERANDE laget (den team-krediterings-konventionen är
//      overifierad, se match-stats-header + decisions.md). Att läsa sidan ur ställnings-deltat
//      är därför egenmåls-SÄKERT: ökar home_goals firar vi hemmalaget, oavsett om målet var
//      ett egenmål av bortalaget. Källa: parse-live.ts facit-regel (`goals` = auktoritativt
//      resultat) + match-stats isOwnGoalDetail-doc (team-konventionen tolkas aldrig om).
//
//  G3. NOTIS-TEXTEN: titel "MÅL!", brödtext "<lag> <hemma>-<borta>" (det firade lagets namn +
//      den löpande ställningen i hemma-borta-ordning, t.ex. "Spanien 2-1"). Ställningen är
//      ALLTID hemma-borta (matchens fasta orientering), lag-namnet är det som GJORDE målet
//      (scoring-sidan ur G2). Egenmål: ställningen stämmer ändå (auktoritativ), och laget är
//      det GYNNADE (scoring-sidan), inte egenmåls-skytten , exakt vad en tittare förväntar sig.
// =====================================================================================

import { extractGoals } from '../../data/match-stats';
import type { MatchGoal } from '../../data/match-stats';
import type { LiveEvent } from '../../data/livescore';

/** Den ena sidan i en match (matchens fasta orientering, oberoende av vem som spelar). */
export type MatchSide = 'home' | 'away';

/** En löpande ställning (hemma-borta), som den persisteras i match_live_data. */
export interface MatchScore {
  /** Hemmamål, null mycket tidigt innan API:t satt det. */
  home: number | null;
  /** Bortamål, null mycket tidigt innan API:t satt det. */
  away: number | null;
}

/** Ett detekterat nytt mål, redo att avduppas (signatur) + formuleras (notis). */
export interface DetectedGoal {
  /** Den stabila signaturen (G1) , DB-dedup-nyckeln (notified_goals) byggs ur denna + matchId. */
  signature: string;
  /** Det underliggande målet (ur den delade extractGoals), bevarat för spårbarhet/test. */
  goal: MatchGoal;
}

/**
 * Bygg ett måls STABILA signatur (G1). Fält som är invarianta över en re-poll/re-leverans:
 * minut, tillägg, lag-id, skytt-id, skytt-namn (sista utvägen om id null), samt straff-/
 * egenmåls-flaggorna (de skiljer t.ex. ett straffmål från ett vanligt mål i samma minut , de
 * är det MatchGoal bär i stället för den råa detail-strängen, som inte finns i den delade
 * extractGoals-formen). INTE event-index (det skiftar när blobben skrivs om). null-fält skrivs
 * som tom sträng så signaturen är deterministisk (ingen "undefined").
 *
 * @param goal     ett mål ur extractGoals.
 * @param matchId  matchens id (scopar signaturen till matchen , samma minut i två matcher krockar inte).
 */
export function goalSignature(goal: MatchGoal, matchId: string): string {
  // Pipe-separerad, fält i fast ordning. Värden kan inte själva innehålla '|' meningsfullt
  // (minut/tillägg/id är tal, namn är API-text utan pipe, flaggorna är 0/1), ingen escaping behövs.
  return [
    matchId,
    goal.minute,
    goal.extra ?? '',
    goal.teamApiId,
    goal.scorerId ?? '',
    goal.scorerName ?? '',
    goal.isPenalty ? 'p' : '',
    goal.isOwnGoal ? 'o' : '',
  ].join('|');
}

/**
 * Diffa GAMLA mot NYA event-listan och returnera de mål som är NYA (signatur saknas i gamla).
 * Den delade extractGoals används på BÅDA sidor (samma måltolkning som skytteligan), så ingen
 * parallell parse. Ordningen bevaras kronologiskt (extractGoals sorterar redan på tid).
 *
 * Re-poll-säkert (G1): om NYA listan är en omskrivning som INNEHÅLLER alla gamla mål +
 * några nya, detekteras bara de nya. En NYA lista som är IDENTISK med den gamla ger [] (inga
 * nya mål). En NYA lista som av någon anledning är KORTARE (ett mål togs bort, t.ex. ett
 * VAR-annullerat mål, eller en korrigering) ger heller inga "nya" mål , vi notifierar ALDRIG
 * negativt (ett borttaget mål är inte en mål-händelse).
 *
 * @param oldEvents  events ur OLD-raden (kan vara tom: matchen hade inga events än).
 * @param newEvents  events ur NEW-raden.
 * @param matchId    matchens id (för signaturen).
 */
export function diffNewGoals(
  oldEvents: readonly LiveEvent[],
  newEvents: readonly LiveEvent[],
  matchId: string
): DetectedGoal[] {
  const oldSignatures = new Set(extractGoals(oldEvents).map((g) => goalSignature(g, matchId)));
  const detected: DetectedGoal[] = [];
  for (const goal of extractGoals(newEvents)) {
    const signature = goalSignature(goal, matchId);
    if (!oldSignatures.has(signature)) {
      detected.push({ signature, goal });
    }
  }
  return detected;
}

/**
 * Härled vilken SIDA som gjorde målet ur ställnings-deltat (G2): sidan vars mål ÖKADE
 * från OLD till NEW. Egenmåls-säkert (vi läser inte event-lagets id). Returnerar null om
 * deltat inte entydigt pekar ut EN sida (båda lika, ett null-värde, eller en minskning ,
 * då kan vi inte fira ett lag ärligt och faller tillbaka på en lag-neutral notis).
 *
 * VARFÖR delta och inte event-laget: se G2. Ett egenmål av bortalaget ökar HEMMALAGETS
 * `goals.home`; deltat pekar då rätt (hemma firas), medan event-laget (borta) pekar fel.
 *
 * @param oldScore  ställningen i OLD-raden.
 * @param newScore  ställningen i NEW-raden.
 */
export function scoringSideFromScoreDelta(
  oldScore: MatchScore,
  newScore: MatchScore
): MatchSide | null {
  // Saknas ett NEW-värde kan vi inte räkna delta -> ingen säker sida.
  if (newScore.home === null || newScore.away === null) {
    return null;
  }
  // null i OLD behandlas som 0 (matchen var 0-0 innan API:t satte fältet , ett första mål
  // tar då home/away från null till 1, vilket vi vill tolka som "den sidan gjorde mål").
  const oldHome = oldScore.home ?? 0;
  const oldAway = oldScore.away ?? 0;
  const homeDelta = newScore.home - oldHome;
  const awayDelta = newScore.away - oldAway;
  // Exakt EN sida ska ha ökat för ett entydigt mål. Ökar båda (osannolikt, två poll-steg
  // slogs ihop) eller ingen (eller en minskning, korrigering) -> ingen säker sida.
  if (homeDelta > 0 && awayDelta <= 0) {
    return 'home';
  }
  if (awayDelta > 0 && homeDelta <= 0) {
    return 'away';
  }
  return null;
}

/** Notisens visningsbara form (samma {title, body, url} som SW:n parsar via sw-payload). */
export interface GoalNotification {
  title: string;
  body: string;
  url: string;
}

/**
 * Formulera mål-notisen (G3). Titel "MÅL!", brödtext "<lag> <det firade lagets mål>-<motståndarens>".
 *
 * Ställningen orienteras SCORING-TEAM-FÖRST (det firade lagets siffra leder), så "Spanien 2-1"
 * läses naturligt som "Spanien gjorde mål, leder/står 2-1". Sidan (home/away) avgör vilken av
 * home_goals/away_goals som är "det firade lagets" siffra:
 *   - side 'home': firade laget = home -> "<lag> <home>-<away>".
 *   - side 'away': firade laget = away -> "<lag> <away>-<home>".
 *
 * Fallbacks (gissa aldrig):
 *   - Saknas sida ELLER lagnamn men ställningen finns: lag-neutral, ställningen i matchens fasta
 *     hemma-borta-ordning ("Mål! 2-1"), aldrig en påhittad lag-uppgift.
 *   - Saknas ställningen helt (något värde null): minimal "Mål i matchen!" (ett mål utan satt
 *     ställning , vi visar hellre något ärligt än inget).
 *
 * Svenska, inga em-dash (voice-regel); bindestrecket i ställningen är ett siffer-bindestreck.
 *
 * @param side       scoring-sidan (ur scoringSideFromScoreDelta), null om okänd.
 * @param score      den löpande ställningen (NEW-raden), hemma-borta.
 * @param teamName   det firade lagets namn (ur resolveCelebratedTeamName), null om okänt.
 * @param url        djuplänk (matchens väg i appen), default '/'.
 */
export function formatGoalNotification(
  side: MatchSide | null,
  score: MatchScore,
  teamName: string | null,
  url = '/'
): GoalNotification {
  // Ställningen saknas helt -> minimal, ärlig.
  if (score.home === null || score.away === null) {
    return { title: 'MÅL!', body: 'Mål i matchen!', url };
  }

  // Känd sida + känt lag: orientera scoring-team-först.
  if (side !== null && teamName !== null) {
    const ledande = side === 'home' ? score.home : score.away;
    const andra = side === 'home' ? score.away : score.home;
    return { title: 'MÅL!', body: `${teamName} ${ledande}-${andra}`, url };
  }

  // Känd ställning men okänd sida/lag -> lag-neutral, matchens fasta hemma-borta-ordning.
  return { title: 'MÅL!', body: `Mål! ${score.home}-${score.away}`, url };
}

/**
 * Härled vilket LAG som ska firas för ett detekterat mål, UTAN att luta sig mot en home/away-
 * ordning i blobben (match_live_data bär ingen home/away-flagg) och UTAN att tolka om egenmåls-
 * konventionen.
 *
 *  - VANLIGT mål: det firade laget ÄR mål-eventets lag (`goal.teamName`) , API attribuerar ett
 *    vanligt mål till det gjorda laget. Direkt, otvetydigt.
 *  - EGENMÅL: eventets lag är det KONCEDERANDE laget (overifierad team-konvention, tolkas aldrig
 *    om). Det GYNNADE laget är det ANDRA laget i matchen , vi hämtar dess namn ur ett annat lags
 *    event i samma match (`allEvents`). Hittas inget annat lag (matchens enda event är egenmålet)
 *    -> null (lag-neutral notis, gissa aldrig).
 *
 * Detta är egenmåls-säkert OCH ordnings-oberoende: vi behöver aldrig veta vilket lag som är
 * hemma, bara vilket lag som GJORDE målet (vanligt: eventets lag; egenmål: det andra laget).
 *
 * @param detected   det detekterade målet (ur diffNewGoals).
 * @param allEvents  alla NYA events (för att hitta motståndarlagets namn vid egenmål).
 */
export function resolveCelebratedTeamName(
  detected: DetectedGoal,
  allEvents: readonly LiveEvent[]
): string | null {
  const { goal } = detected;
  if (!goal.isOwnGoal) {
    return goal.teamName;
  }
  // Egenmål: gynnat lag = det ANDRA laget. Leta ett event från ett lag med ett ANNAT teamApiId.
  const other = allEvents.find((e) => e.teamApiId !== goal.teamApiId);
  return other ? other.teamName : null;
}
