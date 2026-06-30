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
  aetPenResponse,
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

  it('bär spelar- + assist-id (stabil nyckel för skytteligan T87)', () => {
    // Första målet i samplen: J. Bellingham (id 129718) med assist L. Shaw (id 891).
    const events = parseEvents(eventsResponse);
    const firstGoal = events.find((e) => e.kind === 'goal');
    expect(firstGoal?.playerId).toBe(129718);
    expect(firstGoal?.assistId).toBe(891);
  });

  it('sätter assistId till null när assist saknas (assist {id:null,name:null})', () => {
    const events = parseEvents(eventsResponse);
    const card = events.find((e) => e.kind === 'card');
    expect(card?.assistId).toBeNull();
  });

  it('läser kortfärg ur detail (Yellow Card -> yellow)', () => {
    const events = parseEvents(eventsResponse);
    const yellow = events.find((e) => e.kind === 'card' && e.detail === 'Yellow Card');
    expect(yellow?.cardColor).toBe('yellow');
  });

  // DISKRIMINERANDE seam-test (F1): API-Football v3 sätter detail "Yellow-Red Card" för en
  // andra-gult-UTVISNING. Den strängen bär BÅDE "yellow" och "red", så en includes('yellow')-
  // FÖRST-ordning skulle klassa den som 'yellow' (buggen). Vi matar den EXAKTA API-strängen
  // genom parseEvents->readCardColor och kräver 'red' (utvisning), inte 'yellow'. Tidigare
  // tester använde bara de bekväma "Red Card"/"Yellow Card", aldrig den riktiga strängen.
  it('klassar "Yellow-Red Card" (andra-gult-utvisning) som red, INTE yellow (F1)', () => {
    const secondYellowSendOff = {
      get: 'fixtures/events',
      results: 1,
      errors: [],
      response: [
        {
          time: { elapsed: 75, extra: null },
          team: { id: 1, name: 'X' },
          player: { id: 1, name: 'A' },
          assist: { id: null, name: null },
          type: 'Card',
          detail: 'Yellow-Red Card', // API-Footballs FAKTISKA sträng för andra gult
          comments: null,
        },
      ],
    } as unknown as RawApiResponse<RawEvent>;
    const [e] = parseEvents(secondYellowSendOff);
    expect(e.kind).toBe('card');
    expect(e.cardColor).toBe('red');
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

  it('bär event.comments vidare (markören för straffläggning: "Penalty Shootout")', () => {
    // KÄLLHÄNVISAT (fixture-aet-pen.json): en straffläggnings-spark är ett event med
    // comments "Penalty Shootout". En vanlig straff i matchen har comments null. Utan
    // att bära comments går de två inte att skilja, så vi bevisar att fältet flödar.
    const shootout = {
      get: 'fixtures/events',
      results: 2,
      errors: [],
      response: [
        {
          time: { elapsed: 120, extra: 1 },
          team: { id: 1, name: 'X' },
          player: { id: 5, name: 'Skytt' },
          assist: { id: null, name: null },
          type: 'Goal',
          detail: 'Penalty',
          comments: 'Penalty Shootout',
        },
        {
          time: { elapsed: 23, extra: null },
          team: { id: 1, name: 'X' },
          player: { id: 6, name: 'Ordinarie' },
          assist: { id: null, name: null },
          type: 'Goal',
          detail: 'Penalty',
          comments: null,
        },
      ],
    } as unknown as RawApiResponse<RawEvent>;
    const [kick, regular] = parseEvents(shootout);
    expect(kick.comments).toBe('Penalty Shootout');
    expect(regular.comments).toBeNull();
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

  it('bär tränarens namn ur coach-blocket (England: G. Southgate)', () => {
    const lineups = parseLineups(lineupsResponse);
    expect(lineups[0].coachName).toBe('G. Southgate');
  });

  it('tål en lineup-post UTAN coach-block -> coachName null (gissa aldrig)', () => {
    // En post där hela coach-blocket saknas (API kan utelämna det) ska ge null, inte krasch.
    const payload = {
      get: 'fixtures/lineups',
      results: 1,
      response: [
        {
          team: { id: 99, name: 'Utan tränare' },
          formation: '4-4-2',
          startXI: [{ player: { id: 1, name: 'A', number: 1, pos: 'G', grid: '1:1' } }],
          substitutes: [],
        },
      ],
      errors: {},
    };
    const lineups = parseLineups(payload);
    expect(lineups[0].coachName).toBeNull();
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

  // DISKRIMINERANDE facit-test mot RIKTIG data (Argentina-Frankrike, VM-finalen 2022).
  // goals 3-3 (aggregat efter förlängning, exkl. straffar) != extratime 1-1 != fulltime
  // 2-2 , så testet RÖDNAR om någon återinför extratime-buggen (homeGoals=et.home=1) eller
  // fulltime-buggen (homeGoals=ft.home=2) i stället för facit ur goals (3).
  it('läser facit ur goals (3-3), INTE extratime (1-1), för en RIKTIG straffmatch (Arg-Fra 2022)', () => {
    const result = parseFinalResult(aetPenResponse);
    expect(result.apiFixtureId).toBe(979139);
    expect(result.homeGoals).toBe(3); // goals.home (facit), inte extratime.home (1) el. fulltime.home (2)
    expect(result.awayGoals).toBe(3); // goals.away (facit), inte extratime.away (1) el. fulltime.away (2)
    expect(result.decidedBy).toBe('penalties');
    expect(result.penalties).toEqual({ homeGoals: 4, awayGoals: 2 }); // straffarna separat
  });

  // DISKRIMINERANDE AET-test (syntetisk): goals 3-1 != extratime 2-0 != fulltime 1-1, alla
  // tre olika, så en återinförd extratime-bugg (homeGoals=et.home=2) eller fulltime-bugg
  // (homeGoals=ft.home=1) ger ett ANNAT svar än det rätta (goals 3-1) och rödnar testet.
  it('läser facit ur goals för en AET-match (förlängning, inga straffar) , inte extratime', () => {
    const aet = {
      get: 'fixtures',
      results: 1,
      errors: [],
      response: [
        {
          fixture: {
            id: 11,
            date: '2026-07-05T20:00:00+00:00',
            timestamp: 1,
            status: { long: 'Match Finished', short: 'AET', elapsed: 120, extra: null },
          },
          teams: { home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } },
          goals: { home: 3, away: 1 }, // facit: aggregat efter förlängning
          score: {
            halftime: { home: 0, away: 0 },
            fulltime: { home: 1, away: 1 }, // ställning efter 90 min
            extratime: { home: 2, away: 0 }, // ENBART förlängningsmålen (additivt)
            penalty: { home: null, away: null },
          },
        },
      ],
    } as unknown as RawApiResponse<RawFixtureResponse>;
    const result = parseFinalResult(aet);
    expect(result.decidedBy).toBe('extra-time');
    expect(result.homeGoals).toBe(3); // goals (3), inte extratime (2) el. fulltime (1)
    expect(result.awayGoals).toBe(1); // goals (1), inte extratime (0) el. fulltime (1)
    expect(result.penalties).toBeNull(); // inga straffar i en AET-match
  });

  it('härleder decidedBy=penalties och bär straffresultat för en (syntetisk) PEN-match', () => {
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
          goals: { home: 2, away: 2 }, // facit: aggregat före straffar (1-1 ft + 1-1 et)
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
    expect(result.homeGoals).toBe(2); // goals (aggregat), inte straffarna (4) el. enbart et (1)
  });

  it('fail loud när en avgjord match saknar goals (facit)', () => {
    const noGoals = {
      get: 'fixtures',
      results: 1,
      errors: [],
      response: [
        {
          fixture: {
            id: 13,
            date: '2026-07-01T20:00:00+00:00',
            timestamp: 1,
            status: { long: 'Match Finished', short: 'FT', elapsed: 90, extra: null },
          },
          teams: { home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } },
          goals: { home: null, away: null },
          score: {
            halftime: { home: 0, away: 0 },
            fulltime: { home: null, away: null },
            extratime: { home: null, away: null },
            penalty: { home: null, away: null },
          },
        },
      ],
    } as unknown as RawApiResponse<RawFixtureResponse>;
    expect(() => parseFinalResult(noGoals)).toThrow(/saknar goals/);
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
