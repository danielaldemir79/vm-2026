// RLS/gate-integrationstest för ADMIN-STATISTIK (T45, #76): bevisar att de två
// admin-RPC:erna (admin_room_stats + admin_revealed_predictions) NEKAR en vanlig
// (icke-admin) användare , med RIKTIGA anonyma Supabase-sessioner mot det LEVANDE
// projektet (kmzhyblzxangpxydufve). En mock kan inte bevisa en is_app_admin()-gate
// (samma skäl som T14/T15/T42-RLS-testerna).
//
// VAD DETTA TEST BEVISAR (via klient-API:t mot de riktiga RPC:erna):
//   * en ANONYM icke-admin får TOM mängd ur admin_room_stats (gaten nekar tyst),
//   * en ANONYM icke-admin får TOM mängd ur admin_revealed_predictions,
//   * ingen rå rums-/tips-data läcker till en icke-admin över rumsgränserna.
//
// DEN FULLA admin-vägen (admin SER alla rum + bara AVSLÖJADE tips, framtida tips
// filtreras bort) bevisades SERVER-SIDE med riktiga roller + jwt-claims + en temporär
// admin-rad av senior-developern (DO-block, läst-only, se docs/decisions.md T45 /
// HANDOFF: 545 match-tips totalt, 19 avslöjade, 526 framtida BORTFILTRERADE). Det kan
// INTE bevisas via klient-API:t mot LIVE eftersom vi inte gör en riktig anonym session
// till admin i produktion (det vore att lägga en främling i app_admins). Detta test
// täcker den del som ÄR bevisbar via klienten utan admin-behörighet: gaten nekar.
//
// ENV-GRIND: kräver nät + projektets publika uppgifter UR MILJÖN (VITE_SUPABASE_*).
// Saknas de skippas hela sviten rent (describe.skipIf), precis som de andra RLS-testen.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../supabase-types';
import type { VmSupabaseClient } from '../supabase-browser';
import { fetchAdminRoomStats, fetchAdminRevealedPredictions } from './admin-stats-api';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const hasEnv = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

function freshClient(tag: string): VmSupabaseClient {
  return createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `vm2026-admin-stats-rls-${tag}-${Math.random().toString(36).slice(2)}`,
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

const runnable = hasEnv && (await reachable());

describe.skipIf(!runnable)('RLS: admin-statistik gate (riktiga sessioner)', () => {
  let stranger: VmSupabaseClient; // vanlig anonym icke-admin
  let setupOk = true;

  beforeAll(async () => {
    stranger = freshClient('stranger');
    try {
      await signInOrRateLimit(stranger);
    } catch (err) {
      if (err instanceof Error && err.message === 'RATE_LIMIT') {
        setupOk = false;
        return;
      }
      throw err;
    }
  }, 30000);

  afterAll(async () => {
    // Inget att städa: en icke-admin kan per gaten inte ha skapat någon rad, och
    // RPC:erna är read-only. Den anonyma testanvändaren lämnas (dedikerat projekt).
  });

  beforeEach((ctx) => {
    if (!setupOk) {
      ctx.skip();
    }
  });

  it('admin_room_stats: en ANONYM icke-admin får TOM mängd (gaten nekar)', async () => {
    const rooms = await fetchAdminRoomStats(stranger);
    expect(rooms).toEqual([]);
  });

  it('admin_revealed_predictions: en ANONYM icke-admin får TOM mängd (gaten nekar)', async () => {
    const revealed = await fetchAdminRevealedPredictions(stranger);
    expect(revealed).toEqual([]);
  });
});
