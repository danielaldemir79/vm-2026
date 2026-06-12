// Ren parser för lag-profil-källan -> team-profiles.ts.
//
// EN sanning för hur det committade källutdraget (team-profiles-source.txt) blir
// profildata-filen: både generator-skriptet (scripts/generate-team-profiles.ts,
// CLI med fil-IO) OCH källånkrings-testet (team-profiles-source.test.ts)
// importerar dessa rena funktioner. Ingen duplicerad parser, så testet kör EXAKT
// den logik genereringen kör. Inga Node-beroenden här (ren sträng in, sträng ut),
// så modulen typkollas av app-bygget och kan testas direkt.
//
// VARFÖR ett generator/parser-upplägg och inte handskriven data: profildatan är
// 48 lag x (FIFA-ranking + stjärnspelare + kuriosa), gissningskänslig (en felaktig
// rank eller en spelare som inte finns i truppen vore en faktatabbe), och därmed
// värd att låsa mot en COMMITTAD källtext med värde-likhet i CI (samma mönster som
// T4:s Annexe C-tabell och T4b:s matchtablå, se docs/patterns.md
// "gissningskanslig-data-genereras-ur-auktoritativ-kalla-med-validerande-generator").
//
// KÄLLOR (gissas ALDRIG): se preambeln i team-profiles-source.txt.
//   - FIFA-ranking: FIFA/Coca-Cola Men's World Ranking, JUNIUTGÅVAN 2026-06-11 (T69,
//     ersatte aprilutgåvan som var senast vid T10).
//   - Stjärnspelare: VM 2026:s slutgiltiga 26-mannatrupper (offentliggjorda 2026-06-02),
//     redaktionellt urval men varje spelare bevisligen i truppen enligt källa.
//   - Kuriosa: verifierbara VM-fakta (antal tidigare slutspel + bästa placering).
//   - "Bästa speldraget" UTELÄMNAS med flit (subjektivt utan källa, se decisions.md T10).

import type { GroupId } from '../../domain/types';

/** Sätter i källtexten där dataraderna börjar (allt innan ignoreras). */
export const SOURCE_START_MARKER = 'PROFILES';

/** Fält-separator i en datarad ("CODE | rank=N | star=... | kuriosa=..."). */
const FIELD_SEPARATOR = ' | ';

/** Separator mellan stjärnspelar-namn inom star-fältet. */
const STAR_SEPARATOR = ';';

/** Max antal stjärnspelare per lag (källan ger 1-3, fler vore ett indata-fel). */
export const MAX_STAR_PLAYERS = 3;

/**
 * En lag-profil som den committade team-profiles.ts exponerar per lag-id.
 *
 * `fifaRanking` (FIFA-position), `starPlayers` (1-3 namn, kan vara tom array om
 * inga källbelagda) och `trivia` (en kort kuriosa-rad) speglar de valfria
 * Team-fälten (domain/types.ts). `bestPlay` finns medvetet INTE: det är
 * subjektivt utan källa och utelämnas (decisions.md T10), profil-vyn använder
 * FIFA-rankingen som styrke-signal i stället. Hellre tomt än gissat.
 */
export interface TeamProfile {
  fifaRanking: number;
  starPlayers: string[];
  trivia: string;
}

/** Hela profil-tabellen: lag-id (gemen landskod) -> profil. */
export type TeamProfileTable = Record<string, TeamProfile>;

/**
 * Det generatorn/testet behöver veta om lagen, injicerat så parsern INTE
 * dubblerar teams.ts (en sanning för lag-listan, samma mönster som groupOf i
 * match-schedule-parser). `code` = FIFA-trebokstavskod (versaler), `id` = gemen
 * kod, `group` = grupp-id. Lagen kommer i teams.ts A-L-ordning.
 */
export interface TeamRef {
  id: string;
  code: string;
  group: GroupId;
}

/** En parsad källrad (innan den valideras mot lag-listan). */
export interface ParsedProfileRow {
  code: string;
  fifaRanking: number;
  starPlayers: string[];
  trivia: string;
}

/**
 * Plocka ut ett namngivet fält ("nyckel=värde") ur en rad-del och returnera
 * värdet (trimmat). Fail loud om delen inte har formen `nyckel=...`, så ett
 * format-fel i källan stoppar genereringen i stället för att tyst tappa data.
 */
function fieldValue(part: string, key: string): string {
  const prefix = `${key}=`;
  if (!part.startsWith(prefix)) {
    throw new Error(`Väntade fält "${key}=..." men fick "${part}".`);
  }
  return part.slice(prefix.length).trim();
}

/**
 * Parsa EN datarad till en ParsedProfileRow. Strikt: exakt fyra fält i ordning
 * (CODE, rank=, star=, kuriosa=). Fail loud vid fel form, fel ranking-tal eller
 * för många stjärnspelare. Ren funktion (ingen IO).
 */
export function parseProfileRow(line: string): ParsedProfileRow {
  const parts = line.split(FIELD_SEPARATOR).map((p) => p.trim());
  if (parts.length !== 4) {
    throw new Error(
      `Profilrad ska ha 4 fält (CODE | rank= | star= | kuriosa=), fick ${parts.length}: "${line}".`
    );
  }
  const [codePart, rankPart, starPart, triviaPart] = parts;

  const code = codePart.trim();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error(`Ogiltig FIFA-kod "${code}" (väntade 3 versaler) i rad: "${line}".`);
  }

  const rankRaw = fieldValue(rankPart, 'rank');
  // Strikt heltals-parse: avvisa "12abc", tomt, negativt, decimaltal. En FIFA-
  // position är ett positivt heltal; allt annat är ett indata-fel (fail loud).
  if (!/^\d+$/.test(rankRaw)) {
    throw new Error(`Ogiltig FIFA-ranking "${rankRaw}" (väntade positivt heltal) för ${code}.`);
  }
  const fifaRanking = Number(rankRaw);
  if (fifaRanking < 1) {
    throw new Error(`FIFA-ranking måste vara >= 1, fick ${fifaRanking} för ${code}.`);
  }

  const starRaw = fieldValue(starPart, 'star');
  // Tomt star-fält = inga källbelagda stjärnspelare (giltigt, hellre tomt än
  // gissat). Annars 1-MAX namn separerade med ';'.
  const starPlayers =
    starRaw === ''
      ? []
      : starRaw
          .split(STAR_SEPARATOR)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
  if (starPlayers.length > MAX_STAR_PLAYERS) {
    throw new Error(
      `För många stjärnspelare (${starPlayers.length} > ${MAX_STAR_PLAYERS}) för ${code}.`
    );
  }

  const trivia = fieldValue(triviaPart, 'kuriosa');
  if (trivia === '') {
    throw new Error(`Tom kuriosa-rad för ${code} (väntade en kort faktarad).`);
  }

  return { code, fifaRanking, starPlayers, trivia };
}

/**
 * Parsa hela källtexten till profilrader (i källans ordning). Hoppar fram till
 * SOURCE_START_MARKER (preambeln ignoreras), ignorerar tomma rader och
 * '#'-kommentarer. Ren funktion (ingen IO).
 *
 * @throws Om start-markören saknas, så en trasig källa inte tyst ger noll rader.
 */
export function parseProfiles(text: string): ParsedProfileRow[] {
  const lines = text.split('\n');
  const startIndex = lines.findIndex((l) => l.trim() === SOURCE_START_MARKER);
  if (startIndex === -1) {
    throw new Error(`Hittade inte start-markören "${SOURCE_START_MARKER}" i källutdraget.`);
  }
  const rows: ParsedProfileRow[] = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    rows.push(parseProfileRow(trimmed));
  }
  return rows;
}

/**
 * Bygg den typade profil-tabellen ur de parsade raderna, VALIDERAD mot lag-listan
 * (teams.ts via TeamRef[]). Detta är källånkringens hjärta: profildatan måste
 * matcha EXAKT de 48 lagen, varken mer eller mindre. Fail loud (PRINCIPLES §8) vid:
 *   - okänd kod (rad utan motsvarande lag i teams.ts),
 *   - dubblett (samma kod två gånger i källan),
 *   - drift i ANTAL eller MÄNGD (ett lag saknar profil, eller en profil saknar lag).
 *
 * Returnerar en map lag-ID (gemen kod) -> TeamProfile, så konsumenten slår upp på
 * Team.id (samma nyckel som matcher/tabeller använder).
 *
 * @throws Vid varje form av drift mellan källan och teams.ts.
 */
export function buildProfileTable(
  rows: ParsedProfileRow[],
  teams: readonly TeamRef[]
): TeamProfileTable {
  const teamByCode = new Map(teams.map((t) => [t.code, t]));

  const table: TeamProfileTable = {};
  const seenCodes = new Set<string>();
  for (const row of rows) {
    if (seenCodes.has(row.code)) {
      throw new Error(`Dubblerad profil för ${row.code} i källan (varje lag exakt en gång).`);
    }
    seenCodes.add(row.code);

    const team = teamByCode.get(row.code);
    if (team === undefined) {
      throw new Error(
        `Profilrad för okänd kod "${row.code}" (finns inte i teams.ts, FIFA-lottningen).`
      );
    }
    table[team.id] = {
      fifaRanking: row.fifaRanking,
      starPlayers: row.starPlayers,
      trivia: row.trivia,
    };
  }

  // DRIFT-VAKT: varje lag i teams.ts MÅSTE ha en profil (annars är data ofullständig).
  // Vänd kontrollen: en saknad profil för ett känt lag är lika illa som en extra.
  const missing = teams.filter((t) => table[t.id] === undefined).map((t) => t.code);
  if (missing.length > 0) {
    throw new Error(
      `Lag utan profil (${missing.length}): ${missing.join(', ')}. Varje lag i teams.ts måste ha en rad.`
    );
  }
  // ANTAL-vakt: exakt lika många profiler som lag (fångar t.ex. en extra rad vars
  // kod råkar dubbletten av en annan, vilket de två kollarna ovan annars klarar,
  // men en explicit antals-grind är en billig sista skyddsräcke).
  const profileCount = Object.keys(table).length;
  if (profileCount !== teams.length) {
    throw new Error(`Förväntade ${teams.length} profiler, fick ${profileCount}.`);
  }

  return table;
}

/* ------------------------------------------------------------------ *
 * Emit (parsad data -> .ts-filtext). Prettier-stil DIREKT (single quotes via
 * tsString) så den genererade filen är format:check-ren och regenerera-och-diffa-
 * låset håller (emit + prettier ger samma bytes). Samma motgift som T4b:s emit.
 * ------------------------------------------------------------------ */

/**
 * Emittera ett TS-strängliteral i projektets Prettier-stil. Prettier föredrar
 * SINGLE quotes, MEN byter till double quotes när strängen innehåller en apostrof
 * och ingen citationstecken (så apostrofen slipper escapas, t.ex. "N'Golo Kanté").
 * Vi replikerar den regeln EXAKT så emit == prettier --write (annars bryts
 * regenerera-och-diffa-låset). Diakriter (å/ä/ö, é, ć, ø) bevaras i UTF-8.
 */
function tsString(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\');
  const hasSingle = escaped.includes("'");
  const hasDouble = escaped.includes('"');
  // Prettiers val: single om möjligt; double bara när det sparar en escape
  // (apostrof finns men inget citationstecken). Med båda tecknen kvar single +
  // escapa apostrofen (Prettiers default vid lika många, här förenklat: single).
  if (hasSingle && !hasDouble) {
    return `"${escaped}"`;
  }
  return `'${escaped.replace(/'/g, "\\'")}'`;
}

/** Emittera star-arrayen kompakt: [] tom, annars ['A', 'B'] på en rad. */
function emitStarPlayers(players: readonly string[]): string {
  if (players.length === 0) {
    return '[]';
  }
  return `[${players.map(tsString).join(', ')}]`;
}

/** Prettiers print-bredd (matchar .prettierrc / default), så emit = prettier --write. */
const PRINT_WIDTH = 100;

/**
 * Emittera en `nyckel: 'värde',`-rad i Prettiers stil. Prettier BRYTER raden om
 * den ryms inte inom print-bredden: då hamnar värdet på en egen rad, indenterad
 * ett steg djupare (`    nyckel:\n      'värde',`). Vi replikerar den regeln EXAKT
 * så den genererade filen är format:check-ren och regenerera-och-diffa-låset håller
 * (annars normaliserar prettier --write filen och driver isär från generatorns
 * output, vilket bryter låset, samma fälla som T4b:s emit löste med tsString).
 *
 * @param indent  Indentering för nyckel-raden (här 4 mellanslag, inne i objektet).
 */
function emitStringField(key: string, value: string, indent: string): string {
  const literal = tsString(value);
  const oneLine = `${indent}${key}: ${literal},`;
  if (oneLine.length <= PRINT_WIDTH) {
    return oneLine;
  }
  // För lång: bryt som Prettier gör (nyckel, sedan värdet indenterat ett steg till).
  return `${indent}${key}:\n${indent}  ${literal},`;
}

/**
 * Emittera EN profil-post. Nyckeln (lag-id) är en gemen 3-bokstavskod = ett giltigt
 * JS-identifierare, så Prettier skriver den OKVOTERAD (`mex:`, inte `'mex':`); vi
 * gör likadant. fifaRanking + starPlayers ryms alltid på en rad; trivia kan vara
 * lång och bryts då enligt Prettier-regeln (emitStringField).
 */
function emitProfileEntry(id: string, profile: TeamProfile): string {
  return (
    `  ${id}: {\n` +
    `    fifaRanking: ${profile.fifaRanking},\n` +
    `    starPlayers: ${emitStarPlayers(profile.starPlayers)},\n` +
    `${emitStringField('trivia', profile.trivia, '    ')}\n` +
    `  },`
  );
}

/**
 * Bygg HELA innehållet i team-profiles.ts ur källtexten (LF-radslut). Parsa ->
 * validera mot lag-listan -> emittera, i teams.ts-ordning (A-L) så filen är stabil
 * och läsbar. Vid fel KASTAS ett fel (fail loud) i stället för en halv tabell.
 *
 * Samma EN-sanning-mönster som buildMatchesFile: både generatorn och
 * källånkrings-testet kör DENNA funktion, så testet bevisar att källan ->
 * profil-koden ger exakt den committade team-profiles.ts.
 *
 * @param teams  Lagen i teams.ts-ordning (A-L), så emit-ordningen är deterministisk.
 * @throws Vid format-fel eller drift mot lag-listan.
 */
export function buildProfilesFile(text: string, teams: readonly TeamRef[]): string {
  const rows = parseProfiles(text);
  const table = buildProfileTable(rows, teams);

  // Emittera i teams.ts-ordning (A-L), inte i Object-nyckelordning, så filen är
  // deterministisk oavsett insättnings-ordning (samma princip som teams.ts:
  // härled ordningen explicit, lita inte på objekt-nycklar).
  const body = teams.map((t) => emitProfileEntry(t.id, table[t.id])).join('\n');

  return `// GENERERAD FIL, redigera inte för hand. Se scripts/generate-team-profiles.ts.
//
// VM 2026:s lag-profiler: FIFA-ranking, stjärnspelare och kuriosa per lag (48 lag).
// GENERERAD ur det committade källutdraget (team-profiles-source.txt) via den rena
// parsern (team-profiles-parser.ts), och VÄRDE-LÅST mot källan i CI
// (team-profiles-source.test.ts: regenerera-och-diffa + mutationstest + 48/48-täckning).
//
// KÄLLOR (gissas ALDRIG), se preambeln i team-profiles-source.txt:
//   - FIFA-ranking: FIFA/Coca-Cola Men's World Ranking, OFFICIELLA JUNIUTGÅVAN
//     (publicerad 2026-06-11, hämtad 2026-06-12, T69), verifierad mot ESPN + Wikipedia
//     (topp 20 med poäng) + whereig.com. Ersatte aprilutgåvan (2026-04-01) som var senast vid T10.
//   - Stjärnspelare: VM 2026:s slutgiltiga 26-mannatrupper (offentliggjorda 2026-06-02),
//     redaktionellt urval, men varje spelare bevisligen i truppen enligt källa.
//   - Kuriosa: verifierbara VM-fakta (antal tidigare slutspel + bästa placering),
//     ur Wikipedia "FIFA World Cup records and statistics".
//
// "BÄSTA SPELDRAGET" finns medvetet INTE här: subjektivt utan källa, utelämnat
// (Team.bestPlay förblir undefined). Profil-vyn använder FIFA-rankingen som
// styrke-signal i stället. Se docs/decisions.md (T10).
//
// Nyckeln är lag-ID (gemen FIFA-kod, samma id som teams.ts/matcher refererar).

import type { TeamProfileTable } from './team-profiles-parser';

/** Lag-profiler per lag-id (A-L-ordning), källånkrade. */
export const WC2026_TEAM_PROFILES: TeamProfileTable = {
${body}
};
`;
}
