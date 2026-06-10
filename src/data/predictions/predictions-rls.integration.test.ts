// RLS-integrationstest för TIPS (T15, #15): bevisar att Row Level Security
// skyddar tipsen, NEKAD och TILLÅTEN, med TVÅ-TRE RIKTIGA anonyma Supabase-
// sessioner mot det LEVANDE projektet (kmzhyblzxangpxydufve). En mock kan inte
// bevisa RLS (samma skäl som T14:s rooms-rls.integration.test.ts).
//
// VAD DETTA TEST BEVISAR (med riktiga sessioner mot riktiga RLS-policyer):
//   * en medlem kan lägga + ändra SITT EGET tips på en ÖPPEN match (avspark ej
//     passerad),
//   * en medlem ser sitt eget tips,
//   * en UTOMSTÅENDE nekas att läsa OCH skriva tips i rummet,
//   * man kan inte FÖRFALSKA ett tips i någon annans namn (user_id = auth.uid()).
//
// DEADLINE-LÅSET (skriv nekas efter avspark) + TIPS-SEKRETESSEN (andras tips dolda
// före avspark) bevisades SERVER-SIDE med riktiga roller + manipulerade kickoff-
// tider av senior-developern (DO-block + set role authenticated + jwt-claims, se
// HANDOFF-blocket / docs/decisions.md T15). Det kan INTE bevisas via klient-API:t
// mot LIVE eftersom alla riktiga VM-matcher ligger i framtiden (alla är "öppna")
// och vi ändrar inte produktionens kickoff-tider från ett test. Detta test täcker
// de delar som ÄR bevisbara via klienten mot en öppen match.
//
// ENV-GRIND: kräver nät + projektets publika uppgifter UR MILJÖN (VITE_SUPABASE_*).
// Saknas de skippas hela sviten rent (describe.skipIf), precis som T14:s RLS-test.
// INGEN hårdkodad fallback (nyckeln är publik per design men hör i env, PRINCIPLES §7).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../supabase-types';
import type { VmSupabaseClient } from '../supabase-browser';
import { createRoom, joinRoomByCode } from '../rooms/rooms-api';
import { WC2026_MATCHES } from '../wc2026';
import { listMyPredictions, listRoomPredictions, upsertMyPrediction } from './predictions-api';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const hasEnv = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// VAL AV TESTMATCH (Copilot C13, tids-robusthet): hela sviten antar att matchen är
// ÖPPEN (avspark ej passerad), annars börjar RLS dölja/avvisa och CI skulle falla
// över tid. Vi väljer därför den SENASTE gruppspelsmatchen med KÄNDA lag och gatar
// dessutom på dess avspark (skipIf nedan), så sviten skippar rent EFTER avspark i
// stället för att falla.
//
// VARFÖR g-J-6 (inte t.ex. finalen M104 19 juli): finalen ligger längst fram men
// har TBD-lag (homeTeamId/awayTeamId = null) och hör inte till tips-format-rymden på
// samma sätt; en gruppspelsmatch har kända lag OCH ett giltigt predictions-match_id.
// g-J-6 (Jordanien-Argentina) är den ALLRA sista gruppspelsmatchen: kickoff
// 2026-06-28T02:00:00Z, ett dygn senare än g-L-5/g-L-6 (27 juni), vilket ger maximal
// CI-marginal inom gruppspelet. Verifierat mot WC2026_MATCHES (matchplanen, källåkrad).
const OPEN_MATCH = 'g-J-6';

// Avsparken DÄRIVERAS ur matchplanen (EN sanning för tiderna), inte hårdkodad här,
// så ett käll-uppdaterat schema aldrig kan drifta från denna grind (lärdomen om att
// härleda värden ur källan, inte duplicera dem). En instant-jämförelse (UTC ms) är
// rätt här: "har avsparken passerat NU?" är tidszons-oberoende.
const OPEN_MATCH_KICKOFF_MS = (() => {
  const m = WC2026_MATCHES.find((x) => x.id === OPEN_MATCH);
  if (!m) {
    // Fail loud: om matchplanen byter id ska detta SYNAS, inte tyst skippa allt.
    throw new Error(`[VM2026] Testmatchen ${OPEN_MATCH} saknas i WC2026_MATCHES.`);
  }
  return new Date(m.kickoff).getTime();
})();

// Är testmatchen fortfarande öppen (avspark inte passerad)? Efter avspark börjar
// RLS låsa/dölja, då skulle assertionerna nedan inte längre gälla -> skippa i stället
// för att falla. (g-J-6 ligger 2026-06-28; denna grind aktiveras först efter VM:t.)
const matchStillOpen = Date.now() < OPEN_MATCH_KICKOFF_MS;

function freshClient(tag: string): VmSupabaseClient {
  return createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `vm2026-pred-rls-${tag}-${Math.random().toString(36).slice(2)}`,
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

// Sviten körs bara med env + nåbart projekt OCH medan testmatchen ännu är öppen
// (C13): efter avspark döljer/avvisar RLS, så assertionerna gäller inte längre.
const runnable = hasEnv && matchStillOpen && (await reachable());

describe.skipIf(!runnable)('RLS: tips, medlemskap + förfalskning (riktiga sessioner)', () => {
  let alice: VmSupabaseClient; // skapar rummet, lägger ett tips
  let bob: VmSupabaseClient; // går med, lägger ett eget tips
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
      const room = await createRoom(alice, 'Tips-RLS-testrum', 'Alice');
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

  it('en medlem (Bob) kan lägga sitt eget tips på en ÖPPEN match (TILLÅTEN)', async () => {
    const saved = await upsertMyPrediction(bob, roomId, {
      matchId: OPEN_MATCH,
      homeGoals: 2,
      awayGoals: 1,
    });
    expect(saved).toMatchObject({
      matchId: OPEN_MATCH,
      userId: bobUid,
      homeGoals: 2,
      awayGoals: 1,
    });
  });

  it('en medlem kan ÄNDRA sitt tips före avspark (upsert på samma nyckel)', async () => {
    const updated = await upsertMyPrediction(bob, roomId, {
      matchId: OPEN_MATCH,
      homeGoals: 0,
      awayGoals: 0,
    });
    expect(updated).toMatchObject({
      matchId: OPEN_MATCH,
      userId: bobUid,
      homeGoals: 0,
      awayGoals: 0,
    });
    // Bara EN rad (upsert ersatte, skapade ingen dubblett).
    const mine = await listMyPredictions(bob, roomId);
    expect(mine.filter((p) => p.matchId === OPEN_MATCH)).toHaveLength(1);
  });

  it('Bob ser sitt eget tips i listan', async () => {
    const mine = await listMyPredictions(bob, roomId);
    expect(mine.find((p) => p.matchId === OPEN_MATCH)?.userId).toBe(bobUid);
  });

  it('TIPS-SEKRETESS: Alice ser INTE Bobs tips på en öppen match (bara sitt eget)', async () => {
    // Alice lägger sitt eget tips, läser sedan rummets tips på den öppna matchen.
    // RLS ska dölja Bobs tips (avspark ej passerad) men visa Alice eget.
    await upsertMyPrediction(alice, roomId, { matchId: OPEN_MATCH, homeGoals: 1, awayGoals: 1 });
    const visible = await listRoomPredictions(alice, roomId);
    const onMatch = visible.filter((p) => p.matchId === OPEN_MATCH);
    expect(onMatch.map((p) => p.userId)).toEqual([aliceUid]); // bara Alice eget
    expect(onMatch.some((p) => p.userId === bobUid)).toBe(false); // INTE Bobs
  });

  it('FÖRFALSKNING: en medlem kan inte skriva ett tips i en annans namn', async () => {
    // upsertMyPrediction sätter user_id = auth.uid(), men vi bevisar att en RÅ
    // insert med någon annans user_id NEKAS av RLS (with check user_id=auth.uid()).
    const { error } = await bob.from('predictions').insert({
      room_id: roomId,
      match_id: OPEN_MATCH,
      user_id: aliceUid, // försök förfalska som Alice
      home_goals: 9,
      away_goals: 9,
    });
    expect(error).not.toBeNull(); // RLS nekar
  });

  it('en UTOMSTÅENDE (Carol) kan inte skriva ett tips (RLS INSERT nekad)', async () => {
    await expect(
      upsertMyPrediction(carol, roomId, { matchId: OPEN_MATCH, homeGoals: 0, awayGoals: 0 })
    ).rejects.toThrow(/Spara tips misslyckades/);
  });

  it('en UTOMSTÅENDE (Carol) ser inga tips (RLS SELECT nekad)', async () => {
    const visible = await listRoomPredictions(carol, roomId);
    expect(visible).toEqual([]);
  });

  it('en medlem kan INTE skriva ett match_id i fel format (constraint)', async () => {
    await expect(
      upsertMyPrediction(bob, roomId, { matchId: 'x'.repeat(5000), homeGoals: 0, awayGoals: 0 })
    ).rejects.toThrow(/Spara tips misslyckades/);
  });
});
