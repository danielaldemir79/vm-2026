// PUSH-SENDER (edge function, Deno) , web-push avsändare, FUNDAMENT (T85, #177).
//
// ANSVAR (tunt, en sak): skicka en web-push-notis till EN användares EGNA enheter. I T85
// är detta scoped till SELF (mode:'test'): den anropande användaren (ur JWT:n) får en
// test-notis till sina egna prenumerationer. Det är fundamentets end-to-end-bevis. Att
// skicka till ANDRA (vid mål) är T89, UTANFÖR den här funktionens ansvar.
//
// SÄKERHET:
//   * verify_jwt = true: kräver en giltig (även anonym) session. Användaren LÖSES ur
//     JWT:n (auth.getUser med anroparens token), vi litar ALDRIG på ett user-id i bodyn.
//   * VAPID-PRIVATNYCKELN läses server-side ur app_config med SERVICE_ROLE och lämnar
//     ALDRIG funktionen (PRINCIPLES §7), samma mönster som api_football_key i pollaren.
//   * Prenumerationerna läses med SERVICE_ROLE (förbi RLS) men FILTRERAT på den lösta
//     user_id:t , funktionen kan bara skicka till anroparens egna enheter, aldrig någon
//     annans (self-scope-garantin).
//
// CORS: OPTIONS besvaras TIDIGT (preflight), och alla svar bär CORS-headers. (Den globala
// topplistans 503 berodde delvis på saknad CORS , vi upprepar inte det misstaget.)
//
// FAIL-LOUD (PRINCIPLES §8): saknad nyckel/konfig, auth-fel eller ett leverans-fel
// loggas + svarar med ett begripligt fel. En användare UTAN prenumerationer får ett
// tydligt 200-svar med sent:0 (inte en tyst no-op som ser ut att ha lyckats).
//
// @ts-nocheck , Deno-runtime (npm:/jsr:-importer, Deno-globaler). Den här filen typas/
// lintas INTE av app-grafen (tsc -b/eslint kör mot src/, supabase/functions undantas).
// Den gissningskänsliga, testbara logiken (raw VAPID -> JWK-konvertering, CORS-headers,
// payload-form) bor i src/features/push/* + supabase/functions/_shared/push-vapid.ts
// (rena funktioner, enhetstestade), så edge-skalet är tunt IO + den verifierade web-push-
// libben. Web-push-implementationen: jsr:@negrel/webpush (Deno-native, Web Crypto , INTE
// npm:web-push, vars node:crypto-beroende inte är pålitligt i edge-runtime). Konverteringen
// raw->JWK är bevisad mot Web Crypto (signera/verifiera-prob + raw-roundtrip), se decisions.md.

import { createClient } from 'npm:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { rawVapidToJwkPair } from '../_shared/push-vapid.ts';

// CORS: tillåt anrop från appens ursprung. Vi speglar inte en allowlist här (publik app,
// inga cookies , Authorization-headern bär token), så '*' är rätt avvägning; metoderna +
// headers täcker supabase-js functions.invoke (POST + apikey/authorization/content-type).
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Test-notisens payload (speglar buildTestNotificationPayload i src; SW:n parsar samma
// {title, body, url}-form). Inga em-dash i svensk copy (voice-regel).
const TEST_PAYLOAD = JSON.stringify({
  title: 'VM 2026',
  body: 'Test-notis , notiserna fungerar! Du får en pling när det blir mål.',
  url: '/',
});

Deno.serve(async (req) => {
  // CORS preflight: svara TIDIGT, före all annan logik.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !serviceKey || !anonKey) {
      throw new Error('SUPABASE_URL / SERVICE_ROLE / ANON saknas i funktionens env.');
    }

    // --- 1. Lös ANROPAREN ur JWT:n (aldrig ur bodyn) ---
    // En klient med anroparens Authorization-header: auth.getUser läser då DENNES user.
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      // 401: ingen giltig session (verify_jwt borde redan ha stoppat, men dubbel-gata).
      return jsonResponse({ error: 'Ingen giltig session (kräver inloggning).' }, 401);
    }
    const userId = userData.user.id;

    // --- 2. Läs VAPID-nycklarna ur app_config (SERVICE_ROLE, server-side hemlighet) ---
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: cfgRows, error: cfgErr } = await admin
      .from('app_config')
      .select('key, value')
      .in('key', ['vapid_public_key', 'vapid_private_key']);
    if (cfgErr) throw new Error(`Läs app_config misslyckades: ${cfgErr.message}`);
    const cfg = new Map((cfgRows ?? []).map((r) => [r.key, r.value]));
    const publicKey = cfg.get('vapid_public_key');
    const privateKey = cfg.get('vapid_private_key');
    if (!publicKey || !privateKey) {
      throw new Error(
        'app_config saknar vapid_public_key / vapid_private_key (inserta vid deploy).'
      );
    }

    // --- 3. Bygg application-servern ur de (raw->JWK-konverterade) VAPID-nycklarna ---
    // rawVapidToJwkPair är den rena, enhetstestade + Web-Crypto-bevisade konverteringen.
    const vapidKeys = await webpush.importVapidKeys(rawVapidToJwkPair(publicKey, privateKey), {
      extractable: false,
    });
    const appServer = await webpush.ApplicationServer.new({
      // mailto-kontakt = VAPID-kravet (sub-claim). En riktig adress så push-tjänsten kan nå oss.
      contactInformation: 'mailto:daniel.aldemir79@gmail.com',
      vapidKeys,
    });

    // --- 4. Läs ANROPARENS egna prenumerationer (service_role, FILTRERAT på userId) ---
    const { data: subs, error: subErr } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth_key')
      .eq('user_id', userId);
    if (subErr) throw new Error(`Läs push_subscriptions misslyckades: ${subErr.message}`);

    if (!subs || subs.length === 0) {
      // Ärligt svar: inget skickat (ingen tyst "lyckat" utan mottagare).
      return jsonResponse({ sent: 0, message: 'Inga prenumerationer för användaren.' });
    }

    // --- 5. Skicka test-notisen till varje enhet ---
    // En 404/410 ur push-tjänsten = enheten har avregistrerat (gone). Vi städar då bort
    // den döda raden (idempotent), så listan inte växer med spöken. Andra fel loggas men
    // stoppar inte de övriga enheterna (best-effort per enhet).
    let sent = 0;
    const errors = [];
    for (const sub of subs) {
      try {
        const subscriber = appServer.subscribe({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        });
        await subscriber.pushTextMessage(TEST_PAYLOAD, {});
        sent += 1;
      } catch (err) {
        const status = err?.response?.status;
        if (status === 404 || status === 410) {
          // Död prenumeration: städa bort (best-effort, ett fel här ska inte krascha svaret).
          await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          errors.push(`gone:${sub.endpoint.slice(-12)}`);
        } else {
          errors.push(`${status ?? 'err'}:${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    return jsonResponse({ sent, total: subs.length, errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: `[VM2026] push-sender: ${message}` }, 500);
  }
});
