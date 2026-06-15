// RÅA API-Football-svarstyper (api-sports.io), härledda ur de FAKTISKT fångade
// svaren i __fixtures__/ (live VM-match + rika 2022-svar). Detta är KÄLLANS form
// (fältnamn exakt som API:t levererar), INTE appens konsument-form, så parsern i
// parse-live.ts bevisar en äkta mappning från källan i stället för att gömma drift
// i en otestad live-gren (fixtures formade efter konsument-typen döljer mappnings-
// fel, så vi formar dem efter källans verkliga fältnamn).
//
// KÄLLA (gissas ALDRIG): de committade sample-svaren under
//   src/data/livescore/__fixtures__/ är riktiga API-Football-svar (endpoint
//   "fixtures"). Formen är dokumenterad på https://www.api-football.com/documentation-v3
//   men typerna här är härledda ur det vi FAKTISKT fick, inte ur dokumentationen
//   (dokumentationen kan utelämna null-fall som verkliga svar har).
//
// Fält vi inte konsumerar i Bit 1 (t.ex. fixture.referee, league.logo, players-
// blocket) utelämnas medvetet: typerna täcker det parsern faktiskt läser, så de
// förblir små och ärliga. Okända extra fält i svaret ignoreras tyst av JSON.parse,
// det är förväntat.

/** Det yttre kuvertet varje API-Football-svar har (get/parameters/errors/response). */
export interface RawApiResponse<T> {
  get: string;
  /** results-räknaren API:t sätter (antal poster i response). */
  results: number;
  response: T[];
  /**
   * API:t rapporterar fel som ETT objekt `{}` vid framgång, men en ICKE-tom
   * ARRAY (eller ett objekt med nycklar) vid t.ex. ogiltig nyckel/plan. Vi
   * modellerar det löst (unknown) och fail-loud:ar i parsern om det är icke-tomt.
   */
  errors: unknown;
}

/** Lag-referensen som återkommer i fixture-, event-, statistik- och lineup-svar. */
export interface RawTeamRef {
  id: number;
  name: string;
  /** Logo-URL. Finns i de flesta svar men inte garanterat (utelämnas defensivt). */
  logo?: string;
}

/** fixture.status-blocket: short-koden är den vi normaliserar mot (1H/HT/FT/...). */
export interface RawFixtureStatus {
  long: string;
  /** Kort statuskod, t.ex. "1H", "HT", "FT", "NS". Driver normaliseringen. */
  short: string;
  /** Spelad minut enligt API:t (kan vara null före avspark och i pauser). */
  elapsed: number | null;
  /** Tilläggsminuter inom perioden (t.ex. 45+`extra`), null när inget tillägg. */
  extra: number | null;
}

/** fixture-blocket inuti en fixtures-/fixtures?id-post. */
export interface RawFixtureInfo {
  id: number;
  /** Avspark i ISO 8601 (med offset), t.ex. "2026-06-14T20:00:00+00:00". */
  date: string;
  /** Unix-tidsstämpel (sekunder) för avspark, redundant med `date`. */
  timestamp: number;
  status: RawFixtureStatus;
}

/** teams-blocket: hemma/borta-lag. */
export interface RawTeams {
  home: RawTeamRef;
  away: RawTeamRef;
}

/** goals-blocket: löpande ställning (kan vara null mycket tidigt). */
export interface RawGoals {
  home: number | null;
  away: number | null;
}

/** Ett ställnings-par (mål hemma/borta) som score-blockets delar använder. */
export interface RawScorePair {
  home: number | null;
  away: number | null;
}

/**
 * score-blocket: delställningar per fas. fulltime är facit-källan för ett
 * avgjort resultat; penalty fylls vid straffavgörande slutspel.
 */
export interface RawScore {
  halftime: RawScorePair;
  fulltime: RawScorePair;
  extratime: RawScorePair;
  penalty: RawScorePair;
}

/** En komplett fixtures-/fixtures?id-post (response[]-elementet). */
export interface RawFixtureResponse {
  fixture: RawFixtureInfo;
  teams: RawTeams;
  goals: RawGoals;
  score: RawScore;
}

/** time-blocket i ett event: elapsed-minut + ev. tilläggsminut. */
export interface RawEventTime {
  elapsed: number;
  /** Tilläggsminut (t.ex. 90+`extra`), null när inget tillägg. */
  extra: number | null;
}

/** En spelar-/assist-referens i ett event. BÅDA fälten kan vara null (assist saknas). */
export interface RawEventPlayer {
  id: number | null;
  name: string | null;
}

/**
 * Ett matchhändelse-event (fixtures/events). `type` är inkonsekvent i case mellan
 * kategorier i det verkliga svaret ("Goal"/"Card"/"subst"/"Var"), vilket parsern
 * normaliserar. `detail` särskiljer underkategori ("Normal Goal"/"Penalty"/
 * "Yellow Card"/"Red Card"/...).
 */
export interface RawEvent {
  time: RawEventTime;
  team: RawTeamRef;
  player: RawEventPlayer;
  assist: RawEventPlayer;
  type: string;
  detail: string;
  comments: string | null;
}

/** En enskild statistik-post per lag: typ-etikett + värde (number | "%"-sträng | null). */
export interface RawStatisticItem {
  type: string;
  /** number (skott/passningar), "%"-sträng (possession), eller null (saknas). */
  value: number | string | null;
}

/** statistik-svarets response[]-element: ett lag + dess statistik-lista. */
export interface RawStatisticsResponse {
  team: RawTeamRef;
  statistics: RawStatisticItem[];
}

/** En spelare i en laguppställning. `grid` är "rad:kolumn" eller null (avbytare). */
export interface RawLineupPlayer {
  id: number;
  name: string;
  number: number;
  /** Position: "G"/"D"/"M"/"F". */
  pos: string;
  /** Rutnätsposition "rad:kolumn", null för avbytare. */
  grid: string | null;
}

/** lineup-svarets response[]-element: lag + formation + startelva + avbytare. */
export interface RawLineupResponse {
  team: RawTeamRef;
  formation: string;
  startXI: { player: RawLineupPlayer }[];
  substitutes: { player: RawLineupPlayer }[];
}
