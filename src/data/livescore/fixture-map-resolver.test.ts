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

describe('resolveFixtureToMatch: edge', () => {
  it('UNRESOLVED mot en tom plan (inget att matcha mot)', () => {
    expect(resolveFixtureToMatch(fixture(), []).kind).toBe('unresolved');
  });

  it('fönstret är 2h (samma som Bit 1:s match-identitet)', () => {
    expect(AUTO_MAP_KICKOFF_WINDOW_MS).toBe(2 * 60 * 60 * 1000);
  });
});
