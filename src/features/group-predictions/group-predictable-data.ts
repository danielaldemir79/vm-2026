// REN urvalslogik för GRUPP-TIPS: vilka grupper kan tippas, deras 4 lag, och är
// de låsta? (T16, #16). Ingen React, inget I/O, fristående testbar. Grupp-tips-vyn
// är tunn ovanpå denna. Systerfil till predictable-matches.ts (T15).
//
// REGLER:
//   * DEADLINE = gruppens FÖRSTA match (g-X-1). LÅST = den matchens avspark passerad
//     (now >= kickoff). Server-RLS (group_deadline_kickoff = g-X-1) upprätthåller
//     låset; här härleder vi det BARA för VISNINGEN. EN sanning för ankaret: vi slår
//     upp gruppens första match i matchplanen (samma g-X-1 som RLS-helpern), inte en
//     dubblerad tid. Klockan är injicerbar (now), default nuet.
//   * Varje grupp listar sina 4 lag (för 1:a/2:a-väljarna), i matchplanens/gruppens
//     ordning. Lag-identiteten är FIFA:s trebokstavskod (code), samma som DB-
//     constrainten (^[A-Z]{3}$) och bonus-score jämför mot (se decisions.md T16).
//
// Vi sorterar grupperna A..L (spelordning) så vyn är stabil och förutsägbar.

import type { Group, GroupId, Match, Team } from '../../domain/types';

/** Ett lag-val i en grupp-väljare: stabil kod-identitet + visningsnamn. */
export interface GroupTeamOption {
  /** FIFA trebokstavskod (t.ex. "BRA"), lagras i DB:t och jämförs av bonus-score. */
  code: string;
  /** Visningsnamn (t.ex. "Brasilien"). */
  name: string;
}

/** En tippbar grupp + dess 4 lag + härledd låst-status (för visning). */
export interface PredictableGroup {
  groupId: GroupId;
  /** Gruppens 4 lag (1:a/2:a väljs bland dessa). */
  teams: GroupTeamOption[];
  /** true om gruppens första match sparkat igång (now >= g-X-1): grupp-tipset låst. */
  locked: boolean;
  /** Gruppens första match (g-X-1) avspark, ISO. null om matchen saknas (oväntat). */
  deadlineIso: string | null;
}

/** match_id för en grupps FÖRSTA match (deadline-ankaret), t.ex. "g-A-1". */
export function groupFirstMatchId(groupId: GroupId): string {
  return `g-${groupId}-1`;
}

/**
 * Härled de tippbara grupperna (A..L) med deras 4 lag och låst-status mot `now`.
 *
 * @param groups   gruppindelningen (Group[]: id + teamIds).
 * @param teams    alla lag (för att slå upp code/namn ur teamIds).
 * @param matches  matchplanen (för att hitta gruppens första match = deadline).
 * @param now      nuet (default new Date()), injicerbart för test/determinism.
 */
export function selectPredictableGroups(
  groups: readonly Group[],
  teams: readonly Team[],
  matches: readonly Match[],
  now: Date = new Date()
): PredictableGroup[] {
  const nowMs = now.getTime();
  const teamById = new Map(teams.map((t) => [t.id, t]));
  // Snabb uppslagning av en match på id (för deadline = gruppens första match).
  const matchById = new Map(matches.map((m) => [m.id, m]));

  return groups
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((group) => {
      const firstMatch = matchById.get(groupFirstMatchId(group.id));
      const deadlineIso = firstMatch ? firstMatch.kickoff : null;
      // FAIL-SAFE för visningen: saknas gruppens första match (oväntat, matchplanen
      // är källåkrad) behandlar vi gruppen som LÅST, så vi aldrig erbjuder ett tips
      // vi inte kan deadline-bevaka. (Server-RLS:ens NULL-deadline nekar ändå skriv.)
      const locked = deadlineIso === null || nowMs >= new Date(deadlineIso).getTime();
      const teamOptions: GroupTeamOption[] = group.teamIds.map((teamId) => {
        const team = teamById.get(teamId);
        return { code: team?.code ?? teamId, name: team?.name ?? teamId };
      });
      return { groupId: group.id, teams: teamOptions, locked, deadlineIso };
    });
}
