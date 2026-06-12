// PRELIMINÄR treplats-seedning ur NUVARANDE (ofullständiga) tabeller (T56, #100).
//
// DANIELS ÖNSKAN (issue #100): "även fast de inte spelat så kan man visa det
// levande nu med de positioner som är nu. så kan den röra sig efter varje resultat
// som matas in. roligt så att se redan nu." Slutspelsträdet ska alltså visa de 8
// bästa treornas NUVARANDE seedning redan under gruppspelet, inte bara "möjliga
// lag", och röra sig vid varje inmatat resultat.
//
// SKILLNADEN mot den SKARPA seedningen (computeThirdPlaceRanking i
// rank-third-places.ts): den skarpa returnerar `qualifyingGroups: null` tills ALLA
// 12 grupper är FÄRDIGSPELADE (fail-safe, en grupp som inte spelat klart kan ändra
// vilka 8 treor som kvalificerar). Det är RÄTT för det riktiga, låsta trädet och
// rörs ALDRIG här. Den här modulen är en SEPARAT, uttryckligen PRELIMINÄR härledning
// för live-vyn: den seedar de 8 NUVARANDE bästa treorna så man ser läget röra sig,
// men allt den producerar är märkt preliminärt i UI:t ("Nuvarande ställning, inte
// klart förrän grupperna är färdigspelade"), samma ärlighets-anda som T51:s
// simulering (gissa aldrig fram ett facit-sken).
//
// ============================================================================
// HARD, INGEN PARALLELL SEEDNING (gissa aldrig, PRINCIPLES §4):
//   Vi ÅTERANVÄNDER exakt de källlåsta motorerna:
//     - rankThirdPlaces (FIFA Article 13: poäng -> total målskillnad -> gjorda mål)
//     - seedThirdPlaces (FIFA Annexe C, 495 källlåsta kombinationer)
//   Ingen egen rankningstabell, ingen egen Annexe C. Den enda skillnaden mot den
//   skarpa vägen är NÄR vi seedar (på nuvarande ställning i stället för bara när
//   allt är klart), inte HUR.
//
// ÄRLIG GRÄNS för vad preliminär seedning kan säga (dokumenterad, inte gissad):
//   FIFA Article 13 rangordnar treorna ÖVER grupper (poäng/MS/mål jämförs mellan
//   12 olika gruppers treor). En sådan jämförelse är bara meningsfull när ALLA 12
//   grupperna HAR en nuvarande trea att jämföra (annars rangordnar vi en delmängd
//   och "8 bästa" är en gissning om en grupp utan trea ännu). Därför seedar vi
//   preliminärt ENDAST när alla 12 kanoniska grupperna har en rank-3-rad just nu.
//   Saknar någon grupp en nuvarande trea (t.ex. en grupp som inte spelat alls)
//   lämnar vi bästa-trea-slotarna i sitt "möjliga lag"-läge i stället för att
//   seeda på en ofullständig jämförelse. Detta är medvetet SAMMA täcknings-krav
//   (alla 12 grupper representerade) som den skarpa vägen använder för
//   qualifyingGroups, skillnaden är bara att vi inte kräver FÄRDIGSPELAT.
// ============================================================================

import type { GroupId, GroupTable } from '../types';
import { GROUP_IDS } from '../types';
import { rankThirdPlaces } from './rank-third-places';
import { seedThirdPlaces, QUALIFYING_THIRDS } from './seed-third-places';

/**
 * Seeda de 8 NUVARANDE bästa treorna in i sextondelsfinalerna utifrån de nuvarande
 * (ev. ofullständiga) tabellerna, via FIFA:s Annexe C. PRELIMINÄRT: resultatet är
 * giltigt bara för den nuvarande ställningen och kan ändras vid nästa resultat.
 *
 * @param tables  De härledda grupptabellerna just nu (deriveGroupTables). Behöver
 *                INTE vara färdigspelade, men varje grupp måste ha en nuvarande
 *                rank-3-rad för att en ärlig övergripande rankning ska gå att göra.
 * @returns       En Map matchId -> grupp vars NUVARANDE trea seedas dit (Annexe C),
 *                eller en TOM Map om de 12 nuvarande treorna inte kan rangordnas
 *                (någon grupp saknar en nuvarande trea). Tom Map => inga preliminära
 *                treor placeras, slotarna stannar i "möjliga lag"-läget.
 *
 * VARFÖR returnera grupp (inte lag-id): exakt som den skarpa vägen i deriveBracket,
 * så anroparen slår upp den nuvarande rank-3-trean i gruppens tabell. En sanning
 * för "vem är trea i grupp X just nu" (tabellen), inte ett fruset lag-id här.
 */
export function preliminaryThirdSeeding(
  tables: readonly GroupTable[]
): ReadonlyMap<string, GroupId> {
  // Återanvänd FIFA Article 13-rankningen på nuvarande ställning. rankThirdPlaces
  // hoppar över en grupp utan rank-3-rad, så `ranked` har en trea PER grupp som
  // har en just nu (kan vara färre än 12).
  const ranked = rankThirdPlaces(tables);

  // Ärlig gräns: kräv en nuvarande trea i ALLA 12 kanoniska grupperna (unik
  // täckning, samma krav som den skarpa qualifyingGroups, men utan färdigspelat).
  // Annars vore "8 bästa av en delmängd" en gissning om en grupp utan nuvarande
  // trea (gissa aldrig). Då returnerar vi tom Map -> ingen preliminär seedning.
  const rankedGroups = new Set(ranked.map((t) => t.group));
  const allGroupsPresent = GROUP_IDS.every((g) => rankedGroups.has(g));
  if (!allGroupsPresent) {
    return new Map();
  }

  // De 8 NUVARANDE bästa grupperna (i grupp-bokstavsordning, formen seedThirdPlaces
  // tar emot), seedade via den källlåsta Annexe C-tabellen. Samma motor som den
  // skarpa vägen, bara på nuvarande ställning.
  const qualifyingGroups = [...ranked.slice(0, QUALIFYING_THIRDS).map((t) => t.group)].sort();

  const byMatchId = new Map<string, GroupId>();
  for (const assignment of seedThirdPlaces(qualifyingGroups)) {
    byMatchId.set(assignment.matchId, assignment.thirdPlaceGroup);
  }
  return byMatchId;
}
