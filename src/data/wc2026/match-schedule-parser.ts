// Ren parser för den svenska TV-tablån -> matches.ts.
//
// EN sanning för hur det committade TV-tablå-utdraget (tv-schedule-source.txt)
// blir matchdata-filen: både generator-skriptet (scripts/generate-matches.ts,
// CLI med fil-IO) OCH källånkrings-testet (match-schedule-source.test.ts)
// importerar dessa rena funktioner. Ingen duplicerad parser, så testet kör EXAKT
// den logik genereringen kör. Inga Node-beroenden här (ren sträng in, sträng ut),
// så modulen typkollas av app-bygget och kan testas direkt.
//
// VARFÖR ett generator/parser-upplägg och inte handskriven data: matchplanen är
// 104 matcher med tider, kanaler och (för slutspelet) positions-källor, för
// felkänslig att handknappa och svår att review:a snabbt. Genom att parsa ur en
// COMMITTAD källtext och kräva värde-likhet i CI blir datan spårbar, regenererbar
// och låst till källans faktiska värden (samma mönster som T4:s Annexe C-tabell,
// se docs/patterns.md "gissningskanslig-data-genereras-ur-auktoritativ-kalla...").
//
// KÄLLA (gissas ALDRIG): Svensk TV-tablå (Daniel, 2026-06-09), ur SPEC §8:s
//   svenska sändningskällor (svenskafans, fotbollskanalen). AUKTORITATIV för
//   avsparkstid + svensk TV-kanal. Tid I KÄLLAN = svensk tid (Europe/Stockholm);
//   parsade kickoffUtc/Match.kickoff lagras i UTC (se tidszons-noten nedan).
//   Arena/stad saknas i källan (känd lucka, gissas aldrig, se VENUE_UNKNOWN).

import type { GroupId, Match, MatchStage } from '../../domain/types';

/** Sätter i källtexten där dataraderna börjar (allt innan ignoreras). */
export const SOURCE_START_MARKER = 'TV-TIDER';

/**
 * IANA-tidszonen tablåns klockslag är uttryckta i. UTC härleds ur DENNA zon
 * (inte en hårdkodad offset), så konverteringen är korrekt även om en framtida
 * tablå skulle sträcka sig över en DST-övergång. Match.kickoff lagras i UTC och
 * UI:t formaterar tillbaka till svensk tid (undviker off-by-one kring midnatt).
 */
export const SOURCE_TIMEZONE = 'Europe/Stockholm';

/**
 * Platshållare för arena/stad. Källan bär INTE arena (känd lucka, se preambeln i
 * tv-schedule-source.txt + docs/decisions.md). Match.venue är ett obligatoriskt
 * fält, så vi sätter en UTTRYCKLIG "ej verifierad"-text i stället för att gissa
 * en arena (PRINCIPLES: gissa aldrig, fail loud / synligt i stället för tyst).
 */
export const VENUE_UNKNOWN = 'Arena ej verifierad (egen data-punkt)';

/** Endast dessa TV-kanaler förekommer i källan (svensk sändningsrätt, SPEC §4). */
const VALID_CHANNELS = new Set(['SVT', 'TV4']);

/** Svenska veckodagar (parsern bryr sig bara om datumet, dagen är redundant). */
const WEEKDAYS = new Set(['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag']);

/** Svenska månadsnamn -> månadsnummer (1-baserat). */
const MONTHS: Record<string, number> = {
  januari: 1,
  februari: 2,
  mars: 3,
  april: 4,
  maj: 5,
  juni: 6,
  juli: 7,
  augusti: 8,
  september: 9,
  oktober: 10,
  november: 11,
  december: 12,
};

/**
 * Visningsnamn (som i tablån) -> lag-id (gemen FIFA-kod, samma id som teams.ts).
 * Innehåller ALIAS för tablåns namn-varianter (källan skriver "Curacao" och
 * "Kongo-Kinshasa", teams.ts har "Curaçao" respektive "DR Kongo"), så ett lag
 * aldrig gissas eller tappas. Korskoll mot teams.ts görs i källånkrings-testet.
 *
 * Notera: detta är en explicit, källhänvisad mappning, inte en gissning. Varje
 * post motsvarar ett verifierat lag i FIFA-lottningen (src/data/wc2026/teams.ts).
 */
export const TEAM_NAME_TO_ID: Record<string, string> = {
  Mexiko: 'mex',
  Sydafrika: 'rsa',
  Sydkorea: 'kor',
  Tjeckien: 'cze',
  Kanada: 'can',
  'Bosnien och Hercegovina': 'bih',
  Qatar: 'qat',
  Schweiz: 'sui',
  Brasilien: 'bra',
  Marocko: 'mar',
  Haiti: 'hai',
  Skottland: 'sco',
  USA: 'usa',
  Paraguay: 'par',
  Australien: 'aus',
  Turkiet: 'tur',
  Tyskland: 'ger',
  // Källan skriver "Curacao" (utan cedilj), teams.ts har "Curaçao".
  Curacao: 'cuw',
  Curaçao: 'cuw',
  Elfenbenskusten: 'civ',
  Ecuador: 'ecu',
  Nederländerna: 'ned',
  Japan: 'jpn',
  Sverige: 'swe',
  Tunisien: 'tun',
  Belgien: 'bel',
  Egypten: 'egy',
  Iran: 'irn',
  'Nya Zeeland': 'nzl',
  Spanien: 'esp',
  'Kap Verde': 'cpv',
  Saudiarabien: 'ksa',
  Uruguay: 'uru',
  Frankrike: 'fra',
  Senegal: 'sen',
  Irak: 'irq',
  Norge: 'nor',
  Argentina: 'arg',
  Algeriet: 'alg',
  Österrike: 'aut',
  Jordanien: 'jor',
  Portugal: 'por',
  // Källan skriver "Kongo-Kinshasa", teams.ts har "DR Kongo" (kod COD).
  'Kongo-Kinshasa': 'cod',
  'DR Kongo': 'cod',
  Uzbekistan: 'uzb',
  Colombia: 'col',
  England: 'eng',
  Kroatien: 'cro',
  Ghana: 'gha',
  Panama: 'pan',
};

/**
 * Lag-id -> grupp (A-L). Härleds INTE här utan tas som parameter av parsern (från
 * teams.ts, en sanning), så parsern inte dubblerar gruppindelningen. Se buildMatches.
 */
export type TeamGroupLookup = (teamId: string) => GroupId | undefined;

/** Slutspels-sektionernas rubriker -> stage. Gruppmatcher har ingen rubrik (TV-TIDER). */
const KNOCKOUT_SECTIONS: ReadonlyArray<{ marker: string; stage: MatchStage }> = [
  { marker: 'SEXTONDELSFINALER', stage: 'round-of-32' },
  { marker: 'ÅTTONDELSFINALER', stage: 'round-of-16' },
  { marker: 'KVARTSFINALER', stage: 'quarter-final' },
  { marker: 'SEMIFINALER', stage: 'semi-final' },
  { marker: 'BRONSMATCH', stage: 'third-place' },
  { marker: 'FINAL', stage: 'final' },
];

/** En parsad position-källa ur en slutspelsrad, t.ex. "1A", "2B", "3ABCDF", "W73", "RU101". */
export interface ParsedKnockoutSource {
  /** Den råa positions-strängen som tablån skrev (för korskoll mot bracket-structure). */
  raw: string;
}

/** En parsad gruppmatch (lag kända ur tablån). */
export interface ParsedGroupMatch {
  kind: 'group';
  /**
   * Avsparkstid som UTC ISO-instant (härlett FRÅN tablåns svenska väggklocka,
   * Europe/Stockholm, av zonedWallTimeToUtcIso). Värdet är alltså UTC, inte
   * svensk tid: vid felsökning av off-by-one kring midnatt är detta UTC-sidan.
   */
  kickoffUtc: string;
  homeTeamId: string;
  awayTeamId: string;
  tvChannel: string;
}

/** En parsad slutspelsmatch (FIFA-matchnummer + positions-källor, lag ännu okända). */
export interface ParsedKnockoutMatch {
  kind: 'knockout';
  /** FIFA:s officiella matchnummer (73-104). */
  matchNumber: number;
  stage: MatchStage;
  /** Avsparkstid som UTC ISO-instant (härlett ur svensk väggklocka, se ParsedGroupMatch). */
  kickoffUtc: string;
  home: ParsedKnockoutSource;
  away: ParsedKnockoutSource;
  tvChannel: string;
}

export type ParsedMatch = ParsedGroupMatch | ParsedKnockoutMatch;

/* ------------------------------------------------------------------ *
 * Tidszons-konvertering: svensk väggklocka -> UTC-instant.
 * ------------------------------------------------------------------ */

/**
 * Offset (minuter) för en IANA-zon vid ett givet UTC-instant, via Intl. Positiv
 * öster om Greenwich (Europe/Stockholm ger +120 i sommartid, +60 i vintertid).
 */
function zoneOffsetMinutes(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(utcMs));
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0; // "GMT" exakt = UTC.
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

/**
 * Konvertera en väggklocka i `timeZone` till ett UTC ISO-instant.
 *
 * VARFÖR (känd fälla `utc-datum-anvant-som-lokalt-datum`): tablåns "00:00 söndag
 * 14 juni" är 00:00 SVENSK tid, vilket är 2026-06-13T22:00:00Z i UTC, alltså ett
 * annat KALENDERDATUM. Att lagra "14 juni 00:00" rakt av som UTC vore off-by-one.
 * Vi härleder offset:en ur zonen vid själva instanten (hanterar DST generellt,
 * inte en hårdkodad +2) och korrigerar ett steg om instanten hamnar på andra
 * sidan en DST-gräns än startgissningen.
 */
export function zonedWallTimeToUtcIso(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): string {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = zoneOffsetMinutes(timeZone, wallAsUtc);
  let utcMs = wallAsUtc - firstOffset * 60000;
  const secondOffset = zoneOffsetMinutes(timeZone, utcMs);
  if (secondOffset !== firstOffset) {
    utcMs = wallAsUtc - secondOffset * 60000;
  }
  return new Date(utcMs).toISOString();
}

/* ------------------------------------------------------------------ *
 * Parsning av källtexten.
 * ------------------------------------------------------------------ */

/** Matchar starten på en gruppmatch-dagsrad: "Torsdag 11 juni:" -> [dag, månad]. */
const GROUP_DAY_RE = /^([A-Za-zÅÄÖåäö]+)\s+(\d{1,2})\s+([a-zåäö]+):\s*(.*)$/;

/** Matchar en gruppmatch-post: "21:00 Mexiko vs Sydafrika (TV4)". */
const GROUP_MATCH_RE = /^(\d{1,2}):(\d{2})\s+(.+?)\s+vs\s+(.+?)\s+\((SVT|TV4)\)$/;

/**
 * Matchar en slutspelsrad. Två former förekommer:
 *  - med kolon (flera matcher): "Mån 29 juni: 19:00 1C vs 2F (76) TV4; ..."
 *  - utan kolon (en match):     "Tor 09 juli 22:00 W89 vs W90 (97) TV4"
 *    eller med etikett:         "BRONSMATCH: Lör 18 juli 23:00 RU101 vs RU102 (103) SVT"
 * Vi normaliserar genom att först plocka ut datumet, sedan posterna.
 */
const KO_DATE_RE = /(\d{1,2})\s+([a-zåäö]+)/;
const KO_MATCH_RE = /(\d{1,2}):(\d{2})\s+(\S+)\s+vs\s+(\S+)\s+\((\d{2,3})\)\s+(SVT|TV4)/g;

/** Året tablån gäller. Tablån skriver inte ut året; VM 2026 är fastställt. */
export const SCHEDULE_YEAR = 2026;

function parseSwedishMonth(name: string): number {
  const month = MONTHS[name.toLowerCase()];
  if (month === undefined) {
    throw new Error(`Okänd svensk månad i källan: "${name}".`);
  }
  return month;
}

function resolveTeamId(name: string): string {
  const id = TEAM_NAME_TO_ID[name.trim()];
  if (id === undefined) {
    throw new Error(
      `Okänt lagnamn i TV-tablån: "${name}". ` +
        `Lägg till en mappning i TEAM_NAME_TO_ID (och verifiera att laget finns i teams.ts).`
    );
  }
  return id;
}

/**
 * Parsa hela TV-tablån till en lista av matcher i KÄLLTEXT-ordning (gruppmatcher
 * i tablå-ordning, sedan slutspelsmatcher i den ordning de står i källan, INTE
 * matchnummer-ordning: en enskild källrad kan lista t.ex. (76) före (74)).
 * Konsumenterna (buildMatches/buildMatchesFile, vyer) slår upp på matchnummer och
 * är ordnings-oberoende, så ingen sortering behövs.
 *
 * FAIL-LOUD vid varje oväntad rad-form, okänt lagnamn, okänd månad/kanal, så ett
 * extraktions-/transkriptions-fel syns i bygget i stället för att tyst tappa en
 * match (PRINCIPLES §8).
 *
 * @throws Om startmarkören saknas, en rad är felformad, eller ett namn/kanal/månad
 *   inte kan tolkas.
 */
export function parseSchedule(text: string): ParsedMatch[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(SOURCE_START_MARKER));
  if (start === -1) {
    throw new Error(`Hittade inte startmarkören "${SOURCE_START_MARKER}" i källtexten.`);
  }

  const matches: ParsedMatch[] = [];
  let currentStage: MatchStage = 'group';

  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;

    // Byt sektion när en slutspels-rubrik dyker upp. BRONSMATCH/FINAL bär
    // matchen på samma rad (rubrik + data), de andra rubrikerna står ensamma.
    const section = KNOCKOUT_SECTIONS.find((s) => line.startsWith(s.marker));
    if (section) {
      currentStage = section.stage;
      // BRONSMATCH/FINAL: rubriken och matchdatan står på SAMMA rad. Övriga
      // rubriker (SEXTONDELSFINALER ...) har bara en parentes-beskrivning efter
      // markören, ingen match. En match känns igen på " vs "; bara då parsas
      // resten, annars är raden en ren sektionsrubrik (drar bara om stage).
      const rest = line.slice(section.marker.length).replace(/^:\s*/, '');
      if (rest.includes(' vs ')) {
        matches.push(...parseKnockoutLine(rest, currentStage));
      }
      continue;
    }

    if (currentStage === 'group') {
      matches.push(...parseGroupLine(line));
    } else {
      matches.push(...parseKnockoutLine(line, currentStage));
    }
  }

  return matches;
}

/** Parsa en gruppmatch-dagsrad ("Torsdag 11 juni: 21:00 A vs B (TV4); ..."). */
function parseGroupLine(line: string): ParsedGroupMatch[] {
  const m = line.match(GROUP_DAY_RE);
  if (!m) {
    throw new Error(`Oväntad gruppmatch-rad (matchar inte "Veckodag DD månad:"): "${line}".`);
  }
  const [, weekday, dayStr, monthStr, rest] = m;
  if (!WEEKDAYS.has(weekday)) {
    throw new Error(`Okänd veckodag "${weekday}" i raden: "${line}".`);
  }
  const day = Number(dayStr);
  const month = parseSwedishMonth(monthStr);

  return rest
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => {
      const e = entry.match(GROUP_MATCH_RE);
      if (!e) {
        throw new Error(
          `Oväntad gruppmatch-post (matchar inte "HH:MM A vs B (KANAL)"): "${entry}".`
        );
      }
      const [, hStr, minStr, home, away, channel] = e;
      return {
        kind: 'group' as const,
        kickoffUtc: zonedWallTimeToUtcIso(
          SOURCE_TIMEZONE,
          SCHEDULE_YEAR,
          month,
          day,
          Number(hStr),
          Number(minStr)
        ),
        homeTeamId: resolveTeamId(home),
        awayTeamId: resolveTeamId(away),
        tvChannel: assertChannel(channel),
      };
    });
}

/** Parsa en slutspelsrad (en eller flera matcher med matchnummer + positions-källor). */
function parseKnockoutLine(line: string, stage: MatchStage): ParsedKnockoutMatch[] {
  const dateMatch = line.match(KO_DATE_RE);
  if (!dateMatch) {
    throw new Error(`Slutspelsrad saknar datum ("DD månad"): "${line}".`);
  }
  const day = Number(dateMatch[1]);
  const month = parseSwedishMonth(dateMatch[2]);

  const result: ParsedKnockoutMatch[] = [];
  // KO_MATCH_RE har `g`-flagga; återställ lastIndex vid varje rad (delad regex).
  KO_MATCH_RE.lastIndex = 0;
  let mm: RegExpExecArray | null;
  while ((mm = KO_MATCH_RE.exec(line)) !== null) {
    const [, hStr, minStr, home, away, numStr, channel] = mm;
    result.push({
      kind: 'knockout',
      matchNumber: Number(numStr),
      stage,
      kickoffUtc: zonedWallTimeToUtcIso(
        SOURCE_TIMEZONE,
        SCHEDULE_YEAR,
        month,
        day,
        Number(hStr),
        Number(minStr)
      ),
      home: { raw: home },
      away: { raw: away },
      tvChannel: assertChannel(channel),
    });
  }
  if (result.length === 0) {
    throw new Error(`Slutspelsrad innehöll ingen tolkbar match: "${line}".`);
  }
  return result;
}

function assertChannel(channel: string): string {
  if (!VALID_CHANNELS.has(channel)) {
    throw new Error(`Okänd TV-kanal "${channel}" (väntade SVT eller TV4).`);
  }
  return channel;
}

/* ------------------------------------------------------------------ *
 * Bygg typade Match-objekt ur de parsade matcherna.
 * ------------------------------------------------------------------ */

/** Förväntat antal matcher i hela VM 2026: 72 gruppmatcher + 32 slutspel. */
export const EXPECTED_GROUP_MATCHES = 72;
export const EXPECTED_KNOCKOUT_MATCHES = 32;
export const EXPECTED_TOTAL_MATCHES = EXPECTED_GROUP_MATCHES + EXPECTED_KNOCKOUT_MATCHES;

/**
 * Bygg den typade matchlistan ur de parsade matcherna.
 *
 * Gruppmatcher: lag kända ur tablån, groupId härleds ur `groupOf` (teams.ts, en
 * sanning, parsern dubblerar inte gruppindelningen). Status = 'scheduled',
 * resultat null (SPEC §6: resultat null tills inmatat). Id:t är stabilt och
 * läsbart: "g-<GRUPP>-<n>" i gruppens spel-ordning.
 *
 * Slutspelsmatcher: lagen är ÄNNU OKÄNDA (homeTeamId/awayTeamId = null, per
 * Match-typen: slutspelslag fylls av seedningen i T4/T9), groupId null. Id:t är
 * FIFA:s matchnummer "M<nn>" (samma id-rymd som bracket-structure.ts), så
 * matchtablån och slutspelsträdet refererar SAMMA match.
 *
 * Positions-källan (1A/3ABCDF/W73/RU101) bär INTE in i Match-objektet här, den
 * lever i bracket-structure.ts (en sanning för slutspels-positionerna). Den
 * parsade källan korskollas mot bracket-structure i match-schedule-source.test.ts.
 *
 * @throws Om en gruppmatchs lag inte tillhör samma kända grupp (data-defekt).
 */
export function buildMatches(parsed: ParsedMatch[], groupOf: TeamGroupLookup): Match[] {
  const groupSeq = new Map<GroupId, number>();
  const out: Match[] = [];

  for (const p of parsed) {
    if (p.kind === 'group') {
      const homeGroup = groupOf(p.homeTeamId);
      const awayGroup = groupOf(p.awayTeamId);
      if (homeGroup === undefined || awayGroup === undefined) {
        throw new Error(
          `Gruppmatch med okänt lag-id: ${p.homeTeamId} vs ${p.awayTeamId} (saknas i teams.ts).`
        );
      }
      if (homeGroup !== awayGroup) {
        throw new Error(
          `Gruppmatch korsar grupper: ${p.homeTeamId} (${homeGroup}) vs ` +
            `${p.awayTeamId} (${awayGroup}). En gruppmatch spelas inom EN grupp.`
        );
      }
      const n = (groupSeq.get(homeGroup) ?? 0) + 1;
      groupSeq.set(homeGroup, n);
      out.push({
        id: `g-${homeGroup}-${n}`,
        stage: 'group',
        groupId: homeGroup,
        homeTeamId: p.homeTeamId,
        awayTeamId: p.awayTeamId,
        kickoff: p.kickoffUtc,
        venue: VENUE_UNKNOWN,
        tvChannel: p.tvChannel,
        result: null,
        status: 'scheduled',
      });
    } else {
      out.push({
        id: `M${p.matchNumber}`,
        stage: p.stage,
        groupId: null,
        homeTeamId: null,
        awayTeamId: null,
        kickoff: p.kickoffUtc,
        venue: VENUE_UNKNOWN,
        tvChannel: p.tvChannel,
        result: null,
        status: 'scheduled',
      });
    }
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Emit: bygg den GENERERADE matches.ts-filen ur en byggd matchlista.
 * ------------------------------------------------------------------ */

/**
 * Citera en sträng som en TS single-quote-litteral (matchar projektets Prettier-
 * stil, så den GENERERADE filen redan är format:check-ren och inte driver mot
 * det committade innehållet vid regenerera-och-diffa). Värdena här är lag-id,
 * ISO-datum, grupp-id och kanalnamn, alla utan citattecken/backslash, men vi
 * escapar ändå defensivt så emit aldrig kan bryta litteralen.
 */
function tsString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Emittera EN Match-literal (scheduled, resultat null) i kompakt, läsbar form. */
function emitMatchLiteral(m: Match): string {
  // Bara scheduled-matcher genereras (hela matchplanen är ospelad), så formen är
  // alltid result: null + status: 'scheduled'.
  const home = m.homeTeamId === null ? 'null' : tsString(m.homeTeamId);
  const away = m.awayTeamId === null ? 'null' : tsString(m.awayTeamId);
  const groupId = m.groupId === null ? 'null' : tsString(m.groupId);
  // tvChannel är valfritt i Match-typen, men buildMatches sätter ALLTID en kanal
  // ur tablån. Saknas den här är det ett internt fel, inte en giltig match att
  // emittera tyst utan kanal: fail loud (PRINCIPLES §8).
  if (m.tvChannel === undefined) {
    throw new Error(`Match ${m.id} saknar TV-kanal vid emit (ska aldrig hända).`);
  }
  return (
    `  {\n` +
    `    id: ${tsString(m.id)},\n` +
    `    stage: ${tsString(m.stage)},\n` +
    `    groupId: ${groupId},\n` +
    `    homeTeamId: ${home},\n` +
    `    awayTeamId: ${away},\n` +
    `    kickoff: ${tsString(m.kickoff)},\n` +
    `    venue: ${tsString(m.venue)},\n` +
    `    tvChannel: ${tsString(m.tvChannel)},\n` +
    `    result: null,\n` +
    `    status: 'scheduled',\n` +
    `  },`
  );
}

/**
 * Bygg HELA innehållet i matches.ts ur TV-tablå-källtexten (LF-radslut).
 * Parsa -> bygg typade Match-objekt -> validera antal -> emittera. Vid fel KASTAS
 * ett fel (fail loud) i stället för att skriva en halv matchplan.
 *
 * Samma EN-sanning-mönster som annexe-c-parser.buildTableFile: både generatorn
 * och källånkrings-testet kör DENNA funktion, så testet bevisar att källan ->
 * tabell-koden ger exakt den committade matches.ts.
 *
 * @throws Om källan inte ger 72 gruppmatcher + 32 slutspelsmatcher.
 */
export function buildMatchesFile(text: string, groupOf: TeamGroupLookup): string {
  const parsed = parseSchedule(text);
  const matches = buildMatches(parsed, groupOf);

  const groupCount = matches.filter((m) => m.stage === 'group').length;
  const knockoutCount = matches.length - groupCount;
  if (groupCount !== EXPECTED_GROUP_MATCHES || knockoutCount !== EXPECTED_KNOCKOUT_MATCHES) {
    throw new Error(
      `Förväntade ${EXPECTED_GROUP_MATCHES} gruppmatcher + ${EXPECTED_KNOCKOUT_MATCHES} ` +
        `slutspelsmatcher, fick ${groupCount} + ${knockoutCount}.`
    );
  }

  const body = matches.map(emitMatchLiteral).join('\n');
  return `// GENERERAD FIL, redigera inte för hand. Se scripts/generate-matches.ts.
//
// VM 2026:s fullständiga matchplan: 72 gruppmatcher + 32 slutspelsmatcher
// (M73-M104), med avsparkstid (UTC) och svensk TV-kanal. GENERERAD ur den
// committade svenska TV-tablån (tv-schedule-source.txt) via den rena parsern
// (match-schedule-parser.ts), och VÄRDE-LÅST mot källan i CI
// (match-schedule-source.test.ts: regenerera-och-diffa + mutationstest).
//
// KÄLLA (gissas ALDRIG): Svensk TV-tablå (Daniel, 2026-06-09), ur SPEC §8:s
//   svenska sändningskällor (svenskafans, fotbollskanalen). AUKTORITATIV för
//   avsparkstid + svensk TV-kanal. Tid i källan = svensk tid (Europe/Stockholm);
//   kickoff nedan är UTC (UI:t formaterar tillbaka, se parserns tidszons-not).
//
// GRUPPMATCHER: lagen är kända (homeTeamId/awayTeamId satta, groupId A-L),
//   status 'scheduled', resultat null (SPEC §6: resultat null tills inmatat).
// SLUTSPELSMATCHER: id = FIFA:s matchnummer "M<nn>" (samma id som
//   bracket-structure.ts, så matchtablå och slutspelsträd refererar SAMMA match).
//   Lagen är ÄNNU OKÄNDA (homeTeamId/awayTeamId = null) tills seedningen (T4/T9)
//   löst dem; positions-källan (1A/3ABCDF/W73/RU101) lever i bracket-structure.ts.
//
// ARENA-LUCKA (känd, gissas ALDRIG): källan bär inte arena/stad, så venue är en
//   uttrycklig "ej verifierad"-platshållare (ingen gissad arena). Se docs/decisions.md.

import type { Match } from '../../domain/types';

/** Hela VM 2026:s matchplan i tablå-ordning (gruppspel) följt av M73-M104. */
export const WC2026_MATCHES: Match[] = [
${body}
];
`;
}
