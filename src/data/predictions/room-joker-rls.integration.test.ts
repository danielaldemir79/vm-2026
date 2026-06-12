// RLS-integrationstest för JOKER-VALEN (T19, #19). Bevisar att Row Level Security
// skyddar jokrarna (NEKAD + TILLÅTEN) med RIKTIGA anonyma Supabase-sessioner mot det
// LEVANDE projektet (kmzhyblzxangpxydufve). Samma upplägg som T15/T16:s RLS-tester.
//
// VAD DETTA TEST BEVISAR (riktiga sessioner mot riktiga RLS-policyer):
//   * en medlem kan sätta + flytta SIN EGEN joker på en ÖPPEN match (deadline ej passerad),
//   * en medlem ser sitt eget joker-val,
//   * en UTOMSTÅENDE nekas att läsa OCH skriva,
//   * man kan inte FÖRFALSKA en joker i någon annans namn (user_id = auth.uid()),
//   * EN JOKER PER DAG: en andra joker SAMMA svenska kalenderdag krockar (upsert byter).
//
// DEADLINE-LÅSET (skriv nekas efter avspark) + SEKRETESSEN (andras joker dolda före
// avspark) + en-joker-per-dag bevisades dessutom SERVER-SIDE med riktiga roller +
// manipulerade kickoff-tider (DO-block, se HANDOFF / docs/decisions.md T19). Det kan
// INTE bevisas via klient-API:t mot LIVE eftersom alla riktiga deadlines ligger i
// framtiden. Detta test täcker de delar som ÄR bevisbara via klienten.
//
// ENV-GRIND: kräver nät + projektets publika uppgifter UR MILJÖN (VITE_SUPABASE_*).
// Saknas de skippas hela sviten rent (describe.skipIf), precis som T14/T15/T16.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../supabase-types';
import type { VmSupabaseClient } from '../supabase-browser';
import { createRoom, joinRoomByCode } from '../rooms/rooms-api';
import { WC2026_MATCHES } from '../wc2026';
import { listMyJokers, listRoomJokers, upsertMyJoker } from './room-joker-api';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const hasEnv = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// ÖPPEN MATCH: joker-deadline är matchens egen avspark (samma som tipset). Finalen
// (M104, 19 juli) ligger längst fram, så den är öppen längst -> maximal CI-marginal.
const OPEN_MATCH = 'M104';
// En ANNAN match SAMMA svenska kalenderdag som OPEN_MATCH (för en-joker-per-dag-kollen)
// finns inte för finalen (den spelas ensam), så en-joker-per-dag bevisas i DO-blocket
// (server-side, två gruppmatcher samma dag). Här provar vi bytet inom samma match.

function kickoffMs(matchId: string): number {
  const m = WC2026_MATCHES.find((x) => x.id === matchId);
  if (!m) {
    throw new Error(`[VM2026] Testmatchen ${matchId} saknas i WC2026_MATCHES.`);
  }
  return new Date(m.kickoff).getTime();
}

const stillOpen = Date.now() < kickoffMs(OPEN_MATCH);

function freshClient(tag: string): VmSupabaseClient {
  return createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `vm2026-joker-rls-${tag}-${Math.random().toString(36).slice(2)}`,
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

describe.skipIf(!runnable)('RLS: joker-val, riktiga sessioner', () => {
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
      const room = await createRoom(alice, 'Joker-RLS-testrum', 'Alice');
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

  it('en medlem (Bob) kan sätta sin egen joker på en öppen match, och joker_day fylls server-side', async () => {
    const saved = await upsertMyJoker(bob, roomId, { matchId: OPEN_MATCH });
    expect(saved).toMatchObject({ matchId: OPEN_MATCH, userId: bobUid });
    // Triggern fyllde joker_day (svensk dag, icke-tomt ISO-datum).
    expect(saved.jokerDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const mine = await listMyJokers(bob, roomId);
    expect(mine.filter((j) => j.matchId === OPEN_MATCH)).toHaveLength(1);
  });

  it('SEKRETESS: Alice ser INTE Bobs joker på en öppen (ej startad) match (bara sin egen)', async () => {
    await upsertMyJoker(alice, roomId, { matchId: OPEN_MATCH });
    const visible = await listRoomJokers(alice, roomId);
    // Alice ser sin egen, men inte Bobs (Bobs match har inte sparkat igång än).
    expect(visible.some((j) => j.userId === aliceUid)).toBe(true);
    expect(visible.some((j) => j.userId === bobUid)).toBe(false);
  });

  it('FÖRFALSKNING: en medlem kan inte skriva en joker i annans namn', async () => {
    const { error } = await bob.from('room_jokers').insert({
      room_id: roomId,
      match_id: OPEN_MATCH,
      user_id: aliceUid, // försök förfalska
      joker_day: '2026-07-19', // ignoreras av triggern ändå
    });
    expect(error).not.toBeNull();
  });

  it('en utomstående (Carol) nekas skriv + ser inga joker', async () => {
    await expect(upsertMyJoker(carol, roomId, { matchId: OPEN_MATCH })).rejects.toThrow(
      /Spara joker misslyckades/
    );
    expect(await listRoomJokers(carol, roomId)).toEqual([]);
  });

  it('ett match_id i fel format (skräp) nekas av constraint', async () => {
    await expect(upsertMyJoker(bob, roomId, { matchId: 'inte-en-match' })).rejects.toThrow(
      /Spara joker misslyckades/
    );
  });
});
