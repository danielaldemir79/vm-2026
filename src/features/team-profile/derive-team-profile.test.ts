import { describe, expect, it } from 'vitest';
import type { Group, Match, Team } from '../../domain/types';
import { deriveTeamProfile } from './derive-team-profile';

// Lag-fabrik med valfria profil-fält (T10).
function team(id: string, over: Partial<Team> = {}): Team {
  return { id, name: id.toUpperCase(), code: id.toUpperCase(), group: 'A', ...over };
}

function scheduled(id: string, home: string | null, away: string | null, kickoff: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: home,
    awayTeamId: away,
    kickoff,
    venue: 'Arena ej verifierad',
    tvChannel: 'TV4',
    result: null,
    status: 'scheduled',
  };
}

const sweden = team('swe', {
  name: 'Sverige',
  code: 'SWE',
  group: 'F',
  fifaRanking: 38,
  starPlayers: ['Alexander Isak', 'Viktor Gyökeres'],
  trivia: '12 tidigare VM-slutspel.',
});
const japan = team('jpn', { name: 'Japan', code: 'JPN', group: 'F' });
const nl = team('ned', { name: 'Nederländerna', code: 'NED', group: 'F' });
const tunisia = team('tun', { name: 'Tunisien', code: 'TUN', group: 'F' });

const groups: Group[] = [{ id: 'F', teamIds: ['ned', 'jpn', 'swe', 'tun'] }];
const teamsById = new Map<string, Team>([
  ['swe', sweden],
  ['jpn', japan],
  ['ned', nl],
  ['tun', tunisia],
]);

describe('deriveTeamProfile, profil-fält ur laget', () => {
  it('plockar fifaRanking, stjärnspelare och kuriosa ur Team', () => {
    const profile = deriveTeamProfile(sweden, groups, [], teamsById);
    expect(profile.fifaRanking).toBe(38);
    expect(profile.starPlayers).toEqual(['Alexander Isak', 'Viktor Gyökeres']);
    expect(profile.trivia).toBe('12 tidigare VM-slutspel.');
    expect(profile.group).toBe('F');
  });

  it('härleder gruppkompisarna (övriga lag i gruppen, laget självt exkluderat)', () => {
    const profile = deriveTeamProfile(sweden, groups, [], teamsById);
    const ids = profile.groupOpponents.map((t) => t.id).sort();
    expect(ids).toEqual(['jpn', 'ned', 'tun']);
    expect(ids).not.toContain('swe');
  });
});

describe('deriveTeamProfile, edge-fall: saknad profildata (data saknas, inte gissat)', () => {
  it('ett lag utan fifaRanking/starPlayers/trivia ger null/tom, inte påhittat', () => {
    const profile = deriveTeamProfile(japan, groups, [], teamsById);
    expect(profile.fifaRanking).toBeNull();
    expect(profile.starPlayers).toEqual([]);
    expect(profile.trivia).toBeNull();
  });

  it('ett lag utan grupp-post ger inga gruppkompisar (fail-safe, ingen krasch)', () => {
    const lonely = team('xyz', { group: 'L' });
    const profile = deriveTeamProfile(lonely, groups, [], new Map([['xyz', lonely]]));
    expect(profile.groupOpponents).toEqual([]);
  });
});

describe('deriveTeamProfile, lagets väg (matcher kronologiskt + motståndare)', () => {
  const matches: Match[] = [
    scheduled('m2', 'jpn', 'swe', '2026-06-20T19:00:00.000Z'),
    scheduled('m1', 'swe', 'ned', '2026-06-13T16:00:00.000Z'),
    scheduled('m3', 'tun', 'ned', '2026-06-13T13:00:00.000Z'), // ej Sveriges match
  ];

  it('tar bara lagets egna matcher, i kronologisk ordning', () => {
    const profile = deriveTeamProfile(sweden, groups, matches, teamsById);
    expect(profile.matches.map((m) => m.match.id)).toEqual(['m1', 'm2']);
  });

  it('anger motståndaren och hemma/borta per match ur lagets perspektiv', () => {
    const profile = deriveTeamProfile(sweden, groups, matches, teamsById);
    const [first, second] = profile.matches;
    // m1: Sverige hemma mot Nederländerna.
    expect(first.isHome).toBe(true);
    expect(first.opponentId).toBe('ned');
    // m2: Japan hemma mot Sverige -> Sverige borta, motståndare Japan.
    expect(second.isHome).toBe(false);
    expect(second.opponentId).toBe('jpn');
  });

  it('utelämnar slutspelsmatcher där laget ännu inte är framräknat (ingen gissad väg)', () => {
    // En slutspelsmatch med null-lag är INTE lagets match (gissa aldrig en väg som
    // inte är låst): den dyker inte upp i vägen.
    const ko: Match = {
      ...scheduled('M73', null, null, '2026-07-01T19:00:00.000Z'),
      stage: 'round-of-32',
      groupId: null,
    };
    const profile = deriveTeamProfile(sweden, groups, [...matches, ko], teamsById);
    expect(profile.matches.map((m) => m.match.id)).not.toContain('M73');
  });
});
