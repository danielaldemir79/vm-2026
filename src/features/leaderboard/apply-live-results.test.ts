// Tester för den PRELIMINÄRA (live) resultat-overlayn (T84, #176).
//
// Det här är featurens KORREKTHETS-kärna, så testerna bevisar de farligaste sömmarna,
// inte bara happy-path:
//   - DATA-INTEGRITET: overlayn är REN och MUTERAR aldrig den officiella matchlistan
//     (bevis att inget kan skriva official_match_results , funktionen tar bara data in,
//     ger ny data ut, äger ingen skriv-väg).
//   - KONVERGENS (acceptanskriteriet): preliminär == officiell så snart facit landat,
//     bevisat genom att köra HELA poäng-vägen (applyLiveResults -> derivePoolFacit ->
//     buildLeaderboard) och jämföra preliminär live-ställning mot officiellt inmatad
//     IDENTISK ställning , raderna måste bli exakt lika.
//   - POSITIONS-RÖRELSE: ett live-mål ändrar en medlems preliminära poäng OCH placering.
//   - NEGATIV KONTROLL: utan overlayn (officiella listan rakt av) rör sig INGET , så det
//     är overlayn, inte fixturen, som driver rörelsen.
//   - EDGE: ingen live-data (= dagens beteende), live-rad för redan officiellt klar match
//     (officiellt vinner), okänd/null live-ställning (ingen gissad 0-0), pågående tied
//     SLUTSPELS-match (ärlig gräns, faller tyst ur overlayn).

import { describe, expect, it } from 'vitest';
import type { Group, Match, Team } from '../../domain/types';
import type { LiveData } from '../../data/livescore';
import { buildLeaderboard, type MemberPredictions } from './aggregate-scores';
import { derivePoolFacit } from './derive-facit';
import { applyLiveResults, hasLivePreliminaryMatch } from './apply-live-results';
import type { RoomMember } from '../../data/rooms';
import type { Prediction } from '../../data/predictions';

/* ------------------------------------------------------------------ *
 * Test-data: en liten grupp med två lag-id (räcker för match-tips-poäng).
 * ------------------------------------------------------------------ */

const TEAMS: Team[] = [
  { id: 'swe', name: 'Sverige', code: 'SWE', group: 'A' } as Team,
  { id: 'bra', name: 'Brasilien', code: 'BRA', group: 'A' } as Team,
];
const GROUPS: Group[] = [{ id: 'A', teamIds: ['swe', 'bra'] }];

/** En gruppmatch (default scheduled, ingen ställning). */
function match(id: string, overrides: Partial<Match> = {}): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'swe',
    awayTeamId: 'bra',
    kickoff: '2026-06-15T18:00:00Z',
    venue: 'Arena',
    result: null,
    status: 'scheduled',
    ...overrides,
  } as Match;
}

/** En slutspelsmatch (för den ärliga slutspels-gräns-testen). */
function knockoutMatch(id: string, overrides: Partial<Match> = {}): Match {
  return {
    id,
    stage: 'round-of-32',
    groupId: null,
    homeTeamId: 'swe',
    awayTeamId: 'bra',
    kickoff: '2026-07-01T18:00:00Z',
    venue: 'Arena',
    result: null,
    status: 'scheduled',
    ...overrides,
  } as Match;
}

/** En live-rad (status + ställning styr om/hur overlayn slår till). */
function live(matchId: string, overrides: Partial<LiveData> = {}): LiveData {
  return {
    matchId,
    apiFixtureId: 1,
    status: 'live',
    elapsedMinute: 60,
    homeGoals: 1,
    awayGoals: 0,
    events: [],
    statistics: [],
    lineups: [],
    frozen: false,
    lastSyncedAt: '2026-06-15T19:00:00Z',
    ...overrides,
  };
}

/** Ett match-tips (de enda tips dessa tester poängsätter). */
function matchPick(
  userId: string,
  matchId: string,
  homeGoals: number,
  awayGoals: number
): Prediction {
  return { matchId, userId, homeGoals, awayGoals, updatedAt: '2026-06-01T00:00:00Z' };
}

function memberPredictions(userId: string, picks: Prediction[]): MemberPredictions {
  return { userId, matchPredictions: picks, groupPredictions: [], bracketPredictions: [] };
}

/** Bekvämlighet: kör HELA poäng-vägen (overlay -> facit -> topplista) för en matchlista. */
function leaderboardFor(
  matches: Match[],
  liveBy: ReadonlyMap<string, LiveData>,
  members: RoomMember[],
  predsByUser: ReadonlyMap<string, MemberPredictions>
) {
  const preliminaryMatches = applyLiveResults(matches, liveBy);
  const facit = derivePoolFacit(TEAMS, GROUPS, preliminaryMatches);
  return buildLeaderboard(members, predsByUser, facit);
}

/* ------------------------------------------------------------------ *
 * Data-integritet: ren funktion, ingen mutation, ingen skriv-väg.
 * ------------------------------------------------------------------ */

describe('applyLiveResults, data-integritet (preliminärt lager skriver ALDRIG officiellt)', () => {
  it('muterar ALDRIG den officiella matchlistan (ny array, indata orörd)', () => {
    const officialMatches = [match('m1', { status: 'live', result: null })];
    const before = structuredClone(officialMatches);
    const liveBy = new Map([['m1', live('m1', { homeGoals: 2, awayGoals: 1 })]]);

    const result = applyLiveResults(officialMatches, liveBy);

    // Indata-listan + dess element är OFÖRÄNDRADE (overlayn rör inte den officiella sanningen).
    expect(officialMatches).toEqual(before);
    expect(officialMatches[0].status).toBe('live');
    expect(officialMatches[0].result).toBeNull();
    // Utdata är en NY lista med en NY (preliminär) match , inte samma referens.
    expect(result).not.toBe(officialMatches);
    expect(result[0]).not.toBe(officialMatches[0]);
    expect(result[0].status).toBe('finished');
  });

  it('är en ren härledning: samma indata ger samma utdata, ingen sido-effekt', () => {
    const officialMatches = [match('m1', { status: 'live', result: null })];
    const liveBy = new Map([['m1', live('m1', { homeGoals: 1, awayGoals: 1 })]]);
    const a = applyLiveResults(officialMatches, liveBy);
    const b = applyLiveResults(officialMatches, liveBy);
    expect(a).toEqual(b);
  });
});

/* ------------------------------------------------------------------ *
 * Konvergens: preliminär == officiell när facit landat (acceptanskriteriet).
 * ------------------------------------------------------------------ */

describe('applyLiveResults, KONVERGENS (preliminär == officiell när facit matats in)', () => {
  const members: RoomMember[] = [
    { userId: 'u1', displayName: 'Anna' },
    { userId: 'u2', displayName: 'Bo' },
  ];
  // u1 tippade exakt 2-1, u2 tippade 0-0. Live-/officiella ställningen blir 2-1.
  const predsByUser = new Map<string, MemberPredictions>([
    ['u1', memberPredictions('u1', [matchPick('u1', 'm1', 2, 1)])],
    ['u2', memberPredictions('u2', [matchPick('u2', 'm1', 0, 0)])],
  ]);

  it('preliminär topplista (live 2-1) == officiell topplista (facit 2-1)', () => {
    // PRELIMINÄRT: matchen pågår live 2-1, inget officiellt facit än.
    const liveMatches = [match('m1', { status: 'live', result: null })];
    const liveBy = new Map([['m1', live('m1', { homeGoals: 2, awayGoals: 1 })]]);
    const preliminary = leaderboardFor(liveMatches, liveBy, members, predsByUser);

    // OFFICIELLT: admin matar in EXAKT 2-1, matchen är 'finished', ingen live-overlay längre
    // (officiella status finished -> overlayn hoppar matchen, även om live-raden ligger kvar).
    const officialMatches = [
      match('m1', { status: 'finished', result: { homeGoals: 2, awayGoals: 1 } }),
    ];
    const official = leaderboardFor(officialMatches, liveBy, members, predsByUser);

    // KONVERGENS: de två topplistorna är EXAKT lika (samma poäng, samma rank, samma exakt-träff).
    expect(preliminary).toEqual(official);
    // Och u1 (exakt 2-1) leder båda.
    expect(official.find((e) => e.userId === 'u1')?.rank).toBe(1);
    expect(official.find((e) => e.userId === 'u1')?.points).toBeGreaterThan(0);
  });

  it('officiellt facit VINNER över en avvikande live-rad (preliminär rör ej en klar match)', () => {
    // Matchen är officiellt 2-1 (finished), men en föråldrad live-rad säger 5-5. Officiellt
    // ska vinna: overlayn får ALDRIG skriva över ett officiellt resultat.
    const officialMatches = [
      match('m1', { status: 'finished', result: { homeGoals: 2, awayGoals: 1 } }),
    ];
    const staleLive = new Map([['m1', live('m1', { homeGoals: 5, awayGoals: 5 })]]);
    const result = applyLiveResults(officialMatches, staleLive);
    expect(result[0].status).toBe('finished');
    expect(result[0].result).toEqual({ homeGoals: 2, awayGoals: 1 });
    // hasLivePreliminaryMatch ska ALDRIG flagga en redan officiellt klar match som live.
    expect(hasLivePreliminaryMatch(officialMatches, staleLive)).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Positions-rörelse + negativ kontroll.
 * ------------------------------------------------------------------ */

describe('applyLiveResults, positions-rörelse i realtid', () => {
  const members: RoomMember[] = [
    { userId: 'u1', displayName: 'Anna' },
    { userId: 'u2', displayName: 'Bo' },
  ];
  // u1 tippade 2-1 (träffar live 2-1), u2 tippade 1-1 (träffar inte). Före live: lika (0p).
  const predsByUser = new Map<string, MemberPredictions>([
    ['u1', memberPredictions('u1', [matchPick('u1', 'm1', 2, 1)])],
    ['u2', memberPredictions('u2', [matchPick('u2', 'm1', 1, 1)])],
  ]);
  const officialMatches = [match('m1', { status: 'live', result: null })];

  it('ett live-mål ger u1 preliminära poäng OCH placering 1 (rör sig förbi u2)', () => {
    const liveBy = new Map([['m1', live('m1', { homeGoals: 2, awayGoals: 1 })]]);
    const board = leaderboardFor(officialMatches, liveBy, members, predsByUser);
    const u1 = board.find((e) => e.userId === 'u1')!;
    const u2 = board.find((e) => e.userId === 'u2')!;
    expect(u1.points).toBeGreaterThan(u2.points);
    expect(u1.rank).toBe(1);
    expect(u2.rank).toBe(2);
  });

  it('NEGATIV KONTROLL: utan overlay (live tom) är listan lika (0p) , overlayn driver rörelsen', () => {
    const board = leaderboardFor(officialMatches, new Map(), members, predsByUser);
    const u1 = board.find((e) => e.userId === 'u1')!;
    const u2 = board.find((e) => e.userId === 'u2')!;
    // Ingen match avgjord (status live, inget facit) -> alla 0p -> delad rank 1.
    expect(u1.points).toBe(0);
    expect(u2.points).toBe(0);
    expect(u1.rank).toBe(1);
    expect(u2.rank).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * Edge-fall: ingen live, okänd ställning, tied slutspel (ärlig gräns), tie-poäng.
 * ------------------------------------------------------------------ */

describe('applyLiveResults + hasLivePreliminaryMatch, edge-fall', () => {
  it('INGEN live-data: matchlistan returneras oförändrad (= dagens beteende, samma referens)', () => {
    const officialMatches = [match('m1', { status: 'live', result: null })];
    const result = applyLiveResults(officialMatches, new Map());
    expect(result).toBe(officialMatches); // stabil referens (ingen onödig ny array)
    expect(hasLivePreliminaryMatch(officialMatches, new Map())).toBe(false);
  });

  it('okänd live-ställning (home/away null tidigt i matchen): ingen gissad 0-0, ingen overlay', () => {
    const officialMatches = [match('m1', { status: 'live', result: null })];
    const liveBy = new Map([['m1', live('m1', { homeGoals: null, awayGoals: null })]]);
    const result = applyLiveResults(officialMatches, liveBy);
    expect(result[0].status).toBe('live');
    expect(result[0].result).toBeNull();
    expect(hasLivePreliminaryMatch(officialMatches, liveBy)).toBe(false);
  });

  it('en FRUSEN (FT) live-rad är inte preliminär (väntar bara på officiellt facit)', () => {
    const officialMatches = [match('m1', { status: 'live', result: null })];
    const frozenLive = new Map([
      ['m1', live('m1', { status: 'finished', frozen: true, homeGoals: 2, awayGoals: 1 })],
    ]);
    const result = applyLiveResults(officialMatches, frozenLive);
    expect(result[0].status).toBe('live'); // ingen overlay (FT live-status pågår inte)
    expect(hasLivePreliminaryMatch(officialMatches, frozenLive)).toBe(false);
  });

  it('halvtidsvila (paus) räknas som pågående: overlayn lägger på den löpande ställningen', () => {
    const officialMatches = [match('m1', { status: 'live', result: null })];
    const pausedLive = new Map([
      ['m1', live('m1', { status: 'paused', homeGoals: 1, awayGoals: 0 })],
    ]);
    const result = applyLiveResults(officialMatches, pausedLive);
    expect(result[0].status).toBe('finished');
    expect(result[0].result).toEqual({ homeGoals: 1, awayGoals: 0 });
    expect(hasLivePreliminaryMatch(officialMatches, pausedLive)).toBe(true);
  });

  it('ÄRLIG GRÄNS: en pågående OAVGJORD slutspelsmatch faller tyst ur overlayn (ingen vinnare än)', () => {
    // En live 1-1 i slutspel kan inte bli ett giltigt 'finished'-resultat utan straff-vinnare
    // (FIFA Article 14, validate-result). Overlayn isolerar matchen (fail-safe) i stället för
    // att gissa en vinnare , matchen står kvar live, inga preliminära poäng rör sig för den.
    const officialMatches = [knockoutMatch('k1', { status: 'live', result: null })];
    const tiedLive = new Map([['k1', live('k1', { homeGoals: 1, awayGoals: 1 })]]);
    const result = applyLiveResults(officialMatches, tiedLive);
    expect(result[0].status).toBe('live'); // oförändrad, ingen gissad vinnare
    expect(result[0].result).toBeNull();
  });

  it('en pågående AVGJORD slutspelsmatch (live 2-1) får sin preliminära ställning', () => {
    const officialMatches = [knockoutMatch('k1', { status: 'live', result: null })];
    const liveBy = new Map([['k1', live('k1', { homeGoals: 2, awayGoals: 1 })]]);
    const result = applyLiveResults(officialMatches, liveBy);
    expect(result[0].status).toBe('finished');
    expect(result[0].result).toEqual({ homeGoals: 2, awayGoals: 1 });
  });

  it('en live-rad utan motsvarande officiell match ignoreras (gissa aldrig en match)', () => {
    const officialMatches = [match('m1', { status: 'live', result: null })];
    const liveBy = new Map([['ghost', live('ghost', { homeGoals: 9, awayGoals: 9 })]]);
    const result = applyLiveResults(officialMatches, liveBy);
    expect(result).toBe(officialMatches); // m1 har ingen live-rad, ghost har ingen match
    expect(hasLivePreliminaryMatch(officialMatches, liveBy)).toBe(false);
  });
});
