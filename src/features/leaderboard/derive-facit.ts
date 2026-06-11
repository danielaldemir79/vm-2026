// Härled det FAKTISKA utfallet (facit) för poäng-aggregeringen (T17, #17).
// REN funktion, inget I/O, ingen React, fristående testbar.
//
// ============================================================================
// VAD ÄR "FACIT"? (modell-beslut, dokumenterat i docs/decisions.md T17)
// ============================================================================
// Rummets DELADE, inmatade resultat (room_match_results) är facit. Rummet lovar
// "ni fyller i matchresultaten tillsammans" (T14 KA-F3), så den delade match-
// listan (room-resultaten vävda ovanpå den källåkrade planen, via applyRoomResults)
// är den ENDA sanningen alla medlemmar delar. Grupptabeller och slutspelsträd
// HÄRLEDS i sin tur ur exakt samma matchlista (computeStandings/deriveBracket,
// SPEC §6 "härledd state"). Vi inför alltså ingen ny sanning här, vi läser den
// matchlista topplistan redan får och plockar ut de utfall som poängen jämför mot.
//
// ============================================================================
// LAG-IDENTITET (HARD, T16 F1-seamen): id (gemen) -> code (versal) FÖRE poäng
// ============================================================================
// Pool-tipsen LAGRAS som Team.CODE (versal "BRA", DB-constraint ^[A-Z]{3}$). Men
// det härledda facit (computeStandings.teamId, deriveBracket.winnerTeamId) bär
// Team.ID (gemen "bra", teamId(code)=code.toLowerCase()). Möts de två rymderna
// otransformerat i poäng-seamen ger det TYST 0 poäng för ALLA tips
// (`'BRA' === 'bra'` är false), exakt T16-lärdomen
// `tva-identitetsrymder-moter-forst-vid-otestad-poang-seam`.
//
// Vi mappar därför id -> CODE (versal, branded TeamCode) HÄR, vid facit-källan,
// via lag-listan, INNAN facit lämnar denna modul. Då bär BÅDA sidor av poäng-
// jämförelsen versal code: tipset (lagrat code) och facit (mappat till code). En
// gemen id kan strukturellt inte längre nå poängfunktionen, och kontraktet är
// explicit i typen (TeamCode), inte bara en docstring. bonus-score:s egen
// normalisering blir då defense-in-depth, inte den enda spärren.
//
// KÄLLA till regeln (gissas inte): reviewer-lärdom T16 F1 + docs/decisions.md
// T16 §"LAG-IDENTITET" + src/domain/team-code.ts.

import type { Group, Match, Team } from '../../domain/types';
import { asTeamCode, type TeamCode } from '../../domain/team-code';
import { computeStandings } from '../../domain/standings/compute-standings';
import { deriveBracket } from '../bracket/derive-bracket';
import { CHAMPION_SLOT_ID, type GroupOutcome } from '../../data/predictions';
import type { KnockoutStage } from '../../domain/bracket/bracket-structure';
import type { Scoreline } from '../../data/predictions';

/* ------------------------------------------------------------------ *
 * id -> code-mappning (facit-rymden -> tipsens lagrings-rymd).
 * ------------------------------------------------------------------ */

/**
 * Bygg ett uppslag Team.id (gemen) -> Team.code (versal, branded TeamCode) ur
 * lag-listan. EN sanning för mappningen, så facit-sidan kan översättas till
 * tipsens lagrings-rymd på ETT ställe (T16 F1-seamen). code:n DB-validerades på
 * write (^[A-Z]{3}$), så den brandas via asTeamCode (betrodd intern källa).
 */
function buildIdToCode(teams: readonly Team[]): ReadonlyMap<string, TeamCode> {
  const map = new Map<string, TeamCode>();
  for (const team of teams) {
    map.set(team.id, asTeamCode(team.code));
  }
  return map;
}

/* ------------------------------------------------------------------ *
 * Facit-formerna (allt i CODE-rymden efter mappning).
 * ------------------------------------------------------------------ */

/** Facit för EN avgjord gruppmatch: matchens id + den ordinarie målställningen. */
export interface MatchFacit {
  matchId: string;
  actual: Scoreline;
}

/** Facit för EN klar grupp: 1:an + 2:an som CODE (mappat ur den färdiga tabellen). */
export interface GroupFacit {
  groupId: string;
  /** GroupOutcome bär nu versal CODE (mappat ur teamId), inte gemen id. */
  actual: GroupOutcome;
}

/** Facit för EN avgjord slutspels-slot: vem som gick vidare, som CODE + rundan. */
export interface BracketFacit {
  slotId: string;
  stage: KnockoutStage;
  /** Laget som FAKTISKT gick vidare ur slotten (deriveBracket), som CODE. */
  advancingTeam: TeamCode;
}

/** Hela facit för poäng-aggregeringen, i CODE-rymden. */
export interface PoolFacit {
  /** Avgjorda gruppmatcher (för match-tipsen, scorePrediction). */
  matches: MatchFacit[];
  /** Klara grupper (för grupp-tipsen, scoreGroupPrediction). */
  groups: GroupFacit[];
  /** Avgjorda slutspels-slots (för bracket-tipsen, scoreBracketAdvance). */
  bracketSlots: BracketFacit[];
  /** VM-mästaren (final-vinnaren) som CODE, eller null tills finalen är avgjord. */
  champion: TeamCode | null;
}

/* ------------------------------------------------------------------ *
 * Härledning per facit-typ.
 * ------------------------------------------------------------------ */

/**
 * Avgjorda GRUPPMATCHER: bara färdigspelade gruppmatcher bidrar (ett tips ger
 * poäng FÖRST när matchen är avgjord, det är poäng-/avslöjande-modellen). En
 * scheduled/live-match har inget facit än och hoppas över.
 */
function deriveMatchFacit(matches: readonly Match[]): MatchFacit[] {
  const facit: MatchFacit[] = [];
  for (const match of matches) {
    if (match.stage !== 'group' || match.status !== 'finished') {
      continue;
    }
    facit.push({
      matchId: match.id,
      actual: { homeGoals: match.result.homeGoals, awayGoals: match.result.awayGoals },
    });
  }
  return facit;
}

/**
 * KLARA grupper: en grupp ger facit (1:a + 2:a) först när den är FÄRDIGSPELAD
 * (varje lag spelat sina matcher, samma villkor som bracket-låsningen). Vi
 * härleder ur computeStandings (FIFA-tiebreak, T3/T4), inte ur ett lagrat fält.
 *
 * En grupp räknas som klar när alla dess lag spelat 3 matcher (VM-formatets
 * envarsmöte i en 4-lagsgrupp, SPEC §5). Innan dess är 1:a/2:a inte avgjorda
 * och grupp-tipset ska inte poängsättas (annars rör sig poängen på en gissning).
 */
const MATCHES_PER_TEAM = 3;

function deriveGroupFacit(
  groups: readonly Group[],
  matches: readonly Match[],
  idToCode: ReadonlyMap<string, TeamCode>
): GroupFacit[] {
  const facit: GroupFacit[] = [];
  for (const group of groups) {
    const standings = computeStandings(group.teamIds, matches);
    const complete =
      standings.length > 0 && standings.every((row) => row.played >= MATCHES_PER_TEAM);
    if (!complete) {
      continue;
    }
    const winner = standings.find((r) => r.rank === 1);
    const runnerUp = standings.find((r) => r.rank === 2);
    if (!winner || !runnerUp) {
      continue;
    }
    facit.push({
      groupId: group.id,
      actual: {
        // id -> CODE vid facit-källan (T16 F1): tipset är lagrat som code, så
        // facit mappas till code, annars tyst 0 poäng. mapTeamId fail-loud:ar
        // om ett härlett id saknar code (brutet referens-kontrakt, inte tyst).
        winnerTeamId: mapTeamId(winner.teamId, idToCode),
        runnerUpTeamId: mapTeamId(runnerUp.teamId, idToCode),
      },
    });
  }
  return facit;
}

/**
 * Avgjorda SLUTSPELS-SLOTS + mästaren: deriveBracket ger vinnar-propageringen
 * (inkl. straffar, FIFA Art. 14). En slot ger facit först när dess match är
 * avgjord (winnerSlotId satt), då är "vem gick vidare" känt. Mästaren är
 * final-slottens (M104) vinnare.
 *
 * Vi använder deriveGroupTables-vägen INTE här: deriveBracket tar grupptabellerna
 * själv? Nej, deriveBracket tar (tables, matches). Vi bygger tabellerna via
 * computeStandings per grupp (samma som deriveGroupTables gör) och matar in.
 */
function deriveBracketFacit(
  groups: readonly Group[],
  matches: readonly Match[],
  idToCode: ReadonlyMap<string, TeamCode>
): { slots: BracketFacit[]; champion: TeamCode | null } {
  // Bygg grupptabellerna (samma härledning som deriveGroupTables, men vi har inte
  // Group-objekten i bracket-modulen; vi bygger dem här ur grupperna + matcherna).
  const tables = groups.map((group) => ({
    groupId: group.id,
    standings: computeStandings(group.teamIds, matches),
  }));

  const bracket = deriveBracket(tables, matches);

  const slots: BracketFacit[] = [];
  let champion: TeamCode | null = null;

  for (const matchState of bracket.matches) {
    if (matchState.winnerSlotId === null) {
      continue; // matchen ännu inte avgjord -> inget facit för slotten
    }
    // Vinnar-sloten (home eller away) bär det avancerande lagets teamId (id).
    const winnerSlot =
      matchState.home.id === matchState.winnerSlotId ? matchState.home : matchState.away;
    if (winnerSlot.teamId === null) {
      continue; // skydd: avgjord men lag ej resolvat (ska inte hända)
    }
    const advancingTeam = mapTeamId(winnerSlot.teamId, idToCode);
    slots.push({
      slotId: matchState.matchId,
      stage: matchState.stage,
      advancingTeam,
    });
    // Mästaren = final-matchens (stage 'final') vinnare.
    if (matchState.stage === 'final') {
      champion = advancingTeam;
    }
  }

  return { slots, champion };
}

/**
 * Mappa ett härlett facit-id (gemen Team.id) till versal CODE (TeamCode). FAIL
 * LOUD (PRINCIPLES §8) om id:t saknar en code i lag-listan: det är ett brutet
 * referens-kontrakt (facit refererar ett lag som inte finns), inte ett normalt
 * läge att maskera tyst. Maskeras det blir poängen tyst fel i stället för synligt.
 */
function mapTeamId(teamId: string, idToCode: ReadonlyMap<string, TeamCode>): TeamCode {
  const code = idToCode.get(teamId);
  if (code === undefined) {
    throw new Error(
      `[VM2026] Facit refererar lag-id "${teamId}" som saknar en code i lag-listan ` +
        `(brutet referens-kontrakt). Kan inte poängsätta tips mot ett okänt lag.`
    );
  }
  return code;
}

/* ------------------------------------------------------------------ *
 * Publik härledning.
 * ------------------------------------------------------------------ */

/**
 * Härled hela facit (avgjorda matcher, klara grupper, avgjorda slutspels-slots,
 * mästaren) ur lag + grupper + den delade matchlistan. Allt i CODE-rymden, redo
 * att jämföras mot de code-lagrade tipsen utan ytterligare mappning.
 *
 * @param teams    Lag-listan (för id -> code-mappningen, T16 F1-seamen).
 * @param groups   Grupperna (för grupp-/bracket-facit, gruppmedlemskap).
 * @param matches  Den DELADE matchlistan (rummets resultat vävda in), facit-källan.
 */
export function derivePoolFacit(
  teams: readonly Team[],
  groups: readonly Group[],
  matches: readonly Match[]
): PoolFacit {
  const idToCode = buildIdToCode(teams);
  const { slots, champion } = deriveBracketFacit(groups, matches, idToCode);
  return {
    matches: deriveMatchFacit(matches),
    groups: deriveGroupFacit(groups, matches, idToCode),
    bracketSlots: slots,
    champion,
  };
}

/** Re-exporterad för konsumenter (aggregeringen) som behöver champion-slot-id:t. */
export { CHAMPION_SLOT_ID };
