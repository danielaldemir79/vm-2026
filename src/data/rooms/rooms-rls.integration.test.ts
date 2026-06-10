// RLS-integrationstest (T14, #14): bevisar att Row Level Security skyddar rätt,
// NEKAD och TILLÅTEN, med TRE RIKTIGA anonyma Supabase-sessioner mot det
// LEVANDE projektet (kmzhyblzxangpxydufve). Detta är det enda testet som faktiskt
// BEVISAR säkerhetsmodellen, en mock kan inte bevisa RLS (lärdomen
// mock-foljer-konsumenttyp och uttommande-test-vaktar-svagare-invariant: testet
// måste nå den gren där garantin annars bryts, här riktiga RLS-avslag).
//
// VARFÖR det körs mot live och inte en mock: RLS lever i databasen, inte i
// klienten. Bara riktiga sessioner med olika auth.uid() kan visa att en utomstående
// NEKAS och en medlem TILLÅTS. Testet använder samma rooms-API som appen, så det
// dubbel-bevisar både RLS OCH att klient-koden anropar rätt.
//
// NÄT-GIND: testet kräver nät + de publika Supabase-uppgifterna. Saknas de (t.ex.
// en offline-CI utan env) SKIPPAS hela sviten rent (describe.skipIf), så den gröna
// enhetstest-sviten inte blir röd av en nät-avsaknad. Uppgifterna är PUBLIKA per
// design (anon/publishable-nyckel, skyddad av just den RLS vi testar), men läses
// ur env (VITE_SUPABASE_URL/ANON_KEY) eller faller till projektets kända publika
// värden, så de inte hårdkodas som "secrets" (de är inga, men vi behandlar dem
// som env-konfig ändå, PRINCIPLES §7).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../supabase-types';
import type { VmSupabaseClient } from '../supabase-browser';
import {
  createRoom,
  joinRoomByCode,
  leaveRoom,
  listMembers,
  listRoomResults,
  upsertRoomResult,
} from './rooms-api';

// Publik projektkonfig: env först (Vites import.meta.env, bundler-native), annars
// projektets kända publika värden. Den publishable-nyckeln är publik per design
// (RLS är skyddet), inte en secret, men läses ändå via env-konfig (PRINCIPLES §7).
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://kmzhyblzxangpxydufve.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_dqH6DdvuZDJ4vVTRd-bC5Q__fOMygZ0';

/** Skapa en fristående klient (egen storage-nyckel) = en isolerad session. */
function freshClient(tag: string): VmSupabaseClient {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // Ingen delad storage mellan testanvändarna: var och en sin egen session.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `vm2026-rls-test-${tag}-${Math.random().toString(36).slice(2)}`,
    },
  });
}

// Lättviktig nåbarhets-probe som INTE bränner en anonym inloggning (auth-health-
// endpointen svarar utan att skapa en användare). Så probe:n inte själv bidrar
// till rate-limiten. En SKIP betyder "projektet är inte användbart just nu":
// offline ELLER rate-limitat (anonym sign-in är rate-limitad per IP). I båda fall
// håller skipIf sviten grön i stället för röd, men RLS-modellen är bevisad när
// testet KÖR (den körs i CI/lokalt när projektet är nåbart + under rate-limiten).
async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Anonym inloggning med EN omförsök vid rate-limit (anonym sign-in är rate-limitad
 * per IP). Kastar en RATE_LIMIT-markerad-igenkännbar signal om det fortfarande är
 * rate-limitat, så setup kan skippa snyggt i stället för att rödna på en extern
 * gräns vi inte styr över.
 */
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

// Avgör EN gång vid inläsning om projektet är nåbart. skipIf gör sviten grön
// (skippad) offline i stället för röd.
const online = await reachable();

describe.skipIf(!online)('RLS: rum, medlemmar och delade resultat (riktiga sessioner)', () => {
  let alice: VmSupabaseClient; // skapar rummet
  let bob: VmSupabaseClient; // går med via kod
  let carol: VmSupabaseClient; // utomstående, går aldrig med
  let aliceUid: string;
  let bobUid: string;
  let roomId: string;
  let roomCode: string;
  // Sätts false om setup rate-limitas: tester guardar på den och skippar snyggt
  // i stället för att rödna på en extern rate-limit (anonym sign-in per IP).
  let setupOk = true;

  beforeAll(async () => {
    alice = freshClient('alice');
    bob = freshClient('bob');
    carol = freshClient('carol');

    try {
      aliceUid = (await signInOrRateLimit(alice)).id;
      bobUid = (await signInOrRateLimit(bob)).id;
      await signInOrRateLimit(carol);

      const room = await createRoom(alice, 'RLS-testrum', 'Alice');
      roomId = room.id;
      roomCode = room.code;
    } catch (err) {
      if (err instanceof Error && err.message === 'RATE_LIMIT') {
        // Extern rate-limit på anonym sign-in: skippa assertions (de bevisas när
        // limiten är klar). Inte ett kod-fel, så vi rödnar inte sviten.
        setupOk = false;
        return;
      }
      throw err;
    }
  }, 30000);

  afterAll(async () => {
    // Städa: Alice (skaparen) raderar rummet (cascade tar medlemmar + resultat).
    try {
      await alice.from('rooms').delete().eq('id', roomId);
    } catch {
      // bästa-ansträngning, testdata i ett dedikerat projekt
    }
  });

  // Skippa varje test snyggt om setup rate-limitades (extern gräns, inte kod-fel).
  beforeEach((ctx) => {
    if (!setupOk) {
      ctx.skip();
    }
  });

  it('skaparen blir medlem och kan läsa sitt eget rum direkt', async () => {
    const members = await listMembers(alice, roomId);
    expect(members.map((m) => m.userId)).toContain(aliceUid);
  });

  it('en UTOMSTÅENDE (Carol) ser inga medlemmar (RLS SELECT nekad)', async () => {
    const members = await listMembers(carol, roomId);
    expect(members).toEqual([]);
  });

  it('en UTOMSTÅENDE (Carol) kan inte läsa rummet direkt (RLS nekar rad)', async () => {
    const { data } = await carol.from('rooms').select('id').eq('id', roomId);
    expect(data).toEqual([]);
  });

  it('en UTOMSTÅENDE (Carol) kan inte rad-skanna rooms-tabellen', async () => {
    const { data } = await carol.from('rooms').select('id');
    expect(data).toEqual([]);
  });

  it('Bob kan gå med via koden och blir då medlem (TILLÅTEN)', async () => {
    const joined = await joinRoomByCode(bob, roomCode, 'Bob');
    expect(joined).not.toBeNull();
    expect(joined!.id).toBe(roomId);

    const members = await listMembers(bob, roomId);
    expect(members.map((m) => m.userId).sort()).toEqual([aliceUid, bobUid].sort());
  });

  it('gå-med med en OKÄND kod ger null (ingen läcka)', async () => {
    const joined = await joinRoomByCode(bob, 'zzzz9q', 'Bob');
    expect(joined).toBeNull();
  });

  it('en medlem (Bob) kan skriva ett delat resultat, en annan medlem (Alice) läser det', async () => {
    // Riktigt match-id ur planen (gruppmatch 'g-A-1'); 'M1' finns INTE och nekas
    // dessutom av rmr_match_id_format-constrainten (KA-SA2), så testet speglar de
    // faktiska id:na (gruppspel = g-...-id, slutspel = M73..M104).
    await upsertRoomResult(bob, roomId, {
      matchId: 'g-A-1',
      homeGoals: 2,
      awayGoals: 1,
      status: 'finished',
    });

    const results = await listRoomResults(alice, roomId);
    const m1 = results.find((r) => r.matchId === 'g-A-1');
    expect(m1).toMatchObject({ homeGoals: 2, awayGoals: 1, status: 'finished', updatedBy: bobUid });
  });

  it('en UTOMSTÅENDE (Carol) kan inte skriva ett resultat (RLS INSERT nekad)', async () => {
    // RLS-avslag -> rooms-api fail-loud:ar. Vi bevisar att skrivningen NEKAS.
    await expect(
      upsertRoomResult(carol, roomId, {
        matchId: 'g-A-2',
        homeGoals: 0,
        awayGoals: 0,
        status: 'finished',
      })
    ).rejects.toThrow(/Spara resultat misslyckades/);

    // Och att inget faktiskt skrevs (Alice ser inte g-A-2).
    const results = await listRoomResults(alice, roomId);
    expect(results.find((r) => r.matchId === 'g-A-2')).toBeUndefined();
  });

  it('en medlem kan INTE skriva ett match_id i fel format, t.ex. 10000 tecken (KA-SA2)', async () => {
    // rmr_match_id_format-constrainten nekar godtycklig text. Ett orimligt långt
    // match_id (10000 tecken) ska avvisas av DB:n (constraint-fel -> fail-loud), så
    // kolumnen inte är en obegränsad text-yta. Bob är medlem, så RLS släpper igenom
    // till constrainten (det är formatet, inte behörigheten, som stoppar här).
    const garbage = 'x'.repeat(10000);
    await expect(
      upsertRoomResult(bob, roomId, {
        matchId: garbage,
        homeGoals: 0,
        awayGoals: 0,
        status: 'finished',
      })
    ).rejects.toThrow(/Spara resultat misslyckades/);

    // Och inget skräp lagrades (Alice ser det inte).
    const results = await listRoomResults(alice, roomId);
    expect(results.find((r) => r.matchId === garbage)).toBeUndefined();
  });

  it('en UTOMSTÅENDE (Carol) ser inga resultat (RLS SELECT nekad)', async () => {
    const results = await listRoomResults(carol, roomId);
    expect(results).toEqual([]);
  });

  it('Bob (medlem, ej skapare) kan inte radera rummet (bara skaparen)', async () => {
    await bob.from('rooms').delete().eq('id', roomId);
    // Rummet finns kvar (Alice ser det fortfarande).
    const { data } = await alice.from('rooms').select('id').eq('id', roomId);
    expect(data).toHaveLength(1);
  });

  it('Bob kan LÄMNA rummet och förlorar då åtkomsten (RLS följer medlemskapet)', async () => {
    await leaveRoom(bob, roomId);
    // Efter lämnande nekar RLS Bob åtkomst till rummet igen.
    const { data } = await bob.from('rooms').select('id').eq('id', roomId);
    expect(data).toEqual([]);
  });
});
