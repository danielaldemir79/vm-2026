// REN härledning av "Min sida"-profilen (T97). Inget I/O, ingen React, fristående testbar.
//
// VARFÖR en ren resolve-funktion (samma anda som deriveSelfSummary / resolveFavoriteTeam):
// "Min sida" är en PROFIL-vy som KONSOLIDERAR data som redan finns i tre stores (topplista,
// rum, favoritlag). Den räknar INGET nytt och hämtar INGET nytt , den plockar ut och formar
// det de redan exponerar, så profilen aldrig kan drifta från de paneler som äger datan
// (topplistan, medlemslistan, favoritlags-väljaren). Härledningen bor här (ren) så gatningen
// (vad visas när / vad är null) kan bevisas isolerat, utan att rendera tre providers.
//
// EN SANNING: ställningen plockas TROGET ur deriveSelfSummary (samma rad som "Dina poäng"-
// panelen i topplistan + tips-summeringen läser), inte en parallell omräkning. Profilen är
// alltså ett SKYLTFÖNSTER mot befintlig data, inte en andra källa.

import type { LeaderboardEntry } from '../leaderboard/aggregate-scores';
import type { PersonalStats } from '../leaderboard/personal-stats';
import { deriveSelfSummary } from '../leaderboard/self-summary';
import type { RoomMember, RoomSummary } from '../../data/rooms';

/**
 * Aktuell användares KOMPAKTA ställning i det aktiva rummet: placering + total + (om den
 * finns) träffsäkerhet, plus en ärlig live-flagga. En glanceable rad, INTE en re-render av
 * hela "Dina poäng"-panelen. null när vi inte kan peka ut en egen rad (samma gate som
 * deriveSelfSummary: ingen identitet / inte medlem / ingen topplista).
 */
export interface MinSidaStanding {
  /** 1-baserad placering (delad vid lika, samma som topplistan). */
  rank: number;
  /** Antal medlemmar topplistan rangordnar (för "av N"). */
  totalMembers: number;
  /** Total bonuspoäng (alla tre tips-typer mot facit). */
  points: number;
  /**
   * Träffsäkerhet 0-1, eller null. null = inga avgjorda tips än (eller ingen statistik-rad);
   * då utelämnar UI:t träffsäkerheten i stället för en falsk 0 % (samma fail-safe som
   * PersonalStatsSection). Plockad ur selfStats (samma score-väg), aldrig omräknad här.
   */
  accuracy: number | null;
  /**
   * Är ställningen just nu PRELIMINÄR (en match pågår och en löpande live-poäng ligger ovanpå
   * facit)? Driver den ärligt märkta "preliminär"-noten. Speglar store.livePreliminary.
   */
  livePreliminary: boolean;
}

/** Ett rum i profilens kompakta rums-översikt (namn + om det är det aktiva). */
export interface MinSidaRoom {
  id: string;
  name: string;
  /** Är detta det aktiva rummet (tydligt markerat i listan + pinnat först)? */
  isActive: boolean;
}

/** Hela profilens view-model, härledd ur de tre stores. */
export interface MinSidaProfile {
  /**
   * Visningsnamnet (ur det aktiva rummets medlemskap) + den STABILA identiteten (userId) som
   * bär avatar-färgen. null när vi inte kan peka ut användaren (ingen identitet / inte medlem
   * i det aktiva rummet) , då visas en lugn, neutral profil-topp i stället för ett gissat namn.
   */
  identity: { userId: string; displayName: string } | null;
  /** Kompakt ställning i det aktiva rummet, eller null (ingen egen rad att visa). */
  standing: MinSidaStanding | null;
  /** Användarens rum (egen rums-översikt), aktivt rum pinnat först. Tom = inga rum. */
  rooms: readonly MinSidaRoom[];
}

/**
 * Indata till härledningen: exakt de fält profilen behöver ur de tre stores. Att ta en
 * smal, explicit form (i stället för hela store-typerna) håller härledningen testbar utan
 * att binda den till providers, och gör beroendet på varje fält synligt.
 */
export interface MinSidaInput {
  /** Är det sociala lagret aktivt (Supabase konfigurerat)? Annars finns ingen profil-data. */
  roomsEnabled: boolean;
  /** Den inloggade (anonyma) användarens id, eller null innan auth-sessionen är klar. */
  userId: string | null;
  /** Användarens rum (RoomsStore.myRooms). */
  myRooms: readonly RoomSummary[];
  /** Det aktiva rummet, eller null. */
  activeRoom: RoomSummary | null;
  /** Det aktiva rummets medlemmar (för visningsnamnet). */
  members: readonly RoomMember[];
  /** Den rangordnade topplistan för det aktiva rummet (LeaderboardStore.leaderboard). */
  leaderboard: readonly LeaderboardEntry[];
  /** Aktuell användares personliga statistik, eller null (LeaderboardStore.selfStats). */
  selfStats: PersonalStats | null;
  /** Är topplistan preliminär (live) just nu (LeaderboardStore.livePreliminary)? */
  livePreliminary: boolean;
}

/**
 * Slå upp aktuell användares visningsnamn i det aktiva rummets medlemslista. Returnerar
 * identiteten (userId + namn) eller null när vi inte kan peka ut användaren (ingen id, eller
 * id:t finns inte bland medlemmarna än , t.ex. precis innan medlemmarna laddats). Vi gissar
 * ALDRIG ett namn; null låter profil-toppen falla till sitt lugna neutrala läge.
 */
function resolveIdentity(
  userId: string | null,
  members: readonly RoomMember[]
): { userId: string; displayName: string } | null {
  if (userId === null) {
    return null;
  }
  const self = members.find((m) => m.userId === userId);
  // Tomt/whitespace-namn faller bort (samma robusthet som initialsFromName): hellre ingen
  // identitet (neutral topp) än en tom rubrik.
  if (self === undefined || self.displayName.trim() === '') {
    return null;
  }
  return { userId, displayName: self.displayName.trim() };
}

/**
 * Bygg profilens rums-översikt: alla användarens rum, det aktiva pinnat FÖRST + markerat,
 * övriga i inkommande ordning (stabil, samma "ditt först"-anda som MemberGrid). Ren, muterar
 * inte indata.
 */
function buildRooms(
  myRooms: readonly RoomSummary[],
  activeRoom: RoomSummary | null
): MinSidaRoom[] {
  const mapped = myRooms.map((room) => ({
    id: room.id,
    name: room.name,
    isActive: activeRoom !== null && room.id === activeRoom.id,
  }));
  const active = mapped.filter((r) => r.isActive);
  const rest = mapped.filter((r) => !r.isActive);
  return [...active, ...rest];
}

/**
 * Härled hela "Min sida"-profilen ur de tre stores indata.
 *
 * Returnerar null NÄR det inte finns någon meningsfull profil att visa alls:
 *   - rummen är inaktiva (fixtures/lokalt läge): det sociala lagret vilar, ingen profil
 *     (samma gate som RoomSection returnerar null), ELLER
 *   - användaren saknar identitet OCH har inga rum: inget att visa upp.
 * I dessa fall renderar sektionen inget (ingen trasig tom profil).
 *
 * Annars returneras en profil där VARJE del gatas för sig (graceful, north-star: "rendera
 * de delar som FAKTISKT har data"): identitet (namn/avatar) kan vara null medan rooms finns,
 * standing kan vara null (inget aktivt rum / ingen egen rad) medan identitet + rooms finns.
 */
export function deriveMinSidaProfile(input: MinSidaInput): MinSidaProfile | null {
  // Inaktivt socialt lager: ingen profil alls (appen kör lokalt, precis som RoomSection).
  if (!input.roomsEnabled) {
    return null;
  }

  const identity = resolveIdentity(input.userId, input.members);
  const rooms = buildRooms(input.myRooms, input.activeRoom);

  // Ingen identitet OCH inga rum: det finns ingenting att visa upp än (auth inte klar och
  // användaren inte med i något rum). Hellre ingen profil än en tom platta.
  if (identity === null && rooms.length === 0) {
    return null;
  }

  // Ställningen plockas TROGET ur den redan rangordnade topplistan (deriveSelfSummary, EN
  // sanning), inte omräknad. null när vi inte kan peka ut en egen rad (ingen identitet /
  // inte medlem / inget aktivt rum -> tom topplista -> ingen rad). Träffsäkerheten plockas
  // ur selfStats (samma score-väg); null när inga avgjorda tips än.
  const summary = deriveSelfSummary(input.leaderboard, input.userId);
  const standing: MinSidaStanding | null =
    summary === null
      ? null
      : {
          rank: summary.rank,
          totalMembers: summary.totalMembers,
          points: summary.points,
          accuracy: input.selfStats?.accuracy ?? null,
          livePreliminary: input.livePreliminary,
        };

  return { identity, standing, rooms };
}
