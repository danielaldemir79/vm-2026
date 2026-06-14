// Parser-tester mot den FAKTISKT fångade API-Football-formen (de committade
// __fixtures__/-svaren). Testar beteende, edge-fall OCH fel-vägar (PRINCIPLES §5):
// tom lista, null assist, korrupt namn, okänd status, saknade obligatoriska fält,
// API-rapporterade errors. Skarven (rå -> normaliserad) körs mot oförändrad källform.

import { describe, expect, it } from 'vitest';
import {
  normalizeStatus,
  parseEvents,
  parseFinalResult,
  parseLineups,
  parseLiveFixtures,
  parseStatistics,
  toUtcIso,
} from './parse-live';
import {
  eventsResponse,
  finishedResponse,
  lineupsResponse,
  liveAllResponse,
  statisticsResponse,
} from './fixtures';
import type { RawApiResponse, RawEvent, RawFixtureResponse } from './api-football-types';

describe('normalizeStatus: källhänvisad status-mappning', () => {
  it('mappar live-koder (1H/2H/ET) till live', () => {
    expect(normalizeStatus('1H')).toBe('live');
    expect(normalizeStatus('2H')).toBe('live');
    expect(normalizeStatus('ET')).toBe('live');
  });

  it('mappar paus-koder (HT/BT/P/SUSP/INT) till paused (Daniels frys-spec)', () => {
    for (const code of ['HT', 'BT', 'P', 'SUSP', 'INT']) {
      expect(normalizeStatus(code)).toBe('paused');
    }
  });

  it('mappar slutkoder (FT/AET/PEN) till finished', () => {
    expect(normalizeStatus('FT')).toBe('finished');
    expect(normalizeStatus('AET')).toBe('finished');
    expect(normalizeStatus('PEN')).toBe('finished');
  });

  it('mappar ej-startad (NS/TBD) till scheduled och ej-spelad (PST/CANC/...) till postponed', () => {
    expect(normalizeStatus('NS')).toBe('scheduled');
    expect(normalizeStatus('TBD')).toBe('scheduled');
    for (const code of ['PST', 'CANC', 'ABD', 'AWD', 'WO']) {
      expect(normalizeStatus(code)).toBe('postponed');
    }
  });

  it('ger unknown (ALDRIG live) för en okänd kod (fail-safe)', () => {
    expect(normalizeStatus('ZZ')).toBe('unknown');
    expect(normalizeStatus('')).toBe('unknown');
  });
});

describe('toUtcIso: normaliserar offset-tid till Z', () => {
  it('normaliserar +00:00 till Z', () => {
    expect(toUtcIso('2026-06-14T20:00:00+00:00')).toBe('2026-06-14T20:00:00.000Z');
  });

  it('normaliserar en icke-noll-offset till samma UTC-instant', () => {
    expect(toUtcIso('2026-06-14T22:00:00+02:00')).toBe('2026-06-14T20:00:00.000Z');
  });

  it('fail loud på en ogiltig tid (ingen tyst NaN)', () => {
    expect(() => toUtcIso('inte-ett-datum')).toThrow(/Ogiltig ISO-tid/);
  });
});

describe('parseLiveFixtures: live=all-svaret (Nederländerna-Japan)', () => {
  it('normaliserar den fångade live-matchen till en LiveMatchSnapshot', () => {
    const [snap] = parseLiveFixtures(liveAllResponse);
    expect(snap.apiFixtureId).toBe(1489376);
    expect(snap.status).toBe('live'); // status.short = "1H"
    expect(snap.apiStatusShort).toBe('1H');
    expect(snap.elapsedMinute).toBe(29);
    expect(snap.kickoffUtc).toBe('2026-06-14T20:00:00.000Z');
    expect(snap.homeTeamApiId).toBe(1118); // Netherlands
    expect(snap.homeTeamName).toBe('Netherlands');
    expect(snap.awayTeamApiId).toBe(12); // Japan
    expect(snap.homeGoals).toBe(0);
    expect(snap.awayGoals).toBe(0);
  });

  it('fail loud när API rapporterade errors (icke-tom array)', () => {
    const broken: RawApiResponse<RawFixtureResponse> = {
      get: 'fixtures',
      results: 0,
      errors: ['Invalid API key'],
      response: [],
    };
    expect(() => parseLiveFixtures(broken)).toThrow(/API rapporterade fel/);
  });

  it('fail loud när errors-objektet har nycklar (API:ts objekt-fel-form)', () => {
    const broken: RawApiResponse<RawFixtureResponse> = {
      get: 'fixtures',
      results: 0,
      errors: { token: 'Missing application key.' },
      response: [],
    };
    expect(() => parseLiveFixtures(broken)).toThrow(/API rapporterade fel/);
  });

  it('accepterar tomt errors-objekt (API:ts framgångs-form) och ger tom lista', () => {
    const empty: RawApiResponse<RawFixtureResponse> = {
      get: 'fixtures',
      results: 0,
      errors: {},
      response: [],
    };
    expect(parseLiveFixtures(empty)).toEqual([]);
  });

  it('fail loud när en fixtures-post saknar lag-id (struktur-fel)', () => {
    const noTeam = {
      get: 'fixtures',
      results: 1,
      errors: [],
      response: [
        {
          fixture: {
            id: 5,
            date: '2026-06-14T20:00:00+00:00',
            timestamp: 1,
            status: { long: '', short: '1H', elapsed: 1, extra: null },
          },
          teams: { home: { name: 'X' }, away: { id: 2, name: 'Y' } },
          goals: { home: 0, away: 0 },
          score: {
            halftime: { home: 0, away: 0 },
            fulltime: { home: null, away: null },
            extratime: { home: null, away: null },
            penalty: { home: null, away: null },
          },
        },
      ],
    } as unknown as RawApiResponse<RawFixtureResponse>;
    expect(() => parseLiveFixtures(noTeam)).toThrow(/lag-id saknas/);
  });
});

describe('parseEvents: rika 2022-events (smutsig verklig data)', () => {
  it('normaliserar alla 22 events ur den fångade formen', () => {
    const events = parseEvents(eventsResponse);
    expect(events).toHaveLength(22);
  });

  it('normaliserar event-typer (Goal/Card/subst/Var) till stängd union', () => {
    const events = parseEvents(eventsResponse);
    const kinds = new Set(events.map((e) => e.kind));
    expect(kinds).toContain('goal');
    expect(kinds).toContain('card');
    expect(kinds).toContain('subst');
    expect(kinds).toContain('var');
  });

  it('sätter assistName till null när assist saknas (assist {id:null,name:null})', () => {
    const events = parseEvents(eventsResponse);
    const card = events.find((e) => e.kind === 'card');
    expect(card).toBeDefined();
    expect(card?.assistName).toBeNull();
  });

  it('läser kortfärg ur detail (Yellow Card -> yellow)', () => {
    const events = parseEvents(eventsResponse);
    const yellow = events.find((e) => e.kind === 'card' && e.detail === 'Yellow Card');
    expect(yellow?.cardColor).toBe('yellow');
  });

  it('bär extra-minut för ett tilläggstid-event (45+1, 90+10, 90+13)', () => {
    const events = parseEvents(eventsResponse);
    const stoppage = events.find((e) => e.extra !== null);
    expect(stoppage).toBeDefined();
    expect(stoppage?.extra).toBeGreaterThan(0);
  });

  it('städar korrupt spelarnamn ("3   M. Taremi" -> "M. Taremi") utan att hitta på', () => {
    // Det sista eventet i samplen har player.name = "3                         M. Taremi"
    // (verklig data-smuts: inläckt nummer + lång whitespace). cleanName ska kollapsa
    // whitespace och strippa det ledande lösryckta talet, men inte ändra namnet i övrigt.
    const events = parseEvents(eventsResponse);
    const taremiPenalty = events.find((e) => e.kind === 'goal' && e.detail === 'Penalty');
    expect(taremiPenalty?.playerName).toBe('M. Taremi');
  });

  it('en tom events-lista är giltig (vanligt tidigt i en match) och ger []', () => {
    const empty: RawApiResponse<RawEvent> = {
      get: 'fixtures/events',
      results: 0,
      errors: [],
      response: [],
    };
    expect(parseEvents(empty)).toEqual([]);
  });

  it('fail loud när ett event saknar team.id (struktur-fel)', () => {
    const broken = {
      get: 'fixtures/events',
      results: 1,
      errors: [],
      response: [
        {
          time: { elapsed: 10, extra: null },
          team: { name: 'X' },
          player: { id: 1, name: 'A' },
          assist: { id: null, name: null },
          type: 'Goal',
          detail: 'Normal Goal',
          comments: null,
        },
      ],
    } as unknown as RawApiResponse<RawEvent>;
    expect(() => parseEvents(broken)).toThrow(/team\.id/);
  });

  it('en okänd event-typ blir kind other och bär rå typ vidare', () => {
    const odd = {
      get: 'fixtures/events',
      results: 1,
      errors: [],
      response: [
        {
          time: { elapsed: 10, extra: null },
          team: { id: 1, name: 'X' },
          player: { id: 1, name: 'A' },
          assist: { id: null, name: null },
          type: 'Penalty Missed',
          detail: 'Missed Penalty',
          comments: null,
        },
      ],
    } as unknown as RawApiResponse<RawEvent>;
    const [e] = parseEvents(odd);
    expect(e.kind).toBe('other');
    expect(e.rawType).toBe('Penalty Missed');
  });
});

describe('parseStatistics: per-lags-statistik (number/%-sträng/null)', () => {
  it('normaliserar de två lagens statistik ur den fångade formen', () => {
    const stats = parseStatistics(statisticsResponse);
    expect(stats).toHaveLength(2);
    expect(stats[0].teamApiId).toBe(10); // England
  });

  it('bevarar number-värden, %-strängar och null oförändrade', () => {
    const stats = parseStatistics(statisticsResponse);
    const england = stats[0];
    const possession = england.statistics.find((s) => s.type === 'Ball Possession');
    const totalShots = england.statistics.find((s) => s.type === 'Total Shots');
    const redCards = england.statistics.find((s) => s.type === 'Red Cards');
    expect(possession?.value).toBe('78%'); // %-sträng bevarad
    expect(totalShots?.value).toBe(13); // number bevarad
    expect(redCards?.value).toBeNull(); // null bevarad (inte 0)
  });

  it('fail loud när en statistik-post saknar team.id', () => {
    const broken = {
      get: 'fixtures/statistics',
      results: 1,
      errors: [],
      response: [{ team: { name: 'X' }, statistics: [] }],
    } as unknown as RawApiResponse<never>;
    expect(() => parseStatistics(broken)).toThrow(/team\.id/);
  });
});

describe('parseLineups: laguppställningar', () => {
  it('normaliserar formation, startelva (11) och avbytare ur den fångade formen', () => {
    const lineups = parseLineups(lineupsResponse);
    expect(lineups).toHaveLength(2);
    const england = lineups[0];
    expect(england.formation).toBe('4-2-3-1');
    expect(england.startXI).toHaveLength(11);
    expect(england.startXI[0].position).toBe('G'); // målvakt först
    expect(england.startXI[0].grid).toBe('1:1');
  });

  it('sätter grid till null för avbytare (grid saknas)', () => {
    const lineups = parseLineups(lineupsResponse);
    expect(lineups[0].substitutes[0].grid).toBeNull();
  });
});

describe('parseFinalResult: facit ur fixtures?id (avgjord match)', () => {
  it('läser slutresultatet (England 6-2 Iran) ur den avgjorda fixturen', () => {
    const result = parseFinalResult(finishedResponse);
    expect(result.apiFixtureId).toBe(855735);
    expect(result.homeGoals).toBe(6);
    expect(result.awayGoals).toBe(2);
    expect(result.decidedBy).toBe('regulation');
    expect(result.penalties).toBeNull();
  });

  it('fail loud när matchen INTE är avgjord (facit får inte läsas på pågående match)', () => {
    // liveAllResponse är en pågående match (status 1H) , facit ska vägras.
    expect(() => parseFinalResult(liveAllResponse)).toThrow(/är inte avgjord/);
  });

  it('härleder decidedBy=penalties och bär straffresultat för en PEN-match', () => {
    const pen = {
      get: 'fixtures',
      results: 1,
      errors: [],
      response: [
        {
          fixture: {
            id: 9,
            date: '2026-07-01T20:00:00+00:00',
            timestamp: 1,
            status: { long: 'Penalties', short: 'PEN', elapsed: 120, extra: null },
          },
          teams: { home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } },
          goals: { home: 1, away: 1 },
          score: {
            halftime: { home: 0, away: 0 },
            fulltime: { home: 1, away: 1 },
            extratime: { home: 1, away: 1 },
            penalty: { home: 4, away: 3 },
          },
        },
      ],
    } as unknown as RawApiResponse<RawFixtureResponse>;
    const result = parseFinalResult(pen);
    expect(result.decidedBy).toBe('penalties');
    expect(result.penalties).toEqual({ homeGoals: 4, awayGoals: 3 });
    expect(result.homeGoals).toBe(1); // ordinarie+förlängning, inte straffarna
  });

  it('fail loud när id-uppslaget inte gav exakt en post', () => {
    const two = {
      get: 'fixtures',
      results: 2,
      errors: [],
      response: [finishedResponse.response[0], finishedResponse.response[0]],
    } as unknown as RawApiResponse<RawFixtureResponse>;
    expect(() => parseFinalResult(two)).toThrow(/exakt 1 fixtures-post/);
  });
});
