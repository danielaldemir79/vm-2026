// RLS-integrationstest för GLOBAL FACIT (T42, #72): bevisar att Row Level
// Security skyddar de officiella resultaten, med RIKTIGA anonyma Supabase-
// sessioner mot det LEVANDE projektet (kmzhyblzxangpxydufve). En mock kan inte
// bevisa RLS (samma skäl som T14/T15-RLS-testerna).
//
// VAD DETTA TEST BEVISAR (via klient-API:t mot riktiga RLS-policyer):
//   * en ANONYM icke-admin SER facit (SELECT öppen, ingen rum-medlemskap krävs),
//   * en ANONYM icke-admin NEKAS att skriva facit (RLS is_app_admin),
//   * en icke-admin kan inte BEFORDRA sig själv (app_admins skriv nekas),
//   * isAppAdmin() returnerar false för en vanlig anonym användare.
//
// DEN FULLA admin-vägen (admin SKRIVER OK, admin kan inte förfalska updated_by,
// icke-admin UPDATE rör 0 rader) bevisades SERVER-SIDE med riktiga roller +
// jwt-claims + en temporär admin-rad av senior-developern (DO-block, ROLLBACK:at,
// se docs/decisions.md T42 / HANDOFF). Det kan INTE bevisas via klient-API:t mot
// LIVE eftersom vi inte gör en riktig anonym session till admin i produktion (det
// vore att lägga en främling i app_admins). Detta test täcker de delar som ÄR
// bevisbara via klienten utan admin-behörighet.
//
// ENV-GRIND: kräver nät + projektets publika uppgifter UR MILJÖN (VITE_SUPABASE_*).
// Saknas de skippas hela sviten rent (describe.skipIf), precis som T14/T15-RLS-testet.
// INGEN hårdkodad fallback (nyckeln är publik per design men hör i env, PRINCIPLES §7).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../supabase-types';
import type { VmSupabaseClient } from '../supabase-browser';
import { isAppAdmin } from './app-admin-api';
import { listOfficialResults, upsertOfficialResult } from './official-results-api';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const hasEnv = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// En giltig match_id (samma format som constrainten) att försöka skriva. Skrivet
// blockeras ändå av RLS (icke-admin), så raden ska aldrig landa.
const SOME_MATCH = 'g-A-1';

function freshClient(tag: string): VmSupabaseClient {
  return createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `vm2026-omr-rls-${tag}-${Math.random().toString(36).slice(2)}`,
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

describe.skipIf(!runnable)('RLS: global facit + admin (riktiga sessioner)', () => {
  let stranger: VmSupabaseClient; // vanlig anonym icke-admin
  let strangerUid: string;
  let setupOk = true;

  beforeAll(async () => {
    stranger = freshClient('stranger');
    try {
      strangerUid = (await signInOrRateLimit(stranger)).id;
    } catch (err) {
      if (err instanceof Error && err.message === 'RATE_LIMIT') {
        setupOk = false;
        return;
      }
      throw err;
    }
  }, 30000);

  afterAll(async () => {
    // Inget att städa: en icke-admin kan per RLS inte ha skapat någon facit-/admin-
    // rad. Den anonyma testanvändaren lämnas (samma som T15-testet, dedikerat projekt).
  });

  beforeEach((ctx) => {
    if (!setupOk) {
      ctx.skip();
    }
  });

  it('en ANONYM icke-admin SER facit (SELECT öppen, inget rum krävs)', async () => {
    // Ska inte kasta (RLS SELECT = using(true)). Listan kan vara tom (inget facit
    // inmatat än), men anropet ska LYCKAS, det bevisar att läsningen är tillåten.
    const results = await listOfficialResults(stranger);
    expect(Array.isArray(results)).toBe(true);
  });

  it('en ANONYM icke-admin NEKAS att skriva facit (RLS is_app_admin)', async () => {
    await expect(
      upsertOfficialResult(stranger, {
        matchId: SOME_MATCH,
        homeGoals: 9,
        awayGoals: 9,
        status: 'finished',
      })
    ).rejects.toThrow(/Spara officiellt resultat misslyckades/);
  });

  it('en icke-admin kan INTE befordra sig själv (app_admins skriv nekas)', async () => {
    const { error } = await stranger.from('app_admins').insert({ user_id: strangerUid });
    expect(error).not.toBeNull(); // RLS: ingen skriv-policy => nekad
  });

  it('isAppAdmin() är false för en vanlig anonym användare', async () => {
    const admin = await isAppAdmin(stranger);
    expect(admin).toBe(false);
  });

  it('en icke-admin ser INTE sin egen rad i app_admins (hen är inte admin)', async () => {
    // select_self släpper bara EGNA rader, och en icke-admin HAR ingen rad => tom.
    const { data, error } = await stranger.from('app_admins').select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
