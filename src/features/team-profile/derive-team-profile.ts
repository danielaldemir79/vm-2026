// Härledning av en lag-profil (REN funktion, inget I/O, ingen React).
//
// Ansvar (senior-devs FUNKTIONELLA lager): ta ett lag + den delade sanningen
// (grupper + matcher + lag-uppslag) och härleda allt profil-vyn visar: FIFA-ranking,
// stjärnspelare, kuriosa, gruppen laget tillhör, gruppkompisarna, och lagets VÄG i
// turneringen (dess spelade + kommande matcher). Allt är en ren funktion av datan,
// inget lagras (samma härledd-state-princip som grupptabeller/slutspelsträd, SPEC §6).
//
// VARFÖR en egen ren modul: härledningen har ingen React-/I/O-koppling, så den kan
// enhetstestas fristående (inkl. edge-fall: lag utan stjärnspelare, lag vars
// slutspelsmatcher ännu inte fått lag), och vyn/hooken blir tunna. Samma uppdelning
// som deriveGroupTables/deriveBracket (härledd-state-vy-mönstret, docs/patterns.md).
//
// "LAGETS VÄG" (KISS, SPEC §4 "lagets väg i turneringen"): grupp + lagets matcher i
// kronologisk ordning. Vi ÅTERANVÄNDER den verifierade matchlistan i stället för att
// bygga en egen slutspels-projektion: ett lags slutspelsmatcher är ännu okända (lag
// null tills seedningen, T9), så en "garanterad väg" vore en gissning. Lagets
// gruppmatcher + de slutspelsmatcher det redan blivit framräknat till räcker (gissa
// aldrig en väg som inte är låst).

import type { Group, GroupId, Match, Team } from '../../domain/types';

/** En match i lagets väg, med motståndaren och om laget spelar hemma. */
export interface TeamProfileMatch {
  match: Match;
  /** Motståndarlagets id i denna match (null om ännu okänt, t.ex. tom slutspelsslot). */
  opponentId: string | null;
  /** Spelar profil-laget hemma i denna match? */
  isHome: boolean;
}

/** Den härledda lag-profilen, allt profil-vyn behöver. */
export interface TeamProfileData {
  team: Team;
  /** FIFA-ranking (valfri i Team-typen, men källånkrad för alla 48 lag i T10). */
  fifaRanking: number | null;
  /** Stjärnspelare (kan vara tom om inga källbelagda, hellre tomt än gissat). */
  starPlayers: string[];
  /** Kuriosa-rad (kan vara null om saknas). */
  trivia: string | null;
  /** Gruppen laget tillhör. */
  group: GroupId;
  /** Gruppkompisarna (övriga lag i gruppen), för "vägen i turneringen"-kontexten. */
  groupOpponents: Team[];
  /** Lagets matcher i kronologisk ordning (grupp + ev. framräknade slutspelsmatcher). */
  matches: TeamProfileMatch[];
}

/**
 * Härled lag-profilen för ETT lag. Ren funktion: samma indata ger alltid samma
 * profil. Matcherna sorteras kronologiskt på avsparkstid (kickoff är ISO-UTC, så
 * sträng-jämförelse = tids-jämförelse).
 *
 * @param team       Laget profilen gäller (bär redan de källånkrade profil-fälten).
 * @param groups     Alla grupper (för gruppkompisarna).
 * @param matches    Hela matchlistan (den delade sanningen); vi plockar lagets matcher.
 * @param teamsById  Lag-uppslag (id -> Team) för gruppkompisarna.
 */
export function deriveTeamProfile(
  team: Team,
  groups: readonly Group[],
  matches: readonly Match[],
  teamsById: ReadonlyMap<string, Team>
): TeamProfileData {
  // Gruppkompisarna: övriga lag i samma grupp (laget självt exkluderat).
  const group = groups.find((g) => g.id === team.group);
  const groupOpponents: Team[] = (group?.teamIds ?? [])
    .filter((id) => id !== team.id)
    .map((id) => teamsById.get(id))
    .filter((t): t is Team => t !== undefined);

  // Lagets matcher: alla där laget är hemma eller borta. Slutspelsmatcher där laget
  // ännu inte är framräknat (homeTeamId/awayTeamId null) hör INTE hit, vägen visar
  // bara matcher laget BEVISLIGEN spelar (gruppmatcher + redan låsta slutspelsmatcher).
  const teamMatches: TeamProfileMatch[] = matches
    .filter((m) => m.homeTeamId === team.id || m.awayTeamId === team.id)
    .map((m) => {
      const isHome = m.homeTeamId === team.id;
      const opponentId = isHome ? m.awayTeamId : m.homeTeamId;
      return { match: m, opponentId, isHome };
    })
    // Kronologisk ordning (kickoff är ISO-UTC, sträng-sort = tids-sort).
    .sort((a, b) => a.match.kickoff.localeCompare(b.match.kickoff));

  return {
    team,
    fifaRanking: team.fifaRanking ?? null,
    starPlayers: team.starPlayers ?? [],
    trivia: team.trivia ?? null,
    group: team.group,
    groupOpponents,
    matches: teamMatches,
  };
}
