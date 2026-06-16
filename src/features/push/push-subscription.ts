// Prenumerations-serialisering + payload-formatering för web-push (T85, #177). REN logik
// (ingen DOM, inga sido-effekter), så de lätt-fel-gissade transformationerna enhetstestas
// direkt: en webbläsares PushSubscription -> de fält vår tabell + push-sender behöver, och
// notis-payloadens form ({title, body, url}).

/** Raden vi lagrar i push_subscriptions (klient-formen, camelCase). */
export interface PushSubscriptionRow {
  /** Push-tjänstens unika endpoint-URL (FCM/APNs/Mozilla). UNIQUE i tabellen. */
  endpoint: string;
  /** Klientens publika P-256-nyckel (base64url) , krypterar nyttolasten till just denna enhet. */
  p256dh: string;
  /** Klientens auth-hemlighet (base64url) , del av web-push-krypteringen (RFC 8291). */
  authKey: string;
}

/** Notis-nyttolastens form (det push-sender skickar och service workern parsar). */
export interface PushPayload {
  title: string;
  body: string;
  /** Vart notis-klicket ska öppna/fokusera (absolut eller app-relativ URL). */
  url: string;
}

/**
 * Plocka ut de lagrings-fält vi behöver ur en webbläsares `PushSubscription`.
 *
 * En `PushSubscription` bär `endpoint` + krypteringsnycklar (`getKey('p256dh')`,
 * `getKey('auth')`) som rå `ArrayBuffer`. Vår tabell + web-push-biblioteket vill ha dem
 * som base64url-strängar. Vi läser dem via `subscription.toJSON()` (standardiserad form,
 * `keys.p256dh` / `keys.auth` redan base64url-kodade) i stället för att hand-koda
 * ArrayBuffer -> base64url, så vi inte kan stava fel i en byte-loop.
 *
 * FAIL-LOUD: saknar JSON-formen endpoint eller någon nyckel är prenumerationen oduglig
 * (kan inte lagras eller skickas till), så vi kastar i stället för att lagra en halv rad
 * som ger en tyst leverans-miss senare. Källa: MDN "PushSubscription.toJSON()".
 *
 * @param subscription  Resultatet av pushManager.subscribe()/getSubscription().
 * @returns             { endpoint, p256dh, authKey } redo att upsertas.
 * @throws              Om endpoint eller någon nyckel saknas.
 */
export function serializePushSubscription(subscription: PushSubscription): PushSubscriptionRow {
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const authKey = json.keys?.auth;

  if (!endpoint || !p256dh || !authKey) {
    throw new Error(
      '[VM2026] Prenumerationen saknar endpoint eller krypteringsnycklar , kan inte lagras ' +
        '(oduglig PushSubscription).'
    );
  }
  return { endpoint, p256dh, authKey };
}

/**
 * Bygg test-notisens nyttolast (T85:s end-to-end-bevis). En ren fabrik, så formen är EN
 * sanning som både klient-test och (via samma fält) service workern delar. Den faktiska
 * mål-notisen (T89) får sin egen fabrik; detta är bara fundamentets självtest.
 *
 * url default = appens rot ('/'), så ett klick på test-notisen fokuserar/öppnar appen.
 */
export function buildTestNotificationPayload(): PushPayload {
  return {
    title: 'VM 2026',
    body: 'Test-notis , notiserna fungerar! Du får en pling när det blir mål.',
    url: '/',
  };
}
