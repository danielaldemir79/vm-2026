// "Vad krävs"-motorn: live-scenarier för sista gruppomgången (T11, SPEC §5).
//
// Givet en grupps nuvarande tabelläge + dess ÅTERSTÅENDE matcher, klassar
// motorn varje lag som KLAR vidare / UTE / BEROR PÅ för att avancera (de mest
// spännande minuterna i ett VM). REN funktion, inget I/O, ingen React, så den
// är enhetstestbar fristående och kan köras om vid varje resultatinmatning.
//
// ============================================================================
// ARKITEKTUR: enumerera utfall, ÅTERANVÄND compute-standings (bygg ALDRIG egen
// tabellogik). För en grupp med n återstående matcher finns 3^n W/D/L-utfall
// (vinst/oavgjort/förlust per match). För VARJE utfall bygger vi syntetiska
// färdiga matcher och låter den redan verifierade computeStandings (FIFA-
// tiebreakers inkl. re-iteration, T3/T4) räkna tabellen. Lagets placering i
// varje utfall klassas, och de aggregeras till en ärlig slutsats per lag.
//
// VIKTIG APPROXIMATION (var den ligger, åt vilket håll den är konservativ):
// en W/D/L-enumeration fixerar POÄNGEN exakt men INTE målsiffrorna. Exakta mål
// påverkar tiebreaks (målskillnad b, gjorda mål c). Därför kan ett och samma
// W/D/L-utfall ge OLIKA placering beroende på målmarginaler när lag står lika
// på poäng. Vi hanterar det KONSERVATIVT:
//   - "KLAR vidare" påstås BARA när laget är topp-2 i ALLA utfall på ett sätt
//     som ingen målmarginal kan rubba (poängen ensam räcker, se securelyTop2).
//   - "UTE" påstås BARA när laget är utanför topp-2 i ALLA utfall på ett sätt
//     ingen marginal kan rädda (>= 2 lag har STRIKT mer poäng).
//   - Allt målsiffer-känsligt blir "BEROR PÅ" (med villkoret "beror på
//     målskillnad" där det gäller). Approximationen lutar alltså ALLTID mot
//     "beror på", ALDRIG mot ett falskt "klart"/"ute". Detta är medvetet (HARD:
//     gissa aldrig en garanti W/D/L inte avgör). Se docs/decisions.md T11.
//
// BÄSTA-TREA-VÄGEN (kopplad till T4, korsar grupper): en trea kvalificerar om
// den rankas topp-8 av de 12 grupptreorna (FIFA Article 13, rank-third-places.ts).
// VILKA 8 beror på ALLA tolv gruppers resultat. Att simulera alla gruppers
// kombinationer är en kombinatorisk explosion (gissa-aldrig vs. över-claim), så
// trea-vägen uttrycks KVALITATIVT: "kan sluta trea, men om det räcker beror på
// andra grupper". Vi påstår ALDRIG att en viss poäng som trea "räcker" (det går
// inte att bevisa utan de andra grupperna). Se decisions.md T11.
// ============================================================================

import type { GroupId, Match, MatchResult, ScheduledMatch } from '../../domain/types';
import { computeStandings } from '../../domain/standings/compute-standings';

/**
 * Övre gräns för antal återstående gruppmatcher motorn enumererar (3^n utfall).
 *
 * I VM 2026-formatet (4 lag, varje lag spelar 3 matcher) har en grupp exakt 6
 * matcher totalt och som mest 2 ÅTERSTÅENDE i sista omgången (de två sista
 * spelas samtidigt), dvs 3^2 = 9 utfall. Tasken är "sista gruppomgången".
 *
 * Vi tillåter ändå upp till 3 (3^3 = 27 utfall) som en liten marginal för en
 * grupp där en hel omgång saknas, men FAIL-LOUD:ar (kastar) över det: 3^n växer
 * exponentiellt och en oväntat stor n (felaktig data, framtida format-ändring)
 * ska larma HÖGT, inte tyst beräkna en explosion (PRINCIPLES §8). Garantin bor
 * i motorn (assertEnumerable) och randtestas n-1/n/n+1 (lessons:
 * uttommande-test-vaktar-svagare-invariant, Förekomst 3: tröskel-garantier ska
 * bo i funktionen och randtestas n-1/n/n+1).
 */
export const MAX_REMAINING_MATCHES = 3;

/** Antal lag som går vidare DIREKT per grupp (etta + tvåa, SPEC §5). */
const DIRECT_QUALIFY_RANK = 2;

/** Status-klassningen för ett lags avancemang. */
export type AdvancementStatus =
  // Topp-2 i ALLA återstående utfall, oberoende av målskillnad: klar för slutspel.
  | 'qualified'
  // Utanför topp-2 i ALLA utfall (>= 2 lag har strikt mer poäng) OCH kan inte ens
  // sluta trea: matematiskt ute (kan inte avancera på någon väg).
  | 'eliminated'
  // Allt däremellan: utfallet beror på återstående matcher (egna och/eller andras),
  // ev. på målskillnad, och/eller på trea-vägen (andra grupper). Bär villkorstext.
  | 'depends';

/**
 * En människo-läsbar slutsats för ett lag: status + en svensk villkorstext +
 * maskinläsbara flaggor (för UI:t/design-frontend att gruppera och styla).
 */
export interface TeamScenario {
  /** Laget (Team.id). */
  teamId: string;
  /** Lagets nuvarande placering i gruppen (1-baserad), ur den härledda tabellen. */
  currentRank: number;
  /** Aggregerad status (klar / ute / beror på). */
  status: AdvancementStatus;
  /** Svensk villkorstext, t.ex. "Vinst räcker för avancemang." (alltid satt). */
  condition: string;
  /**
   * Kan laget sluta topp-2 (etta/tvåa) i NÅGOT återstående utfall? (Driver
   * "kan fortfarande gå vidare direkt".)
   */
  canFinishTop2: boolean;
  /**
   * Kan laget sluta trea i NÅGOT utfall? (Trea-vägen kvalificerar om laget blir
   * en av de 8 bästa treorna, vilket beror på ANDRA grupper, se modulhuvudet.)
   */
  canFinishThird: boolean;
  /**
   * True när lagets öde i minst ett utfall avgörs av MÅLSKILLNAD (lag lika på
   * poäng i topp-2-striden). Då kan W/D/L inte ensamt klassa det, och status
   * blir 'depends'. Gör approximationens gräns SYNLIG för UI:t (ärlighet).
   */
  marginDependent: boolean;
}

/**
 * Vilken FAS gruppen är i (avgör hur scenarierna ska tolkas):
 *   - 'decided'    : färdigspelad, scenarierna är FACIT (etta/tvåa klara osv).
 *   - 'scenarios'  : sista omgången / få matcher kvar (n <= MAX_REMAINING_MATCHES),
 *                    motorn har enumererat och klassat varje lag (det egentliga
 *                    "vad krävs"-läget, tasken).
 *   - 'too-early'  : för många matcher kvar för att enumerera meningsfullt (n >
 *                    MAX). Detta är ett LEGITIMT produkt-läge (turneringen tidig),
 *                    INTE ett fel: "vad krävs"-scenarier hör hemma INFÖR sista
 *                    omgången. Lagen visas i tabellordning utan klassning. Skilt
 *                    från motorns FAIL-LOUD-vakt (assertEnumerable), som larmar på
 *                    OVÄNTAT stora n (data-defekt) om någon enumererar direkt.
 */
export type ScenarioPhase = 'decided' | 'scenarios' | 'too-early';

/** Hela gruppens scenario-bild: gruppen + fas + per-lag-slutsatserna. */
export interface GroupScenario {
  groupId: GroupId;
  /** Fasen (se ScenarioPhase): styr hur teams ska tolkas. */
  phase: ScenarioPhase;
  /** En slutsats per lag i gruppen, i nuvarande tabellordning (bäst först). */
  teams: TeamScenario[];
  /**
   * Är gruppen färdigspelad (inga återstående matcher)? Bekvämlighets-flagga,
   * ekvivalent med `phase === 'decided'`. Då är scenarierna FACIT (etta/tvåa
   * klara, trea beror på andra grupper, fyra ute), inte längre "om".
   */
  decided: boolean;
  /** Antal återstående (ospelade) gruppmatcher med kända lag. */
  remainingMatches: number;
}

/* ------------------------------------------------------------------ *
 * Utfalls-enumeration (3^n) + syntetiska matcher.
 * ------------------------------------------------------------------ */

/** Ett utfall för EN match ur hemmalagets perspektiv. */
type Outcome = 'home-win' | 'draw' | 'away-win';

const OUTCOMES: readonly Outcome[] = ['home-win', 'draw', 'away-win'];

/**
 * En återstående match vi kan tilldela ett utfall. Vi kräver kända lag (annars
 * kan utfallet inte tillskrivas lag); en ospelad match utan kända lag (skulle
 * inte hända i gruppspel) hoppas över i samlingen nedan.
 */
interface RemainingMatch {
  matchId: string;
  groupId: GroupId;
  homeTeamId: string;
  awayTeamId: string;
}

/**
 * Vakt (fail loud): vägra enumerera fler än MAX_REMAINING_MATCHES matcher.
 * 3^n växer exponentiellt, så en oväntat stor n ska larma HÖGT i stället för att
 * tyst beräkna en explosion. Garantin bor HÄR (i motorn), inte hos anroparen.
 */
// Exporterad enbart för att tröskel-garantin ska kunna randtestas DIREKT
// (n-1/n/n+1) per lessons "uttommande-test-vaktar-svagare-invariant" (Förekomst
// 3): tröskel-garantier ska bo i funktionen och randtestas. Det publika
// computeGroupScenario gatar normalt FÖRE den (too-early-fasen), så den hårda
// kast-grenen nås i praktiken bara vid en bruten invariant.
export function assertEnumerable(remainingCount: number, groupId: GroupId): void {
  if (remainingCount > MAX_REMAINING_MATCHES) {
    throw new Error(
      `Scenario-motorn vägrar enumerera ${remainingCount} återstående matcher i grupp ` +
        `${groupId} (max ${MAX_REMAINING_MATCHES}, dvs 3^${MAX_REMAINING_MATCHES} utfall). ` +
        `3^n växer exponentiellt; en så stor mängd är oväntad i sista gruppomgången ` +
        `(VM 2026: max 2 kvar) och tyder på felaktig data eller ändrat format.`
    );
  }
}

/**
 * Syntetiskt resultat för ett tilldelat utfall. Vi använder NEUTRALA marginaler
 * (1-0 / 1-1 / 0-1): exakta målsiffror får inte påverka KLAR/UTE-klassningen
 * (den approximationen hanteras separat via securelyTop2/definitelyOutOfTop2,
 * som BARA tittar på poäng). Marginalen finns bara så computeStandings får ett
 * giltigt resultat att räkna poäng ur; tiebreak-känsligheten fångas inte här
 * utan i poäng-resonemanget. Se modulhuvudets APPROXIMATION-not.
 */
function resultForOutcome(outcome: Outcome): MatchResult {
  switch (outcome) {
    case 'home-win':
      return { homeGoals: 1, awayGoals: 0 };
    case 'draw':
      return { homeGoals: 0, awayGoals: 0 };
    case 'away-win':
      return { homeGoals: 0, awayGoals: 1 };
  }
}

/** Bygg en syntetisk färdigspelad gruppmatch för ett tilldelat utfall. */
function syntheticMatch(rem: RemainingMatch, outcome: Outcome): Match {
  return {
    id: rem.matchId,
    stage: 'group',
    groupId: rem.groupId,
    homeTeamId: rem.homeTeamId,
    awayTeamId: rem.awayTeamId,
    kickoff: '2026-06-27T19:00:00Z',
    venue: 'scenario',
    result: resultForOutcome(outcome),
    status: 'finished',
  };
}

/**
 * Alla 3^n kombinationer av utfall för de återstående matcherna, som arrayer av
 * Outcome i samma ordning som `remaining`. Iterativ kartesisk produkt (ingen
 * rekursion), enkel och förutsägbar.
 */
function enumerateOutcomeCombos(remaining: readonly RemainingMatch[]): Outcome[][] {
  let combos: Outcome[][] = [[]];
  for (let i = 0; i < remaining.length; i += 1) {
    const next: Outcome[][] = [];
    for (const combo of combos) {
      for (const outcome of OUTCOMES) {
        next.push([...combo, outcome]);
      }
    }
    combos = next;
  }
  return combos;
}

/* ------------------------------------------------------------------ *
 * Poäng-resonemang per utfall (den konservativa kärnan).
 * ------------------------------------------------------------------ */

/** Poäng per lag i ETT utfall (teamId -> poäng), ur en härledd tabell. */
type PointsByTeam = ReadonlyMap<string, number>;

/**
 * Är laget SÄKERT topp-2 i detta utfall, OBEROENDE av målskillnad?
 *
 * Poängen är fix i utfallet, bara tiebreak (mål) är öppet. Laget är säkert
 * topp-2 om HÖGST 1 annat lag står >= dess poäng: även om varje sådant lag
 * vinner tiebreaken hamnar laget som värst på rank 2. Annars (2+ lag med >=
 * poäng) KAN målskillnad knuffa ner det till rank 3, alltså inte säkert.
 *
 * Konkret: `aheadOrEqual` = antal ANDRA lag med poäng >= lagets. Säkert topp-2
 * <=> aheadOrEqual <= 1. (Lag med STRIKT mer poäng ligger garanterat före; lag
 * med LIKA poäng KAN ligga före via tiebreak, så vi räknar dem konservativt som
 * "kan ligga före".)
 */
function securelyTop2(teamId: string, points: PointsByTeam): boolean {
  const own = points.get(teamId)!;
  let aheadOrEqual = 0;
  for (const [id, p] of points) {
    if (id !== teamId && p >= own) {
      aheadOrEqual += 1;
    }
  }
  return aheadOrEqual <= DIRECT_QUALIFY_RANK - 1;
}

/**
 * Är laget SÄKERT UTANFÖR topp-2 i detta utfall, OBEROENDE av målskillnad?
 *
 * Sant när minst 2 andra lag har STRIKT mer poäng: då ligger laget garanterat
 * på rank 3 eller sämre oavsett tiebreak (ingen marginal kan hoppa över ett lag
 * med fler poäng). Annars kan laget MÖJLIGEN nå topp-2 (via tiebreak eller för
 * att färre än 2 lag är strikt före), så det är inte säkert ute ur topp-2.
 */
function definitelyOutOfTop2(teamId: string, points: PointsByTeam): boolean {
  const own = points.get(teamId)!;
  let strictlyAhead = 0;
  for (const [id, p] of points) {
    if (id !== teamId && p > own) {
      strictlyAhead += 1;
    }
  }
  return strictlyAhead >= DIRECT_QUALIFY_RANK;
}

/**
 * Tre möjliga klassningar av ETT lag i ETT utfall, sett till topp-2:
 *   - 'secure-top2'    : säkert topp-2 (poängen räcker, marginal-oberoende)
 *   - 'secure-out'     : säkert utanför topp-2 (>= 2 lag strikt före)
 *   - 'margin-decides' : lag lika på poäng i topp-2-striden, MÅLSKILLNAD avgör
 */
type Top2Class = 'secure-top2' | 'secure-out' | 'margin-decides';

function classifyTop2(teamId: string, points: PointsByTeam): Top2Class {
  if (securelyTop2(teamId, points)) {
    return 'secure-top2';
  }
  if (definitelyOutOfTop2(teamId, points)) {
    return 'secure-out';
  }
  return 'margin-decides';
}

/**
 * KAN laget MÖJLIGEN nå minst en TREDJEPLATS (rank <= 3) i detta utfall, även med
 * gynnsam målskillnad? Sant om FÄRRE än 3 lag har STRIKT mer poäng: då är rank 3
 * (eller bättre) öppen via tiebreak. Är 3 lag strikt före är laget LÅST till
 * rank 4 oavsett marginal (sista placeringen), alltså ingen trea-chans.
 *
 * KONSERVATIVT (samma anda som securelyTop2/definitelyOutOfTop2): vi använder
 * STRIKT poäng-före, så en marginal ALDRIG kan göra ett "kan-bli-trea" till ett
 * falskt "ute". Driver 'eliminated'-grinden (ute = aldrig topp-2 OCH aldrig
 * ens en möjlig trea), så ett lag aldrig falskt klassas ute pga neutral marginal.
 */
function couldReachThird(teamId: string, points: PointsByTeam): boolean {
  const own = points.get(teamId)!;
  let strictlyAhead = 0;
  for (const [id, p] of points) {
    if (id !== teamId && p > own) {
      strictlyAhead += 1;
    }
  }
  return strictlyAhead < DIRECT_QUALIFY_RANK + 1;
}

/* ------------------------------------------------------------------ *
 * Per-utfall-utvärdering: härled tabell + lagens rank + poäng-klass.
 * ------------------------------------------------------------------ */

/**
 * Vad ett enskilt utfall säger om ett lag. Helt POÄNG-baserat: vi läser inte den
 * neutrala-marginal-ranken alls (den vore inte marginal-konservativ), utan
 * härleder topp-2/trea-möjligheterna ur poängen, så slutsatsen aldrig hänger på
 * den godtyckligt valda marginalen i syntetiska matcher (se modulhuvudet).
 */
interface OutcomeForTeam {
  /** Poäng-klassen (secure-top2 / secure-out / margin-decides). */
  top2Class: Top2Class;
  /** Kan laget nå rank <= 3 i detta utfall med gynnsam marginal (poäng-konservativt)? */
  couldBeThird: boolean;
}

/**
 * Utvärdera ETT utfall för ALLA lag: bygg de syntetiska matcherna, slå ihop med
 * de redan spelade gruppmatcherna, härled tabellen via computeStandings (DRY),
 * och returnera per lag dess POÄNG-baserade topp-2-/trea-klass. computeStandings
 * körs för att få korrekta poäng (samma motor som tabellerna); marginalen i de
 * syntetiska matcherna påverkar inte klassningen (den är poäng-baserad).
 */
function evaluateOutcome(
  teamIds: readonly string[],
  playedGroupMatches: readonly Match[],
  remaining: readonly RemainingMatch[],
  combo: readonly Outcome[]
): Map<string, OutcomeForTeam> {
  const synthetic = remaining.map((rem, i) => syntheticMatch(rem, combo[i]));
  const standings = computeStandings(teamIds, [...playedGroupMatches, ...synthetic]);

  const pointsByTeam: Map<string, number> = new Map(standings.map((r) => [r.teamId, r.points]));

  const result = new Map<string, OutcomeForTeam>();
  for (const row of standings) {
    result.set(row.teamId, {
      top2Class: classifyTop2(row.teamId, pointsByTeam),
      couldBeThird: couldReachThird(row.teamId, pointsByTeam),
    });
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * Aggregering över alla utfall -> status per lag.
 * ------------------------------------------------------------------ */

/** Det aggregerade läget för ett lag över ALLA utfall (innan villkorstext). */
interface Aggregate {
  /** Säkert topp-2 i ALLA utfall (poäng räcker överallt). */
  secureTop2Everywhere: boolean;
  /** Säkert utanför topp-2 i ALLA utfall (aldrig ens marginal-chans). */
  secureOutEverywhere: boolean;
  /**
   * Kan laget MÖJLIGEN nå topp-2 i NÅGOT utfall (POÄNG-konservativt, med gynnsam
   * marginal)? Sant om laget är säkert topp-2 ELLER målskillnads-avgjort i något
   * utfall. Skild från neutral-marginal-rank, så signalen aldrig falskt negativ.
   */
  couldBeTop2Somewhere: boolean;
  /**
   * Kan laget MÖJLIGEN nå minst rank 3 i NÅGOT utfall (POÄNG-konservativt, med
   * gynnsam marginal)? Skild från den neutral-marginal-rank tabellen visar:
   * denna driver 'eliminated'-grinden så ett lag aldrig falskt klassas ute pga
   * vald marginal.
   */
  couldBeThirdSomewhere: boolean;
  /** Minst ett utfall där MÅLSKILLNAD avgör topp-2 för laget. */
  marginDependent: boolean;
}

function aggregate(
  teamId: string,
  perOutcome: ReadonlyArray<Map<string, OutcomeForTeam>>
): Aggregate {
  let secureTop2Everywhere = true;
  let secureOutEverywhere = true;
  let couldBeTop2Somewhere = false;
  let couldBeThirdSomewhere = false;
  let marginDependent = false;

  for (const outcome of perOutcome) {
    const o = outcome.get(teamId)!;
    if (o.top2Class !== 'secure-top2') {
      secureTop2Everywhere = false;
    }
    if (o.top2Class !== 'secure-out') {
      secureOutEverywhere = false;
    }
    if (o.top2Class === 'margin-decides') {
      marginDependent = true;
    }
    // Topp-2 är MÖJLIGT i utfallet om laget är säkert topp-2 eller målskillnads-
    // avgjort (då kan rätt marginal lyfta det till rank 2). Poäng-konservativt.
    if (o.top2Class === 'secure-top2' || o.top2Class === 'margin-decides') {
      couldBeTop2Somewhere = true;
    }
    if (o.couldBeThird) {
      couldBeThirdSomewhere = true;
    }
  }

  return {
    secureTop2Everywhere,
    secureOutEverywhere,
    couldBeTop2Somewhere,
    couldBeThirdSomewhere,
    marginDependent,
  };
}

/* ------------------------------------------------------------------ *
 * Villkorstext (svenska): vad räcker för laget?
 * ------------------------------------------------------------------ */

/**
 * Avgör om en GIVEN utfalls-restriktion på lagets EGNA matcher räcker för säkert
 * topp-2 i ALLA utfall av övriga matcher. Används för "vinst räcker" /
 * "oavgjort räcker"-villkoren: vi låser lagets egna matcher till ett bestämt
 * utfall (vinst eller oavgjort) och kollar att laget är securelyTop2 oavsett hur
 * de ANDRA matcherna går. Konservativt: bara om det håller i ALLA övriga utfall.
 */
function ownResultGuarantees(
  teamId: string,
  ownOutcome: 'win' | 'draw',
  teamIds: readonly string[],
  playedGroupMatches: readonly Match[],
  remaining: readonly RemainingMatch[]
): boolean {
  // Inga egna återstående matcher -> villkoret är inte applicerbart.
  const ownIndices = remaining
    .map((rem, i) => ({ rem, i }))
    .filter(({ rem }) => rem.homeTeamId === teamId || rem.awayTeamId === teamId);
  if (ownIndices.length === 0) {
    return false;
  }

  // Enumerera bara ÖVRIGA matchers utfall; lagets egna låses till ownOutcome.
  const otherMatches = remaining.filter(
    (rem) => rem.homeTeamId !== teamId && rem.awayTeamId !== teamId
  );
  const otherCombos = enumerateOutcomeCombos(otherMatches);

  for (const otherCombo of otherCombos) {
    const synthetic: Match[] = [];
    let otherIdx = 0;
    for (const rem of remaining) {
      const isOwn = rem.homeTeamId === teamId || rem.awayTeamId === teamId;
      if (isOwn) {
        // Lås lagets match till önskat eget utfall (vinst/oavgjort).
        const outcome = ownOutcomeToMatchOutcome(rem, teamId, ownOutcome);
        synthetic.push(syntheticMatch(rem, outcome));
      } else {
        synthetic.push(syntheticMatch(rem, otherCombo[otherIdx]));
        otherIdx += 1;
      }
    }
    const standings = computeStandings(teamIds, [...playedGroupMatches, ...synthetic]);
    const points: Map<string, number> = new Map(standings.map((r) => [r.teamId, r.points]));
    if (!securelyTop2(teamId, points)) {
      return false;
    }
  }
  return true;
}

/** Översätt ett önskat EGET utfall (vinst/oavgjort) till match-Outcome (hemma/borta-perspektiv). */
function ownOutcomeToMatchOutcome(
  rem: RemainingMatch,
  teamId: string,
  ownOutcome: 'win' | 'draw'
): Outcome {
  if (ownOutcome === 'draw') {
    return 'draw';
  }
  return rem.homeTeamId === teamId ? 'home-win' : 'away-win';
}

/**
 * Bygg den svenska villkorstexten utifrån det aggregerade läget + vad lagets
 * egna resultat garanterar. Hålls kort och ärlig: vi lovar bara det vi bevisat
 * (konservativt), och pekar ut målskillnads-/andra-gruppers-beroendet explicit.
 */
function buildCondition(
  teamId: string,
  agg: Aggregate,
  teamIds: readonly string[],
  playedGroupMatches: readonly Match[],
  remaining: readonly RemainingMatch[]
): string {
  if (agg.secureTop2Everywhere) {
    return 'Klar för slutspel (etta eller tvåa, oavsett återstående resultat).';
  }
  if (agg.secureOutEverywhere && !agg.couldBeThirdSomewhere) {
    return 'Utslagen, kan inte längre avancera.';
  }
  if (agg.secureOutEverywhere && agg.couldBeThirdSomewhere) {
    return 'Kan inte längre nå topp-2, men kan sluta trea, om det räcker beror på de andra grupperna.';
  }

  // Laget KAN nå topp-2 men inte garanterat: hitta det enklaste egna kravet.
  const winGuarantees = ownResultGuarantees(teamId, 'win', teamIds, playedGroupMatches, remaining);
  const drawGuarantees = ownResultGuarantees(
    teamId,
    'draw',
    teamIds,
    playedGroupMatches,
    remaining
  );

  const parts: string[] = [];
  if (drawGuarantees) {
    parts.push('Oavgjort räcker för topp-2.');
  } else if (winGuarantees) {
    parts.push('Vinst räcker för topp-2.');
  } else {
    parts.push('Måste vinna och hoppas på andra matcher för topp-2.');
  }

  if (agg.marginDependent) {
    parts.push('I vissa fall avgör målskillnaden.');
  }
  if (agg.couldBeThirdSomewhere) {
    parts.push('Annars kan en tredjeplats räcka, beroende på de andra grupperna.');
  }
  return parts.join(' ');
}

/* ------------------------------------------------------------------ *
 * Hjälp: samla en grupps spelade + återstående matcher.
 * ------------------------------------------------------------------ */

/**
 * En match är en RÄKNINGSBAR gruppmatch för scenariot om den hör till gruppen.
 * Spelade (finished) räknas in i grunden, ospelade (scheduled/live) med KÄNDA
 * lag enumereras. En ospelad gruppmatch utan kända lag (data-defekt i gruppspel)
 * kan inte tillskrivas lag och hoppas över i enumerationen (men ändrar inte
 * grunden).
 */
function isGroupMatchFor(match: Match, groupId: GroupId): boolean {
  return match.stage === 'group' && match.groupId === groupId;
}

function collectRemaining(
  groupMatches: readonly Match[],
  groupId: GroupId
): { played: Match[]; remaining: RemainingMatch[] } {
  const played: Match[] = [];
  const remaining: RemainingMatch[] = [];
  for (const match of groupMatches) {
    if (match.status === 'finished') {
      played.push(match);
      continue;
    }
    // Ospelad: enumererbar bara om båda lagen är kända.
    if (match.homeTeamId !== null && match.awayTeamId !== null) {
      remaining.push({
        matchId: match.id,
        groupId,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
      });
    }
  }
  return { played, remaining };
}

/* ------------------------------------------------------------------ *
 * Publik API: scenariot för EN grupp.
 * ------------------------------------------------------------------ */

/**
 * Beräkna "vad krävs"-scenariot för en grupp.
 *
 * @param teamIds       Lagen i gruppen (Team.id). Tabellen härleds över dem.
 * @param allMatches    Alla matcher (motorn filtrerar själv till gruppens egna).
 * @param groupId       Gruppen att analysera.
 * @returns             En GroupScenario med en fas (decided/scenarios/too-early)
 *                      + per-lag-slutsatser i nuvarande tabellordning.
 *
 * Tre faser, alla utan undantag (kastar INTE): färdigspelad (facit), sista
 * omgången (n <= MAX, enumererat), eller för tidigt (n > MAX, ingen klassning,
 * ett legitimt produkt-läge inför sista omgången). FAIL-LOUD-vakten
 * (assertEnumerable) ligger inne i enumerations-grenen och larmar bara om vi
 * NÅR enumeringen med ett oväntat stort n (data-defekt), aldrig på det normala
 * tidiga läget som fångas FÖRE enumeringen.
 *
 * Funktionen muterar inte sina argument, så den är säker att köra om vid varje
 * resultatinmatning (live).
 */
export function computeGroupScenario(
  teamIds: readonly string[],
  allMatches: readonly Match[],
  groupId: GroupId
): GroupScenario {
  const groupMatches = allMatches.filter((m) => isGroupMatchFor(m, groupId));
  const { played, remaining } = collectRemaining(groupMatches, groupId);

  // Nuvarande tabell (bara spelade matcher) -> nuvarande rank + visningsordning.
  const currentStandings = computeStandings(teamIds, played);

  // INGEN matchdata alls (varken spelad eller schemalagd) = "för tidigt"/ej
  // startat, INTE "färdigspelad". Annars skulle en grupp utan matcher (tom data)
  // falskt klassas som decided -> facit på en tom tabell (alla 0 p, rank på
  // teamId-fallback). Vi gatar därför "decided" på att det FANNS spelade matcher.
  const noData = played.length === 0 && remaining.length === 0;
  if (noData) {
    return {
      groupId,
      phase: 'too-early',
      decided: false,
      remainingMatches: 0,
      teams: currentStandings.map((row) => tooEarlyScenario(row.teamId, row.rank)),
    };
  }

  const decided = remaining.length === 0;

  // FAS 1, färdigspelad: scenarierna är FACIT ur den färdiga tabellen (det fanns
  // spelade matcher och inga återstår).
  if (decided) {
    return {
      groupId,
      phase: 'decided',
      decided: true,
      remainingMatches: 0,
      teams: currentStandings.map((row) => decidedScenario(row.teamId, row.rank)),
    };
  }

  // FAS 3 (kollas FÖRE enumeringen), för tidigt: för många matcher kvar för att
  // enumerera meningsfullt. Ett legitimt produkt-läge (turneringen tidig), inte
  // ett fel: "vad krävs"-scenarier hör hemma inför sista omgången. Vi visar bara
  // tabelläget utan klassning, i stället för att enumerera 3^n (explosion).
  if (remaining.length > MAX_REMAINING_MATCHES) {
    return {
      groupId,
      phase: 'too-early',
      decided: false,
      remainingMatches: remaining.length,
      teams: currentStandings.map((row) => tooEarlyScenario(row.teamId, row.rank)),
    };
  }

  // FAS 2, sista omgången: enumerera 3^n utfall EN gång och klassa alla lag.
  // assertEnumerable är en defensiv invariant-vakt: vi har redan gatat på
  // remaining <= MAX ovan, så den kan bara kasta om någon bryter den invarianten
  // (fail loud mot data-defekt/oväntat stort n), aldrig i normalflödet.
  assertEnumerable(remaining.length, groupId);
  const combos = enumerateOutcomeCombos(remaining);
  const perOutcome = combos.map((combo) => evaluateOutcome(teamIds, played, remaining, combo));

  const teams: TeamScenario[] = currentStandings.map((row) => {
    const agg = aggregate(row.teamId, perOutcome);
    const status = statusFromAggregate(agg);
    const condition = buildCondition(row.teamId, agg, teamIds, played, remaining);
    return {
      teamId: row.teamId,
      currentRank: row.rank,
      status,
      condition,
      canFinishTop2: agg.couldBeTop2Somewhere,
      // Poäng-konservativt (inte neutral-marginal-rank): ett lag KAN sluta trea
      // om någon målskillnad kan placera det rank <= 3, så UI:t inte felaktigt
      // döljer trea-vägen pga den valda neutrala marginalen.
      canFinishThird: agg.couldBeThirdSomewhere,
      marginDependent: agg.marginDependent,
    };
  });

  return { groupId, phase: 'scenarios', decided: false, remainingMatches: remaining.length, teams };
}

/** Härled status ur det aggregerade läget (konservativt, se modulhuvudet). */
function statusFromAggregate(agg: Aggregate): AdvancementStatus {
  if (agg.secureTop2Everywhere) {
    return 'qualified';
  }
  // Ute BARA om laget aldrig kan nå topp-2 OCH inte ens kan sluta trea med
  // någon målskillnad (couldBeThirdSomewhere, POÄNG-konservativt). Vi använder
  // INTE den neutral-marginal-rank tabellen visar här: den vore för optimistisk
  // åt fel håll och kunde falskt klassa ett lag ute. Konservativ riktning =
  // hellre "beror på" än ett falskt "ute".
  if (agg.secureOutEverywhere && !agg.couldBeThirdSomewhere) {
    return 'eliminated';
  }
  return 'depends';
}

/**
 * Scenariot för ett lag i en FÄRDIGSPELAD grupp (facit, inte "om"). Etta/tvåa är
 * klara, fyra är ute, trea beror på de andra grupperna (bästa-trea-vägen).
 */
function decidedScenario(teamId: string, rank: number): TeamScenario {
  if (rank <= DIRECT_QUALIFY_RANK) {
    return {
      teamId,
      currentRank: rank,
      status: 'qualified',
      condition: rank === 1 ? 'Gruppvinnare, klar för slutspel.' : 'Grupptvåa, klar för slutspel.',
      canFinishTop2: true,
      canFinishThird: false,
      marginDependent: false,
    };
  }
  if (rank === DIRECT_QUALIFY_RANK + 1) {
    return {
      teamId,
      currentRank: rank,
      status: 'depends',
      condition:
        'Grupptrea, avancemang beror på om laget blir en av de 8 bästa treorna (andra grupper).',
      canFinishTop2: false,
      canFinishThird: true,
      marginDependent: false,
    };
  }
  return {
    teamId,
    currentRank: rank,
    status: 'eliminated',
    condition: 'Utslagen.',
    canFinishTop2: false,
    canFinishThird: false,
    marginDependent: false,
  };
}

/**
 * Scenariot för ett lag när det är FÖR TIDIGT att beräkna (för många matcher
 * kvar, fas 'too-early'). Vi påstår INGENTING om avancemang ännu (allt är öppet),
 * bara nuvarande tabellposition visas. Status 'depends' är ärligt: inget är
 * avgjort, men vi enumererar inte (gissa aldrig en garanti vi inte beräknat).
 */
function tooEarlyScenario(teamId: string, rank: number): TeamScenario {
  return {
    teamId,
    currentRank: rank,
    status: 'depends',
    condition: 'Scenarier visas inför sista gruppomgången, när färre matcher återstår.',
    // Allt är fortfarande möjligt tidigt i gruppspelet; vi påstår inte motsatsen.
    canFinishTop2: true,
    canFinishThird: true,
    marginDependent: false,
  };
}

/* ------------------------------------------------------------------ *
 * Bekvämlighet: ScheduledMatch-narrowing (för call-sites/tester).
 * ------------------------------------------------------------------ */

/** Är matchen en ospelad (scheduled) match? Liten typhjälpare för tester/UI. */
export function isScheduled(match: Match): match is ScheduledMatch {
  return match.status === 'scheduled';
}
