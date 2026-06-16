// GOAL-PUSH-DISPATCHER (edge function, Deno) , skickar en mål-notis vid ETT nytt mål (T89, #182).
//
// ANSVAR (tunt, en sak): reagera på en match_live_data-UPDATE (via DB-triggern, pg_net), diffa
// OLD vs NEW för NYA mål med den DELADE måltolkningen, avduppa hårt mot notified_goals, och
// skicka "MÅL! Spanien 2-1" till varje OPTAD-IN användares enheter som inte tystats av sina
// preferenser (master av / nattläge / scope).
//
// POLLAREN RÖRS ALDRIG (SPEC §13.3 out-of-scope): pollaren upsertar match_live_data oförändrat;
// vi reagerar PÅ den raden via en AFTER UPDATE-trigger (t89_goal_push_trigger). Ingen rad i
// pollarens kod ändras.
//
// ===========================================================================================
// SÄKERHET , KRITISK (denna funktion skickar till ANDRAS enheter):
//   * verify_jwt = FALSE + DELAD HEMLIGHET. Triggern (pg_net) kan inte bära en användar-JWT,
//     och en anon-JWT (som pollar-cronen) skulle göra funktionen anropbar av VEM SOM HELST ,
//     oacceptabelt när den skickar till andras enheter. I stället kräver vi en hemlig header
//     (x-goal-dispatch-secret) som BARA triggern känner (lagrad i app_config, läses server-
//     side). Ett anrop utan exakt rätt hemlighet -> 401, inget skickas. Detta är den
//     dokumenterade verify_jwt=false-undantaget (custom auth), inte en öppen funktion.
//   * Mottagarna gatas av VAR ANVÄNDARES EGNA opt-in + preferenser (push_subscriptions-raden:
//     en rad finns BARA om enheten själv prenumererat; notify_enabled/quiet_hours/scope styr
//     OM den får notisen). Ingen kan tvinga en notis till någon annans enhet.
//   * VAPID-PRIVATNYCKELN + hemligheten läses ur app_config med SERVICE_ROLE och lämnar ALDRIG
//     funktionen (PRINCIPLES §7), samma mönster som push-sender + pollaren.
//
// IDEMPOTENS (HARD, ingen dubbel-/historik-notis): för VARJE nytt mål INSERTar vi en rad i
// notified_goals (PK = match_id + goal_signature) med `on conflict do nothing` FÖRE vi skickar.
// Rörde insert 0 rader -> målet är redan notifierat (re-levererad webhook / redeploy / re-poll
// som skrev om blobben) -> hoppa TYST. Så en re-leverans kan ALDRIG re-notifiera. Signaturen är
// stabil över re-poll (goalSignature: minut+tillägg+lag+skytt+flaggor, INTE event-index).
//
// ALL gissningskänslig logik (parse, mål-diff, signatur, scoring-sida, notis-text, preferens-
// beslut) bor i src/features/push/* (rena, enhetstestade) och speglas hit via den GENERERADE
// _shared/goal-push-core.ts (paritets-testad). Edge-skalet är tunn IO + web-push-libben.
//
// @ts-nocheck , Deno-runtime (npm:/jsr:-importer, Deno-globaler). Typas/lintas INTE av app-grafen.

import { createClient } from 'npm:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { rawVapidToJwkPair } from '../_shared/push-vapid.ts';
import {
  parseEvents,
  diffNewGoals,
  goalSignature,
  scoringSideFromScoreDelta,
  resolveCelebratedTeamName,
  formatGoalNotification,
  shouldNotifyUser,
} from '../_shared/goal-push-core.ts';
// Direkt-import av den GENERERADE matchplanen (match_id -> app-lag-par), INTE via
// livescore-core.ts , dispatchern behöver bara planen för scope-filtret (vilka lag spelar i
// matchen), inte pollarens 571-rads-kärna. embedded-match-plan.ts är värde-låst mot matches.ts
// i CI (match-plan.test.ts), så det är samma sanning utan att koppla in poll-logiken.
import { EMBEDDED_MATCH_PLAN } from '../_shared/embedded-match-plan.ts';

// CORS: anropas server-till-server av triggern, men vi speglar push-senders mönster (en
// manuell test-invoke via supabase-js ska också funka). '*' är rätt (publik app, ingen cookie).
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-goal-dispatch-secret',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Bygg en {homeTeamId, awayTeamId} (FIFA-koder) ur den inbäddade matchplanen, för scope-filtret. */
function matchTeamIds(matchId) {
  const entry = EMBEDDED_MATCH_PLAN.find((m) => m.matchId === matchId);
  // Gruppmatcher har app-lag-id (gemen FIFA-kod); slutspel null tills seedat. Scope-filtret är
  // FIFA-koder i VERSALER (push_preferences.favorite_team_id ~ ^[A-Z]{3}$), så vi versaliserar
  // app-id:t (app-id är gemen FIFA-kod, t.ex. 'esp'). Saknas matchen/laget -> null.
  return {
    homeTeamId: entry?.homeAppId ? entry.homeAppId.toUpperCase() : null,
    awayTeamId: entry?.awayAppId ? entry.awayAppId.toUpperCase() : null,
  };
}

/** Parsa events-blobben (RawApiResponse-kuvert) tåligt -> LiveEvent[]; null/trasig -> []. */
function safeParseEvents(blob) {
  if (blob === null || blob === undefined) {
    return [];
  }
  try {
    return parseEvents(blob);
  } catch (err) {
    console.warn(`[VM2026] goal-push-dispatcher: kunde inte parsa events: ${String(err)}`);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      throw new Error('SUPABASE_URL / SERVICE_ROLE saknas i funktionens env.');
    }
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // --- 1. AUTH: kräv den delade hemligheten (BARA triggern känner den) ---
    // Läs förväntad hemlighet ur app_config (server-side). Saknas den -> 500 (fail loud, hellre
    // det än att svälja auth tyst). Fel/utebliven header -> 401 (inget skickas).
    const { data: secretRow, error: secretErr } = await admin
      .from('app_config')
      .select('value')
      .eq('key', 'goal_dispatch_secret')
      .maybeSingle();
    if (secretErr) throw new Error(`Läs goal_dispatch_secret misslyckades: ${secretErr.message}`);
    const expectedSecret = secretRow?.value;
    if (!expectedSecret) {
      throw new Error('app_config saknar goal_dispatch_secret (inserta vid deploy).');
    }
    const providedSecret = req.headers.get('x-goal-dispatch-secret') ?? '';
    if (providedSecret !== expectedSecret) {
      return jsonResponse({ error: 'Ogiltig eller saknad dispatch-hemlighet.' }, 401);
    }

    // --- 2. Läs OLD + NEW match_live_data-raden ur triggerns body ---
    const body = await req.json().catch(() => null);
    const newRow = body?.record ?? null;
    const oldRow = body?.old_record ?? null;
    if (!newRow || typeof newRow.match_id !== 'string') {
      return jsonResponse({ error: 'Saknar record.match_id i bodyn.' }, 400);
    }
    const matchId = newRow.match_id;

    // --- 3. Diffa NYA mål mot GAMLA (delad måltolkning) ---
    const oldEvents = safeParseEvents(oldRow?.events ?? null);
    const newEvents = safeParseEvents(newRow.events ?? null);
    const detected = diffNewGoals(oldEvents, newEvents, matchId);
    if (detected.length === 0) {
      return jsonResponse({ matchId, newGoals: 0, message: 'Inga nya mål i denna uppdatering.' });
    }

    // Ställningen + scoring-sidan (egenmåls-säkert, ur ställnings-deltat).
    const oldScore = { home: oldRow?.home_goals ?? null, away: oldRow?.away_goals ?? null };
    const newScore = { home: newRow.home_goals ?? null, away: newRow.away_goals ?? null };
    const side = scoringSideFromScoreDelta(oldScore, newScore);
    const teamIds = matchTeamIds(matchId);

    // --- 4. Per nytt mål: dedup-INSERT (hård idempotens) FÖRE något skickas ---
    // Avgör FÖRST vilka mål som faktiskt ska notifieras (dedup), så app_config/VAPID +
    // prenumerations-läsningen sker EN gång även vid snabba på-varandra-mål (inte per mål).
    const toNotify = [];
    const perGoal = [];
    for (const det of detected) {
      const signature = goalSignature(det.goal, matchId);
      // notified_goals PK = (match_id, signature). on conflict do nothing: rörde 0 rader =>
      // redan notifierat (re-leverans/redeploy/re-poll) => hoppa TYST. Detta är den HÅRDA
      // garantin mot dubbel-/historik-notis.
      const { data: inserted, error: insErr } = await admin
        .from('notified_goals')
        .upsert(
          { match_id: matchId, goal_signature: signature },
          { onConflict: 'match_id,goal_signature', ignoreDuplicates: true }
        )
        .select('goal_signature');
      if (insErr) throw new Error(`notified_goals-insert misslyckades: ${insErr.message}`);
      if (!inserted || inserted.length === 0) {
        perGoal.push({ signature, status: 'already-notified' });
        continue; // redan notifierat -> hoppa tyst
      }
      const teamName = resolveCelebratedTeamName(det, newEvents);
      toNotify.push({ signature, teamName });
    }

    // Inga NYA (alla redan notifierade) -> inget att skicka, men ärligt svar.
    if (toNotify.length === 0) {
      return jsonResponse({
        matchId,
        newGoals: detected.length,
        goalsNotified: 0,
        totalSent: 0,
        perGoal,
      });
    }

    // VAPID-server + prenumerationer EN gång (delas av alla mål i denna dispatch).
    const sender = await buildSender(admin);
    const recipients = await readRecipients(admin);
    const now = new Date();

    let totalSent = 0;
    for (const goal of toNotify) {
      const payload = formatGoalNotification(side, newScore, goal.teamName);
      const sent = await sendToRecipients(admin, sender, recipients, payload, teamIds, now);
      totalSent += sent;
      perGoal.push({ signature: goal.signature, status: 'notified', team: goal.teamName, sent });
    }

    return jsonResponse({
      matchId,
      newGoals: detected.length,
      goalsNotified: toNotify.length,
      totalSent,
      perGoal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: `[VM2026] goal-push-dispatcher: ${message}` }, 500);
  }
});

/**
 * Bygg web-push-application-servern EN gång ur VAPID-nycklarna (server-hemlighet i app_config).
 * Delas av alla mål i en dispatch (ingen om-import per mål). Samma raw->JWK-konvertering +
 * @negrel/webpush-mönster som push-sender (T85, bevisat i edge-runtime).
 */
async function buildSender(admin) {
  const { data: cfgRows, error: cfgErr } = await admin
    .from('app_config')
    .select('key, value')
    .in('key', ['vapid_public_key', 'vapid_private_key']);
  if (cfgErr) throw new Error(`Läs app_config (vapid) misslyckades: ${cfgErr.message}`);
  const cfg = new Map((cfgRows ?? []).map((r) => [r.key, r.value]));
  const publicKey = cfg.get('vapid_public_key');
  const privateKey = cfg.get('vapid_private_key');
  if (!publicKey || !privateKey) {
    throw new Error('app_config saknar vapid_public_key / vapid_private_key.');
  }
  const vapidKeys = await webpush.importVapidKeys(rawVapidToJwkPair(publicKey, privateKey), {
    extractable: false,
  });
  return webpush.ApplicationServer.new({
    contactInformation: 'mailto:daniel.aldemir79@gmail.com',
    vapidKeys,
  });
}

/**
 * Läs ALLA prenumerationer + deras preferenser EN gång (service_role förbigår RLS , vi MÅSTE
 * läsa alla användares rader för att kunna skicka till deras enheter; self-scope-garantin är att
 * en rad BARA finns om enheten själv prenumererat). Delas av alla mål i en dispatch.
 */
async function readRecipients(admin) {
  const { data: subs, error: subErr } = await admin
    .from('push_subscriptions')
    .select(
      'endpoint, p256dh, auth_key, notify_enabled, quiet_hours_enabled, match_scope, favorite_team_id'
    );
  if (subErr) throw new Error(`Läs push_subscriptions misslyckades: ${subErr.message}`);
  return subs ?? [];
}

/**
 * Skicka EN notis-payload till de mottagare vars EGNA preferenser släpper igenom (master på, ej
 * natt, scope passar). Returnerar antal faktiskt skickade pushar.
 *
 * Self-scope-garantin (säkerhet): vi respekterar VARJE rads egna preferenser (shouldNotifyUser),
 * och en rad finns bara om enheten själv prenumererat , ingen kan tvinga en notis till någon
 * annans enhet.
 */
async function sendToRecipients(admin, appServer, subs, payload, teamIds, now) {
  if (subs.length === 0) {
    return 0;
  }
  const message = JSON.stringify(payload);
  let sent = 0;
  for (const sub of subs) {
    // Preferens-beslutet (delad ren funktion): master på, ej natt, scope passar.
    const prefs = {
      notifyEnabled: sub.notify_enabled !== false, // default på (kolumnen är NOT NULL default true)
      quietHoursEnabled: sub.quiet_hours_enabled === true,
      scope: sub.match_scope === 'favorite' ? 'favorite' : 'all',
      favoriteTeamId: sub.favorite_team_id ?? null,
    };
    const decision = shouldNotifyUser(prefs, teamIds, now);
    if (!decision.notify) {
      continue; // tyst skippad (av/natt/scope)
    }
    try {
      const subscriber = appServer.subscribe({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth_key },
      });
      await subscriber.pushTextMessage(message, {});
      sent += 1;
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404 || status === 410) {
        // Död prenumeration -> städa bort (idempotent best-effort), exakt som push-sender.
        await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      } else {
        console.warn(`[VM2026] goal-push: leverans-fel (${status ?? 'err'}): ${String(err)}`);
      }
    }
  }
  return sent;
}
