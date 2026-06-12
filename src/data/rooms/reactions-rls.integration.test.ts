// RLS-integrationstest för reaktioner (T24, #24): bevisar att Row Level Security
// skyddar rätt, NEKAD och TILLÅTEN, med TRE RIKTIGA anonyma Supabase-sessioner mot
// det LEVANDE projektet. Detta är det enda testet som faktiskt BEVISAR säkerhets-
// modellen, en mock kan inte bevisa RLS (lärdomen mock-foljer-konsumenttyp +
// uttommande-test-vaktar-svagare-invariant: testet måste nå den gren där garantin
// annars bryts, här riktiga RLS-avslag). Samma upplägg som comments-rls.integration.test.
//
// VARFÖR live och inte mock: RLS lever i databasen, inte i klienten. Bara riktiga
// sessioner med olika auth.uid() kan visa att en utomstående NEKAS och en medlem
// TILLÅTS. Testet använder samma reactions-API som appen, så det dubbel-bevisar både
// RLS OCH att klient-koden anropar rätt.
//
// ENV-GRIND: kräver nät + Supabase-projektets publika uppgifter UR MILJÖN
// (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Saknas de skippas hela sviten rent
// (describe.skipIf), så den gröna enhetstest-sviten inte blir röd och inget kör mot
// ett okänt projekt. INGEN hårdkodad fallback (nyckeln är publik per design, men hör
// i miljö-konfig, PRINCIPLES §7).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../supabase-types';
import type { VmSupabaseClient } from '../supabase-browser';
import { createRoom, joinRoomByCode } from './rooms-api';
import { listRoomReactions, removeMyReaction, upsertMyReaction } from './reactions-api';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const hasEnv = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Skapa en fristående klient (egen storage-nyckel) = en isolerad session. */
function freshClient(tag: string): VmSupabaseClient {
  return createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `vm2026-reactions-rls-test-${tag}-${Math.random().toString(36).slice(2)}`,
    },
  });
}

/** Lättviktig nåbarhets-probe som INTE bränner en anonym inloggning. */
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

/** Anonym inloggning med EN omförsök vid rate-limit (per IP). */
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

const runnable = hasEnv && (await reachable());

describe.skipIf(!runnable)('RLS: rummets reaktioner (riktiga sessioner)', () => {
  let alice: VmSupabaseClient; // skapar rummet (medlem)
  let bob: VmSupabaseClient; // går med via kod (medlem)
  let carol: VmSupabaseClient; // utomstående, går aldrig med
  let aliceUid: string;
  let roomId: string;
  let roomCode: string;
  let setupOk = true;

  beforeAll(async () => {
    alice = freshClient('alice');
    bob = freshClient('bob');
    carol = freshClient('carol');
    try {
      aliceUid = (await signInOrRateLimit(alice)).id;
      await signInOrRateLimit(bob);
      await signInOrRateLimit(carol);

      const room = await createRoom(alice, 'T24 reaktion-RLS', 'Alice');
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
    // Städa: Alice (skaparen) raderar rummet (cascade tar medlemmar + reaktioner).
    try {
      await alice.from('rooms').delete().eq('id', roomId);
    } catch {
      // bästa-ansträngning, testdata i ett dedikerat projekt
    }
    // Logga ut alla tre sessioner så ingen bakgrunds-anslutning (auto-refresh) ligger
    // kvar EFTER att test-miljön rivits (annars en "caught after teardown"-varning).
    await Promise.allSettled([alice?.auth.signOut(), bob?.auth.signOut(), carol?.auth.signOut()]);
  });

  beforeEach((ctx) => {
    if (!setupOk) {
      ctx.skip();
    }
  });

  it('en medlem (Alice) kan reagera, en annan medlem (Bob) ser reaktionen', async () => {
    const saved = await upsertMyReaction(alice, roomId, 'g-A-1', '🔥');
    expect(saved.userId).toBe(aliceUid); // user_id sattes av DB-default auth.uid()
    expect(saved.emoji).toBe('🔥');

    const seenByBob = await listRoomReactions(bob, roomId);
    expect(seenByBob.find((r) => r.matchId === 'g-A-1' && r.userId === aliceUid)?.emoji).toBe('🔥');
  });

  it('en medlem kan BYTA sin emoji på samma match (upsert, en rad)', async () => {
    await upsertMyReaction(alice, roomId, 'g-A-1', '⚽');
    const all = await listRoomReactions(alice, roomId);
    const mine = all.filter((r) => r.matchId === 'g-A-1' && r.userId === aliceUid);
    expect(mine).toHaveLength(1); // upsert bytte, skapade inte en andra
    expect(mine[0].emoji).toBe('⚽');
  });

  it('en UTOMSTÅENDE (Carol) ser INGA reaktioner (RLS SELECT nekad)', async () => {
    const seenByCarol = await listRoomReactions(carol, roomId);
    expect(seenByCarol).toEqual([]);
  });

  it('en UTOMSTÅENDE (Carol) kan INTE reagera (RLS INSERT nekad)', async () => {
    await expect(upsertMyReaction(carol, roomId, 'g-A-2', '🔥')).rejects.toThrow(
      /Reagera misslyckades/
    );
    const all = await listRoomReactions(alice, roomId);
    expect(all.find((r) => r.matchId === 'g-A-2')).toBeUndefined();
  });

  it('en medlem (Bob) kan INTE radera en ANNANS (Alice) reaktion', async () => {
    const before = await listRoomReactions(alice, roomId);
    const aliceReaction = before.find((r) => r.userId === aliceUid && r.matchId === 'g-A-1');
    expect(aliceReaction).toBeDefined();

    // RLS DELETE nekar tyst (0 rader rörda; Bob filtrerar på match_id men RLS gränsar
    // till EGEN rad, så Alices rad rörs inte).
    await removeMyReaction(bob, roomId, 'g-A-1');

    const after = await listRoomReactions(alice, roomId);
    expect(after.find((r) => r.userId === aliceUid && r.matchId === 'g-A-1')).toBeDefined(); // kvar
  });

  it('en medlem kan radera sin EGEN reaktion (avmarkera)', async () => {
    await upsertMyReaction(bob, roomId, 'g-A-3', '😱');
    await removeMyReaction(bob, roomId, 'g-A-3');
    const after = await listRoomReactions(bob, roomId);
    expect(after.find((r) => r.matchId === 'g-A-3')).toBeUndefined();
  });

  it('DB:ns CHECK nekar en emoji utanför den kurerade listan', async () => {
    // Klient-valideringen stoppar redan, men vi bevisar att DB:n är sanningen genom en
    // rå insert förbi api-valideringen (CHECK ska neka 💩).
    const { error } = await alice
      .from('room_reactions')
      .insert({ room_id: roomId, match_id: 'g-A-4', emoji: '💩' });
    expect(error).not.toBeNull(); // room_reactions_emoji_allowed CHECK-brott
  });

  it('DB:ns CHECK nekar ett ogiltigt match_id', async () => {
    const { error } = await alice
      .from('room_reactions')
      .insert({ room_id: roomId, match_id: 'M999', emoji: '🔥' });
    expect(error).not.toBeNull(); // room_reactions_match_id_format CHECK-brott
  });
});
