// Tester för admin-överblickens HÄRLEDNING (T45, #76). FOKUS (HÖG-RISK, aggregat-
// korrekthet + sekretess):
//   * per-rum-topplistan poängsätts mot facit via SAMMA motor som T17 (en sanning),
//   * den globala "vem tippar bäst" rangordnar (rum, medlem)-poster med delad rank,
//   * SEKRETESS: bara tips som finns i den AVSLÖJADE listan poängsätts (servern
//     filtrerar bort framtida tips; ett tips som inte är med bidrar med 0), och
//   * engagemangs-räknarna + unika-tippare-talet speglas korrekt.

import { describe, expect, it } from 'vitest';
import type { Group, Match, Team } from '../../domain/types';
import type { AdminRoomStat, AdminRevealedPrediction } from '../../data/admin';
import { deriveAdminStats } from './derive-admin-stats';

/* ------------------------------------------------------------------ *
 * Minimal, deterministisk fixtur (två lag, en grupp, en avgjord match).
 * ------------------------------------------------------------------ */

const TEAMS: Team[] = [
  { id: 'bra', name: 'Brasilien', code: 'BRA', group: 'A' },
  { id: 'arg', name: 'Argentina', code: 'ARG', group: 'A' },
];

const GROUPS: Group[] = [{ id: 'A', teamIds: ['bra', 'arg'] }];

// EN avgjord gruppmatch ger direkt ett match-facit (2-1). Grupptabellen blir INTE
// komplett (lagen har inte spelat 3 matcher), så grupp-/bracket-facit är tomt , vi
// fokuserar match-tips-poängen, som är deterministisk och räcker för aggregat-beviset.
const MATCHES: Match[] = [
  {
    id: 'g-A-1',
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'bra',
    awayTeamId: 'arg',
    kickoff: '2026-06-11T19:00:00.000Z',
    venue: 'Test Arena',
    status: 'finished',
    result: { homeGoals: 2, awayGoals: 1 },
  },
];

/** Ett rum-stat med medlemmar + engagemang. */
function roomStat(
  over: Partial<AdminRoomStat> & Pick<AdminRoomStat, 'roomId' | 'members'>
): AdminRoomStat {
  return {
    name: over.name ?? 'Rum',
    code: over.code ?? 'code',
    createdAt: over.createdAt ?? '2026-06-01T00:00:00.000Z',
    memberCount: over.memberCount ?? over.members.length,
    matchPredictionCount: over.matchPredictionCount ?? 0,
    groupPredictionCount: over.groupPredictionCount ?? 0,
    bracketPredictionCount: over.bracketPredictionCount ?? 0,
    ...over,
  };
}

function matchTip(
  roomId: string,
  userId: string,
  homeGoals: number,
  awayGoals: number
): AdminRevealedPrediction {
  return { kind: 'match', roomId, userId, matchId: 'g-A-1', homeGoals, awayGoals };
}

describe('deriveAdminStats, per-rum-topplista + global ranking', () => {
  it('poängsätter rummets medlemmar mot facit (exakt 3p, rätt utfall 1p, miss 0p)', () => {
    const rooms: AdminRoomStat[] = [
      roomStat({
        roomId: 'r1',
        name: 'VM 2026',
        members: [
          { userId: 'u1', displayName: 'Daniel', joinedAt: 'j0' },
          { userId: 'u2', displayName: 'Elin', joinedAt: 'j1' },
          { userId: 'u3', displayName: 'Simon', joinedAt: 'j2' },
        ],
      }),
    ];
    const revealed: AdminRevealedPrediction[] = [
      matchTip('r1', 'u1', 2, 1), // exakt -> 3p
      matchTip('r1', 'u2', 3, 0), // rätt utfall (hemmavinst) -> 1p
      matchTip('r1', 'u3', 0, 2), // fel utfall (bortavinst) -> 0p
    ];

    const overview = deriveAdminStats(rooms, revealed, TEAMS, GROUPS, MATCHES);

    const lb = overview.rooms[0].leaderboard;
    const byUser = new Map(lb.map((e) => [e.userId, e]));
    expect(byUser.get('u1')!.points).toBe(3);
    expect(byUser.get('u1')!.rank).toBe(1);
    expect(byUser.get('u2')!.points).toBe(1);
    expect(byUser.get('u2')!.rank).toBe(2);
    expect(byUser.get('u3')!.points).toBe(0);
    expect(byUser.get('u3')!.rank).toBe(3);
    // u1 prickade exakt -> en exakt-träff (tiebreak-måttet).
    expect(byUser.get('u1')!.exactHits).toBe(1);
  });

  it('SEKRETESS: ett tips som INTE finns i den avslöjade listan bidrar med 0 (inte poängsatt)', () => {
    // u2 har inget avslöjat tips alls (servern filtrerade bort hans framtida tips).
    const rooms: AdminRoomStat[] = [
      roomStat({
        roomId: 'r1',
        members: [
          { userId: 'u1', displayName: 'Daniel', joinedAt: 'j0' },
          { userId: 'u2', displayName: 'Elin', joinedAt: 'j1' },
        ],
      }),
    ];
    const revealed: AdminRevealedPrediction[] = [matchTip('r1', 'u1', 2, 1)];

    const overview = deriveAdminStats(rooms, revealed, TEAMS, GROUPS, MATCHES);
    const byUser = new Map(overview.rooms[0].leaderboard.map((e) => [e.userId, e]));
    // u2 är MED i listan (medlem) men har 0 poäng (inget avslöjat tips att poängsätta).
    expect(byUser.get('u2')!.points).toBe(0);
    expect(byUser.has('u2')).toBe(true);
  });

  it('global "vem tippar bäst" rangordnar (rum, medlem)-poster över alla rum, delad rank', () => {
    const rooms: AdminRoomStat[] = [
      roomStat({
        roomId: 'r1',
        name: 'VM 2026',
        members: [{ userId: 'u1', displayName: 'Daniel', joinedAt: 'j0' }],
      }),
      roomStat({
        roomId: 'r2',
        name: 'Rhodos',
        members: [{ userId: 'u2', displayName: 'Elin', joinedAt: 'j1' }],
      }),
      roomStat({
        roomId: 'r3',
        name: 'Jobbet',
        members: [{ userId: 'u3', displayName: 'Anna', joinedAt: 'j2' }],
      }),
    ];
    const revealed: AdminRevealedPrediction[] = [
      matchTip('r1', 'u1', 2, 1), // 3p
      matchTip('r2', 'u2', 2, 1), // 3p (delad 1:a med u1)
      matchTip('r3', 'u3', 1, 0), // 1p (rätt utfall)
    ];

    const overview = deriveAdminStats(rooms, revealed, TEAMS, GROUPS, MATCHES);
    const top = overview.topTipsters;
    expect(top).toHaveLength(3);
    // Två poster med 3p -> delad rank 1; nästa hoppar till rank 3 (1224-stilen).
    const threes = top.filter((t) => t.points === 3);
    expect(threes).toHaveLength(2);
    expect(threes.every((t) => t.rank === 1)).toBe(true);
    const one = top.find((t) => t.points === 1)!;
    expect(one.rank).toBe(3);
    // Posten bär BÅDE medlem och rum (samma person kan finnas i flera rum).
    expect(one.roomName).toBe('Jobbet');
    expect(one.displayName).toBe('Anna');
  });

  it('räknar totalRooms + unika tippare (en person i flera rum räknas en gång)', () => {
    const rooms: AdminRoomStat[] = [
      roomStat({
        roomId: 'r1',
        members: [
          { userId: 'u1', displayName: 'Daniel', joinedAt: 'j0' },
          { userId: 'u2', displayName: 'Elin', joinedAt: 'j1' },
        ],
      }),
      roomStat({
        roomId: 'r2',
        members: [{ userId: 'u1', displayName: 'Daniel', joinedAt: 'j2' }], // u1 igen
      }),
    ];
    const overview = deriveAdminStats(rooms, [], TEAMS, GROUPS, MATCHES);
    expect(overview.totalRooms).toBe(2);
    expect(overview.totalTipsters).toBe(2); // u1 + u2, u1 inte dubbelräknad
  });

  it('speglar engagemangs-räknarna och behåller en tom medlemslistas rum', () => {
    const rooms: AdminRoomStat[] = [
      roomStat({
        roomId: 'r1',
        name: 'VM 2026',
        matchPredictionCount: 42,
        groupPredictionCount: 7,
        bracketPredictionCount: 2,
        members: [{ userId: 'u1', displayName: 'Daniel', joinedAt: 'j0' }],
      }),
    ];
    const overview = deriveAdminStats(rooms, [], TEAMS, GROUPS, MATCHES);
    const r = overview.rooms[0];
    expect(r.matchPredictionCount).toBe(42);
    expect(r.groupPredictionCount).toBe(7);
    expect(r.bracketPredictionCount).toBe(2);
    // En medlem utan avslöjade tips -> 0 poäng men MED i topplistan.
    expect(r.leaderboard).toHaveLength(1);
    expect(r.leaderboard[0].points).toBe(0);
  });
});
