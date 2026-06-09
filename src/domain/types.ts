// EN sanning för VM 2026:s domänmodell, strikt typad (inga `any`).
//
// Fälten följer SPEC §6 (datamodell). Kärn-entiteterna (Team, Group, Match,
// BracketSlot) är fullt definierade och används av T3:s datalager + härledda
// state. Social-entiteterna (User, Room, Prediction m.fl.) är medvetet bara
// TYP-STUBS här: de byggs ut med logik i Fas 2 (tips/realtid), men typerna
// finns på plats nu så datalagrets kontrakt är komplett och Fas 2 bara tänder
// dem. Se docs/SPEC.md §6 och issue #3.
//
// Designval: tabeller, slutspelsträd och poäng LAGRAS aldrig, de HÄRLEDS av
// rena funktioner från Match-resultaten (SPEC §6, "härledd state"). Därför är
// t.ex. GroupStanding inte ett persistent fält på Group utan en beräknad form.

/* ------------------------------------------------------------------ *
 * Kärn-entiteter (tracker, Fas 1)
 * ------------------------------------------------------------------ */

/** Grupp-id A till L (12 grupper i VM 2026-formatet, SPEC §5). */
export type GroupId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';

/** Alla giltiga grupp-id i spelordning, enda sanningen för iteration/validering. */
export const GROUP_IDS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
] as const satisfies readonly GroupId[];

/**
 * Ett landslag. `id` är en stabil intern nyckel (t.ex. landskod) som matcher
 * och tabeller refererar, oberoende av visningsnamn. `code` är FIFA:s
 * trebokstavskod (för flagga/visning). Kuriosa/stjärnspelare/bästa speldrag är
 * valfria: de fylls av lag-profil-tasken och får saknas i datalagrets fixtures.
 */
export interface Team {
  /** Stabil intern nyckel som matcher/tabeller refererar (gissas aldrig om). */
  id: string;
  /** Visningsnamn, t.ex. "Brasilien". */
  name: string;
  /** FIFA:s trebokstavs-landskod, t.ex. "BRA". Driver flagg-rendering. */
  code: string;
  /** Vilken grupp laget tillhör. */
  group: GroupId;
  /** FIFA-ranking vid turneringsstart (valfri tills data-tasken fyllt den). */
  fifaRanking?: number;
  /** Kort kuriosa-rad (lag-profil, valfri). */
  trivia?: string;
  /** Stjärnspelare att lyfta fram (lag-profil, valfri). */
  starPlayers?: string[];
  /** "Bästa speldraget" (lag-profil, valfri). */
  bestPlay?: string;
}

/**
 * En grupp om 4 lag. Tabellen LAGRAS inte här (härleds av compute-standings
 * från gruppens matcher), bara medlemskapet definieras. `teamIds` refererar
 * Team.id, inte inbäddade Team-objekt, så en sanning per lag.
 */
export interface Group {
  id: GroupId;
  /** Lag-id:n i gruppen (refererar Team.id). Normalt 4 i VM 2026-formatet. */
  teamIds: string[];
}

/** Var en match spelas i turneringen: gruppspel eller en namngiven slutspelsrunda. */
export type MatchStage =
  | 'group'
  | 'round-of-32'
  | 'round-of-16'
  | 'quarter-final'
  | 'semi-final'
  | 'third-place'
  | 'final';

/**
 * Matchens livscykel. Kopplingen status <-> resultat är inte bara en konvention
 * utan ett TYP-KONTRAKT: `Match` är en diskriminerad union på `status` (se
 * nedan), så en 'finished'-match GARANTERAT bär ett resultat och en
 * 'scheduled'/'live'-match garanterat inte gör det. Ogiltiga tillstånd
 * (finished utan resultat, scheduled med resultat) är därmed orepresenterbara.
 */
export type MatchStatus = 'scheduled' | 'live' | 'finished';

/**
 * Ett matchresultat (mål hemma/borta i ordinarie tid + ev. straffar).
 * Separat typ så härledda funktioner kan ta emot exakt resultatdelen, och så
 * att `Match.result` kan vara null tills resultatet matats in (SPEC §6).
 *
 * `penalties` används bara i slutspel (oavgjort kan inte stå sig där). I
 * gruppspelstabell-beräkningen ignoreras straffar medvetet, ett oavgjort
 * gruppspel ger 1-1 i poäng oavsett, så fältet rör inte standings-logiken.
 */
export interface MatchResult {
  /** Mål för hemmalaget i ordinarie tid (+ ev. förlängning). */
  homeGoals: number;
  /** Mål för bortalaget i ordinarie tid (+ ev. förlängning). */
  awayGoals: number;
  /** Straffläggning, bara i slutspel vid oavgjort. Saknas i gruppspel. */
  penalties?: {
    homeGoals: number;
    awayGoals: number;
  };
}

/**
 * De fält en match bär oavsett livscykel-läge. `groupId` är satt för
 * gruppspelsmatcher (stage === 'group'), null för slutspelsmatcher. Lag
 * refereras via id, så en match kan existera innan slutspelslaget är känt
 * (homeTeamId/awayTeamId kan vara null i slutspel innan seedningen i T4 fyllt
 * dem). Statusen och resultatet ligger INTE här utan på varianterna nedan, som
 * kopplar dem till varandra.
 */
interface MatchBase {
  id: string;
  stage: MatchStage;
  /** Grupp för gruppspelsmatcher, null i slutspel. */
  groupId: GroupId | null;
  /** Hemmalag (Team.id). Null i slutspel innan laget är framräknat (T4). */
  homeTeamId: string | null;
  /** Bortalag (Team.id). Null i slutspel innan laget är framräknat (T4). */
  awayTeamId: string | null;
  /** Avsparkstid i ISO 8601 (UTC), formateras lokalt i UI:t. */
  kickoff: string;
  /** Arena/stad, t.ex. "MetLife Stadium, East Rutherford". */
  venue: string;
  /** Svensk TV-kanal (SPEC §4), valfri tills data-tasken fyllt den. */
  tvChannel?: string;
  /** Kort kuriosa-rad för matchen (valfri). */
  trivia?: string;
}

/** En kommande match: inte spelad än, alltså inget resultat (SPEC §6). */
export interface ScheduledMatch extends MatchBase {
  status: 'scheduled';
  result: null;
}

/**
 * En pågående match. Resultat matas in när matchen är klar (SPEC §6, "resultat
 * null tills inmatat"), så även en live-match bär `null` här tills den slår om
 * till 'finished'. (Vill vi senare visa en löpande ställning blir det ett eget,
 * uttryckligt fält, inte en uppluckring av detta kontrakt.)
 */
export interface LiveMatch extends MatchBase {
  status: 'live';
  result: null;
}

/** En färdigspelad match: bär ALLTID ett resultat (icke-null), per typgaranti. */
export interface FinishedMatch extends MatchBase {
  status: 'finished';
  result: MatchResult;
}

/**
 * En match, modellerad som en DISKRIMINERAD UNION på `status`. Det är typen
 * (inte en konvention) som garanterar kopplingen status <-> resultat: bara en
 * 'finished'-match har ett `result` (icke-null), och en 'scheduled'/'live'-match
 * har alltid `result: null`. Konsumenter narrowar därför säkert på `status`
 * (t.ex. `if (match.status === 'finished')` ger `match.result: MatchResult` utan
 * null-check), och ogiltiga tillstånd (finished utan resultat, scheduled med
 * resultat) går inte ens att uttrycka. Se issue #3 och Copilot-fynd C7/C8.
 */
export type Match = ScheduledMatch | LiveMatch | FinishedMatch;

/**
 * En lag-rad i en härledd grupptabell. ALLA fält är beräknade av
 * compute-standings från gruppens matcher, inget lagras. Förkortningar följer
 * SPEC §6: MV = matcher vunna, GM = gjorda mål, IM = insläppta mål, MS =
 * målskillnad (GM - IM).
 */
export interface GroupStanding {
  /** Vilket lag raden gäller (Team.id). */
  teamId: string;
  /** Spelade matcher. */
  played: number;
  /** Vunna (MV). */
  won: number;
  /** Oavgjorda. */
  drawn: number;
  /** Förlorade. */
  lost: number;
  /** Gjorda mål (GM). */
  goalsFor: number;
  /** Insläppta mål (IM). */
  goalsAgainst: number;
  /** Målskillnad (MS = GM - IM). */
  goalDifference: number;
  /** Poäng (3 för vinst, 1 för oavgjort, 0 för förlust). */
  points: number;
  /** Placering i gruppen, 1-baserad. Sätts av compute-standings efter sortering. */
  rank: number;
}

/** En komplett härledd grupptabell: gruppens id + de sorterade lag-raderna. */
export interface GroupTable {
  groupId: GroupId;
  /** Rader sorterade enligt FIFA-tiebreak-ordning, bästa laget först. */
  standings: GroupStanding[];
}

/**
 * Källan till ett lag i en slutspelsposition: gruppvinnare, grupptvåa eller en
 * av de 8 bästa treorna (SPEC §5). Detta är BracketSlot-typens kontrakt redo
 * för T4, T3 bygger INTE den fullständiga seedningen.
 */
export type BracketSource =
  | { kind: 'group-winner'; group: GroupId }
  | { kind: 'group-runner-up'; group: GroupId }
  // Bästa-trea: vilken trea som hamnar här avgörs av FIFA:s förbestämda
  // tredjeplats-tabell utifrån VILKA grupper de kvalificerade treorna kom från
  // (SPEC §5). Den seedningen är T4:s ansvar, inte T3:s, slot:en bär bara att
  // källan ÄR en bästa-trea.
  | { kind: 'best-third'; eligibleGroups: GroupId[] };

/**
 * En position i slutspelsträdet. `resolvedTeamId` är null tills gruppspelet är
 * klart och seedningen (T4) räknat fram laget. `nextSlotId` pekar på vart
 * vinnaren går vidare (null för finalen). T3 definierar bara TYPEN, fyllningen
 * av träd-strukturen och seedningen är T4.
 */
export interface BracketSlot {
  id: string;
  stage: Exclude<MatchStage, 'group'>;
  /** Var laget i denna slot kommer ifrån (gruppvinnare/tvåa/bästa trea). */
  source: BracketSource;
  /** Framräknat lag (Team.id), null tills seedningen i T4 löst det. */
  resolvedTeamId: string | null;
  /** Slot dit vinnaren går vidare, null för finalen. */
  nextSlotId: string | null;
}

/* ------------------------------------------------------------------ *
 * Social-entiteter (tips + gamification, Fas 2-3)
 *
 * MEDVETNA TYP-STUBS. Fälten följer SPEC §6 så Fas 2 har kontraktet, men
 * INGEN logik byggs här (issue #3 scope). De finns med så datamodellen är
 * komplett och AI/Daniel ser hela formen tidigt (ai-first: starka typer som
 * maskinläsbar kontext).
 * ------------------------------------------------------------------ */

/** Identifierad vän som tippar. Stub, byggs ut i Fas 2 (auth/rumskod). */
export interface User {
  id: string;
  displayName: string;
  /** Pinnat favoritlag (Team.id), valfritt och per användare (SPEC §10). */
  favoriteTeamId?: string;
  /** Personlig statistik (träffsäkerhet m.m.), fylls i Fas 3. */
  stats?: PlayerStats;
}

/** Alias: SPEC §6 kallar entiteten "User / Player". Samma form. */
export type Player = User;

/** Personlig tips-statistik (Fas 3). Stub. */
export interface PlayerStats {
  /** Andel rätt utfall (0-1). */
  accuracy: number;
  /** Antal exakta resultat-träffar. */
  exactHits: number;
  /** Bästa "call" som text (t.ex. "kallade skrällen X-Y"). */
  bestCall?: string;
}

/**
 * En mini-liga: ett rum med medlemmar och egen topplista (SPEC §6, §12).
 * Stub, byggs i Fas 2.
 */
export interface Room {
  id: string;
  name: string;
  /** Kod vänner använder för att gå med via länk/kod. */
  joinCode: string;
  /** Medlemmar (User.id). */
  memberIds: string[];
}

/** Alias: SPEC §6 kallar entiteten "Room / League". Samma form. */
export type League = Room;

/** Ett tips på en enskild match (Fas 2). Stub. */
export interface Prediction {
  id: string;
  userId: string;
  matchId: string;
  /** Gissat resultat (samma form som ett verkligt MatchResult). */
  predicted: MatchResult;
  /** Tilldelade poäng efter avgjord match, null innan dess. */
  points: number | null;
  /** Joker-match: dubblar poängen för denna omgång (SPEC §12). */
  isJoker: boolean;
}

/** Tips på hela slutspelsträdet (Fas 2). Stub. */
export interface BracketPrediction {
  id: string;
  userId: string;
  /** Gissat lag (Team.id) per slot-id i slutspelsträdet. */
  picksBySlotId: Record<string, string>;
  /** Bonuspoäng efter utfall, null innan dess. */
  bonusPoints: number | null;
}

/** Tips på gruppvinnare/tvåa per grupp (Fas 2). Stub. */
export interface GroupPrediction {
  id: string;
  userId: string;
  group: GroupId;
  /** Gissad gruppvinnare (Team.id). */
  predictedWinnerId: string;
  /** Gissad grupptvåa (Team.id). */
  predictedRunnerUpId: string;
  /** Bonuspoäng efter utfall, null innan dess. */
  bonusPoints: number | null;
}

/** Märke/streak en användare tjänat in (Fas 3). Stub. */
export interface Achievement {
  id: string;
  userId: string;
  /** Märkestyp, t.ex. "kallade-skrallen" eller "perfekt-omgang". */
  badgeType: string;
  /** När märket tjänades in, ISO 8601. */
  earnedAt: string;
}

/** Vad en reaktion kan sitta på: en match eller en topplista-rad (Fas 3). */
export type ReactionTarget =
  | { kind: 'match'; matchId: string }
  | { kind: 'leaderboard-row'; userId: string };

/** En emoji-reaktion (Fas 3). Stub. */
export interface Reaction {
  id: string;
  userId: string;
  target: ReactionTarget;
  /** Emojin som tecken, t.ex. "🔥". */
  emoji: string;
}
