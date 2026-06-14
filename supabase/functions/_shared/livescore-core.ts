// DENO-MIRROR av Bit 1:s rena livescore-kärna (src/data/livescore/).
//
// VARFÖR EN MIRROR (medvetet, sanktionerat av task-direktivet): Supabase
// deployar BARA `supabase/functions/`-trädet, så edge-funktionen kan INTE
// importera app-grafens moduler (src/...). De rena bitar pollaren behöver
// kopieras därför hit, MINIMALT och med EXAKT samma logik + källhänvisning som
// originalet, så de kan hållas i synk. Allt här är PURT (ingen Deno-global,
// inget nätverk), så det är samma testbara logik som Bit 1, bara i Deno-trädet.
//
// SYNK-ANSVAR: ändras facit-regeln eller status-mappningen i
// src/data/livescore/parse-live.ts MÅSTE denna fil uppdateras likadant (och
// tvärtom). De två är medvetna kopior, inte två sanningar , de ska aldrig drifta.

// ---------------------------------------------------------------------------
// STATUS-MAPPNING (mirror av parse-live.ts STATUS_BY_SHORT, källhänvisad där).
// Vi behöver bara veta om en match är AVGJORD (finished) för freeze/facit.
// Källa: API-Football v3 fixtures-status (korsverifierad 2026-06-14, se
// docs/decisions.md). FT/AET/PEN = finished.
// ---------------------------------------------------------------------------
export type LiveStatus = 'scheduled' | 'live' | 'paused' | 'finished' | 'postponed' | 'unknown';

const STATUS_BY_SHORT: Readonly<Record<string, LiveStatus>> = {
  NS: 'scheduled',
  TBD: 'scheduled',
  '1H': 'live',
  '2H': 'live',
  ET: 'live',
  P: 'paused',
  HT: 'paused',
  BT: 'paused',
  SUSP: 'paused',
  INT: 'paused',
  FT: 'finished',
  AET: 'finished',
  PEN: 'finished',
  PST: 'postponed',
  CANC: 'postponed',
  ABD: 'postponed',
  AWD: 'postponed',
  WO: 'postponed',
};

/** Slå upp en short-kod, fail-safe till 'unknown' (aldrig 'live') vid okänd kod. */
export function normalizeStatus(short: string): LiveStatus {
  return STATUS_BY_SHORT[short] ?? 'unknown';
}

// ---------------------------------------------------------------------------
// LAG-BRYGGA (mirror av team-bridge.ts WC2026_API_TEAM_BRIDGE). Medvetet
// OFULLSTÄNDIG (bara lag vars API-id setts i fångade svar) , kompletteras före
// go-live när varje VM-lags id dyker upp i live=all. En okänd fixture
// markeras 'unresolved' och hoppas (gissa aldrig en koppling). Källa:
// docs/decisions.md 2026-06-14 (lag-brygga).
// ---------------------------------------------------------------------------
export const API_TEAM_BRIDGE: Readonly<Record<number, string>> = {
  1118: 'netherlands',
  12: 'japan',
  10: 'england',
  22: 'iran',
};

// ---------------------------------------------------------------------------
// FACIT-REGELN (mirror av parse-live.ts parseFinalResult, källhänvisad,
// gissas ALDRIG, verifierad mot RIKTIG data 2026-06-14):
//   * slutresultat = goals.home/away (aggregat ordinarie+förlängning, EXKL.
//     straffar). Rätt för FT, AET och PEN.
//   * straffar = score.penalty, BARA vid status PEN.
//   * ANVÄND ALDRIG score.extratime (bara mål UNDER förlängningen, additivt).
// Källa: fixture-aet-pen.json (Argentina-Frankrike: goals 3-3, et 1-1, pen 4-2).
// ---------------------------------------------------------------------------
export interface RawScorePair {
  home: number | null;
  away: number | null;
}
export interface RawFixtureResponse {
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null } };
  teams: { home: { id: number }; away: { id: number } };
  goals: RawScorePair;
  score: { fulltime: RawScorePair; extratime: RawScorePair; penalty: RawScorePair };
}

export interface AutoFacit {
  apiFixtureId: number;
  homeGoals: number;
  awayGoals: number;
  /** Normaliserad status (alltid 'finished' här). */
  status: LiveStatus;
  /** Straffar, satt BARA vid PEN. */
  penalties: { home: number; away: number } | null;
}

/**
 * Härled facit ur ett RÅTT fixtures?id-svar (en avgjord match). Fail loud om
 * matchen inte är avgjord eller om goals saknas (gissa aldrig). Samma regel +
 * fail-loud-kontrakt som parse-live.ts parseFinalResult.
 */
export function deriveFacit(r: RawFixtureResponse): AutoFacit {
  const short = r.fixture.status.short;
  const status = normalizeStatus(short);
  if (status !== 'finished') {
    throw new Error(
      `deriveFacit: matchen är inte avgjord (status "${short}" -> ${status}). Facit läses bara på avgjord match.`
    );
  }
  if (typeof r.goals.home !== 'number' || typeof r.goals.away !== 'number') {
    throw new Error(`deriveFacit: avgjord match ${r.fixture.id} saknar goals.home/away (facit).`);
  }
  let penalties: AutoFacit['penalties'] = null;
  if (short === 'PEN') {
    const pen = r.score.penalty;
    if (typeof pen.home !== 'number' || typeof pen.away !== 'number') {
      throw new Error(`deriveFacit: PEN-match ${r.fixture.id} saknar score.penalty.`);
    }
    penalties = { home: pen.home, away: pen.away };
  }
  return {
    apiFixtureId: r.fixture.id,
    homeGoals: r.goals.home,
    awayGoals: r.goals.away,
    status: 'finished',
    penalties,
  };
}

/** Slå upp app-lag-id ur bryggan, null om okänt (gissa aldrig). */
export function resolveAppTeamId(apiTeamId: number): string | null {
  return API_TEAM_BRIDGE[apiTeamId] ?? null;
}
