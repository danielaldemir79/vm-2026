// RLS-integrationstest för kommentarer (T66, #121): bevisar att Row Level Security
// skyddar rätt, NEKAD och TILLÅTEN, med TRE RIKTIGA anonyma Supabase-sessioner mot
// det LEVANDE projektet. Detta är det enda testet som faktiskt BEVISAR säkerhets-
// modellen, en mock kan inte bevisa RLS (lärdomen mock-foljer-konsumenttyp +
// uttommande-test-vaktar-svagare-invariant: testet måste nå den gren där garantin
// annars bryts, här riktiga RLS-avslag). Samma upplägg som rooms-rls.integration.test.ts.
//
// VARFÖR live och inte mock: RLS lever i databasen, inte i klienten. Bara riktiga
// sessioner med olika auth.uid() kan visa att en utomstående NEKAS och en medlem
// TILLÅTS. Testet använder samma comments-API som appen, så det dubbel-bevisar både
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
import { addComment, deleteMyComment, listRoomComments, COMMENT_MAX_LEN } from './comments-api';

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
      storageKey: `vm2026-comments-rls-test-${tag}-${Math.random().toString(36).slice(2)}`,
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

describe.skipIf(!runnable)('RLS: rummets kommentarer (riktiga sessioner)', () => {
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

      const room = await createRoom(alice, 'T66 kommentar-RLS', 'Alice');
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
    // Städa: Alice (skaparen) raderar rummet (cascade tar medlemmar + kommentarer).
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

  it('en medlem (Alice) kan skriva en kommentar, en annan medlem (Bob) läser den', async () => {
    const saved = await addComment(alice, roomId, 'Hej alla, vilken match!');
    expect(saved.userId).toBe(aliceUid); // user_id sattes av DB-default auth.uid()
    expect(saved.body).toBe('Hej alla, vilken match!');

    const seenByBob = await listRoomComments(bob, roomId);
    expect(seenByBob.map((c) => c.body)).toContain('Hej alla, vilken match!');
  });

  it('en UTOMSTÅENDE (Carol) ser INGA kommentarer (RLS SELECT nekad)', async () => {
    const seenByCarol = await listRoomComments(carol, roomId);
    expect(seenByCarol).toEqual([]);
  });

  it('en UTOMSTÅENDE (Carol) kan INTE skriva en kommentar (RLS INSERT nekad)', async () => {
    await expect(addComment(carol, roomId, 'Jag borde inte kunna skriva')).rejects.toThrow(
      /Skriv kommentar misslyckades/
    );
    // Och inget skrevs (Alice ser den inte).
    const all = await listRoomComments(alice, roomId);
    expect(all.find((c) => c.body === 'Jag borde inte kunna skriva')).toBeUndefined();
  });

  it('en medlem (Bob) kan INTE radera en ANNANS (Alice) kommentar', async () => {
    const beforeRows = await listRoomComments(alice, roomId);
    const aliceComment = beforeRows.find((c) => c.userId === aliceUid);
    expect(aliceComment).toBeDefined();

    // RLS DELETE nekar tyst (0 rader rörda, inget fel kastas, idempotent).
    await deleteMyComment(bob, aliceComment!.id);

    const afterRows = await listRoomComments(alice, roomId);
    expect(afterRows.find((c) => c.id === aliceComment!.id)).toBeDefined(); // kvar
  });

  it('en medlem kan radera sin EGEN kommentar', async () => {
    const mine = await addComment(bob, roomId, 'Min egen rad att radera');
    await deleteMyComment(bob, mine.id);
    const after = await listRoomComments(bob, roomId);
    expect(after.find((c) => c.id === mine.id)).toBeUndefined();
  });

  it('DB:ns längd-CHECK nekar en för lång kommentar (> 500 tecken)', async () => {
    // Klient-valideringen stoppar redan, men vi bevisar att DB:n är sanningen genom
    // att gå förbi api-valideringen med en rå insert av 501 tecken (CHECK ska neka).
    const tooLong = 'x'.repeat(COMMENT_MAX_LEN + 1);
    const { error } = await alice.from('room_comments').insert({ room_id: roomId, body: tooLong });
    expect(error).not.toBeNull(); // room_comments_body_len CHECK-brott
  });
});
