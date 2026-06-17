// Tester för deriveMinSidaProfile (T97): profilens REN härledning + dess honest-gatning.
// Bevisar VARJE gate-väg isolerat (utan att rendera tre providers): inaktivt läge, ingen
// identitet, inget aktivt rum, samt att ställningen plockas TROGET ur topplistan (en sanning).

import { describe, expect, it } from 'vitest';
import { deriveMinSidaProfile, type MinSidaInput } from './derive-min-sida';
import type { LeaderboardEntry } from '../leaderboard/aggregate-scores';
import type { PersonalStats } from '../leaderboard/personal-stats';
import type { RoomMember, RoomSummary } from '../../data/rooms';

const room = (id: string, name: string): RoomSummary => ({ id, name, code: id.toUpperCase() });
const member = (userId: string, displayName: string): RoomMember => ({ userId, displayName });
const entry = (
  userId: string,
  displayName: string,
  points: number,
  rank: number,
  exactHits = 0
): LeaderboardEntry => ({ userId, displayName, points, rank, exactHits });

const stats = (accuracy: number | null, decidedTips = 4): PersonalStats => ({
  decidedTips,
  exactHits: 0,
  outcomeHits: 0,
  misses: 0,
  accuracy,
  bestCall: null,
});

/** En komplett, "allt-finns"-indata; tester överrider bara det de prövar. */
function input(overrides: Partial<MinSidaInput> = {}): MinSidaInput {
  return {
    roomsEnabled: true,
    userId: 'me',
    myRooms: [room('r1', 'Kompisgänget'), room('r2', 'Jobbet')],
    activeRoom: room('r1', 'Kompisgänget'),
    members: [member('me', 'Daniel Aldemir'), member('u2', 'Anna')],
    leaderboard: [entry('u2', 'Anna', 12, 1), entry('me', 'Daniel Aldemir', 8, 2)],
    selfStats: stats(0.75),
    livePreliminary: false,
    ...overrides,
  };
}

describe('deriveMinSidaProfile, honest-gatning', () => {
  it('returnerar null i fixtures/lokalt läge (roomsEnabled false)', () => {
    expect(deriveMinSidaProfile(input({ roomsEnabled: false }))).toBeNull();
  });

  it('returnerar null utan identitet OCH utan rum (inget att visa)', () => {
    const profile = deriveMinSidaProfile(
      input({ userId: null, myRooms: [], activeRoom: null, members: [], leaderboard: [] })
    );
    expect(profile).toBeNull();
  });

  it('returnerar en profil när det finns rum men ingen identitet än (graceful)', () => {
    // Auth-sessionen inte klar (userId null) men användaren har rum: visa rummen, neutral topp.
    const profile = deriveMinSidaProfile(input({ userId: null, members: [], leaderboard: [] }));
    expect(profile).not.toBeNull();
    expect(profile?.identity).toBeNull();
    expect(profile?.standing).toBeNull();
    expect(profile?.rooms).toHaveLength(2);
  });
});

describe('deriveMinSidaProfile, identitet', () => {
  it('plockar visningsnamnet ur det aktiva rummets medlemskap', () => {
    const profile = deriveMinSidaProfile(input());
    expect(profile?.identity).toEqual({ userId: 'me', displayName: 'Daniel Aldemir' });
  });

  it('faller till null-identitet när användaren inte finns bland medlemmarna än', () => {
    const profile = deriveMinSidaProfile(input({ members: [member('u2', 'Anna')] }));
    expect(profile?.identity).toBeNull();
    // Övriga delar (rum) renderas ändå.
    expect(profile?.rooms).toHaveLength(2);
  });

  it('gissar aldrig ett namn ur ett tomt/whitespace visningsnamn', () => {
    const profile = deriveMinSidaProfile(input({ members: [member('me', '   ')] }));
    expect(profile?.identity).toBeNull();
  });
});

describe('deriveMinSidaProfile, ställning (plockad TROGET ur topplistan)', () => {
  it('speglar placering + total ur den rangordnade topplistan (ingen omräkning)', () => {
    const profile = deriveMinSidaProfile(input());
    expect(profile?.standing).toEqual({
      rank: 2,
      totalMembers: 2,
      points: 8,
      accuracy: 0.75,
      livePreliminary: false,
    });
  });

  it('speglar DELAD placering vid lika poäng (samma rank som listan)', () => {
    const profile = deriveMinSidaProfile(
      input({
        leaderboard: [entry('u2', 'Anna', 8, 1), entry('me', 'Daniel Aldemir', 8, 1)],
      })
    );
    expect(profile?.standing?.rank).toBe(1);
  });

  it('utelämnar träffsäkerheten (null) när inga avgjorda tips finns', () => {
    const profile = deriveMinSidaProfile(input({ selfStats: stats(null, 0) }));
    expect(profile?.standing?.accuracy).toBeNull();
  });

  it('saknar selfStats helt -> träffsäkerhet null (ingen krasch)', () => {
    const profile = deriveMinSidaProfile(input({ selfStats: null }));
    expect(profile?.standing?.accuracy).toBeNull();
  });

  it('bär live-flaggan ärligt (preliminär ställning)', () => {
    const profile = deriveMinSidaProfile(input({ livePreliminary: true }));
    expect(profile?.standing?.livePreliminary).toBe(true);
  });

  it('ingen ställning (null) när användaren inte finns i topplistan (inget aktivt rum / ej medlem)', () => {
    // Topplistan tom (inget aktivt rum) men användaren har rum + identitet via members.
    const profile = deriveMinSidaProfile(input({ leaderboard: [], activeRoom: null }));
    expect(profile).not.toBeNull();
    expect(profile?.standing).toBeNull();
    expect(profile?.identity).toEqual({ userId: 'me', displayName: 'Daniel Aldemir' });
  });

  it('ingen ställning (null) när identiteten saknas (currentUserId null)', () => {
    const profile = deriveMinSidaProfile(input({ userId: null }));
    expect(profile?.standing).toBeNull();
  });
});

describe('deriveMinSidaProfile, rums-översikt', () => {
  it('pinnar det aktiva rummet FÖRST och markerar det', () => {
    const profile = deriveMinSidaProfile(
      input({
        myRooms: [room('r2', 'Jobbet'), room('r1', 'Kompisgänget')],
        activeRoom: room('r1', 'Kompisgänget'),
      })
    );
    expect(profile?.rooms.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(profile?.rooms[0]).toMatchObject({ id: 'r1', isActive: true });
    expect(profile?.rooms[1]).toMatchObject({ id: 'r2', isActive: false });
  });

  it('markerar inget rum som aktivt när inget är valt', () => {
    const profile = deriveMinSidaProfile(input({ activeRoom: null }));
    expect(profile?.rooms.every((r) => !r.isActive)).toBe(true);
  });

  it('muterar inte indata (ren funktion)', () => {
    const rooms = [room('r1', 'A'), room('r2', 'B')];
    const frozen = Object.freeze([...rooms]);
    expect(() => deriveMinSidaProfile(input({ myRooms: frozen }))).not.toThrow();
  });
});
