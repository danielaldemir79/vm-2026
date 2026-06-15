// Tester för selectLiveFeed (Bit 3c): urvalet + ordningen av PÅGÅENDE matcher för
// "LIVE NU"-blocket. Fokus på de grenar som annars tyst kan bli fel:
//   - bara LIVE/PAUS tas med (en avslutad/ej startad match hör inte hemma i live-blocket),
//   - en live-rad utan schemamatch hoppas (gissa aldrig en match),
//   - ordningen: live före paus, sedan tidigast kickoff (kommit längst) först,
//   - namnen tas ur teamsById (samma som matchkortet talar).

import { describe, expect, it } from 'vitest';
import type { Match, Team } from '../../domain/types';
import type { LiveData } from '../../data/livescore';
import { selectLiveFeed } from './live-feed';

/** En schemamatch (default scheduled, kickoff styr ordningen). */
function match(id: string, kickoff: string, overrides: Partial<Match> = {}): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'hom',
    awayTeamId: 'awa',
    kickoff,
    venue: 'Arena',
    tvChannel: 'TV4',
    result: null,
    status: 'scheduled',
    ...overrides,
  } as Match;
}

/** En live-rad med rimliga default (status styr om matchen pågår). */
function live(matchId: string, overrides: Partial<LiveData> = {}): LiveData {
  return {
    matchId,
    apiFixtureId: 1,
    status: 'live',
    elapsedMinute: 30,
    homeGoals: 1,
    awayGoals: 0,
    events: [],
    statistics: [],
    lineups: [],
    frozen: false,
    lastSyncedAt: '2026-06-15T18:00:00.000Z',
    ...overrides,
  };
}

const teams: Team[] = [
  { id: 'hom', name: 'Hemma', code: 'HOM', group: 'A' } as Team,
  { id: 'awa', name: 'Borta', code: 'AWA', group: 'A' } as Team,
];
const teamsById = new Map(teams.map((t) => [t.id, t]));

function matchMap(matches: Match[]): Map<string, Match> {
  return new Map(matches.map((m) => [m.id, m]));
}

describe('selectLiveFeed, urval av pågående matcher', () => {
  it('tar med en LIVE-match med visningsnamn ur teamsById', () => {
    const m = match('m1', '2026-06-15T17:00:00.000Z', { status: 'live', result: null });
    const liveBy = new Map([['m1', live('m1')]]);

    const feed = selectLiveFeed(liveBy, matchMap([m]), teamsById);

    expect(feed).toHaveLength(1);
    expect(feed[0].match.id).toBe('m1');
    expect(feed[0].homeName).toBe('Hemma');
    expect(feed[0].awayName).toBe('Borta');
    expect(feed[0].live.status).toBe('live');
  });

  it('tar med en PAUS-match (halvtidsvila pågår fortfarande)', () => {
    const m = match('m1', '2026-06-15T17:00:00.000Z', { status: 'live', result: null });
    const liveBy = new Map([['m1', live('m1', { status: 'paused' })]]);

    const feed = selectLiveFeed(liveBy, matchMap([m]), teamsById);

    expect(feed).toHaveLength(1);
    expect(feed[0].live.status).toBe('paused');
  });

  it('HOPPAR avslutade och ej startade matcher (inte pågående)', () => {
    const m1 = match('done', '2026-06-15T15:00:00.000Z', {
      status: 'finished',
      result: { homeGoals: 2, awayGoals: 1 },
    });
    const m2 = match('soon', '2026-06-15T20:00:00.000Z', { status: 'scheduled', result: null });
    const liveBy = new Map([
      ['done', live('done', { status: 'finished', frozen: true })],
      ['soon', live('soon', { status: 'scheduled' })],
    ]);

    const feed = selectLiveFeed(liveBy, matchMap([m1, m2]), teamsById);

    expect(feed).toHaveLength(0);
  });

  it('HOPPAR en live-rad utan schemamatch (gissar aldrig en match)', () => {
    const liveBy = new Map([['ghost', live('ghost')]]);

    const feed = selectLiveFeed(liveBy, matchMap([]), teamsById);

    expect(feed).toHaveLength(0);
  });

  it('NEGATIV-KONTROLL: finns schemamatchen tas raden MED (regeln avvisar inte allt)', () => {
    const m = match('real', '2026-06-15T17:00:00.000Z', { status: 'live', result: null });
    const liveBy = new Map([['real', live('real')]]);

    // Utan schemamatch: tom (samma rad). Med schemamatch: en post. Beviset att skip-grenen
    // beror på just den saknade matchen, inte på något annat som alltid filtrerar bort.
    expect(selectLiveFeed(liveBy, matchMap([]), teamsById)).toHaveLength(0);
    expect(selectLiveFeed(liveBy, matchMap([m]), teamsById)).toHaveLength(1);
  });
});

describe('selectLiveFeed, ordning (mest relevant först)', () => {
  it('LIVE före PAUS, oavsett kickoff-ordning i indata', () => {
    const paused = match('p', '2026-06-15T14:00:00.000Z', { status: 'live', result: null });
    const rolling = match('l', '2026-06-15T17:00:00.000Z', { status: 'live', result: null });
    // paus har TIDIGARE kickoff men ska ändå hamna EFTER den rullande matchen.
    const liveBy = new Map([
      ['p', live('p', { status: 'paused' })],
      ['l', live('l', { status: 'live' })],
    ]);

    const feed = selectLiveFeed(liveBy, matchMap([paused, rolling]), teamsById);

    expect(feed.map((e) => e.match.id)).toEqual(['l', 'p']);
  });

  it('inom samma läge: tidigast kickoff (kommit längst) först, id som tie-break', () => {
    const early = match('a', '2026-06-15T15:00:00.000Z', { status: 'live', result: null });
    const late = match('b', '2026-06-15T18:00:00.000Z', { status: 'live', result: null });
    const liveBy = new Map([
      ['b', live('b')],
      ['a', live('a')],
    ]);

    const feed = selectLiveFeed(liveBy, matchMap([early, late]), teamsById);

    expect(feed.map((e) => e.match.id)).toEqual(['a', 'b']);
  });
});
