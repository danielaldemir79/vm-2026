// Rena parser-funktioner: API-Footballs RÅA svar -> appens normaliserade livescore-
// typer (live-types.ts). Inga sido-effekter, inget nätverk, ingen Date.now(): rent
// in, rent ut, så de är trivialt testbara mot de committade sample-svaren.
//
// Designprinciper:
//   - FAIL LOUD på STRUKTUR-fel (svaret är inte ett API-Football-svar alls,
//     API:t rapporterade errors, en obligatorisk identitet saknas), PRINCIPLES §8.
//   - TÅLIGT mot saknade VALFRIA fält (assist null, elapsed null, tom events-lista,
//     okänd status-sträng), utan att tyst hitta på data. En okänd status blir
//     'unknown' (ALDRIG 'live'), den råa koden bevaras, så inget tappas tyst.
//   - Aldrig en tyst maskerande default som DÖLJER ett saknat obligatoriskt värde
//     (en default till ett "giltigt-ser-ut"-värde gömmer just det fel den borde larma).

import type {
  CardColor,
  FinalResult,
  LiveEvent,
  LiveEventKind,
  LiveLineup,
  LiveLineupPlayer,
  LiveMatchSnapshot,
  LiveStatus,
  LiveStatisticValue,
  LiveTeamStatistics,
} from './live-types';
import type {
  RawApiResponse,
  RawEvent,
  RawFixtureResponse,
  RawLineupPlayer,
  RawLineupResponse,
  RawStatisticsResponse,
} from './api-football-types';

/**
 * KÄLLHÄNVISAD status-mappning (gissas ALDRIG). API-Footballs `fixture.status.short`
 * -> normaliserad LiveStatus.
 *
 * KÄLLA: API-Football v3 fixtures-status, korsverifierad 2026-06-14 mot två
 * oberoende källor (API-Football "How to save calls"-guiden + Sportmonks/pilflo
 * api-sports-status-listor), eftersom api-football.com/documentation-v3 svarar 403
 * mot automatiska hämtningar:
 *   - 1H/2H/ET = bollen rullar (live).  P = straffläggning pågår.
 *   - HT/BT = paus mellan faser.  SUSP/INT = avbrott mitt i match.
 *   - FT/AET/PEN = avgjord.  NS/TBD = ej startad.
 *   - PST/CANC/ABD/AWD/WO = ej spelad/uppskjuten/tilldelad.
 *
 * MEDVETET VAL (Daniels spec, vattenpaus-oron): P (straffläggning) klassas som
 * 'paused', inte 'live' , matchklockan ska FRYSA under straffar, inte ticka.
 * Specen listar uttryckligen "FRYS under paus (HT, BT, P, SUSP, INT)".
 *
 * En short-kod som INTE finns här blir 'unknown' (fail-safe): vi gissar hellre
 * "okänd" än "live", så klockan aldrig springer på en kod vi inte förstår.
 */
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

/**
 * Normalisera en ISO-tid (med valfri offset) till UTC med Z-suffix, så två
 * kickoff-tider kan jämföras som strängar/tal oberoende av hur API:t skrev offset.
 * Fail loud på ett ogiltigt datum (hellre det än en tyst NaN som driver
 * match-identiteten fel).
 */
export function toUtcIso(isoWithOffset: string): string {
  const ms = Date.parse(isoWithOffset);
  if (Number.isNaN(ms)) {
    throw new Error(`Ogiltig ISO-tid i API-svar: "${isoWithOffset}"`);
  }
  return new Date(ms).toISOString();
}

/**
 * Vakt mot API-fel + struktur. Kastar om kuvertet saknas, om API:t rapporterade
 * icke-tomma errors, eller om response inte är en array. Returnerar response[].
 */
function requireResponseArray<T>(payload: RawApiResponse<T>, what: string): T[] {
  if (payload === null || typeof payload !== 'object') {
    throw new Error(`${what}: svaret är inte ett objekt.`);
  }
  // errors är {} vid framgång men en icke-tom array/objekt vid fel (ogiltig
  // nyckel/plan). Fail loud så ett trasigt svar inte tyst blir tom data.
  const { errors } = payload;
  if (Array.isArray(errors) ? errors.length > 0 : errors && Object.keys(errors).length > 0) {
    throw new Error(`${what}: API rapporterade fel: ${JSON.stringify(errors)}`);
  }
  if (!Array.isArray(payload.response)) {
    throw new Error(`${what}: response saknas eller är inte en array.`);
  }
  return payload.response;
}

/** Normalisera en fixtures-post -> LiveMatchSnapshot (delas av live=all och id-uppslag). */
function toSnapshot(r: RawFixtureResponse): LiveMatchSnapshot {
  // Obligatorisk identitet: utan fixture-id och lag-id kan vi inte koppla matchen
  // till appen, så det är ett STRUKTUR-fel (fail loud), inte ett tomt fält.
  if (typeof r.fixture?.id !== 'number') {
    throw new Error('Fixtures-post saknar numeriskt fixture.id.');
  }
  if (typeof r.teams?.home?.id !== 'number' || typeof r.teams?.away?.id !== 'number') {
    throw new Error(`Fixture ${r.fixture.id}: lag-id saknas (teams.home/away.id).`);
  }
  return {
    apiFixtureId: r.fixture.id,
    status: normalizeStatus(r.fixture.status.short),
    apiStatusShort: r.fixture.status.short,
    elapsedMinute: r.fixture.status.elapsed,
    kickoffUtc: toUtcIso(r.fixture.date),
    homeTeamApiId: r.teams.home.id,
    homeTeamName: r.teams.home.name,
    awayTeamApiId: r.teams.away.id,
    awayTeamName: r.teams.away.name,
    homeGoals: r.goals?.home ?? null,
    awayGoals: r.goals?.away ?? null,
  };
}

/** Parsa ett `fixtures?league=1&live=all`-svar -> en lista LiveMatchSnapshot. */
export function parseLiveFixtures(
  payload: RawApiResponse<RawFixtureResponse>
): LiveMatchSnapshot[] {
  return requireResponseArray(payload, 'parseLiveFixtures').map(toSnapshot);
}

/**
 * Normalisera API:ts case-inkonsekventa event-typ ("Goal"/"Card"/"subst"/"Var")
 * till en stängd union. Okänd typ -> 'other' (rå typ bevaras i rawType).
 */
function normalizeEventKind(rawType: string): LiveEventKind {
  switch (rawType.toLowerCase()) {
    case 'goal':
      return 'goal';
    case 'card':
      return 'card';
    case 'subst':
      return 'subst';
    case 'var':
      return 'var';
    default:
      return 'other';
  }
}

/** Läs ut kortfärg ur detail ("Yellow Card"/"Red Card"), null när det inte är ett kort. */
function readCardColor(kind: LiveEventKind, detail: string): CardColor | null {
  if (kind !== 'card') {
    return null;
  }
  const d = detail.toLowerCase();
  if (d.includes('yellow')) {
    return 'yellow';
  }
  if (d.includes('red')) {
    return 'red';
  }
  // Ett kort utan igenkännbar färg är ovanligt men ska inte gissas till en färg.
  return null;
}

/**
 * Städa ett spelar-/assist-namn. API:t har visat verklig data-smuts (ett
 * mål-event hade player.name = "3                         M. Taremi", ett
 * inläckt nummer + lång whitespace). Vi trimmar och kollapsar inre whitespace,
 * och strippar ett ledande lösryckt heltal följt av blanksteg (smuts-mönstret),
 * men hittar ALDRIG på ett namn: är fältet null/tomt efter städ blir det null.
 */
function cleanName(name: string | null): string | null {
  if (name === null) {
    return null;
  }
  const collapsed = name.replace(/\s+/g, ' ').trim();
  // Ledande lösryckt heltal + blank ("3 M. Taremi" -> "M. Taremi"). Bara när
  // resten ser ut som ett namn (innehåller en bokstav), annars rör vi inte värdet.
  const stripped = collapsed.replace(/^\d+\s+(?=\S*[A-Za-zÀ-ÿ])/, '');
  return stripped.length > 0 ? stripped : null;
}

/** Normalisera ett enskilt event. */
function toEvent(e: RawEvent): LiveEvent {
  if (typeof e.team?.id !== 'number') {
    throw new Error('Event saknar numeriskt team.id.');
  }
  if (typeof e.time?.elapsed !== 'number') {
    throw new Error(`Event för lag ${e.team.id} saknar time.elapsed.`);
  }
  const kind = normalizeEventKind(e.type);
  return {
    minute: e.time.elapsed,
    extra: e.time.extra ?? null,
    kind,
    rawType: e.type,
    detail: e.detail,
    teamApiId: e.team.id,
    teamName: e.team.name,
    // Spelar-/assist-id bärs vidare (stabil nyckel för skytteligan, T87). Råsvaret kan ha
    // id null (t.ex. en assist som saknas), då blir det null , gissa aldrig ett id.
    playerId: e.player?.id ?? null,
    playerName: cleanName(e.player?.name ?? null),
    assistId: e.assist?.id ?? null,
    assistName: cleanName(e.assist?.name ?? null),
    cardColor: readCardColor(kind, e.detail),
  };
}

/**
 * Parsa ett `fixtures/events`-svar -> LiveEvent[]. En TOM events-lista (vanligt
 * tidigt i en match, t.ex. live_all.json) är giltigt och ger [], inte ett fel.
 */
export function parseEvents(payload: RawApiResponse<RawEvent>): LiveEvent[] {
  return requireResponseArray(payload, 'parseEvents').map(toEvent);
}

/** Normalisera ett statistik-värde: tomma strängar -> null, övrigt oförändrat. */
function normalizeStatValue(value: number | string | null): number | string | null {
  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }
  return value;
}

/** Parsa ett `fixtures/statistics`-svar -> per-lags-statistik. */
export function parseStatistics(
  payload: RawApiResponse<RawStatisticsResponse>
): LiveTeamStatistics[] {
  return requireResponseArray(payload, 'parseStatistics').map((s): LiveTeamStatistics => {
    if (typeof s.team?.id !== 'number') {
      throw new Error('Statistik-post saknar numeriskt team.id.');
    }
    if (!Array.isArray(s.statistics)) {
      throw new Error(`Statistik för lag ${s.team.id}: statistics är inte en array.`);
    }
    return {
      teamApiId: s.team.id,
      teamName: s.team.name,
      statistics: s.statistics.map(
        (item): LiveStatisticValue => ({
          type: item.type,
          value: normalizeStatValue(item.value),
        })
      ),
    };
  });
}

/** Normalisera en lineup-spelare. */
function toLineupPlayer(wrapper: { player: RawLineupPlayer }): LiveLineupPlayer {
  const p = wrapper.player;
  return {
    apiPlayerId: p.id,
    name: p.name,
    number: p.number,
    position: p.pos,
    grid: p.grid ?? null,
  };
}

/** Parsa ett `fixtures/lineups`-svar -> per-lags-laguppställning. */
export function parseLineups(payload: RawApiResponse<RawLineupResponse>): LiveLineup[] {
  return requireResponseArray(payload, 'parseLineups').map((l): LiveLineup => {
    if (typeof l.team?.id !== 'number') {
      throw new Error('Lineup-post saknar numeriskt team.id.');
    }
    if (!Array.isArray(l.startXI) || !Array.isArray(l.substitutes)) {
      throw new Error(`Lineup för lag ${l.team.id}: startXI/substitutes är inte arrayer.`);
    }
    return {
      teamApiId: l.team.id,
      teamName: l.team.name,
      formation: l.formation,
      startXI: l.startXI.map(toLineupPlayer),
      substitutes: l.substitutes.map(toLineupPlayer),
      // Tränarens namn bärs vidare när API:t har det; saknas coach-blocket eller namnet
      // blir det null (gissa aldrig ett tränarnamn). cleanName trimmar/kollapsar smuts.
      coachName: cleanName(l.coach?.name ?? null),
    };
  });
}

/**
 * Parsa facit (slutresultat) ur ett `fixtures?id`-svar. Förväntar EXAKT en post
 * (ett id-uppslag), och att matchen är avgjord (status finished). Härleder
 * slutresultatet + decidedBy ur svaret , gissar aldrig.
 *
 * KÄLLHÄNVISAD facit-regel (gissas ALDRIG, korrigerad mot RIKTIG data 2026-06-14):
 *   - `goals.home/away` = det AUKTORITATIVA slutresultatet, redan aggregerat
 *     (ordinarie + ev. förlängning), EXKLUSIVE straffar. Rätt för ALLA fall: FT
 *     (goals = fulltime), AET (goals = fulltime + extratime) och PEN (goals =
 *     aggregatet före straffläggningen). Det är detta fält facit kommer från.
 *   - `score.extratime` = endast de mål som gjordes UNDER förlängningsperioden
 *     (30 min), ALDRIG det kumulativa slutresultatet. Får ALDRIG användas som facit
 *     (en tidigare bugg gjorde det och skrev t.ex. 1-1 i stället för 3-3 på
 *     Argentina-Frankrike, vilket hade korrumperat slutspels-facit).
 *   - `score.penalty` = straffläggningen separat (bärs i `penalties` vid PEN).
 *   - `decidedBy` härleds ur status: PEN -> 'penalties', AET -> 'extra-time',
 *     annars 'regulation'.
 * KÄLLA: probe mot riktiga 2022-VM-slutspelssvar (5 fångade matcher,
 *   `__fixtures__/fixture-aet-pen.json` = Argentina-Frankrike: goals 3-3, ft 2-2,
 *   et 1-1, pen 4-2). Se docs/decisions.md 2026-06-14.
 */
export function parseFinalResult(payload: RawApiResponse<RawFixtureResponse>): FinalResult {
  const responses = requireResponseArray(payload, 'parseFinalResult');
  if (responses.length !== 1) {
    throw new Error(
      `parseFinalResult: förväntade exakt 1 fixtures-post (id-uppslag), fick ${responses.length}.`
    );
  }
  const r = responses[0];
  const status = normalizeStatus(r.fixture.status.short);
  if (status !== 'finished') {
    throw new Error(
      `parseFinalResult: matchen är inte avgjord (status "${r.fixture.status.short}" -> ${status}). ` +
        'Facit får bara läsas på en avgjord match.'
    );
  }

  const short = r.fixture.status.short;
  const decidedBy: FinalResult['decidedBy'] =
    short === 'PEN' ? 'penalties' : short === 'AET' ? 'extra-time' : 'regulation';

  // `goals` är facit för ALLA avgjorda fall (se docstringen). Det är obligatoriskt
  // på en avgjord match; saknas det är svaret trasigt (fail loud, gissa aldrig).
  const goals = r.goals;
  if (typeof goals.home !== 'number' || typeof goals.away !== 'number') {
    throw new Error(`Fixture ${r.fixture.id}: avgjord match saknar goals.home/away (facit).`);
  }
  const homeGoals = goals.home;
  const awayGoals = goals.away;

  let penalties: FinalResult['penalties'] = null;
  if (decidedBy === 'penalties') {
    const pen = r.score.penalty;
    if (typeof pen.home !== 'number' || typeof pen.away !== 'number') {
      throw new Error(`Fixture ${r.fixture.id}: PEN-match saknar score.penalty.`);
    }
    penalties = { homeGoals: pen.home, awayGoals: pen.away };
  }

  return {
    apiFixtureId: r.fixture.id,
    homeGoals,
    awayGoals,
    decidedBy,
    penalties,
  };
}
