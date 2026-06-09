// Treeplats-motorn (den KRITISKA, gissningskänsliga biten i SPEC §5).
//
// Givet VILKA 8 av de 12 grupperna som bidrar med en kvalificerad bästa trea,
// avgör motorn vilken trea (3X) som hamnar i vilken sextondelsfinal, enligt
// FIFA:s FÖRBESTÄMDA Annexe C-tabell. Detta gissas ALDRIG: tilldelningen slås
// upp i den källhänvisade tabellen (third-place-table.ts).
//
// Motorn är STRUKTURELL: den arbetar på grupp-positioner (3:a-från-grupp-X),
// inte på lagidentiteter, så den kan byggas och uttömmande testas oberoende av
// den faktiska 2026-lottningen.
//
// KÄLLA (gissas ALDRIG): Regulations for the FIFA World Cup 26 (May 2026):
//   - Annexe C (tabellen) sid. 80-97.
//   - Article 12.6 (vilken kolumn -> vilken sextondelsfinal) sid. 23-24.
//   https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf

import type { GroupId } from '../types';
import { GROUP_IDS } from '../types';
import { THIRD_PLACE_COLUMN_WINNERS, THIRD_PLACE_TABLE } from './third-place-table';

/**
 * Antalet treor som går vidare (de 8 bästa av 12), SPEC §5. Lika med Annexe C:s
 * kolumnantal.
 */
export const QUALIFYING_THIRDS = 8;

/**
 * Vilken sextondelsfinal varje Annexe C-kolumn (gruppvinnare) tillhör.
 * Annexe C:s kolumnordning är [1A, 1B, 1D, 1E, 1G, 1I, 1K, 1L] och varje sådan
 * gruppvinnare möter sin trea i en bestämd match (Article 12.6):
 *   1A -> M79, 1B -> M85, 1D -> M81, 1E -> M74,
 *   1G -> M82, 1I -> M77, 1K -> M87, 1L -> M80.
 * Index här matchar THIRD_PLACE_COLUMN_WINNERS exakt.
 */
export const COLUMN_MATCH_IDS = ['M79', 'M85', 'M81', 'M74', 'M82', 'M77', 'M87', 'M80'] as const;

/**
 * Tilldelningen för EN sextondelsfinal: vilken sextondelsfinal (matchnummer),
 * vilken gruppvinnare som är hemma, och vilken grupps trea som möter den.
 */
export interface ThirdPlaceAssignment {
  /** Sextondelsfinalens officiella matchnummer-id, t.ex. "M79". */
  matchId: string;
  /** Gruppvinnaren som möter trean (Annexe C-kolumnens grupp), t.ex. "A" för 1A. */
  winnerGroup: GroupId;
  /** Gruppen vars trea seedas hit, t.ex. "C" för "3C". */
  thirdPlaceGroup: GroupId;
}

/** En normaliserad nyckel för en mängd grupper: sorterade grupp-id sammanfogade. */
function groupSetKey(groups: readonly GroupId[]): string {
  return [...groups].sort().join('');
}

/** En rad ur Annexe C-tabellen (8 grupper i kolumnordning). */
type ThirdPlaceRow = (typeof THIRD_PLACE_TABLE)[number];

/**
 * Förbygg en uppslagsindex från grupp-kombination -> Annexe C-rad EN gång, så
 * seedningen blir O(1) per anrop i stället för O(495) linjär sökning. Tabellen
 * är konstant (genererad), så indexet byggs vid modul-laddning.
 *
 * Nyckel: sorterad sträng av de 8 kvalificerade grupperna (t.ex. "EFGHIJKL").
 * Värde: radens 8 grupper i kolumnordning (THIRD_PLACE_COLUMN_WINNERS).
 */
const TABLE_INDEX: ReadonlyMap<string, ThirdPlaceRow> = buildTableIndex();

function buildTableIndex(): Map<string, ThirdPlaceRow> {
  const index = new Map<string, ThirdPlaceRow>();
  for (const row of THIRD_PLACE_TABLE) {
    // En rads 8 värden ÄR exakt de grupper vars trea kvalificerade sig, så
    // raden är sin egen nyckel (se third-place-table.ts).
    index.set(groupSetKey(row), row);
  }
  return index;
}

/**
 * Validera att indata är exakt 8 GILTIGA, UNIKA grupper. Fail loud (kastar) på
 * ogiltig indata i stället för att tyst returnera fel seedning, det här är
 * kärnan i dataintegritets-kravet (SPEC §5): hellre ett tydligt fel än en
 * gissad treeplats. Returnerar de validerade grupperna.
 */
function validateQualifyingGroups(qualifyingThirds: readonly GroupId[]): readonly GroupId[] {
  if (qualifyingThirds.length !== QUALIFYING_THIRDS) {
    throw new Error(
      `Seedning av bästa treor kräver exakt ${QUALIFYING_THIRDS} grupper, fick ${qualifyingThirds.length}.`
    );
  }
  const valid = new Set<GroupId>(GROUP_IDS);
  const unique = new Set<GroupId>();
  for (const group of qualifyingThirds) {
    if (!valid.has(group)) {
      throw new Error(`Ogiltigt grupp-id i seedningen: "${group}" (giltiga är A-L).`);
    }
    if (unique.has(group)) {
      throw new Error(`Dubblerad grupp i seedningen: "${group}".`);
    }
    unique.add(group);
  }
  return qualifyingThirds;
}

/**
 * Seeda de 8 bästa treorna in i sextondelsfinalerna enligt FIFA:s Annexe C.
 *
 * @param qualifyingThirds  De 8 grupper vars trea gick vidare (i valfri ordning).
 * @returns  En tilldelning per sextondelsfinal med trea (8 st), i COLUMN_MATCH_IDS-
 *           ordning. Garanterat KOLLISIONSFRI: varje trea och varje match
 *           förekommer exakt en gång (vaktas av Annexe C-tabellens konstruktion
 *           och av motorns validering).
 * @throws   Om indata inte är exakt 8 giltiga unika grupper, eller om
 *           kombinationen saknas i Annexe C (ska aldrig hända för en giltig
 *           kombination, fail loud om tabellen vore ofullständig).
 */
export function seedThirdPlaces(
  qualifyingThirds: readonly GroupId[]
): readonly ThirdPlaceAssignment[] {
  const groups = validateQualifyingGroups(qualifyingThirds);

  const row = TABLE_INDEX.get(groupSetKey(groups));
  if (!row) {
    // Med giltig indata kan detta bara hända om Annexe C-tabellen vore
    // ofullständig, vilket ett test (third-place-table.test.ts) utesluter.
    // Fail loud hellre än att gissa en seedning.
    throw new Error(
      `Kombinationen ${groupSetKey(groups)} saknas i FIFA:s Annexe C-tabell (oväntat).`
    );
  }

  // row[i] = grupp vars trea möter gruppvinnaren i kolumn i; kolumn i:s match
  // är COLUMN_MATCH_IDS[i] och dess gruppvinnare THIRD_PLACE_COLUMN_WINNERS[i].
  return THIRD_PLACE_COLUMN_WINNERS.map((winnerGroup, i) => ({
    matchId: COLUMN_MATCH_IDS[i],
    winnerGroup,
    thirdPlaceGroup: row[i],
  }));
}
