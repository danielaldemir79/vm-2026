// 3-dagars FÖNSTER över resultatlistan (REN funktion, inget I/O, ingen React).
//
// PROBLEM (Daniels feedback, #39): inmatningslistan visar alla 104 VM-matcher,
// vilket blir en extremt lång lista att skrolla. Default ska bara visa matcherna
// inom de NÄRMASTE 3 DAGARNA (idag + 2 dagar till), med en expandera-kontroll i
// vyn som fäller ut allt.
//
// VARFÖR en egen ren modul (inte inline i vyn): urvalet är ren datum-logik utan
// React-beroende, så den kan enhetstestas fristående (edge-fall: turneringen ej
// börjad, slutet av turneringen, allt inom fönstret, vilodagar i fönstret) och
// vyn blir tunn. Samma uppdelning som groupMatchesByDay / deriveGroupTables
// (härledd-state-mönstret, docs/patterns.md).
//
// TIDSZONS-REGEL (DRY, återanvänder daily): "närmaste 3 dagar" mäts i SVENSKA
// kalenderdagar, inte i UTC-dygn. Match.kickoff lagras i UTC (matches.ts), men en
// match 00:00 svensk tid hör till den svenska dagen (kickoff då ~22:00Z dagen
// innan). Vi härleder därför varje matchs svenska kalenderdag via daily-lagrets
// `localDateKey` (Intl, off-by-one-säkert), den ENDA sanningen för den regeln, i
// stället för en egen UTC-datumklippning (känd fälla `utc-datum-anvant-som-lokalt
// -datum`, senior-developer lessons).

import type { Match } from '../../domain/types';
import { localDateKey } from '../daily/group-matches-by-day';

/**
 * Hur många SVENSKA kalenderdagar default-fönstret spänner, räknat från och med
 * ankardagen (idag eller premiären). 3 = idag + de två följande dagarna. En
 * konstant så vyn och testerna refererar samma sanning (ingen magisk siffra).
 */
export const WINDOW_DAYS = 3;

/** Resultatet av fönster-urvalet: vad som visas + hur mycket som döljs. */
export interface ResultWindow {
  /**
   * Matcherna inom fönstret, i samma inbördes ordning som indata (urvalet sorterar
   * inte om, vyn äger sin egen presentationsordning). Är ALLA matcher inom fönstret
   * blir detta hela listan och `hiddenCount` blir 0.
   */
  visible: Match[];
  /** Antal matcher UTANFÖR fönstret (dolda tills användaren fäller ut). >= 0. */
  hiddenCount: number;
  /**
   * Ankardagens svenska kalendernyckel (YYYY-MM-DD): fönstrets FÖRSTA dag. Lika med
   * dagens datum när turneringen pågår, eller premiärdagen när "idag" ligger FÖRE
   * den första matchen. null bara när det inte finns någon match alls (inget att
   * ankra mot). Exponeras så vyn kan förklara fönstret för användaren om den vill.
   */
  anchorKey: string | null;
}

/**
 * Räkna upp de svenska kalenderdag-nycklarna som ingår i fönstret: ankardagen och
 * de (WINDOW_DAYS - 1) följande dagarna, som en Set för O(1)-medlemskoll.
 *
 * VARFÖR UTC-midnatt i steg-aritmetiken (samma teknik som daily/enumerateDateKeys):
 * vi stegar KALENDERDAGAR, inte instanter. Genom att tolka ankarnyckeln som midnatt
 * UTC och addera exakt 24 h får varje steg garanterat nästa kalenderdatum, utan att
 * en sommartids-övergång (DST) i svensk tid kan göra ett dygn 23/25 h och hoppa över
 * eller upprepa ett datum. Nyckeln är redan ett rent svenskt kalenderdatum (härlett
 * av localDateKey); här gör vi bara ren datum-aritmetik på den.
 */
function windowDateKeys(anchorKey: string): Set<string> {
  const keys = new Set<string>();
  let cursor = new Date(`${anchorKey}T00:00:00.000Z`).getTime();
  for (let i = 0; i < WINDOW_DAYS; i += 1) {
    keys.add(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000; // exakt 24 h i UTC = nästa kalenderdatum
  }
  return keys;
}

/**
 * Välj matcherna inom de närmaste {@link WINDOW_DAYS} svenska kalenderdagarna.
 *
 * ANKARDAGEN (fönstrets första dag) bestäms av var "idag" ligger relativt
 * matcherna, så fönstret alltid visar något relevant (aldrig en tom default-vy):
 *  - "idag" ligger FÖRE den första matchen (turneringen ej börjad) -> ankra på
 *    PREMIÄRDAGEN (första matchens svenska dag), så premiärfönstret visas. Annars
 *    hade ett fönster runt "idag" varit tomt och hela listan känts gömd.
 *  - annars (turneringen pågår eller är passerad) -> ankra på "IDAG". Ligger hela
 *    turneringen i det förflutna blir fönstret runt idag tomt och hiddenCount =
 *    antalet matcher (allt är "utanför" det framåtblickande fönstret); det är rätt:
 *    det finns inga kommande matcher att lyfta fram, expandera visar historiken.
 *
 * EDGE-FALL (alla testade):
 *  - Tom indata -> tom `visible`, hiddenCount 0, anchorKey null.
 *  - Turneringen ej börjad -> premiärfönstret (ankaret = premiärdagen).
 *  - Färre än 3 dagars matcher kvar (slutet) -> fönstret slutar naturligt vid sista
 *    matchen, inga extra dagar uppfinns.
 *  - Alla matcher inom fönstret -> visible = alla, hiddenCount 0 (vyn döljer knappen).
 *  - Vilodag inom fönstret -> ingen match den dagen, fönstret hoppar inte över den
 *    (kalenderdagarna räknas oavsett om de har matcher), så en match dag 3 syns även
 *    om dag 2 är en vilodag.
 *
 * @param matches  Alla matcher (UTC-kickoff). Ordningen bevaras i `visible`.
 * @param now      "Nu" (injicerbart för test). Bara dess svenska kalenderdatum läses.
 * @param timeZone Zonen dagar mäts i (default svensk tid, via localDateKey). Injicerbar.
 */
export function windowMatches(
  matches: readonly Match[],
  now: Date | number = Date.now(),
  timeZone?: string
): ResultWindow {
  if (matches.length === 0) {
    return { visible: [], hiddenCount: 0, anchorKey: null };
  }

  // Härled varje matchs svenska kalenderdag EN gång (undvik upprepade Intl-anrop).
  const dayKeys = matches.map((m) => localDateKey(m.kickoff, timeZone));

  // Premiärdagen = den tidigaste svenska kalenderdagen någon match spelas (ISO-form,
  // så sträng-min = datum-min). Stabil oavsett indata-ordning.
  const premiereKey = dayKeys.reduce((min, key) => (key < min ? key : min), dayKeys[0]);

  // Dagens svenska kalenderdag (samma härledning som daily/initialDayIndex).
  const todayKey = localDateKey(
    new Date(typeof now === 'number' ? now : now.getTime()).toISOString(),
    timeZone
  );

  // Ankardag: premiären om idag ligger före den (turneringen ej börjad), annars idag.
  const anchorKey = todayKey < premiereKey ? premiereKey : todayKey;

  const windowKeys = windowDateKeys(anchorKey);

  const visible: Match[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    if (windowKeys.has(dayKeys[i])) {
      visible.push(matches[i]);
    }
  }

  return {
    visible,
    hiddenCount: matches.length - visible.length,
    anchorKey,
  };
}
