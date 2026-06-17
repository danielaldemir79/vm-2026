// Custom push-hanterare för service workern (T85, #177).
//
// VARFÖR en separat fil importerad i workbox-SW:n: appen kör vite-plugin-pwa i
// generateSW-läge (workbox genererar service workern, vi byter INTE till injectManifest).
// generateSW tillåter att vi injicerar egna importScripts i den genererade SW:n via
// `workbox.importScripts` i vite.config.ts. Den här filen kopieras från public/ till
// dist-roten och importeras FÖRST i den genererade SW:n, så våra push-/notificationclick-
// lyssnare registreras i samma service-worker-scope som workbox precachen.
//
// Den körs i SERVICE WORKER-kontext (self = ServiceWorkerGlobalScope), INTE i appen. Den
// kan därför inte importera från src/ (annan körkontext, ingen bundling). Parse-regeln
// nedan SPEGLAR src/features/push/sw-payload.ts (parsePushPayload) , den filen + dess test
// är "källan" för regeln; den hålls extremt enkel och defensiv så de två kopiorna inte kan
// drifta meningsfullt. Se docs/decisions.md (T85).
//
// /* eslint-disable */ , detta är Deno/SW-fristående JS, inte en del av app-grafen (eslint
// ignorerar dessutom inte public/, men filen är ren JS utan typer; vi håller den minimal).

/* global self, clients */

// Default-notisen när payloaden saknas/är trasig (speglar DEFAULT_PUSH_NOTIFICATION i
// sw-payload.ts). En push UTAN giltig payload måste ändå visa NÅGOT (push-tjänsternas
// userVisibleOnly-kontrakt), annars kan prenumerationen straffas/avregistreras.
const DEFAULT_PUSH_NOTIFICATION = {
  title: 'VM 2026',
  body: 'Öppna appen för senaste nytt.',
  url: '/',
};

// Speglar parsePushPayload (src/features/push/sw-payload.ts): defensiv parse till en
// komplett {title, body, url}. Tom/icke-JSON/icke-objekt -> default; saknade fält fylls
// från default. Kastar ALDRIG (en kasta-krasch här skulle tappa notisen helt).
function parsePushPayload(raw) {
  if (!raw) {
    return DEFAULT_PUSH_NOTIFICATION;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_PUSH_NOTIFICATION;
  }
  if (typeof data !== 'object' || data === null) {
    return DEFAULT_PUSH_NOTIFICATION;
  }
  return {
    title: typeof data.title === 'string' ? data.title : DEFAULT_PUSH_NOTIFICATION.title,
    body: typeof data.body === 'string' ? data.body : DEFAULT_PUSH_NOTIFICATION.body,
    url: typeof data.url === 'string' ? data.url : DEFAULT_PUSH_NOTIFICATION.url,
  };
}

// PUSH: visa notisen. event.data?.text() ger den råa payloaden (vår server skickar
// JSON {title, body, url}). waitUntil håller SW:n vid liv tills notisen visats.
// Källa: MDN "PushEvent" + web.dev "Push notifications". Källhänvisat i decisions.md (T85).
self.addEventListener('push', (event) => {
  const raw = event.data ? event.data.text() : null;
  const payload = parsePushPayload(raw);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      // Ikon + badge ur de precachade PWA-ikonerna (finns i dist-roten). badge är monokrom
      // på Android-statusraden; icon är den stora bilden i notisen.
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      // data bär url:en vidare till notificationclick (annars förlorad efter visning).
      data: { url: payload.url },
    })
  );
});

// NOTIFICATIONCLICK: stäng notisen och FOKUSERA en redan öppen app-flik om en finns,
// annars öppna en ny på url:en. Standard-mönstret (web.dev "Notification behaviour"):
// matcha mot öppna klienter, fokusera den första, annars openWindow. Källhänvisat i
// decisions.md (T85).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // Fokusera en befintlig app-flik om en finns (focus kan saknas i någon miljö).
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
