// DEMO-fixtures för den TOTALA topplistan (T82 del 3, #173). REN, deterministisk,
// inget I/O, ingen React.
//
// SYFTE: i DEMO/fixtures-läge (off-season, inget live-backend) ska den totala
// topplistan se FYLLD ut direkt , ~240 deltagare med SPRIDDA poäng , så både UI:t
// och bot-datat valideras visuellt. Den riktiga datan (Supabase) tänds live UTAN
// kod-ändring via samma RoomContribution-form (se TotalLeaderboardProvider).
//
// HUR (källmedvetet, gissas inte):
//   1. Markera en DEL av gruppspelet som spelat (DEMO_PLAYED_COUNT första
//      gruppmatcherna får ett deterministiskt resultat) -> ett icke-trivialt facit.
//   2. Härled facit ur den RIKTIGA derivePoolFacit (samma form live väver in), inte
//      en handgjord litteral (lessons: bevisa skarven mot källans form).
//   3. Generera personas (T82 del 1) + tips (generateBotPredictions) mot det facit.
//      'new-room'-botar tippar ALLT inkl. spelat -> sprids över hela listan; capAccuracy
//      0.62 håller dem under en topp-spelare (ingen bot toppar, T82 del 1).
//   4. Injicera den INLOGGADE spelaren (DEMO_SELF_USER_ID) i ett par rum med STARKA tips,
//      så "din placering"-hjälten + den framhävda egna raden demoar sig själva högt upp.
//
// T90 (#183): demon kör den RÄTTVISA modellen (bästa rum, inte summa) via samma
// buildTotalLeaderboard som live. Spelaren är med i flera rum med IDENTISKA tips just för
// att DEMONSTRERA rättvisan: hen får sitt bästa enskilda rums poäng, inte en summa , antal
// rum ger ingen fördel (demo-fixtures.test.ts bevisar seam-en mot live-modellen).
//
// FIXTURES MOT KÄLLANS SCHEMA (lessons, HARD): RoomMember + MemberPredictions =
// Prediction/GroupPrediction/BracketPrediction är KÄLLANS typer (samma form
// listRoom*-API:erna och rooms-lagret producerar live), inte en konsument-form, annars
// döljs en mappnings-drift i den otestade live-grenen.
//
// DETERMINISM: allt härleds ur bot-motorns seed + en fast resultat-seed, så demon ser
// likadan ut varje gång (en sanning, testbar antal/spridning).

import type { Match } from '../../domain/types';
import { fixtureTeams, fixtureGroups, fixtureMatches } from '../../data';
import {
  createRng,
  generatePersonas,
  generateBotPredictions,
  type BotPersona,
  type BotPredictions,
} from '../../data/bots';
import { derivePoolFacit, type PoolFacit } from '../leaderboard';
import type { MemberPredictions } from '../leaderboard';
import type { RoomMember } from '../../data/rooms';
import type { RoomContribution } from './aggregate-total';

/**
 * Den inloggade spelarens id i DEMO-läge. Matchar inget riktigt auth-id (demon har
 * ingen session); TotalLeaderboardProvider pekar ut den som "currentUserId" så hjälten
 * + den egna raden kan demonstreras. Live ersätts den av rooms.userId utan kod-ändring.
 */
export const DEMO_SELF_USER_ID = 'demo-self';

/** Den inloggade spelarens visningsnamn i demon (Daniel = appens ägare/demo-spelare). */
const DEMO_SELF_DISPLAY_NAME = 'Daniel';

/**
 * Hur många av de FÖRSTA gruppmatcherna som markeras spelade i demon. Tillräckligt för
 * att botarnas (och spelarens) match-tips ska ge spridda poäng, men inte hela
 * gruppspelet (då vore facit "färdigt" och mindre likt ett pågående VM). Rent demo-val.
 */
const DEMO_PLAYED_COUNT = 16;

/** Seed för de DETERMINISTISKA demo-resultaten (skild från bot-motorns seed). */
const DEMO_RESULT_SEED = 0x5f3759df;

/**
 * Bygg en matchlista där de DEMO_PLAYED_COUNT första gruppmatcherna är 'finished' med
 * ett deterministiskt resultat. Resten orörda (scheduled, null result). Detta är demo-
 * data: vi RÖR ALDRIG den committade fixtureMatches-källan, vi mappar en kopia.
 */
function buildPlayedMatches(): Match[] {
  const rng = createRng(DEMO_RESULT_SEED);
  let played = 0;
  return fixtureMatches.map((match) => {
    // Bara gruppmatcher med två kända lag kan "spelas" i demon (slutspel saknar lag än).
    const playable =
      match.stage === 'group' && match.homeTeamId !== null && match.awayTeamId !== null;
    if (!playable || played >= DEMO_PLAYED_COUNT) {
      return match;
    }
    played += 1;
    // En rimlig låg målställning (0..3 per lag), deterministisk ur seeden.
    const homeGoals = Math.floor(rng() * 4);
    const awayGoals = Math.floor(rng() * 4);
    return {
      ...match,
      status: 'finished',
      result: { homeGoals, awayGoals },
    } satisfies Match;
  });
}

/** Det DELADE demo-facit, härlett ur den RIKTIGA derivePoolFacit (källans form). */
function buildDemoFacit(playedMatches: readonly Match[]): PoolFacit {
  return derivePoolFacit(fixtureTeams, fixtureGroups, playedMatches);
}

/** Sätt `userId` på varje tips-rad (bot-motorn genererar dem med tomt userId). */
function stampUserId<T extends { userId: string }>(rows: readonly T[], userId: string): T[] {
  return rows.map((row) => ({ ...row, userId }));
}

/**
 * En medlems tips i den form aggregeringen tar (källans MemberPredictions-schema). Bot-
 * motorn returnerar BotPredictions med userId '' (boten har inget user_id i ren form);
 * vi sätter rätt userId på varje rad så aggregeringen kan keya dem per deltagare.
 */
function memberPredictionsFor(userId: string, generated: BotPredictions): MemberPredictions {
  return {
    userId,
    matchPredictions: stampUserId(generated.matchPredictions, userId),
    groupPredictions: stampUserId(generated.groupPredictions, userId),
    bracketPredictions: stampUserId(generated.bracketPredictions, userId),
  };
}

/**
 * Bygg den inloggade spelarens (demo) tips med HÖG träffsäkerhet, så hjälten + den
 * egna raden demoar sig högt upp. Vi återanvänder bot-tips-generatorn med en HÖGRE
 * (men inte perfekt) accuracy via en konstruerad persona, så spelaren ligger i toppen
 * utan att vara orealistiskt perfekt.
 */
function buildSelfPredictions(
  playedMatches: readonly Match[],
  facit: PoolFacit
): MemberPredictions {
  const selfPersona: BotPersona = {
    index: 999_001,
    displayName: DEMO_SELF_DISPLAY_NAME,
    skillTier: 1, // toppen av bandet (men taket < 1, så inte perfekt)
    personality: {
      label: 'demo-spelare',
      commentChance: 0,
      reactionChance: 0,
      tone: 'lugn',
    },
    cohort: 'new-room', // tippar ALLT inkl. spelat -> får poäng
    roomIndex: null,
  };
  // Eget, generöst band så spelaren landar över botarna men under 100 % (realistiskt).
  const generated = generateBotPredictions(selfPersona, playedMatches, fixtureGroups, facit, {
    floorAccuracy: 0.6,
    capAccuracy: 0.9,
  });
  return memberPredictionsFor(DEMO_SELF_USER_ID, generated);
}

/**
 * Bygg DEMO-rummen som RoomContribution[] (formen aggregeringen tar). En per "nytt rum"
 * (botarna har redan en roomIndex), plus spelaren injicerad i de två första rummen så
 * hjälten "med i N rum" + den höga placeringen syns. Live ersätts detta av riktiga
 * per-rums-hämtningar (samma RoomContribution-form), se TotalLeaderboardProvider.
 *
 * @returns rooms (RoomContribution[]) + det delade demo-facit (samma facit alla rum
 *          poängsätts mot, en sanning) + currentUserId (demo-spelaren).
 */
export function buildDemoTotalContributions(): {
  rooms: RoomContribution[];
  facit: PoolFacit;
  currentUserId: string;
} {
  const playedMatches = buildPlayedMatches();
  const facit = buildDemoFacit(playedMatches);

  // Bara 'new-room'-botarna har poäng i demon (de tippar spelade matcher); vm2026/fsu
  // börjar på 0 (tippar bara kommande). Vi tar ALLA med så listan blir stor (~240) och
  // botar med 0p ligger längst ner, precis som live vid turneringsstart.
  const personas = generatePersonas();

  // Gruppera new-room-botar per rum-index; vm2026/fsu samlas i ett gemensamt "rum" var
  // (de hör egentligen till namngivna rum live, men för demon räcker en grupp per kohort).
  const membersByRoom = new Map<string, RoomMember[]>();
  const predsByRoom = new Map<string, Map<string, MemberPredictions>>();

  const ensureRoom = (roomId: string) => {
    if (!membersByRoom.has(roomId)) {
      membersByRoom.set(roomId, []);
      predsByRoom.set(roomId, new Map());
    }
  };

  for (const persona of personas) {
    const roomId =
      persona.cohort === 'new-room' ? `demo-room-${persona.roomIndex}` : `demo-${persona.cohort}`;
    ensureRoom(roomId);
    // Stabilt, distinkt userId per bot (index), så samma bot inte krockar mellan rum.
    const userId = `bot-${persona.index}`;
    const generated = generateBotPredictions(persona, playedMatches, fixtureGroups, facit);
    membersByRoom.get(roomId)!.push({ userId, displayName: persona.displayName });
    predsByRoom.get(roomId)!.set(userId, memberPredictionsFor(userId, generated));
  }

  // Injicera den inloggade spelaren i de två första demo-rummen med IDENTISKA tips (med i
  // FLERA rum, så RÄTTVISAN demonstreras: bästa rum, ingen rum-antals-fördel). Stark
  // profil -> hög placering (1:a, bot-taket håller botar under).
  const selfPreds = buildSelfPredictions(playedMatches, facit);
  for (const roomId of ['demo-room-0', 'demo-room-1']) {
    ensureRoom(roomId);
    // Undvik dubbel-injektion om något rum-id mot förmodan saknas (ensureRoom skapar det).
    if (!predsByRoom.get(roomId)!.has(DEMO_SELF_USER_ID)) {
      membersByRoom
        .get(roomId)!
        .push({ userId: DEMO_SELF_USER_ID, displayName: DEMO_SELF_DISPLAY_NAME });
      predsByRoom.get(roomId)!.set(DEMO_SELF_USER_ID, selfPreds);
    }
  }

  const rooms: RoomContribution[] = [...membersByRoom.keys()].map((roomId) => ({
    roomId,
    members: membersByRoom.get(roomId)!,
    predictionsByUser: predsByRoom.get(roomId)!,
  }));

  return { rooms, facit, currentUserId: DEMO_SELF_USER_ID };
}
