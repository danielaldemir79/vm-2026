// REN urvalslogik för BRACKET-/SLUTSPELS-TIPS: vilka slots kan tippas, vilka två
// lag (eller om de är okända än), och är de låsta? (T16b, #59). Ingen React, inget
// I/O, fristående testbar. Bracket-tips-vyn är tunn ovanpå denna. Systerfil till
// group-predictable-data.ts (T16) + predictable-matches.ts (T15).
//
// MODELL (källmedvetet, gissas inte) , se docs/decisions.md T16 §2 "BRACKET-TIPS-
// MODELLEN" + §4 "DEADLINE-LÅS":
//   * EN slot per SLUTSPELSMATCH (M73..M104): man tippar vilket av matchens TVÅ lag
//     man tror går VIDARE. Slutspelets lag avslöjas gradvis (gruppspel -> seedning
//     -> match-progression), så en slot är TIPPBAR först när BÅDA dess lag är kända
//     (T9:s `resolution === 'resolved'` på home OCH away). Innan dess visas
//     "lagen avgörs av tidigare resultat" och slotten är otippbar , samma princip
//     som T9:s bothTeamsKnown och T15:s predictable-matches (gissa aldrig laget).
//   * EN champion-slot (slot_id = 'champion', CHAMPION_SLOT_ID): vem vinner HELA VM.
//     Tippas bland ALLA 48 lagen (KISS, dokumenterat val nedan). Deadline sedan T53:
//     den FÖRLÄNGDA tiden, se nästa punkt.
//
//   * DEADLINE = slottens egen avspark (M73..M104:s kickoff). Champion (T53, #95):
//     GREATEST(g-A-1:s kickoff, den fasta förlängda söndagstiden) via
//     `applyExtendedDeadline` , samma regel som RLS-helpern bracket_deadline_kickoff
//     efter T53-migrationen. EN sanning för ankaret: `bracketDeadlineMatchId`
//     (bracket-predictions-api) ger ankar-matchen, kickoffen slås upp i matchplanen,
//     och förlängningen appliceras BARA på champion-grenen , ingen dubblerad tid.
//     LÅST = now >= den härledda deadlinen. Server-RLS är det riktiga låset; här
//     härleds det BARA för VISNINGEN. Klockan är injicerbar (now), default nuet.
//
// LAG-IDENTITET (HARD, T16 F1-fällan , se docs/decisions.md): det HÄRLEDDA facit
// (deriveBracket) bär Team.id (GEMEN "bra"), men ett bracket-tips LAGRAS som
// Team.CODE (VERSAL "BRA", DB-constraint ^[A-Z]{3}$, typad TeamCode). Här mappar vi
// därför Team.id -> Team.code via lag-listan och bär `code` (TeamCode) i slot-valen,
// så vyn aldrig av misstag skickar ett rått gemen id (= tyst 0 poäng i T17).

import type { Team } from '../../domain/types';
import { teamCode, type TeamCode } from '../../domain/team-code';
import {
  bracketDeadlineMatchId,
  CHAMPION_SLOT_ID,
  applyExtendedDeadline,
} from '../../data/predictions';
import {
  groupByRound,
  ROUND_LABELS,
  type BracketRound,
  type BracketSlotState,
  type BracketState,
} from '../bracket';
import type { Match } from '../../domain/types';

/** Ett lag-val i en slot-väljare: stabil VERSAL code-identitet + visningsnamn. */
export interface SlotTeamOption {
  /** FIFA trebokstavskod (t.ex. "BRA"), TeamCode , lagras i DB:t, jämförs av bonus-score. */
  code: TeamCode;
  /** Visningsnamn (t.ex. "Brasilien"). */
  name: string;
}

/** En tippbar slot (en slutspelsmatch) + dess två lag + härledd status. */
export interface PredictableSlot {
  /** slot_id = matchnumret (M73..M104), används som tips-nyckel + deadline-ankare. */
  slotId: string;
  /** Slutspelsrundan (för gruppering + poäng-vikt-visning i vyn). */
  stage: BracketSlotState['stage'];
  /** Matchens två lag, som code-val. Tom tills båda lagen är kända (teamsKnown=false). */
  teams: SlotTeamOption[];
  /** true först när BÅDA matchens lag är kända (resolved). Annars otippbar. */
  teamsKnown: boolean;
  /** true om slottens avspark passerat (now >= kickoff): tipset låst (server-RLS gäller). */
  locked: boolean;
  /** Slottens deadline (slottens egen avspark), ISO. null om matchen saknas (oväntat). */
  deadlineIso: string | null;
}

/** En runda med sina tippbara slots (för rund-grupperad rendering, spegel av T9). */
export interface PredictableSlotRound {
  stage: BracketSlotState['stage'];
  label: string;
  slots: PredictableSlot[];
}

/**
 * CHAMPION-slotten (VM-vinnaren): ett separat tippnings-moment FÖRE turneringen.
 * Inte en match-slot, så den bär hela lag-urvalet + sitt eget deadline-ankare.
 *
 * URVAL = ALLA 48 lagen (KISS, dokumenterat val, docs/decisions.md T16b): innan
 * gruppspelet vet ingen vilka som tar sig långt, så ett fritt val bland alla lag är
 * det enkla, rättvisa momentet , inte en konstruerad delmängd. Låst vid den
 * förlängda champion-deadlinen (T53: GREATEST(g-A-1, fasta söndagstiden)).
 */
export interface ChampionSlot {
  /** Alltid CHAMPION_SLOT_ID ('champion'). */
  slotId: string;
  /** Alla lag att välja VM-vinnare bland (code-val), i lag-listans ordning. */
  teams: SlotTeamOption[];
  /** true när champion-deadlinen passerats (T53: GREATEST(g-A-1, förlängd tid)). */
  locked: boolean;
  /** Champion-deadline (T53-förlängd, se modul-doc), ISO. null om ankar-matchen saknas. */
  deadlineIso: string | null;
}

/** Hela bracket-tips-urvalet: rund-grupperade match-slots + champion-slotten. */
export interface PredictableBracket {
  rounds: PredictableSlotRound[];
  champion: ChampionSlot;
}

/** Brand ett Team.id-uppslag till ett SlotTeamOption (id -> code via lag-listan). */
function toOption(teamId: string, teamById: ReadonlyMap<string, Team>): SlotTeamOption {
  const team = teamById.get(teamId);
  // Mappa Team.id (gemen) -> Team.code (versal) , F1-seamen. teamCode() validerar
  // formen (^[A-Z]{3}$) och fail-loud:ar om ett okänt id ger en otrygg sträng, så
  // ett trasigt uppslag SYNS i stället för att tyst ge ett ogiltigt tips.
  const code = team?.code ?? teamId.toUpperCase();
  return { code: teamCode(code), name: team?.name ?? teamId };
}

/** Slå upp en slots deadline-kickoff (ISO) via ankar-matchen, eller null. */
function deadlineIsoFor(slotId: string, matchById: ReadonlyMap<string, Match>): string | null {
  // EN sanning för ankaret: bracketDeadlineMatchId speglar RLS-helpern
  // (slot M73..M104 -> sin egen avspark, 'champion' -> g-A-1).
  const anchorMatch = matchById.get(bracketDeadlineMatchId(slotId));
  return anchorMatch ? anchorMatch.kickoff : null;
}

/** LÅST = now >= deadline. FAIL-SAFE: saknad deadline behandlas som låst (visning). */
function isLocked(deadlineIso: string | null, nowMs: number): boolean {
  // Saknas ankar-matchen (oväntat , matchplanen är källåkrad) behandlar vi slotten
  // som LÅST, så vi aldrig erbjuder ett tips vi inte kan deadline-bevaka. Server-
  // RLS:ens NULL-deadline nekar ändå skriv (docs/decisions.md T16 §4 fail-safe).
  return deadlineIso === null || nowMs >= new Date(deadlineIso).getTime();
}

/**
 * Härled det tippbara bracket-urvalet ur det LEVANDE trädet (deriveBracket).
 *
 * @param bracket  Det härledda slutspelsträdet (T9). null tills datan är klar -> tomt urval.
 * @param teams    Alla lag (för id->code-mappning + champion-urvalet).
 * @param matches  Matchplanen (för att slå upp slottens/championens deadline-kickoff).
 * @param now      Nuet (default new Date()), injicerbart för test/determinism.
 */
export function selectPredictableBracket(
  bracket: BracketState | null,
  teams: readonly Team[],
  matches: readonly Match[],
  now: Date = new Date()
): PredictableBracket {
  const nowMs = now.getTime();
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const matchById = new Map(matches.map((m) => [m.id, m]));

  // Champion-slotten: alla 48 lag (KISS). DEADLINE = GREATEST(g-A-1, fasta söndagstiden
  // 21/6 21:59Z): T53 (#95) införde, T67 (#123) flyttade CHAMPION-tipsets förlängning till
  // söndag 21/6 (g-A-1 = 11 juni ligger FÖRE fasta tiden, så champion förlängs till
  // söndagen). applyExtendedDeadline speglar RLS-helpern
  // bracket_deadline_kickoff('champion') EXAKT (greatest(g-A-1, pool_extended_deadline())).
  // OBS: bara CHAMPION berörs , match-SLOTSEN (M73..M104) nedan behåller sina EGNA
  // avsparks-lås orörda (deadlineIsoFor utan förlängning), exakt som RLS slot-grenen.
  const championDeadlineIso = applyExtendedDeadline(deadlineIsoFor(CHAMPION_SLOT_ID, matchById));
  const champion: ChampionSlot = {
    slotId: CHAMPION_SLOT_ID,
    teams: teams.map((t) => ({ code: teamCode(t.code), name: t.name })),
    locked: isLocked(championDeadlineIso, nowMs),
    deadlineIso: championDeadlineIso,
  };

  if (bracket === null) {
    return { rounds: [], champion };
  }

  // Match-slotsen, rund-grupperade i officiell ordning (T9:s groupByRound, en sanning).
  const rounds: PredictableSlotRound[] = groupByRound(bracket).map((round: BracketRound) => {
    const slots: PredictableSlot[] = round.matches.map((match) => {
      const slotId = match.matchId; // M73..M104 (= slot_id, DB-constraint)
      // TIPPBAR först när BÅDA lagen är kända (resolved), annars otippbar (T9:s
      // bothTeamsKnown-princip , vi gissar aldrig vilket lag som hamnar i slotten).
      const homeKnown = match.home.resolution === 'resolved' && match.home.teamId !== null;
      const awayKnown = match.away.resolution === 'resolved' && match.away.teamId !== null;
      const teamsKnown = homeKnown && awayKnown;
      const slotTeams: SlotTeamOption[] = teamsKnown
        ? [toOption(match.home.teamId!, teamById), toOption(match.away.teamId!, teamById)]
        : [];
      const deadlineIso = deadlineIsoFor(slotId, matchById);
      return {
        slotId,
        stage: match.stage,
        teams: slotTeams,
        teamsKnown,
        locked: isLocked(deadlineIso, nowMs),
        deadlineIso,
      };
    });
    return { stage: round.stage, label: ROUND_LABELS[round.stage], slots };
  });

  return { rounds, champion };
}
