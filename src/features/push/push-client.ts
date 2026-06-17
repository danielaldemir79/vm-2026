// Web-push klient-glue (T85, #177): de SIDO-EFFEKTANDE stegen (begär behörighet,
// prenumerera via pushManager, upserta/radera raden, anropa push-sender). De RENA delarna
// (nyckel-konvertering, serialisering, payload, state-maskin) bor i sina egna moduler och
// enhetstestas där; den här filen orkestrerar dem mot de faktiska browser-/Supabase-API:erna.
//
// TESTBARHET: funktionerna tar in registreringen (ServiceWorkerRegistration) och klienten
// som argument i stället för att gräva i globala navigator.serviceWorker, så flödet kan
// köras i ett test med fakes (vi kan inte skapa en ÄKTA push-subscription i CI, men vi kan
// bevisa att rätt steg sker i rätt ordning + fail-loud-grenarna). Den faktiska
// browser-/leverans-skarven är manuell (iPhone), se HANDOFF.
//
// FAIL LOUD (PRINCIPLES §8): varje fel kastar med ett begripligt svenskt meddelande, så
// UI:t visar fel-vägen i stället för en tyst "ingenting hände".

import type { VmSupabaseClient } from '../../data/supabase-browser';
import { ensureSession } from '../../data/rooms/auth';
import { serializePushSubscription } from './push-subscription';
import { getNotificationApi } from './push-support';
import { urlBase64ToUint8Array, VAPID_PUBLIC_KEY } from './vapid';

/** Namnet på avsändar-edge-funktionen (EN sanning, så klient + deploy refererar samma). */
export const PUSH_SENDER_FUNCTION = 'push-sender';

/**
 * Begär notis-behörighet (måste ske på en användar-gest, anroparen säkerställer det).
 * Returnerar det resulterande permission-läget. Vi kastar inte på 'denied'/'default',
 * det är ett legitimt användarval som state-maskinen sedan visar ärligt.
 *
 * @param win  Window (injicerbart för test).
 */
export async function requestNotificationPermission(win: Window): Promise<NotificationPermission> {
  const notification = getNotificationApi(win);
  if (!notification) {
    // Unsupported: ingen Notification-API att begära från. Fail-loud hellre än en
    // tyst "granted" som ger en obegriplig subscribe-krasch senare.
    throw new Error('[VM2026] Notiser stöds inte i den här webbläsaren.');
  }
  return notification.requestPermission();
}

/**
 * Prenumerera enheten på push och returnera den råa PushSubscription.
 *
 * Idempotent mot webbläsaren: finns redan en aktiv prenumeration (getSubscription)
 * återanvänds den (samma enhet ska inte få två endpoints). Annars skapas en ny med
 * userVisibleOnly:true (push-tjänsterna KRÄVER att varje push visar en notis) +
 * applicationServerKey = den publika VAPID-nyckeln som Uint8Array.
 *
 * @param registration  Den aktiva service-worker-registreringen.
 */
export async function subscribeToPush(
  registration: ServiceWorkerRegistration
): Promise<PushSubscription> {
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return existing;
  }
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    // applicationServerKey vill ha en BufferSource. urlBase64ToUint8Array ger en
    // Uint8Array<ArrayBufferLike> som TS5.9:s nya generiska Uint8Array inte snävar till
    // ArrayBuffer av sig själv (känd lib.dom-friktion). En Uint8Array ÄR alltid en giltig
    // BufferSource i runtime, så vi snävar typen explicit, inte en beteende-ändring.
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  });
}

/**
 * Lagra en prenumeration i push_subscriptions (upsert på endpoint). Säkerställer en
 * session först (en anonym vän får sin auth.uid()), så RLS-checken (user_id = auth.uid())
 * kan binda raden. user_id sätts av DB-defaulten (auth.uid()), vi skickar det inte.
 *
 * onConflict: 'endpoint' = samma enhet som prenumererar igen ÄNDRAR sin rad i stället
 * för att skapa en dubblett (idempotent). user_agent lagras för framtida "den här
 * enheten"-UI (valfritt, null OK).
 *
 * @param client        Supabase-klienten.
 * @param subscription  Den råa PushSubscription att lagra.
 * @param userAgent     Valfri enhets-etikett (navigator.userAgent).
 */
export async function storeSubscription(
  client: VmSupabaseClient,
  subscription: PushSubscription,
  userAgent: string | null
): Promise<void> {
  await ensureSession(client);
  const { endpoint, p256dh, authKey } = serializePushSubscription(subscription);
  const { error } = await client
    .from('push_subscriptions')
    .upsert(
      { endpoint, p256dh, auth_key: authKey, user_agent: userAgent },
      { onConflict: 'endpoint' }
    );
  if (error) {
    throw new Error(`[VM2026] Kunde inte spara push-prenumerationen: ${error.message}`);
  }
}

/**
 * Avregistrera enheten (stäng av): avsluta browser-prenumerationen OCH radera raden.
 *
 * Vi raderar raden via endpoint (vår RLS släpper bara den egna raden ändå). Ordningen:
 * radera DB-raden först, sedan unsubscribe i browsern, så vi aldrig lämnar en endpoint
 * i DB:n som browsern redan glömt (en död rad push-sender skulle skicka till förgäves).
 * En saknad browser-prenumeration (redan av) är inte ett fel, vi raderar ändå raden.
 *
 * @param client        Supabase-klienten.
 * @param registration  Den aktiva service-worker-registreringen.
 */
export async function unsubscribeFromPush(
  client: VmSupabaseClient,
  registration: ServiceWorkerRegistration
): Promise<void> {
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    const { error } = await client
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', existing.endpoint);
    if (error) {
      throw new Error(`[VM2026] Kunde inte ta bort push-prenumerationen: ${error.message}`);
    }
    await existing.unsubscribe();
  }
}

/**
 * Skicka en TEST-notis till den inloggade användarens egna enhet(er), T85:s end-to-end-bevis.
 * Anropar push-sender {mode:'test'}; funktionen löser användaren ur JWT:n och skickar bara
 * till dennes egna prenumerationer (scoped till self, T89 gör utskick till andra).
 *
 * Säkerställer en session först så att en giltig JWT skickas med (funktionen kräver det).
 * FAIL LOUD: ett fel ur funktionen (500, nätfel) kastar, så UI:t kan visa det.
 *
 * @param client  Supabase-klienten (anon-session räcker; funktionen läser user ur JWT).
 */
export async function sendTestNotification(client: VmSupabaseClient): Promise<void> {
  await ensureSession(client);
  const { error } = await client.functions.invoke(PUSH_SENDER_FUNCTION, {
    body: { mode: 'test' },
  });
  if (error) {
    throw new Error(`[VM2026] Kunde inte skicka test-notisen: ${error.message ?? String(error)}`);
  }
}
