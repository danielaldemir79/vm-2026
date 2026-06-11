// RLS-integrationstest för POOL-TIPSEN (T16, #16): grupp-tips + bracket-tips.
// Bevisar att Row Level Security skyddar tipsen (NEKAD + TILLÅTEN) med RIKTIGA
// anonyma Supabase-sessioner mot det LEVANDE projektet (kmzhyblzxangpxydufve).
// Samma upplägg som T15:s predictions-rls.integration.test.ts.
//
// VAD DETTA TEST BEVISAR (riktiga sessioner mot riktiga RLS-policyer):
//   * en medlem kan lägga + ändra SITT EGET grupp-/bracket-tips på en ÖPPEN
//     grupp/slot (deadline ej passerad),
//   * en medlem ser sitt eget tips,
//   * en UTOMSTÅENDE nekas att läsa OCH skriva,
//   * man kan inte FÖRFALSKA ett tips i någon annans namn (user_id = auth.uid()).
//
// DEADLINE-LÅSET (skriv nekas efter deadline) + SEKRETESSEN (andras tips dolda
// före deadline) bevisades SERVER-SIDE med riktiga roller + manipulerade kickoff-
// tider av senior-developern (DO-block, 9 prov, se HANDOFF / docs/decisions.md T16).
// Det kan INTE bevisas via klient-API:t mot LIVE eftersom alla riktiga deadlines
// ligger i framtiden. Detta test täcker de delar som ÄR bevisbara via klienten.
//
// ENV-GRIND: kräver nät + projektets publika uppgifter UR MILJÖN (VITE_SUPABASE_*).
// Saknas de skippas hela sviten rent (describe.skipIf), precis som T14/T15.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../supabase-types';
import type { VmSupabaseClient } from '../supabase-browser';
import { createRoom, joinRoomByCode } from '../rooms/rooms-api';
import { WC2026_MATCHES } from '../wc2026';
import {
  listMyGroupPredictions,
  listRoomGroupPredictions,
  upsertMyGroupPrediction,
} from './group-predictions-api';
import {
  CHAMPION_SLOT_ID,
  listMyBracketPredictions,
  listRoomBracketPredictions,
  upsertMyBracketPrediction,
} from './bracket-predictions-api';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const hasEnv = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// ÖPPEN GRUPP: grupp-tipsets deadline är gruppens FÖRSTA match (g-X-1). Grupp L
// startar sist (g-L-1, 17 juni), så den ger maximal CI-marginal inom gruppspelet.
const OPEN_GROUP = 'L';
const OPEN_GROUP_FIRST_MATCH = 'g-L-1';
// ÖPPEN SLOT: bracket-per-slot-tipsets deadline är slottens egen avspark. Finalen
// (M104, 19 juli) ligger längst fram, så den är öppen längst. Champion-tipset låses
// vid turneringsstart (g-A-1, 11 juni) och prövas separat (den deadlinen kan ha
// passerat när CI körs efter 11/6, så vi gatar inte hela sviten på den).
const OPEN_SLOT = 'M104';

function kickoffMs(matchId: string): number {
  const m = WC2026_MATCHES.find((x) => x.id === matchId);
  if (!m) {
    throw new Error(`[VM2026] Testmatchen ${matchId} saknas i WC2026_MATCHES.`);
  }
  return new Date(m.kickoff).getTime();
}

// Är BÅDE den öppna gruppen och den öppna slotten fortfarande öppna? Efter respektive
// deadline börjar RLS låsa/dölja, då gäller assertionerna inte längre -> skippa.
const stillOpen =
  Date.now() < kickoffMs(OPEN_GROUP_FIRST_MATCH) && Date.now() < kickoffMs(OPEN_SLOT);

function freshClient(tag: string): VmSupabaseClient {
  return createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `vm2026-pool-rls-${tag}-${Math.random().toString(36).slice(2)}`,
    },
  });
}

async function reachable(): Promise<boolean> {
  if (!hasEnv) {
    return false;
  }
  try {
    const res = await fetch(`${SUPABASE_URL!}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY! },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function signInOrRateLimit(c: VmSupabaseClient): Promise<{ id: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await c.auth.signInAnonymously();
    if (!error && data.user) {
      return { id: data.user.id };
    }
    if (error && /rate limit/i.test(error.message)) {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw new Error('RATE_LIMIT');
    }
    throw new Error(error?.message ?? 'Anonym inloggning gav ingen användare.');
  }
  throw new Error('RATE_LIMIT');
}

const runnable = hasEnv && stillOpen && (await reachable());

describe.skipIf(!runnable)('RLS: pool-tips (grupp + bracket), riktiga sessioner', () => {
  let alice: VmSupabaseClient;
  let bob: VmSupabaseClient;
  let carol: VmSupabaseClient; // utomstående
  let aliceUid: string;
  let bobUid: string;
  let roomId: string;
  let roomCode: string;
  let setupOk = true;

  beforeAll(async () => {
    alice = freshClient('alice');
    bob = freshClient('bob');
    carol = freshClient('carol');
    try {
      aliceUid = (await signInOrRateLimit(alice)).id;
      bobUid = (await signInOrRateLimit(bob)).id;
      await signInOrRateLimit(carol);
      const room = await createRoom(alice, 'Pool-RLS-testrum', 'Alice');
      roomId = room.id;
      roomCode = room.code;
      await joinRoomByCode(bob, roomCode, 'Bob');
    } catch (err) {
      if (err instanceof Error && err.message === 'RATE_LIMIT') {
        setupOk = false;
        return;
      }
      throw err;
    }
  }, 30000);

  afterAll(async () => {
    try {
      await alice.from('rooms').delete().eq('id', roomId);
    } catch {
      // bästa-ansträngning, testdata i ett dedikerat projekt
    }
  });

  beforeEach((ctx) => {
    if (!setupOk) {
      ctx.skip();
    }
  });

  // ===== GRUPP-TIPS =====

  it('GRUPP: en medlem (Bob) kan lägga + ändra sitt eget grupp-tips på en öppen grupp', async () => {
    await upsertMyGroupPrediction(bob, roomId, {
      groupId: OPEN_GROUP,
      winnerTeamId: 'BRA',
      runnerUpTeamId: 'ARG',
    });
    const updated = await upsertMyGroupPrediction(bob, roomId, {
      groupId: OPEN_GROUP,
      winnerTeamId: 'ESP',
      runnerUpTeamId: 'POR',
    });
    expect(updated).toMatchObject({
      groupId: OPEN_GROUP,
      userId: bobUid,
      winnerTeamId: 'ESP',
      runnerUpTeamId: 'POR',
    });
    const mine = await listMyGroupPredictions(bob, roomId);
    expect(mine.filter((p) => p.groupId === OPEN_GROUP)).toHaveLength(1); // upsert, ingen dubblett
  });

  it('GRUPP-SEKRETESS: Alice ser INTE Bobs grupp-tips på en öppen grupp (bara sitt eget)', async () => {
    await upsertMyGroupPrediction(alice, roomId, {
      groupId: OPEN_GROUP,
      winnerTeamId: 'FRA',
      runnerUpTeamId: 'ENG',
    });
    const visible = await listRoomGroupPredictions(alice, roomId);
    const onGroup = visible.filter((p) => p.groupId === OPEN_GROUP);
    expect(onGroup.map((p) => p.userId)).toEqual([aliceUid]);
    expect(onGroup.some((p) => p.userId === bobUid)).toBe(false);
  });

  it('GRUPP-FÖRFALSKNING: en medlem kan inte skriva ett grupp-tips i annans namn', async () => {
    const { error } = await bob.from('group_predictions').insert({
      room_id: roomId,
      group_id: OPEN_GROUP,
      user_id: aliceUid, // försök förfalska
      winner_team_id: 'GER',
      runner_up_team_id: 'NED',
    });
    expect(error).not.toBeNull();
  });

  it('GRUPP: en utomstående (Carol) nekas skriv + ser inga grupp-tips', async () => {
    await expect(
      upsertMyGroupPrediction(carol, roomId, {
        groupId: OPEN_GROUP,
        winnerTeamId: 'BRA',
        runnerUpTeamId: 'ARG',
      })
    ).rejects.toThrow(/Spara grupp-tips misslyckades/);
    expect(await listRoomGroupPredictions(carol, roomId)).toEqual([]);
  });

  // ===== BRACKET-TIPS =====

  it('BRACKET: en medlem kan lägga + ändra sitt "går vidare"-tips på en öppen slot', async () => {
    await upsertMyBracketPrediction(bob, roomId, { slotId: OPEN_SLOT, advancingTeamId: 'BRA' });
    const updated = await upsertMyBracketPrediction(bob, roomId, {
      slotId: OPEN_SLOT,
      advancingTeamId: 'ARG',
    });
    expect(updated).toMatchObject({ slotId: OPEN_SLOT, userId: bobUid, advancingTeamId: 'ARG' });
    const mine = await listMyBracketPredictions(bob, roomId);
    expect(mine.filter((p) => p.slotId === OPEN_SLOT)).toHaveLength(1);
  });

  it('BRACKET-SEKRETESS: Alice ser INTE Bobs slot-tips på en öppen slot (bara sitt eget)', async () => {
    await upsertMyBracketPrediction(alice, roomId, { slotId: OPEN_SLOT, advancingTeamId: 'ESP' });
    const visible = await listRoomBracketPredictions(alice, roomId);
    const onSlot = visible.filter((p) => p.slotId === OPEN_SLOT);
    expect(onSlot.map((p) => p.userId)).toEqual([aliceUid]);
    expect(onSlot.some((p) => p.userId === bobUid)).toBe(false);
  });

  it('BRACKET-FÖRFALSKNING: en medlem kan inte skriva ett bracket-tips i annans namn', async () => {
    const { error } = await bob.from('bracket_predictions').insert({
      room_id: roomId,
      slot_id: OPEN_SLOT,
      user_id: aliceUid,
      advancing_team_id: 'GER',
    });
    expect(error).not.toBeNull();
  });

  it('BRACKET: en utomstående (Carol) nekas skriv + ser inga bracket-tips', async () => {
    await expect(
      upsertMyBracketPrediction(carol, roomId, { slotId: OPEN_SLOT, advancingTeamId: 'BRA' })
    ).rejects.toThrow(/Spara bracket-tips misslyckades/);
    expect(await listRoomBracketPredictions(carol, roomId)).toEqual([]);
  });

  it('BRACKET: ett slot_id i fel format (g-* gruppmatch, eller skräp) nekas av constraint', async () => {
    await expect(
      upsertMyBracketPrediction(bob, roomId, { slotId: 'g-A-1', advancingTeamId: 'BRA' })
    ).rejects.toThrow(/Spara bracket-tips misslyckades/);
    // champion-sloten är dock giltig (om dess deadline g-A-1 ännu inte passerat).
    expect(CHAMPION_SLOT_ID).toBe('champion');
  });
});
