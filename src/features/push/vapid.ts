// VAPID-nyckel + nyckel-konvertering för web-push (T85, #177).
//
// VAPID (Voluntary Application Server Identification) signerar push-meddelanden så
// push-tjänsten (FCM/APNs/Mozilla) litar på avsändaren. Nyckelparet har en PUBLIK och en
// PRIVAT del:
//   - PUBLIK nyckel: PUBLIK PER DESIGN. Klienten skickar den till webbläsaren i
//     pushManager.subscribe({ applicationServerKey }). Den får (och ska) ligga i koden,
//     precis som en publik anon-/publishable-nyckel, ingen hemlighet, inget att skydda.
//   - PRIVAT nyckel: HEMLIG. Den signerar utskicken server-side och bor BARA i app_config
//     (key 'vapid_private_key'), läst av push-sender-funktionen med service_role. Den
//     committas ALDRIG till repot (PRINCIPLES §7), samma mönster som api_football_key.
//
// Källa för publik-i-koden / privat-i-secret-store-uppdelningen: MDN "Push API" +
// web.dev "Web Push notifications" (VAPID-avsnittet). Källhänvisat i docs/decisions.md (T85).

/**
 * Den PUBLIKA VAPID-nyckeln (base64url, okomprimerad P-256-punkt, 65 byte -> 87 tecken).
 *
 * Genererad med `npx web-push generate-vapid-keys --json` (T85). Den MOTSVARANDE privata
 * nyckeln ligger BARA i app_config ('vapid_private_key'), aldrig här. Byts nyckelparet ut
 * måste BÅDA bytas tillsammans (publik här + privat i app_config), annars kan inte
 * push-sender verifiera prenumerationer som tecknats mot den gamla publika nyckeln.
 */
export const VAPID_PUBLIC_KEY =
  'BCIJXxSHbX8xfsuccSCq83nJs4kN3oUdWGav7_lflA35_orzSYrLpsC4G03xgYbUtZNH7f1swSr9J40dfmhgvKU';

/**
 * Konvertera en base64url-kodad VAPID-nyckel till den `Uint8Array`
 * `pushManager.subscribe` kräver i `applicationServerKey`.
 *
 * Webbläsarens Push-API tar emot nyckeln som rå byte-buffer (eller base64url-sträng i
 * nyare browsers), men `Uint8Array` är den brett stödda formen. Två steg:
 *   1. base64url -> base64: byt '-'/'_' mot '+'/'/' och padda till multipel av 4 med '='.
 *      base64url (RFC 4648 §5) är den URL-säkra varianten VAPID använder; atob() förstår
 *      bara klassisk base64.
 *   2. atob() avkodar till en binär sträng (ett tecken per byte) -> kopiera varje
 *      charCodeAt till en Uint8Array.
 *
 * REN funktion (inga sido-effekter, ingen DOM utöver globala atob), så konverteringen
 * enhetstestas direkt utan webbläsare, det är den lätt-fel-gissade biten (paddning,
 * tecken-mappning). Källa: web.dev "Subscribe a user" (exakt detta urlBase64ToUint8Array-
 * recept). Källhänvisat i docs/decisions.md (T85).
 *
 * @param base64UrlString  base64url-kodad nyckel (t.ex. VAPID_PUBLIC_KEY).
 * @returns                Nyckeln som Uint8Array.
 * @throws                 Om strängen inte är giltig base64 (atob kastar), fail-loud
 *                         hellre än en tyst trasig prenumeration.
 */
export function urlBase64ToUint8Array(base64UrlString: string): Uint8Array {
  // Padda till multipel av 4 (base64-krav). En tom rest ger ingen extra '='.
  const padding = '='.repeat((4 - (base64UrlString.length % 4)) % 4);
  const base64 = (base64UrlString + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
