// REN urvalslogik för GRUPP-TIPS: vilka grupper kan tippas, deras 4 lag, och är
// de låsta? (T16, #16). Ingen React, inget I/O, fristående testbar. Grupp-tips-vyn
// är tunn ovanpå denna. Systerfil till predictable-matches.ts (T15).
//
// REGLER:
//   * DEADLINE = GREATEST(gruppens FÖRSTA match g-X-1, fasta söndagstiden 21/6 21:59Z).
//     T53 (#95) införde förlängningen, T67 (#123) flyttade den till söndag 21/6: de som
//     inte hann före premiären får t.o.m. söndag 21/6 23:59 svensk tid. FÖRLÄNG, FÖRKORTA
//     ALDRIG (GREATEST): en grupp med ankare EFTER 21/6 behåller sitt SENARE egna ankare
//     (inget riktigt gruppankare gör det , alla g-X-1 ligger 11-17/6 , men regeln, inte
//     datat, är garantin). Vi applicerar samma applyExtendedDeadline som RLS-helpern
//     group_deadline_kickoff
//     (greatest(g-X-1, pool_extended_deadline())), så lås + text är EN sanning, klient
//     + DB. LÅST = den HÄRLEDDA deadlinen passerad (now >= deadline). Server-RLS
//     upprätthåller låset; här härleder vi det BARA för VISNINGEN. Klockan injicerbar.
//   * Varje grupp listar sina 4 lag (för 1:a/2:a-väljarna), i matchplanens/gruppens
//     ordning. Lag-identiteten är FIFA:s trebokstavskod (code), samma som DB-
//     constrainten (^[A-Z]{3}$) och bonus-score jämför mot (se decisions.md T16).
//
// Vi sorterar grupperna A..L (spelordning) så vyn är stabil och förutsägbar.

import { applyExtendedDeadline } from '../../data/predictions';
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
      // GREATEST(g-X-1, fasta söndagstiden): T53-förlängningen. applyExtendedDeadline
      // bevarar ett senare ankare (sen grupp) och null-fail-safen (saknad match -> null),
      // exakt som RLS-helpern group_deadline_kickoff. En sanning, klient + DB.
      const deadlineIso = applyExtendedDeadline(firstMatch ? firstMatch.kickoff : null);
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
