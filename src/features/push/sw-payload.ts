// Service-worker payload-parsning (T85, #177). REN logik, så den lätt-fel-gissade biten
// (parsa en push-event-payload robust, falla tillbaka när den är tom/trasig) enhetstestas
// utan en service-worker-miljö.
//
// VIKTIGT om duplicering: service workern (public/custom-push-sw.js) kan INTE importera
// från src/ (den är en fristående, workbox-importerad fil i en annan körkontext). Den
// hand-implementerar därför SAMMA parse-regel inline. Den här filen är "källan" för regeln
// + dess test; SW-filen speglar den med en kort kommentar som pekar hit (samma
// mirror-anda som _shared edge-mirror:erna, fast minimal, parse-regeln är några rader).
// Det är därför parse-regeln hålls extremt enkel och defensiv, så de två kopiorna inte
// kan drifta meningsfullt. Se docs/decisions.md (T85).

import type { PushPayload } from './push-subscription';

/**
 * En notis redo att visas (parse-resultatet). Samma fält som PushPayload, men efter
 * defensiv normalisering: title/body/url är ALLTID strängar (aldrig undefined), så
 * showNotification och notificationclick aldrig får en trasig form.
 */
export type ParsedPushNotification = Required<PushPayload>;

/**
 * Standard-notisen när payloaden är tom eller trasig. En push UTAN giltig payload ska
 * ändå visa NÅGOT (en tom push som inte visar en notis bryter mot push-tjänsternas
 * "userVisibleOnly"-kontrakt och kan straffa prenumerationen). Lugn, generisk text.
 */
export const DEFAULT_PUSH_NOTIFICATION: ParsedPushNotification = {
  title: 'VM 2026',
  body: 'Öppna appen för senaste nytt.',
  url: '/',
};

/**
 * Parsa en push-events råa data-sträng (`event.data?.text()`) till en visningsbar notis.
 *
 * DEFENSIV (push-payloaden kommer utifrån, från vår server, men formen kan vara tom,
 * icke-JSON, eller sakna fält):
 *   - null/undefined/tom sträng -> default-notisen.
 *   - icke-JSON -> default-notisen (ingen kasta-krasch i SW:n, som tappar notisen helt).
 *   - JSON utan title/body/url -> fyll luckor från default (en delvis payload visar ändå
 *     det den har).
 *
 * @param raw  event.data?.text() (eller null/undefined om event.data saknas).
 * @returns    En komplett, visningsbar notis (alla fält strängar).
 */
export function parsePushPayload(raw: string | null | undefined): ParsedPushNotification {
  if (!raw) {
    return DEFAULT_PUSH_NOTIFICATION;
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_PUSH_NOTIFICATION;
  }
  if (typeof data !== 'object' || data === null) {
    return DEFAULT_PUSH_NOTIFICATION;
  }
  const obj = data as Record<string, unknown>;
  return {
    title: typeof obj.title === 'string' ? obj.title : DEFAULT_PUSH_NOTIFICATION.title,
    body: typeof obj.body === 'string' ? obj.body : DEFAULT_PUSH_NOTIFICATION.body,
    url: typeof obj.url === 'string' ? obj.url : DEFAULT_PUSH_NOTIFICATION.url,
  };
}
