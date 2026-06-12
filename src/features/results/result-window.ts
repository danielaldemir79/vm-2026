// FÖNSTER över match-listan (REN funktion, inget I/O, ingen React).
//
// PROBLEM (Daniels feedback, #39): listan visar alla 104 VM-matcher, vilket blir
// en extremt lång lista att skrolla. Default ska bara visa matcherna i ett litet
// fönster runt NU, med en expandera-kontroll i vyn som fäller ut allt.
//
// FÖNSTRET: igår (bakåt) + idag + de 2 följande dagarna (fyra svenska kalenderdagar).
// Den FRAMÅTBLICKANDE delen (idag + 2 fram) är #39:s ursprungliga 3-dagars fönster.
// Den BAKÅTBLICKANDE delen (igår, ett FAST spann) lades till i T62 (#111):
//
//   PROBLEM (Daniels rapport 2026-06-12, #111): T58:s per-match-poäng visas bara på
//   AVGJORDA matcher, och de enda avgjorda matcherna är gårdagens (och tidigare).
//   Ett rent framåtblickande fönster (idag + 2 fram) gömmer dem, så användaren möter
//   ALDRIG sina poäng i default-vyn, bara via "Visa alla". Lösningen är att alltid
//   ta med IGÅR i fönstret, så de nyss avgjorda matcherna (med poäng) syns kvar
//   dagen efter.
//
//   VARFÖR ett FAST bakåt-spann (igår) och inte "senaste spel-dag oavsett hur långt
//   bort": VM:s gruppspel spelar matcher VARJE dag, så igår ÄR den senaste spel-dagen
//   exakt i den fas där problemet uppstår nu, och ett fast spann drar aldrig in en
//   gammal match (kräver ingen gissning om schemats längsta vilo-lucka). Avgränsning
//   (medveten, dokumenterad): är gårdagen en vilodag tas förrgårs match inte med i
//   default, den nås via "Visa alla". Beslut + motivering: docs/decisions.md (T62).
//
// VARFÖR en egen ren modul (inte inline i vyn): urvalet är ren datum-logik utan
// React-beroende, så den kan enhetstestas fristående (edge-fall: turneringen ej
// börjad, slutet av turneringen, allt inom fönstret, vilodagar i fönstret, gårdagens
// match syns) och vyn blir tunn. Samma uppdelning som groupMatchesByDay /
// deriveGroupTables (härledd-state-mönstret, docs/patterns.md).
//
// TIDSZONS-REGEL (DRY, återanvänder daily): fönster-dagarna mäts i SVENSKA
// kalenderdagar, inte i UTC-dygn. Match.kickoff lagras i UTC (matches.ts), men en
// match 00:00 svensk tid hör till den svenska dagen (kickoff då ~22:00Z dagen
// innan). Vi härleder därför varje matchs svenska kalenderdag via daily-lagrets
// `localDateKey` (Intl, off-by-one-säkert), den ENDA sanningen för den regeln, i
// stället för en egen UTC-datumklippning (känd fälla `utc-datum-anvant-som-lokalt
// -datum`, senior-developer lessons).

import type { Match } from '../../domain/types';
import { localDateKey } from '../daily/group-matches-by-day';

/**
 * Hur många SVENSKA kalenderdagar den FRAMÅTBLICKANDE delen av fönstret spänner,
 * räknat från och med idag (eller premiären när turneringen ej börjat). 3 = idag +
 * de två följande dagarna. Detta är #39:s ursprungliga fönster-bredd. En konstant
 * så vyn och testerna refererar samma sanning (ingen magisk siffra).
 */
export const WINDOW_DAYS = 3;

/**
 * Hur många SVENSKA kalenderdagar fönstret även spänner BAKÅT från idag (T62/#111).
 * 1 = igår tas alltid med, så de NYSS SPELADE matcherna (gårdagens avgjorda, de enda
 * med T58-poäng under gruppspelet) syns kvar i default-vyn i stället för att glida ut
 * ur ett rent framåtblickande fönster. Daniels rapport 2026-06-12 (#111).
 *
 * VARFÖR ett fast spann (igår) och inte "senaste spel-dag oavsett hur långt bort":
 * VM 2026:s gruppspel spelar matcher VARJE dag (premiär 11 juni till 27 juni), så
 * "igår" ÄR den senaste spel-dagen exakt i den fas där Daniels problem uppstår nu.
 * Ett fast spann är symmetriskt med det framåtblickande fönstret, drar aldrig in en
 * gammal match från flera veckor sedan, och kräver ingen gissning om VM-schemats
 * längsta vilo-lucka. Avgränsning (medveten, dokumenterad i docs/decisions.md T62):
 * är gårdagen en VILODAG (kan hända mellan gruppspel/slutspel och i slutspelet) tas
 * förrgårs match inte med i default, den nås via "Visa alla". I de faserna är listan
 * ändå kort så fönstret döljer nästan inget.
 */
export const LOOKBACK_DAYS = 1;

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
   * Ankardagens svenska kalendernyckel (YYYY-MM-DD): fönstrets FÖRSTA dag. När
   * turneringen pågår är det idag minus {@link LOOKBACK_DAYS} (igår, T62/#111), så de
   * nyss spelade matcherna syns kvar. När "idag" ligger FÖRE första matchen
   * (turneringen ej börjad) är det premiärdagen (det rena framåtblickande
   * premiärfönstret, bakåt-spannet läggs inte före premiären). null bara när det inte
   * finns någon match alls (inget att ankra mot). Exponeras så vyn kan förklara
   * fönstret för användaren om den vill.
   */
  anchorKey: string | null;
}

/** Lägg N svenska kalenderdagar till en datumnyckel (N kan vara negativt). */
function addDays(dayKey: string, days: number): string {
  const ms = new Date(`${dayKey}T00:00:00.000Z`).getTime() + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Räkna upp de svenska kalenderdag-nycklarna i fönstret, från `startKey` till och
 * med `endKey` (inklusive båda), som en Set för O(1)-medlemskoll. `startKey` får
 * inte ligga efter `endKey` (callern garanterar det, se windowMatches).
 *
 * VARFÖR UTC-midnatt i steg-aritmetiken (samma teknik som daily/enumerateDateKeys):
 * vi stegar KALENDERDAGAR, inte instanter. Genom att tolka nyckeln som midnatt UTC
 * och addera exakt 24 h får varje steg garanterat nästa kalenderdatum, utan att en
 * sommartids-övergång (DST) i svensk tid kan göra ett dygn 23/25 h och hoppa över
 * eller upprepa ett datum. Nycklarna är redan rena svenska kalenderdatum (härledda
 * av localDateKey); här gör vi bara ren datum-aritmetik på dem.
 */
function windowDateKeys(startKey: string, endKey: string): Set<string> {
  const keys = new Set<string>();
  let cursor = new Date(`${startKey}T00:00:00.000Z`).getTime();
  const end = new Date(`${endKey}T00:00:00.000Z`).getTime();
  while (cursor <= end) {
    keys.add(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000; // exakt 24 h i UTC = nästa kalenderdatum
  }
  return keys;
}

/**
 * Välj matcherna i fönstret: från igår (bakåt-spannet {@link LOOKBACK_DAYS}, T62)
 * till och med idag + de följande {@link WINDOW_DAYS}-1 dagarna (det framåtblickande
 * #39-fönstret).
 *
 * ANKARDAGEN (fönstrets första dag) bestäms av var "idag" ligger relativt matcherna,
 * så fönstret alltid visar något relevant (aldrig en tom default-vy) OCH tar med de
 * nyss spelade matcherna (T62/#111):
 *  - "idag" ligger FÖRE den första matchen (turneringen ej börjad) -> ankra på
 *    PREMIÄRDAGEN (första matchens svenska dag), rent framåtblickande premiärfönster.
 *    Bakåt-spannet läggs INTE före premiären (det vore en tom historik som gömmer
 *    premiären lägre i listan).
 *  - annars (turneringen pågår eller är passerad) -> ankra på IGÅR (idag minus
 *    LOOKBACK_DAYS), så gårdagens avgjorda matcher med poäng (T58) syns kvar i
 *    default-vyn. Fönstrets slut är alltid idag + (WINDOW_DAYS-1), så de KOMMANDE
 *    matcherna också syns. Ligger hela turneringen i det förflutna täcker bakåt-
 *    spannet ändå bara igår+, så bara matcher från igår och framåt syns (äldre nås
 *    via expandera), medan ett pågående slut visar gårdag + idag + morgondag.
 *
 * EDGE-FALL (alla testade):
 *  - Tom indata -> tom `visible`, hiddenCount 0, anchorKey null.
 *  - Turneringen ej börjad -> premiärfönstret (ankaret = premiärdagen, inget bakåt).
 *  - Färre än 3 dagars matcher kvar framåt (slutet) -> fönstret slutar naturligt vid
 *    sista matchen, inga extra dagar uppfinns.
 *  - Alla matcher inom fönstret -> visible = alla, hiddenCount 0 (vyn döljer knappen).
 *  - Vilodag inom fönstret -> ingen match den dagen, fönstret hoppar inte över den
 *    (kalenderdagarna räknas oavsett om de har matcher).
 *  - Gårdagens spelade match (T62) -> syns kvar tillsammans med dagens/morgondagens
 *    kommande, så användaren möter sin T58-poäng utan att fälla ut.
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

  // Ankardag (fönstrets första dag):
  //  - turneringen ej börjad (idag < premiären) -> premiären (rent framåtfönster).
  //  - annars -> igår (idag minus LOOKBACK_DAYS, T62), GOLVAT på premiären så bakåt-
  //    spannet aldrig läggs före första matchen (en tom historik som bara skulle gömma
  //    premiären längre ner i listan). ISO-datum -> sträng-max = senare datum = golvet.
  const yesterdayKey = addDays(todayKey, -LOOKBACK_DAYS);
  const anchorKey =
    todayKey < premiereKey ? premiereKey : yesterdayKey < premiereKey ? premiereKey : yesterdayKey;

  // Fönstrets SLUT: alltid det framåtblickande #39-fönstret. När turneringen ej börjat
  // räknas det från premiären (premiärfönstret, oförändrat #39-beteende), annars från
  // idag. endKey >= anchorKey alltid (anchorKey <= idag <= endKey i pågående läge;
  // ej börjad: anchorKey = premiären = endKey - (WINDOW_DAYS-1) <= endKey).
  const windowEndKey =
    todayKey < premiereKey
      ? addDays(premiereKey, WINDOW_DAYS - 1)
      : addDays(todayKey, WINDOW_DAYS - 1);

  const windowKeys = windowDateKeys(anchorKey, windowEndKey);

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
