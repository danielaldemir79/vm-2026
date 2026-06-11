// Härled en SIMULERAD slutspelsbild UR grupp-tipsen (REN funktion, T51, #88).
//
// DANIELS ÖNSKAN (issue #88): "Tippade grupperna men fick ingen simulering på
// hur 16del kommer se ut osv. Tänkte att den kunde räkna ut det så man kan se
// potentiella finallag, alltså vilka som möter varandra." Detta är motorn bakom
// den vyn: ta användarens tippade gruppvinnare + tvåor och placera dem i
// slutspelsträdets slots, så man SER mötena ("2A mot 2B = Sverige mot Frankrike
// om mina tips slår in"). M73 = Runner-up A v Runner-up B (bracket-structure.ts,
// FIFA Article 12.6), alltså tvåan i grupp A mot tvåan i grupp B.
//
// SYSTERFUNKTION till deriveBracket (bracket/derive-bracket.ts), men driven av
// TIPS i stället för riktiga resultat. Vi ÅTERANVÄNDER hela den källhänvisade,
// hårt testade T4-strukturen (buildBracket / bracket-structure.ts, FIFA Article
// 12.6-12.11) och definierar INGEN ny slutspelsregel. Funktionen är ren (ingen
// React, muterar inte sina argument) och skriver ALDRIG någonstans: detta är en
// rent härledd vy, de riktiga resultaten/facit rörs inte (AC i #88).
//
// ============================================================================
// HARD, GISSA ALDRIG TREORNA (FIFA Annexe C):
//   Sextondelsfinalerna kräver också de 8 BÄSTA TREORNA, seedade enligt FIFA:s
//   Annexe C-tabell utifrån VILKA grupper treorna kom från. Grupp-tipsen bär
//   bara 1:a + 2:a per grupp, INTE treor. Vi har alltså ingen ärlig grund för
//   att seeda en trea. Därför lämnas varje bästa-trea-slot ÖPPEN (resolution
//   'open-third'): den visar sin behörighets-etikett ("3:a A/B/C/D/F") men
//   placerar ALDRIG ett gissat lag. Att gissa en trea och visa den som seedad
//   vore precis det facit-sken issue #88 förbjuder. Källa för treornas roll +
//   varför de inte kan härledas ur tipsen: docs/decisions.md (T51) + den
//   källhänvisade seed-third-places.ts/Annexe C.
//
// VARFÖR PROPAGERINGEN STANNAR VID SEXTONDELEN:
//   Tipsen säger vilka LAG som möts i sextondelsfinalen, men INTE vem som VINNER
//   en match (det är ett matchresultat, inte ett grupp-tips). Alltså kan inget
//   lag föras vidare till åttondelen ur tipsen, ens för en match där båda lagen
//   är kända. Senare rundor visas därför STRUKTURELLT ("Vinnare M73 mot Vinnare
//   M75"), så man ser VÄGEN mot finalen utan att vi hittar på vinnare. Det är
//   den ärliga gränsen för vad ett grupp-tips kan säga.
// ============================================================================

import type { GroupId, Team } from '../../domain/types';
import { GROUP_IDS } from '../../domain/types';
import { buildBracket, type BracketNode } from '../../domain/bracket/build-bracket';

// De kanoniska grupp-id:na (A..L) som ett Set för O(1)-validering av nycklar i
// picksByGroup. EN sanning (domain/types GROUP_IDS), aldrig hårdkodad här: en
// korrupt/legacy-nyckel i mapen (t.ex. ett gammalt rum eller en felskriven grupp)
// får ALDRIG räknas som en tippad grupp, annars kan tippedGroupCount överstiga 12
// ("13 av 12").
const VALID_GROUP_IDS: ReadonlySet<string> = new Set(GROUP_IDS);

/**
 * Hur en slot är bestämd i den TIPS-härledda bilden. Medvetet ett ANNAT
 * vokabulär än derive-bracket.ts SlotResolution ('resolved'/'possible'/'tbd'),
 * eftersom betydelsen skiljer sig: här finns inga riktiga resultat, bara tips.
 */
export type TipsSlotResolution =
  // Laget kommer ur ett grupp-TIPS (tippad 1:a eller 2:a) och är placerat.
  | 'tipped'
  // En bästa-trea-plats: lämnas ÖPPEN (gissas aldrig), bär bara sin
  // behörighets-etikett ("3:a A/B/C/D/F"). Avgörs av riktiga resultat (Annexe C).
  | 'open-third'
  // En senare runda (åttondel och framåt): laget kan inte härledas ur tipsen
  // (vem som vinner en match är inget grupp-tips säger). Visas strukturellt.
  | 'tbd';

/**
 * En slot i den tips-härledda bilden. Speglar bracket/derive-bracket.ts
 * BracketSlotState i FORM (samma fält-namn där de betyder samma sak) så ett
 * UI-lager känns igen, men `resolution` bär det tips-specifika vokabuläret och
 * `teamId` är satt ENBART för 'tipped' (aldrig en gissad trea).
 */
export interface TipsSlotState {
  /** Slot-id, t.ex. "M79-home" (från build-bracket). */
  id: string;
  /** Matchnummer-id, t.ex. "M79". */
  matchId: string;
  /** Hemma/borta. */
  side: BracketNode['side'];
  /** Rundan (round-of-32 ... final). */
  stage: BracketNode['stage'];
  /** Slot dit en vinnare skulle gå vidare, null för final/bronsmatch. */
  nextSlotId: string | null;
  resolution: TipsSlotResolution;
  /** Människo-läsbar positions-etikett (alltid satt), t.ex. "1:a grupp A". */
  label: string;
  /** Tippat lag (Team.id), satt ENBART vid 'tipped', annars null. */
  teamId: string | null;
}

/** En slutspelsmatch i den tips-härledda bilden: dess två slots. */
export interface TipsMatchState {
  matchId: string;
  stage: BracketNode['stage'];
  home: TipsSlotState;
  away: TipsSlotState;
}

/** Hela den tips-härledda bilden, i officiell match-ordning (M73 -> M104). */
export interface TipsBracketState {
  matches: TipsMatchState[];
  /**
   * Hur många av de 12 grupperna som har ETT FULLSTÄNDIGT tips (både 1:a och
   * 2:a). UI:t kan visa "10 av 12 grupper tippade" och uppmuntra att fylla i
   * resten. Härleds ur tipsen, lagras inte.
   */
  tippedGroupCount: number;
}

/**
 * Ett grupp-tips i den form denna motor behöver: gruppens 1:a och 2:a som
 * Team.CODE (versal, "BRA"). Det är EXAKT formen grupp-tips-storen bär
 * (GroupPrediction.winnerTeamId/runnerUpTeamId, TeamCode), så ingen översättning
 * krävs vid seamen. Identitets-rymden (code vs id) hanteras inne i funktionen
 * (se nedan), inte av anroparen.
 */
export interface GroupTipPick {
  /** Tippad gruppvinnare, FIFA-code (versal "BRA"). */
  winnerCode: string;
  /** Tippad grupptvåa, FIFA-code (versal "BRA"). */
  runnerUpCode: string;
}

/* ------------------------------------------------------------------ *
 * Etiketter, samma svenska positions-text som derive-bracket.ts (en
 * sanning vore idealt, men de bor i bracket-feature:n och vi vill inte
 * skapa ett korsberoende sim -> bracket för fyra trivialа strängar;
 * rule-of-three är inte nådd, KISS). Texten är identisk så UI:t ser likadant ut.
 * ------------------------------------------------------------------ */

function winnerLabel(group: GroupId): string {
  return `1:a grupp ${group}`;
}
function runnerUpLabel(group: GroupId): string {
  return `2:a grupp ${group}`;
}
function bestThirdLabel(groups: readonly GroupId[]): string {
  return `3:a ${groups.join('/')}`;
}
function matchWinnerLabel(matchId: string): string {
  return `Vinnare ${matchId}`;
}
function matchLoserLabel(matchId: string): string {
  return `Förlorare ${matchId}`;
}

/* ------------------------------------------------------------------ *
 * Identitets-rymd: tips bär CODE (versal), trädet/uppslag bär Team.id (gemen).
 * (Samma fälla som T16/F1: jämför/placera aldrig en code mot ett id utan att
 * normalisera, annars blir det tyst fel lag.) Vi slår upp tippad code i
 * lag-listan och placerar lagets Team.id, så slot.teamId är i SAMMA rymd som
 * bracket/derive-bracket.ts och UI:t (teamDisplayName tar Team.id). Hittas
 * koden inte (oväntat, tips är validerade mot lag-listan) lämnas slot:en TBD i
 * stället för att placera en obekräftad identitet.
 * ------------------------------------------------------------------ */

/**
 * Bygg ett uppslag från VERSAL FIFA-code -> Team.id ur lag-listan. Code
 * normaliseras till versal så ett tips i valfri kasus matchar (tips lagras
 * versalt, men vi är toleranta vid läsning, inte vid skrivning).
 */
function teamIdByCode(teams: readonly Team[]): Map<string, string> {
  const byCode = new Map<string, string>();
  for (const team of teams) {
    byCode.set(team.code.toUpperCase(), team.id);
  }
  return byCode;
}

/* ------------------------------------------------------------------ *
 * Huvud-härledningen.
 * ------------------------------------------------------------------ */

/**
 * Härled den simulerade slutspelsbilden ur grupp-tipsen.
 *
 * @param picksByGroup Mina grupp-tips per grupp (groupId "A".."L" -> 1:a/2:a som
 *                     code). En grupp utan (komplett) tips ger 'tbd'-slots för
 *                     den gruppens positioner, ingen gissning.
 * @param teams        Alla lag (för att översätta tippad CODE -> Team.id, så
 *                     slot.teamId är i samma rymd som UI:t väntar).
 * @returns            Hela trädet i officiell match-ordning (M73 -> M104) med
 *                     varje slots tips-tillstånd, + hur många grupper som tippats.
 *
 * INVARIANTER (vaktas av testerna):
 *   - En tippad 1:a/2:a hamnar i EXAKT den slot bracket-strukturen säger för dess
 *     grupp-position (M79-home = 1:a grupp A osv).
 *   - Varje bästa-trea-slot förblir 'open-third' (teamId null) OAVSETT tips.
 *   - Åttondel och framåt är 'tbd' (teamId null): tipsen ger ingen match-vinnare.
 *   - Funktionen muterar inte `teams`/`picksByGroup`.
 */
export function deriveTipsBracket(
  picksByGroup: ReadonlyMap<string, GroupTipPick>,
  teams: readonly Team[]
): TipsBracketState {
  const nodes = buildBracket();
  const idByCode = teamIdByCode(teams);

  // Räkna FULLSTÄNDIGA grupp-tips (både 1:a och 2:a satta) över BARA giltiga
  // grupp-id (A..L). Ett tips med tom sträng på någon sida räknas inte som
  // fullständigt (defensivt; storen levererar normalt båda, men en framtida källa
  // kan ge delvis ifyllt), och en nyckel som inte är ett kanoniskt grupp-id räknas
  // inte alls (annars kan en korrupt/legacy-nyckel ge "13 av 12").
  let tippedGroupCount = 0;
  for (const [groupId, pick] of picksByGroup) {
    if (!VALID_GROUP_IDS.has(groupId)) {
      continue;
    }
    if (pick.winnerCode !== '' && pick.runnerUpCode !== '') {
      tippedGroupCount += 1;
    }
  }

  // Slå upp ett tippat lag-id för en grupp-position (1 = vinnare, 2 = tvåa) ur
  // tipsen, översatt code -> Team.id. null om gruppen saknar tips, sidan är tom,
  // eller koden inte finns i lag-listan (ingen obekräftad placering).
  const tippedTeamId = (group: GroupId, rank: 1 | 2): string | null => {
    const pick = picksByGroup.get(group);
    if (!pick) {
      return null;
    }
    const code = rank === 1 ? pick.winnerCode : pick.runnerUpCode;
    if (code === '') {
      return null;
    }
    return idByCode.get(code.toUpperCase()) ?? null;
  };

  const matchStates: TipsMatchState[] = [];
  const nodesByMatch = new Map<string, { home?: BracketNode; away?: BracketNode }>();
  const matchOrder: string[] = [];
  for (const node of nodes) {
    let pair = nodesByMatch.get(node.matchId);
    if (!pair) {
      pair = {};
      nodesByMatch.set(node.matchId, pair);
      matchOrder.push(node.matchId);
    }
    pair[node.side] = node;
  }

  for (const matchId of matchOrder) {
    const pair = nodesByMatch.get(matchId)!;
    matchStates.push({
      matchId,
      stage: pair.home!.stage,
      home: buildTipsSlotState(pair.home!, tippedTeamId),
      away: buildTipsSlotState(pair.away!, tippedTeamId),
    });
  }

  return { matches: matchStates, tippedGroupCount };
}

/** Bygg en slots tips-tillstånd ur dess källa. */
function buildTipsSlotState(
  node: BracketNode,
  tippedTeamId: (group: GroupId, rank: 1 | 2) => string | null
): TipsSlotState {
  const base = {
    id: node.id,
    matchId: node.matchId,
    side: node.side,
    stage: node.stage,
    nextSlotId: node.nextSlotId,
  };

  const source = node.source;
  switch (source.kind) {
    case 'group-winner': {
      const teamId = tippedTeamId(source.group, 1);
      return {
        ...base,
        // Saknas tipset för gruppen är positionen känd men laget inte: behåll
        // positions-etiketten och lämna teamId null (resolution 'tbd'), gissa inte.
        resolution: teamId !== null ? 'tipped' : 'tbd',
        label: winnerLabel(source.group),
        teamId,
      };
    }
    case 'group-runner-up': {
      const teamId = tippedTeamId(source.group, 2);
      return {
        ...base,
        resolution: teamId !== null ? 'tipped' : 'tbd',
        label: runnerUpLabel(source.group),
        teamId,
      };
    }
    case 'best-third':
      // HARD: aldrig en gissad trea. Öppen platshållare, bär behörighets-etiketten.
      return {
        ...base,
        resolution: 'open-third',
        label: bestThirdLabel(source.eligibleGroups),
        teamId: null,
      };
    case 'match-winner':
      // Åttondel och framåt: tipsen ger ingen match-vinnare. Strukturell etikett.
      return {
        ...base,
        resolution: 'tbd',
        label: matchWinnerLabel(source.matchId),
        teamId: null,
      };
    case 'match-loser':
      // Bronsmatchen: semifinal-förlorare, lika ohärledbart ur tips.
      return {
        ...base,
        resolution: 'tbd',
        label: matchLoserLabel(source.matchId),
        teamId: null,
      };
  }
}
