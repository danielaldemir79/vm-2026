// Tester för den RENA avstängnings-härledningen (T99, #200). Bevisar domänreglerna S1-S5
// (rött -> ban, 2 ackumulerade gula -> ban, ackumulering över matcher, från-match, auto-bort
// när avtjänad, gul-nollställning vid fas-gräns) plus edge-fall och fel-vägar, med
// DISKRIMINERANDE fixturer (lessons "invariant-test-vars-fixtur-kollapsar-operatorn": testdata
// når MEDVETET den gren garantin bor i, och tröskeln testas n-1/n/n+1).
//
// Klockan injiceras (nowMs), så "spelad/inte spelad än" är deterministiskt , ingen riktig tid.

import { describe, expect, it } from 'vitest';
import { deriveSuspensions } from './suspensions';
import { parseEvents } from '../../data/livescore';
import type { LiveMatchEvents, LiveEvent } from '../../data/livescore';
import type { RawApiResponse, RawEvent } from '../../data/livescore/api-football-types';
import type { Match } from '../../domain/types';

// --- Bygg-hjälpare ----------------------------------------------------------------------

/** Brasilien (teamApiId 6 -> 'bra' i team-bridge) , finns i bryggan, ger en app-lag-koppling. */
const BRA = 6;
/** Argentina (teamApiId 26 -> 'arg') , ett andra känt lag för fler-lag-fall. */
const ARG = 26;
/** Ett team-id som INTE finns i VM-bryggan (negativ-väg: kortet ska hoppas). */
const UNKNOWN_API_TEAM = 999999;

/** En gruppspels-match i planen (scheduled = inte spelad). */
function groupMatch(id: string, home: string | null, away: string | null, kickoff: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: home,
    awayTeamId: away,
    kickoff,
    venue: 'Arena',
    tvChannel: 'TV4',
    result: null,
    status: 'scheduled',
  };
}

/** En slutspels-match (stage injicerbart för fas-gräns-testet). */
function koMatch(
  id: string,
  stage: Match['stage'],
  home: string | null,
  away: string | null,
  kickoff: string
): Match {
  return {
    id,
    stage,
    groupId: null,
    homeTeamId: home,
    awayTeamId: away,
    kickoff,
    venue: 'Arena',
    tvChannel: 'TV4',
    result: null,
    status: 'scheduled',
  };
}

/** Ett kort-event (gult/rött) för en spelare i ett lag. */
function card(color: 'yellow' | 'red', over: Partial<LiveEvent> = {}): LiveEvent {
  return {
    minute: 30,
    extra: null,
    kind: 'card',
    rawType: 'Card',
    detail: color === 'yellow' ? 'Yellow Card' : 'Red Card',
    teamApiId: BRA,
    teamName: 'Brasilien',
    playerId: 100,
    playerName: 'Försvararen',
    assistId: null,
    assistName: null,
    cardColor: color,
    ...over,
  };
}

function evt(matchId: string, events: LiveEvent[]): LiveMatchEvents {
  return { matchId, events };
}

// Tre gruppmatcher för Brasilien i kronologisk ordning. Alla i framtiden default (ej spelade)
// relativt en NU-tid LÅNGT före, så "auto-bort"-grenen inte triggar om inte vi vill det.
const NOW_BEFORE_ALL = Date.parse('2026-06-01T00:00:00.000Z');
const G1 = groupMatch('g-A-1', 'bra', 'arg', '2026-06-11T19:00:00.000Z');
const G2 = groupMatch('g-A-2', 'bra', 'arg', '2026-06-15T19:00:00.000Z');
const G3 = groupMatch('g-A-3', 'bra', 'arg', '2026-06-20T19:00:00.000Z');
const PLAN_3 = [G1, G2, G3];

// --- S1: rött kort -> avstängd nästa match ---------------------------------------------

describe('S1, rött kort', () => {
  it('rött kort i match 1 -> EN aktiv avstängning som gäller match 2', () => {
    const out = deriveSuspensions([evt('g-A-1', [card('red')])], PLAN_3, NOW_BEFORE_ALL);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      playerId: 100,
      teamId: 'bra',
      reason: 'red-card',
      fromMatchId: 'g-A-1',
      servesMatchId: 'g-A-2',
      estimatedMatches: 1,
    });
  });

  it('rött kort i lagets SISTA match -> ingen post (ingen kommande match att avtjäna i)', () => {
    const out = deriveSuspensions([evt('g-A-3', [card('red')])], PLAN_3, NOW_BEFORE_ALL);
    expect(out).toHaveLength(0);
  });
});

// --- S1 via andra-gult-UTVISNING ("Yellow-Red Card", F1) --------------------------------
// Den verkliga API-strängen för en utvisning på andra gult parsas till ett 'red'-event
// (parse-live.readCardColor), så S1-grenen fångar den. Vi kör den EXAKTA strängen genom
// parseEvents, så hela kedjan råsträng -> 'red' -> EN avstängning bevisas (inte en bekväm
// fixtur). Detta var F1: före fixen klassades "Yellow-Red Card" som 'yellow' -> ingen post.

/** Parsa ETT "Yellow-Red Card"-event (andra-gult-utvisning) som parse-live skulle ge det. */
function secondYellowSendOff(minute: number): LiveEvent {
  const [parsed] = parseEvents({
    get: 'fixtures/events',
    results: 1,
    errors: [],
    response: [
      {
        time: { elapsed: minute, extra: null },
        team: { id: BRA, name: 'Brasilien' },
        player: { id: 100, name: 'Försvararen' },
        assist: { id: null, name: null },
        type: 'Card',
        detail: 'Yellow-Red Card', // API-Footballs FAKTISKA sträng för andra gult
        comments: null,
      },
    ],
  } as unknown as RawApiResponse<RawEvent>);
  return parsed;
}

describe('S1 via andra-gult-utvisning (Yellow-Red Card, F1)', () => {
  it('"Yellow-Red Card" i match 1 -> EN avstängning (red-card) som gäller match 2', () => {
    const out = deriveSuspensions(
      [evt('g-A-1', [secondYellowSendOff(75)])],
      PLAN_3,
      NOW_BEFORE_ALL
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      playerId: 100,
      teamId: 'bra',
      reason: 'red-card',
      fromMatchId: 'g-A-1',
      servesMatchId: 'g-A-2',
    });
  });

  it('första gult (match 1) + andra-gult-utvisning (match 2) -> EXAKT EN avstängning, första gult ej dubbelräknat', () => {
    // Spelaren får ett rent gult i match 1 (pending = 1), sedan en utvisning på andra gult i
    // match 2. Utvisningen är ett 'red'-event (S1) som gäller match 3 , INTE ett andra
    // ackumulerings-gult som skulle paras ihop med match 1:s gula till en EGEN S2-avstängning.
    // Före F1-fixen klassades "Yellow-Red Card" som 'yellow' -> match 1+2 hade blivit ett par
    // (fel from-match) ELLER (med yellowThisMatch-dedupen) ingen post alls. Nu: exakt 1 röd-post.
    const out = deriveSuspensions(
      [evt('g-A-1', [card('yellow')]), evt('g-A-2', [secondYellowSendOff(75)])],
      PLAN_3,
      NOW_BEFORE_ALL
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      reason: 'red-card', // utvisningen, inte 'two-yellows'
      fromMatchId: 'g-A-2', // utlöstes i match 2 (utvisningen), inte match 1
      servesMatchId: 'g-A-3', // gäller lagets nästa match
    });
  });
});

// --- S2: två ackumulerade gula (skilda matcher) -> avstängd nästa match -----------------
// Tröskel-garanti testas n-1 / n / n+1 (lessons "testa garantin där den lättast bryts").

describe('S2, ackumulerade gula (tröskel n-1/n/n+1)', () => {
  it('n-1: ETT gult (en match) -> INGEN avstängning', () => {
    const out = deriveSuspensions([evt('g-A-1', [card('yellow')])], PLAN_3, NOW_BEFORE_ALL);
    expect(out).toHaveLength(0);
  });

  it('n: TVÅ gula i skilda matcher -> EN avstängning, gäller match EFTER det andra gula', () => {
    const out = deriveSuspensions(
      [evt('g-A-1', [card('yellow')]), evt('g-A-2', [card('yellow')])],
      PLAN_3,
      NOW_BEFORE_ALL
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      reason: 'two-yellows',
      fromMatchId: 'g-A-2', // andra gula utlöste
      servesMatchId: 'g-A-3', // gäller lagets nästa match
    });
  });

  it('n+1: TRE gula i tre skilda matcher -> fortfarande EN avstängning (par 1+2 konsumerade, 3:e ensamt)', () => {
    const out = deriveSuspensions(
      [
        evt('g-A-1', [card('yellow')]),
        evt('g-A-2', [card('yellow')]),
        evt('g-A-3', [card('yellow')]),
      ],
      PLAN_3,
      NOW_BEFORE_ALL
    );
    // Andra gula (g-A-2) utlöste avstängning för g-A-3; tredje gula (g-A-3) är ett nytt ensamt
    // gult (par-räknaren nollställdes), så inget nytt par -> exakt 1 post.
    expect(out).toHaveLength(1);
    expect(out[0].fromMatchId).toBe('g-A-2');
  });

  it('två gula i SAMMA match räknas som ETT ackumulerings-gult, inte ett par', () => {
    // Två gula i en match är i verkligheten en utvisning (ett rött event), men om datan bara har
    // två gula-event utan rött, räknar vi högst ETT ackumulerings-gult den matchen (S2-noten).
    const out = deriveSuspensions(
      [evt('g-A-1', [card('yellow'), card('yellow')])],
      PLAN_3,
      NOW_BEFORE_ALL
    );
    expect(out).toHaveLength(0);
  });
});

// --- S5: auto-bort när avtjänad --------------------------------------------------------

describe('S5, auto-bort när avtjänad', () => {
  it('rött i match 1, men match 2 är redan SPELAD (status finished) -> posten borta', () => {
    const finishedG2: Match = {
      ...G2,
      status: 'finished',
      result: { homeGoals: 1, awayGoals: 0 },
    };
    const out = deriveSuspensions(
      [evt('g-A-1', [card('red')])],
      [G1, finishedG2, G3],
      NOW_BEFORE_ALL
    );
    expect(out).toHaveLength(0);
  });

  it('rött i match 1, match 2 ej spelad än men dess AVSPARK har passerat (nu efter kickoff) -> avtjänad, borta', () => {
    // Klockan EFTER g-A-2:s avspark men matchen fortf. scheduled (status hann inte uppdateras):
    // klockan är sanningen, matchen räknas som spelad -> auto-bort.
    const afterG2Kickoff = Date.parse('2026-06-15T21:00:00.000Z');
    const out = deriveSuspensions([evt('g-A-1', [card('red')])], PLAN_3, afterG2Kickoff);
    expect(out).toHaveLength(0);
  });

  it('rött i match 1, match 2 LIVE just nu -> avtjänas just nu, posten borta (spelaren sitter ute)', () => {
    const liveG2: Match = { ...G2, status: 'live', result: null };
    const out = deriveSuspensions([evt('g-A-1', [card('red')])], [G1, liveG2, G3], NOW_BEFORE_ALL);
    expect(out).toHaveLength(0);
  });
});

// --- S3: gul-nollställning vid fas-gräns (VM 2026:s nyhet) -------------------------------

describe('S3, gul-nollställning vid fas-gräns', () => {
  // Ett lag som spelar grupp (g-A-1) + R32 (M73) + R16 (M89): ett gult i gruppspelet + ett gult i
  // R32 ska INTE bli ett par (gruppspelets gula nollställs efter gruppspelet).
  const planAcrossGroup = [
    groupMatch('g-A-1', 'bra', 'arg', '2026-06-11T19:00:00.000Z'),
    koMatch('M73', 'round-of-32', 'bra', 'arg', '2026-06-28T19:00:00.000Z'),
    koMatch('M89', 'round-of-16', 'bra', 'arg', '2026-07-04T21:00:00.000Z'),
    // En kvartsfinal EFTER R16 i SAMMA fas-block (r32-to-quarter), så ett par R32+R16-gula har en
    // kommande match att gälla (M97) , annars vore "0 poster" trivialt sant av brist på nästa match.
    koMatch('M97', 'quarter-final', 'bra', 'arg', '2026-07-09T20:00:00.000Z'),
  ];

  it('gult i gruppspel + gult i R32 -> INGEN avstängning (gula nollställdes efter gruppspelet)', () => {
    const out = deriveSuspensions(
      [evt('g-A-1', [card('yellow')]), evt('M73', [card('yellow')])],
      planAcrossGroup,
      NOW_BEFORE_ALL
    );
    expect(out).toHaveLength(0);
  });

  it('NEGATIV-DISKRIMINANT: två gula BÅDA i slutspelet (R32 + R16) -> EN avstängning (ingen gräns emellan)', () => {
    // Samma plan, men nu båda gula i samma fas-block (R32 och R16 ligger båda i "r32-to-quarter")
    // -> de SKA bli ett par. Skiljer "nollställning vid gräns" från "räknar aldrig par alls".
    const out = deriveSuspensions(
      [evt('M73', [card('yellow')]), evt('M89', [card('yellow')])],
      planAcrossGroup,
      NOW_BEFORE_ALL
    );
    expect(out).toHaveLength(1);
    expect(out[0].fromMatchId).toBe('M89'); // 2:a gula utlöste i R16
    expect(out[0].servesMatchId).toBe('M97'); // gäller lagets nästa match (kvartsfinalen)
  });

  it('gula nollställs igen EFTER kvartsfinalerna (kvart + semi -> inget par)', () => {
    const planAcrossQuarter = [
      koMatch('M97', 'quarter-final', 'bra', 'arg', '2026-07-09T20:00:00.000Z'),
      koMatch('M101', 'semi-final', 'bra', 'arg', '2026-07-14T19:00:00.000Z'),
      koMatch('M104', 'final', 'bra', 'arg', '2026-07-19T19:00:00.000Z'),
    ];
    const out = deriveSuspensions(
      [evt('M97', [card('yellow')]), evt('M101', [card('yellow')])],
      planAcrossQuarter,
      NOW_BEFORE_ALL
    );
    expect(out).toHaveLength(0);
  });
});

// --- Fler-spelare / fler-lag + ordning --------------------------------------------------

describe('flera bannade, deterministisk ordning', () => {
  it('två spelare i olika lag bannade -> två poster, sorterade på lagnamn', () => {
    const plan = [
      groupMatch('g-A-1', 'bra', 'arg', '2026-06-11T19:00:00.000Z'),
      groupMatch('g-A-2', 'bra', 'arg', '2026-06-15T19:00:00.000Z'),
    ];
    const out = deriveSuspensions(
      [
        evt('g-A-1', [
          card('red', {
            teamApiId: BRA,
            teamName: 'Brasilien',
            playerId: 100,
            playerName: 'B-spelare',
          }),
          card('red', {
            teamApiId: ARG,
            teamName: 'Argentina',
            playerId: 200,
            playerName: 'A-spelare',
          }),
        ]),
      ],
      plan,
      NOW_BEFORE_ALL
    );
    expect(out).toHaveLength(2);
    // Sorterat på lagnamn (sv): Argentina före Brasilien.
    expect(out.map((p) => p.teamName)).toEqual(['Argentina', 'Brasilien']);
    expect(out.every((p) => p.servesMatchId === 'g-A-2')).toBe(true);
  });
});

// --- Fel-vägar / edge-fall -------------------------------------------------------------

describe('edge-fall och fel-vägar', () => {
  it('inga kort alls -> tom lista (ingen krasch)', () => {
    expect(deriveSuspensions([evt('g-A-1', [])], PLAN_3, NOW_BEFORE_ALL)).toEqual([]);
  });

  it('tom input (inga matcher) -> tom lista', () => {
    expect(deriveSuspensions([], PLAN_3, NOW_BEFORE_ALL)).toEqual([]);
    expect(deriveSuspensions([], [], NOW_BEFORE_ALL)).toEqual([]);
  });

  it('kort i en match som INTE finns i planen (fixtures api-id) -> hoppas, ingen post', () => {
    const out = deriveSuspensions([evt('api-12345', [card('red')])], PLAN_3, NOW_BEFORE_ALL);
    expect(out).toHaveLength(0);
  });

  it('kort för ett lag utanför VM-bryggan (okänt teamApiId) -> hoppas, ingen gissad koppling', () => {
    const out = deriveSuspensions(
      [evt('g-A-1', [card('red', { teamApiId: UNKNOWN_API_TEAM, teamName: 'Mars FC' })])],
      PLAN_3,
      NOW_BEFORE_ALL
    );
    expect(out).toHaveLength(0);
  });

  it('kort utan känt spelar-id/namn -> hoppas (gissa aldrig en spelare)', () => {
    const out = deriveSuspensions(
      [evt('g-A-1', [card('red', { playerId: null, playerName: null })])],
      PLAN_3,
      NOW_BEFORE_ALL
    );
    expect(out).toHaveLength(0);
  });

  it('oseedad slutspelsmatch (lag null i planen) bidrar inte till sekvensen -> rött där ger ingen post', () => {
    const plan = [
      koMatch('M73', 'round-of-32', null, null, '2026-06-28T19:00:00.000Z'),
      koMatch('M89', 'round-of-16', null, null, '2026-07-04T21:00:00.000Z'),
    ];
    // Kortet har lag 'bra' men matchen har inga seedade lag -> 'bra' har ingen plan-sekvens.
    const out = deriveSuspensions([evt('M73', [card('red')])], plan, NOW_BEFORE_ALL);
    expect(out).toHaveLength(0);
  });
});
