// SERVER-SIDE bygge av den GLOBALA, RÄTTVISA topplistan (T90, #183). REN funktion,
// inget I/O, ingen React, ingen Deno-global , fristående testbar OCH bundlingsbar till
// edge-funktionen (Deno) via en genererad mirror (se _shared/global-leaderboard-core.ts
// + scripts/generate-global-leaderboard-core.ts).
//
// ============================================================================
// VARFÖR SERVER-SIDE (privacy/RLS, ägarens HARD-krav)
// ============================================================================
// Den globala listan måste rangordna ALLA 200+ deltagare i ALLA rum, även de vars
// tips ännu inte avslöjats (deadline ej passerad). En vanlig medlems RLS ser bara
// EGNA rum + EGNA/avslöjade tips, så listan kan INTE byggas i klienten utan att
// antingen (a) bara visa egna rum (T82-del-3-buggen: "Global" visade ~54), eller
// (b) läcka andras hemliga tips. Därför körs poängsättningen i en SECURITY DEFINER-
// väg (edge function, service_role) som LÄSER tipsen men returnerar BARA
// (visningsnamn, poäng, rank, exakt-träffar) , ALDRIG en rå tips-rad. Denna funktion
// är den rena kärnan som edge-funktionen kör; den TAR rådata och GER den säkra,
// rangordnade listan.
//
// ============================================================================
// EN SANNING, INGEN DIVERGERANDE MOTOR (ägarens #1-risk)
// ============================================================================
// Vi RÄKNAR INTE poäng på nytt och reimplementerar INGA regler i SQL. Vi
// återanvänder den EXAKT SAMMA, redan testade TS-poängmotorn som klienten:
//   * derivePoolFacit  (facit-härledning, FIFA-tiebreak, bracket, id->code-seam)
//   * buildTotalLeaderboard (RÄTTVIS aggregering: bästa rum per deltagare, T90)
//   * applyRoomResults (väv in de officiella resultaten på den statiska planen)
// Edge-funktionen kör SAMMA kod via en genererad bundle (parity-testad mot src,
// global-leaderboard-mirror-parity.test.ts), så server och klient aldrig kan drifta.
//
// FACIT-KÄLLAN = de GLOBALA officiella resultaten (official_match_results, T42),
// vävda på den statiska, källåkrade matchplanen , EXAKT samma facit som per-rums-
// topplistan (useLeaderboardData), bara matad ur DB-rader i stället för en hook.

// DEEP imports (inte feature-barrels): barrels re-exporterar React-komponenter + CSS,
// vilket annars dras in i edge-funktionens genererade bundle (T90). Vi importerar de RENA
// modulerna direkt, så hela scoring-grafen är ren och bundlingsbar för Deno (esbuild).
import type { Group, Match, Team } from '../../domain/types';
import type { RoomMatchResult } from '../rooms/rooms-api';
import type { MemberPredictions } from '../../features/leaderboard/aggregate-scores';
import { derivePoolFacit, type PoolFacit } from '../../features/leaderboard/derive-facit';
import { applyRoomResults } from '../../features/results/apply-room-results';
import {
  buildTotalLeaderboard,
  type RoomContribution,
  type TotalLeaderboardEntry,
} from '../../features/total-leaderboard/aggregate-total';

/**
 * Ett rums rådata som edge-funktionen läser ur DB:n (server-side, förbi RLS). Detta
 * är den ENDA platsen råa tips finns; de lämnar ALDRIG funktionen (returvärdet bär
 * bara poäng/namn/rank). Formen matchar DB-projektionen edge-funktionen bygger.
 */
export interface RawRoomData {
  roomId: string;
  /** Rummets medlemmar (room_members: user_id + display_name). */
  members: ReadonlyArray<{ userId: string; displayName: string }>;
  /** Medlemmarnas tips (de tre typerna), redan grupperade per userId. */
  predictionsByUser: ReadonlyMap<string, MemberPredictions>;
}

/**
 * En SÄKER rad i den globala listan: BARA visningsnamn + poäng + rank + exakt-träffar.
 * INGEN userId, INGA råa tips, ingen rum-koppling , inget som avslöjar VAD någon tippat
 * eller VEM (utöver det redan publika visningsnamnet). Detta är allt edge-funktionen
 * returnerar till klienten.
 *
 * userId BEHÅLLS (det är inte hemligt , det är anroparens egen auth.uid() för andra,
 * en ogenomskinlig uuid) så klienten kan markera "din rad" + "hoppa till mig". Det
 * avslöjar inga tips. Vill man vara extra strikt kan edge-funktionen utelämna alla
 * userId utom anroparens; vi behåller dem (ogenomskinliga uuid:er läcker inget om tips).
 */
export interface SafeGlobalEntry {
  userId: string;
  displayName: string;
  points: number;
  rank: number;
  exactHits: number;
}

/**
 * Den statiska, källåkrade turneringsplanen (lag + grupper + matcher). På klienten
 * kommer den ur fixtures/data-source; i edge-funktionen ur en GENERERAD inbäddad
 * kopia (samma sanning, värde-låst). EN form i båda lägen.
 */
export interface StaticPlan {
  teams: readonly Team[];
  groups: readonly Group[];
  /** Den statiska matchplanen (BASEN), innan officiella resultat vävs in. */
  matches: readonly Match[];
}

/**
 * Bygg det DELADE globala facit ur den statiska planen + de officiella resultaten
 * (EXAKT samma kedja som useLeaderboardData på klienten: väv resultaten på planen,
 * derivePoolFacit). Exporterad så parity-testet kan jämföra src vs mirror på just
 * facit-skarven, och så edge-funktionen kan bygga facit en gång och återanvända.
 */
export function buildGlobalFacit(
  plan: StaticPlan,
  officialResults: readonly RoomMatchResult[]
): PoolFacit {
  const woven = applyRoomResults([...plan.matches], [...officialResults]);
  return derivePoolFacit(plan.teams, plan.groups, woven);
}

/**
 * Projicera den fullständiga (interna) total-raden till den SÄKRA utåt-formen. EN
 * plats där vi bestämmer exakt vilka fält som lämnar servern, så inget tips-fält
 * någonsin kan slinka med av misstag (privacy-seam, T90 acceptanskriterium).
 */
function toSafeEntry(entry: TotalLeaderboardEntry): SafeGlobalEntry {
  return {
    userId: entry.userId,
    displayName: entry.displayName,
    points: entry.points,
    rank: entry.rank,
    exactHits: entry.exactHits,
  };
}

/**
 * Bygg hela den globala, rättvisa, rangordnade listan ur rådata + officiella resultat.
 * Detta är edge-funktionens kärna: läs rådata (server-side), poängsätt med den DELADE
 * TS-motorn, RÄTTVIS aggregering (bästa rum per deltagare), och returnera BARA säkra
 * rader.
 *
 * @param rooms            Varje rums rådata (medlemmar + råa tips). Råa tips lämnar
 *                         ALDRIG denna funktion , bara den säkra returformen gör det.
 * @param officialResults  De GLOBALA officiella resultaten (facit-källan, T42).
 * @param plan             Den statiska turneringsplanen (lag/grupper/matcher).
 * @returns                Den globala listan, BARA (userId, namn, poäng, rank, exakt).
 */
export function buildGlobalLeaderboard(
  rooms: readonly RawRoomData[],
  officialResults: readonly RoomMatchResult[],
  plan: StaticPlan
): SafeGlobalEntry[] {
  const facit = buildGlobalFacit(plan, officialResults);
  // Mappa rådatan till den form aggregeringen tar (samma RoomContribution som demo/live).
  const contributions: RoomContribution[] = rooms.map((room) => ({
    roomId: room.roomId,
    members: room.members.map((m) => ({ userId: m.userId, displayName: m.displayName })),
    predictionsByUser: room.predictionsByUser,
  }));
  const total = buildTotalLeaderboard(contributions, facit);
  return total.map(toSafeEntry);
}
