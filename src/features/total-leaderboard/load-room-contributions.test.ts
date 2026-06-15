// Tester för LIVE-vägens rums-bidrags-hämtning (T82 del 3, #173). Bevisar SKARVEN: att de
// tre tips-typerna (Prediction/GroupPrediction/BracketPrediction) grupperas KORREKT per
// userId till MemberPredictions, för ALLA rum , den otestade live-mappnings-grenen
// (lessons: bevisa skarven, inte happy-path). Vi mockar de tunna data-API:erna (rena
// projektioner) så vi testar grupperingen, inte Supabase-klienten.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { VmSupabaseClient } from '../../data/supabase-browser';
import type { RoomSummary } from '../../data/rooms';
import { asTeamCode } from '../../domain/team-code';

// Mocka rooms-API:t (listMembers) och de tre prediction-list-API:erna. Vi spreadar
// importOriginal så mocken inte tappar andra exports (lessons: ofullständig mock som
// knäcker andra features , vi behåller allt utom de funktioner vi styr).
vi.mock('../../data/rooms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/rooms')>();
  return { ...actual, listMembers: vi.fn() };
});
vi.mock('../../data/predictions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/predictions')>();
  return {
    ...actual,
    listRoomPredictions: vi.fn(),
    listRoomGroupPredictions: vi.fn(),
    listRoomBracketPredictions: vi.fn(),
  };
});

import { listMembers } from '../../data/rooms';
import {
  listRoomPredictions,
  listRoomGroupPredictions,
  listRoomBracketPredictions,
} from '../../data/predictions';
import { loadRoomContributions } from './load-room-contributions';

const client = {} as VmSupabaseClient;
const room = (id: string): RoomSummary => ({ id, name: `Rum ${id}`, code: id.toUpperCase() });

const matchPred = (userId: string, matchId: string) => ({
  matchId,
  userId,
  homeGoals: 1,
  awayGoals: 0,
  updatedAt: '',
});
const groupPred = (userId: string, groupId: string) => ({
  groupId,
  userId,
  winnerTeamId: asTeamCode('SWE'),
  runnerUpTeamId: asTeamCode('BRA'),
  updatedAt: '',
});
const bracketPred = (userId: string, slotId: string) => ({
  slotId,
  userId,
  advancingTeamId: asTeamCode('SWE'),
  updatedAt: '',
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadRoomContributions, live-vägens mappnings-skarv', () => {
  it('grupperar de tre tips-typerna per userId till MemberPredictions per rum', async () => {
    vi.mocked(listMembers).mockResolvedValue([
      { userId: 'u1', displayName: 'Anna' },
      { userId: 'u2', displayName: 'Bo' },
    ]);
    vi.mocked(listRoomPredictions).mockResolvedValue([
      matchPred('u1', 'g-A-1'),
      matchPred('u1', 'g-A-2'),
      matchPred('u2', 'g-A-1'),
    ]);
    vi.mocked(listRoomGroupPredictions).mockResolvedValue([groupPred('u1', 'A')]);
    vi.mocked(listRoomBracketPredictions).mockResolvedValue([bracketPred('u2', 'M73')]);

    const [contribution] = await loadRoomContributions(client, [room('r1')]);

    expect(contribution.roomId).toBe('r1');
    expect(contribution.members).toHaveLength(2);
    // u1: TVÅ match-tips + ETT grupp-tips, INGET bracket-tips.
    const u1 = contribution.predictionsByUser.get('u1')!;
    expect(u1.matchPredictions).toHaveLength(2);
    expect(u1.groupPredictions).toHaveLength(1);
    expect(u1.bracketPredictions).toHaveLength(0);
    // u2: ETT match-tips, INGET grupp-tips, ETT bracket-tips.
    const u2 = contribution.predictionsByUser.get('u2')!;
    expect(u2.matchPredictions).toHaveLength(1);
    expect(u2.groupPredictions).toHaveLength(0);
    expect(u2.bracketPredictions).toHaveLength(1);
  });

  it('hämtar bidrag för ALLA rum (inte bara det första)', async () => {
    vi.mocked(listMembers).mockResolvedValue([{ userId: 'u1', displayName: 'Anna' }]);
    vi.mocked(listRoomPredictions).mockResolvedValue([]);
    vi.mocked(listRoomGroupPredictions).mockResolvedValue([]);
    vi.mocked(listRoomBracketPredictions).mockResolvedValue([]);

    const contributions = await loadRoomContributions(client, [room('r1'), room('r2'), room('r3')]);

    expect(contributions.map((c) => c.roomId)).toEqual(['r1', 'r2', 'r3']);
    expect(vi.mocked(listMembers)).toHaveBeenCalledTimes(3);
  });

  it('en tom rumslista ger en tom bidrags-lista (inte med i något rum än)', async () => {
    expect(await loadRoomContributions(client, [])).toEqual([]);
  });
});
