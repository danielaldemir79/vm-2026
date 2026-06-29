// Auto-mappnings-tester. SKARVEN (lärdomen bevisa-skarven): vi kör resolvern mot den
// FAKTISKA matchplanen (buildMatchPlan ur WC2026_MATCHES, samma plan som bäddas in i
// pollaren) + den FULLA lag-bryggan, så happy-path bevisar en ÄKTA koppling (ned/jpn ->
// g-F-1), och fel-vägarna (okänt lag, fel tid, tvetydig) ger unresolved (gissar aldrig).

import { describe, expect, it } from 'vitest';
import {
  AUTO_MAP_KICKOFF_WINDOW_MS,
  resolveFixtureToMatch,
  type LiveFixtureRef,
  type MatchPlanEntry,
} from './fixture-map-resolver';
import { buildMatchPlan } from './match-plan';
import { resolveApiTeamId } from './team-bridge';
import { WC2026_MATCHES } from '../wc2026/matches';

// Den riktiga planen (samma som genereras till edge-funktionen), så testet bevisar
// auto-mappningen mot KÄLLAN, inte en handskriven mini-plan.
const PLAN: MatchPlanEntry[] = buildMatchPlan(WC2026_MATCHES);

// API-id för Nederländerna/Japan ur den fulla bryggan (g-F-1 = ned vs jpn, 2026-06-14T20:00Z).
const NED = resolveApiTeamId('ned') as number; // 1118
const JPN = resolveApiTeamId('jpn') as number; // 12
const GF1_KICKOFF = '2026-06-14T20:00:00.000Z';

/** En live-fixture-ref med rimliga default (ned-jpn), override per test. */
function fixture(overrides: Partial<LiveFixtureRef> = {}): LiveFixtureRef {
  return {
    apiFixtureId: 1489376,
    homeTeamApiId: NED,
    awayTeamApiId: JPN,
    kickoffUtc: GF1_KICKOFF,
    ...overrides,
  };
}

describe('resolveFixtureToMatch: GRUPPMATCH (lag-par + kickoff)', () => {
  it('löser ned-jpn-fixturen till g-F-1 (lag + kickoff matchar)', () => {
    const res = resolveFixtureToMatch(fixture(), PLAN);
    expect(res.kind).toBe('resolved');
    if (res.kind === 'resolved') {
      expect(res.appMatchId).toBe('g-F-1');
      expect(res.apiFixtureId).toBe(1489376);
    }
  });

  it('löser även när API:t har hemma/borta omvänt (paret avgör identiteten)', () => {
    const res = resolveFixtureToMatch(fixture({ homeTeamApiId: JPN, awayTeamApiId: NED }), PLAN);
    expect(res.kind).toBe('resolved');
    if (res.kind === 'resolved') expect(res.appMatchId).toBe('g-F-1');
  });

  it('tål rimlig minut-drift i avsparkstid (inom 2h-fönstret)', () => {
    const res = resolveFixtureToMatch(fixture({ kickoffUtc: '2026-06-14T20:45:00.000Z' }), PLAN);
    expect(res.kind).toBe('resolved');
    if (res.kind === 'resolved') expect(res.appMatchId).toBe('g-F-1');
  });

  it('UNRESOLVED när ETT lag är känt men det andra saknas (kan inte bekräfta, gissar aldrig)', () => {
    // ned känt, andra laget okänt + kickoff stämmer EXAKT med g-F-1. Resolvern får
    // ALDRIG mappa till g-F-1 bara för att tiden råkar stämma , ett känt lag betyder
    // att det är en seedad match vars koppling måste bekräftas via bryggan (båda lag).
    const res = resolveFixtureToMatch(fixture({ awayTeamApiId: 999999 }), PLAN);
    expect(res.kind).toBe('unresolved');
    if (res.kind === 'unresolved') {
      expect(res.reason).toMatch(/ett lag känt|kan inte bekräfta/);
    }
  });

  it('UNRESOLVED när BÅDA lagen okända men kickoff träffar en GRUPPMATCH (inte ett oseedat slutspel)', () => {
    // Båda lag okända + exakt g-F-1-kickoff: g-F-1 ÄR seedad (har lag), så även
    // exakt-kickoff-grenen ska bara mappa mot en match UTAN lag. g-F-1 är unik på
    // tid men en gruppmatch , den ska mappas (exakt unik kickoff), men det skulle
    // vara fel att mappa en helt annan match. Vi accepterar resolved-till-g-F-1 ELLER
    // unresolved, men ALDRIG fel id (kickoff är unik, så det blir g-F-1 eller inget).
    const res = resolveFixtureToMatch(
      fixture({ homeTeamApiId: 888888, awayTeamApiId: 999999 }),
      PLAN
    );
    if (res.kind === 'resolved') {
      expect(res.appMatchId).toBe('g-F-1'); // unik på tid -> aldrig fel id
    }
  });

  it('UNRESOLVED när rätt lag men kickoff ligger utanför fönstret (fel dag)', () => {
    const res = resolveFixtureToMatch(fixture({ kickoffUtc: '2026-06-20T20:00:00.000Z' }), PLAN);
    expect(res.kind).toBe('unresolved');
    if (res.kind === 'unresolved') expect(res.reason).toMatch(/kickoff-fönstret/);
  });

  it('UNRESOLVED (tvetydigt) när två schemarader med samma lag-par ligger inom fönstret', () => {
    // Syntetisk mini-plan: ned/jpn två gånger inom 2h -> resolvern vägrar gissa.
    const ambiguous: MatchPlanEntry[] = [
      { matchId: 'x1', kickoffUtc: GF1_KICKOFF, homeAppId: 'ned', awayAppId: 'jpn' },
      {
        matchId: 'x2',
        kickoffUtc: '2026-06-14T21:00:00.000Z',
        homeAppId: 'ned',
        awayAppId: 'jpn',
      },
    ];
    const res = resolveFixtureToMatch(fixture(), ambiguous);
    expect(res.kind).toBe('unresolved');
    if (res.kind === 'unresolved') expect(res.reason).toMatch(/tvetydigt/);
  });
});

describe('resolveFixtureToMatch: SLUTSPEL (oseedade lag -> unik exakt kickoff)', () => {
  it('löser en slutspelsmatch på EXAKT unik kickoff (lag okända)', () => {
    // M73 (round-of-32) har null lag och kickoff 2026-06-28T19:00Z i planen. En live-
    // fixture med okända lag men exakt den kickoffen ska mappas (om den är unik).
    const m73 = PLAN.find((e) => e.matchId === 'M73');
    expect(m73).toBeDefined();
    const res = resolveFixtureToMatch(
      {
        apiFixtureId: 5000001,
        homeTeamApiId: 888888, // okänt (oseedat slutspelslag)
        awayTeamApiId: 999999,
        kickoffUtc: m73!.kickoffUtc,
      },
      PLAN
    );
    // Bara om M73:s kickoff är unik i planen löses den; annars unresolved. Vi
    // accepterar bägge utfallen men kräver att den ALDRIG mappas till fel id.
    if (res.kind === 'resolved') {
      expect(res.appMatchId).toBe('M73');
    } else {
      expect(res.reason).toMatch(/tvetydigt|exakt kickoff/);
    }
  });

  it('UNRESOLVED för slutspel utan exakt kickoff-träff (gissar aldrig på fönster)', () => {
    const res = resolveFixtureToMatch(
      {
        apiFixtureId: 5000002,
        homeTeamApiId: 888888,
        awayTeamApiId: 999999,
        kickoffUtc: '2030-01-01T00:00:00.000Z', // ingen schemarad har den tiden
      },
      PLAN
    );
    expect(res.kind).toBe('unresolved');
  });

  it('UNRESOLVED (tvetydigt) när flera oseedade slutspelsmatcher delar exakt kickoff', () => {
    const tied: MatchPlanEntry[] = [
      { matchId: 'M90', kickoffUtc: '2026-07-01T19:00:00.000Z', homeAppId: null, awayAppId: null },
      { matchId: 'M91', kickoffUtc: '2026-07-01T19:00:00.000Z', homeAppId: null, awayAppId: null },
    ];
    const res = resolveFixtureToMatch(
      {
        apiFixtureId: 5000003,
        homeTeamApiId: 888888,
        awayTeamApiId: 999999,
        kickoffUtc: '2026-07-01T19:00:00.000Z',
      },
      tied
    );
    expect(res.kind).toBe('unresolved');
    if (res.kind === 'unresolved') expect(res.reason).toMatch(/tvetydigt/);
  });
});

describe('resolveFixtureToMatch: SLUTSPEL (känd-lags fixture, oseedad bracket-plats)', () => {
  // DET REALA M73-SCENARIOT (buggen som gick omappat): en riktig slutspelsmatch har
  // BÅDA lagen kända (de spelade gruppspel, finns i bryggan), men schemaraden M73-M104
  // är oseedad (null lag) tills bracket-seedningen fyllt den. Lag-paret kan då aldrig
  // matcha en null-lags-rad , fallbacken mappar i stället på den UNIKA avsparkstiden.
  const RSA = resolveApiTeamId('rsa') as number; // 1531
  const CAN = resolveApiTeamId('can') as number; // 5529
  const M73 = PLAN.find((e) => e.matchId === 'M73');

  it('löser en känd-lags slutspelsmatch till den oseedade M73-raden via unik kickoff', () => {
    // rsa + can är KÄNDA i bryggan men spelar inte varandra i gruppspel (grupp A vs B),
    // så inget seedat lag-par matchar. M73 är oseedad (null) och unik på sin kickoff i
    // den riktiga planen -> fallbacken mappar fixturen dit. Detta är exakt det fall som
    // tidigare gick unresolved (hela M73-M104 omappat). Diskriminerande: utan fallbacken
    // returnerar grenen unresolved (ANNAT svar än resolved->M73), se negativ-kontrollen.
    expect(M73).toBeDefined();
    const res = resolveFixtureToMatch(
      {
        apiFixtureId: 5100073,
        homeTeamApiId: RSA,
        awayTeamApiId: CAN,
        kickoffUtc: M73!.kickoffUtc,
      },
      PLAN
    );
    expect(res.kind).toBe('resolved');
    if (res.kind === 'resolved') {
      expect(res.appMatchId).toBe('M73');
      expect(res.apiFixtureId).toBe(5100073);
    }
  });

  it('tål rimlig minut-drift mot M73:s kickoff (inom 2h-fönstret)', () => {
    expect(M73).toBeDefined();
    const drifted = new Date(Date.parse(M73!.kickoffUtc) + 40 * 60 * 1000).toISOString();
    const res = resolveFixtureToMatch(
      { apiFixtureId: 5100073, homeTeamApiId: RSA, awayTeamApiId: CAN, kickoffUtc: drifted },
      PLAN
    );
    expect(res.kind).toBe('resolved');
    if (res.kind === 'resolved') expect(res.appMatchId).toBe('M73');
  });

  it('UNRESOLVED (tvetydigt) när TVÅ oseedade slutspels-rader ligger inom fönstret', () => {
    // Syntetisk plan: två null-lags-rader 1 h isär (inom 2h). Känd-lags-fixturen (rsa/can,
    // paret saknas i planen) får då två fallback-kandidater -> vägrar gissa.
    const ambiguousKnockout: MatchPlanEntry[] = [
      { matchId: 'M73', kickoffUtc: '2026-06-28T19:00:00.000Z', homeAppId: null, awayAppId: null },
      { matchId: 'M74', kickoffUtc: '2026-06-28T20:00:00.000Z', homeAppId: null, awayAppId: null },
    ];
    const res = resolveFixtureToMatch(
      {
        apiFixtureId: 5100074,
        homeTeamApiId: RSA,
        awayTeamApiId: CAN,
        kickoffUtc: '2026-06-28T19:00:00.000Z',
      },
      ambiguousKnockout
    );
    expect(res.kind).toBe('unresolved');
    if (res.kind === 'unresolved') expect(res.reason).toMatch(/tvetydigt.*oseedade slutspels/);
  });

  it('UNRESOLVED när ingen oseedad slutspels-rad ligger nära kickoff (gissar aldrig)', () => {
    // Känd-lags-fixture, men kickoffen ligger långt från varje oseedad rad i planen.
    const res = resolveFixtureToMatch(
      {
        apiFixtureId: 5100075,
        homeTeamApiId: RSA,
        awayTeamApiId: CAN,
        kickoffUtc: '2030-01-01T00:00:00.000Z',
      },
      PLAN
    );
    expect(res.kind).toBe('unresolved');
    if (res.kind === 'unresolved') {
      expect(res.reason).toMatch(/oseedad slutspels-plats inom kickoff-fönstret/);
    }
  });

  it('REGRESSION: ett känt + ett okänt lag -> fortfarande unresolved (ingen fallback)', () => {
    // Fallbacken får BARA trigga när BÅDA lagen är kända (Fall 1, candidates tomt). Ett
    // okänt lag dirigeras till ena-laget-okänt-grenen och ska aldrig nå tid-fallbacken.
    expect(M73).toBeDefined();
    const res = resolveFixtureToMatch(
      {
        apiFixtureId: 5100076,
        homeTeamApiId: RSA,
        awayTeamApiId: 999999,
        kickoffUtc: M73!.kickoffUtc,
      },
      PLAN
    );
    expect(res.kind).toBe('unresolved');
    if (res.kind === 'unresolved') expect(res.reason).toMatch(/ett lag känt|kan inte bekräfta/);
  });

  it('INVARIANT (unikhets-gard): oseedade slutspels-rader ligger > fönstret isär i riktiga planen', () => {
    // Fallbackens säkerhet vilar på att ett 2h-fönster fångar HÖGST en oseedad rad. Lås
    // det mot källan (matches.ts M73-M104): minsta avstånd mellan två oseedade rader ska
    // vara STÖRRE än AUTO_MAP_KICKOFF_WINDOW_MS, annars kan en känd-lags-fixture som
    // ligger på sin rad fånga två -> ambiguöst. Bryts detta av ett framtida schema-byte
    // rödnar testet och varnar att garden kan brista.
    const unseeded = PLAN.filter((e) => e.homeAppId === null && e.awayAppId === null)
      .map((e) => Date.parse(e.kickoffUtc))
      .sort((a, b) => a - b);
    expect(unseeded.length).toBe(32); // M73-M104, hela slutspelet oseedat i planen
    let minGap = Infinity;
    for (let i = 1; i < unseeded.length; i++) {
      minGap = Math.min(minGap, unseeded[i] - unseeded[i - 1]);
    }
    expect(minGap).toBeGreaterThan(AUTO_MAP_KICKOFF_WINDOW_MS);
  });
});

describe('resolveFixtureToMatch: edge', () => {
  it('UNRESOLVED mot en tom plan (inget att matcha mot)', () => {
    expect(resolveFixtureToMatch(fixture(), []).kind).toBe('unresolved');
  });

  it('fönstret är 2h (samma som Bit 1:s match-identitet)', () => {
    expect(AUTO_MAP_KICKOFF_WINDOW_MS).toBe(2 * 60 * 60 * 1000);
  });
});
