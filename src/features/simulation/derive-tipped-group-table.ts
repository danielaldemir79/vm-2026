// Härled EN grupps TIPPADE 1:a + 2:a UR användarens tippade matchresultat (REN
// funktion, T65, #119).
//
// DANIELS ÖNSKAN (issue #119): en knapp "Föreslå ur mina matchtips" i grupp-
// tippningen som FÖRIFYLLER gruppens 1:a + 2:a ur de tippade MATCHRESULTATEN, så
// man slipper gissa om manuellt. Detta är motorn bakom knappen: ta gruppens tippade
// matcher, räkna den simulerade tabellen och plocka rank 1 + rank 2.
//
// ============================================================================
// EN SANNING, INGEN PARALLELL TABELLRÄKNING (HARD, gissa aldrig, PRINCIPLES §4):
//   Vi ÅTERANVÄNDER exakt samma härledning som gruppspelsvyn och T64:s tre-seedning:
//   bygg syntetiska FÄRDIGSPELADE gruppmatcher ur tipsen (tippedGroupMatch, delad med
//   derive-tips-thirds.ts) -> deriveGroupTables -> computeStandings (FIFA Article 13:s
//   tiebreak). Ingen egen tabellräkning, ingen egen sortering, ingen egen rank-regel.
//   Den enda skillnaden mot facit-tabellen är INDATA (tippade resultat i stället för
//   riktiga), inte HUR vi räknar. Källa för tiebreaken: Regulations for the FIFA World
//   Cup 26 (May 2026), Article 13 (sid. 26-28), via computeStandings.
//
// PER-GRUPP-GRÄNS (skiljer sig MEDVETET från T64:s alla-12-krav, se decisions.md T65):
//   En grupps 1:a + 2:a beror BARA på den gruppens egna matcher (till skillnad från de
//   8 BÄSTA TREORNA, som kräver en kollisionsfri Annexe C-rad över ALLA 12 grupper, och
//   därför kräver att hela tipset är komplett). Därför är gränsen HÄR per grupp: en
//   grupps förslag är ärligt och fullständigt så snart DEN gruppens alla matcher är
//   tippade, oavsett om andra grupper är klara. Saknas en enda av gruppens matcher i
//   tipsen ges INGET förslag (complete: false), knappen är då inaktiverad med ärlig
//   text, aldrig en gissning ur en halv-tippad grupp (precis det T51/#88 förbjuder).
//   Antalet gruppmatcher HÄRLEDS ur matchplanen (inte hårdkodat 6), så gränsen följer
//   datan om formatet ändras.
//
// IDENTITETS-RYMD vid seamen (T16/F1-fällan, gissa aldrig):
//   computeStandings/deriveGroupTables bär lag som Team.id (GEMEN, "swe"). Men grupp-
//   tips-FORMULÄRET (GroupPredictionForm) väljer och lagrar lag som Team.CODE (VERSAL
//   "SWE", DB-constraint ^[A-Z]{3}$). Skulle vi mata en gemen id rakt in i formuläret
//   matchade inget <option value="SWE"> och valet blev tyst tomt. Därför översätter vi
//   id -> code HÄR vid seamen (spegelbilden av deriveTipsBracket:s code -> id), så
//   förslaget är i SAMMA rymd som formuläret väntar. Hittas ett lag inte i listan
//   (oväntat) ges inget förslag i stället för en obekräftad identitet (fail-safe).
// ============================================================================

import type { GroupId, Group, Match, Team } from '../../domain/types';
import { deriveGroupTables } from '../groups/derive-group-tables';
import { tippedGroupMatch, type MatchTipScore } from './derive-tips-thirds';

/**
 * Ett förslag på en grupps 1:a + 2:a, i FORMULÄRETS rymd (Team.CODE, versal "SWE").
 * Bara satt när gruppens ALLA matcher är tippade (annars ges null från härledningen).
 */
export interface GroupSuggestion {
  /** Föreslagen gruppvinnare (1:a), FIFA-code (versal "SWE"). */
  winnerCode: string;
  /** Föreslagen grupptvåa (2:a), FIFA-code (versal "SWE"). */
  runnerUpCode: string;
}

/**
 * Räkna hur många gruppmatcher en grupp har i matchplanen (en sanning ur datan, inte
 * hårdkodat 6), och hur många av dem som är tippade.
 */
function tippedAndTotalForGroup(
  groupId: GroupId,
  matches: readonly Match[],
  tipsByMatchId: ReadonlyMap<string, MatchTipScore>
): { tipped: number; total: number } {
  let tipped = 0;
  let total = 0;
  for (const match of matches) {
    if (match.stage !== 'group' || match.groupId !== groupId) {
      continue;
    }
    total += 1;
    if (tipsByMatchId.has(match.id)) {
      tipped += 1;
    }
  }
  return { tipped, total };
}

/**
 * Slå upp Team.CODE (versal) för ett Team.id ur lag-listan. null om laget saknas
 * (oväntat, ger då inget förslag i stället för en obekräftad identitet).
 */
function codeForTeamId(teamId: string, teams: readonly Team[]): string | null {
  return teams.find((t) => t.id === teamId)?.code ?? null;
}

/**
 * Härled EN grupps föreslagna 1:a + 2:a UR användarens tippade matchresultat.
 *
 * @param groupId       Vilken grupp förslaget gäller (A..L).
 * @param groups        Gruppmedlemskapen (Group.teamIds -> Team.id), för tabellen.
 * @param teams         Alla lag, för id -> code-översättningen vid seamen.
 * @param matches       Den statiska matchplanen (ger lag/grupp per match + totalen
 *                      gruppmatcher i gruppen).
 * @param tipsByMatchId Mina tippade matchresultat (matchId -> mål hemma/borta). Bara
 *                      DENNA grupps gruppmatcher används.
 * @returns             Förslaget (1:a/2:a som CODE) NÄR gruppens alla matcher är
 *                      tippade OCH tabellen har minst två rader med kända koder,
 *                      annars NULL (knappen inaktiveras, ingen gissning).
 *
 * Funktionen är REN: den muterar inte sina argument och skriver aldrig (de riktiga
 * resultaten/facit rörs inte, detta är en härledd simulering ur tipsen).
 */
export function deriveTippedGroupSuggestion(
  groupId: GroupId,
  groups: readonly Group[],
  teams: readonly Team[],
  matches: readonly Match[],
  tipsByMatchId: ReadonlyMap<string, MatchTipScore>
): GroupSuggestion | null {
  // Ärlighets-grinden FÖRST (gissa aldrig): utan ett KOMPLETT tips för just denna
  // grupp ges inget förslag. total === 0 (oväntat, gruppen saknas i planen) räknas
  // också som ofullständig (fail-safe: inget att föreslå ur).
  const { tipped, total } = tippedAndTotalForGroup(groupId, matches, tipsByMatchId);
  if (total === 0 || tipped !== total) {
    return null;
  }

  // Bygg syntetiska FÄRDIGSPELADE gruppmatcher ur DENNA grupps tips (delad
  // tippedGroupMatch, en sanning med T64) och räkna tabellen via DEN SAMMA
  // härledningen som gruppspelsvyn (deriveGroupTables -> computeStandings, FIFA-
  // tiebreak). Vi räknar bara denna grupp; deriveGroupTables ger en tabell per
  // inskickad grupp, så vi skickar bara den gruppen vi vill ha förslag för.
  const group = groups.find((g) => g.id === groupId);
  if (!group) {
    return null;
  }
  const syntheticMatches: Match[] = [];
  for (const match of matches) {
    if (match.stage !== 'group' || match.groupId !== groupId) {
      continue;
    }
    const score = tipsByMatchId.get(match.id);
    if (score) {
      syntheticMatches.push(tippedGroupMatch(match, score));
    }
  }
  const tables = deriveGroupTables([group], syntheticMatches);
  const standings = tables[0]?.standings ?? [];

  // Plocka rank 1 + rank 2 ur den TIPPADE tabellen (samma sortering som facit, en
  // sanning), och översätt id -> code vid seamen så förslaget hamnar i formulärets
  // rymd. Saknas någon av raderna eller någons code (oväntat med en komplett grupp)
  // ges inget förslag i stället för ett halvt/obekräftat förslag.
  const firstId = standings.find((r) => r.rank === 1)?.teamId;
  const secondId = standings.find((r) => r.rank === 2)?.teamId;
  if (firstId === undefined || secondId === undefined) {
    return null;
  }
  const winnerCode = codeForTeamId(firstId, teams);
  const runnerUpCode = codeForTeamId(secondId, teams);
  if (winnerCode === null || runnerUpCode === null) {
    return null;
  }
  return { winnerCode, runnerUpCode };
}
