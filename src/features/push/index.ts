// Publik yta för push-modulen (T85, #177): web-push-fundamentet (mål-notiser).
// App importerar härifrån så intern struktur kan ändras utan att bryta call-sites.

// Opt-in-sektionen för Mer-fliken (UI).
export { PushOptInSection } from './PushOptInSection';
export type { PushOptInSectionProps } from './PushOptInSection';

// Hook + API-typen (för test/injektion).
export { usePush } from './use-push';
export type { PushApi } from './use-push';

// Ren state-maskin + kontext-läsning (enhetstestad).
export { resolvePushOptInState, readPushOptInContext, isPushSupported } from './push-support';
export type { PushOptInState, PushOptInContext } from './push-support';

// VAPID (publik nyckel + konvertering). Privatnyckeln finns ALDRIG här (app_config).
export { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from './vapid';

// Raw VAPID -> JWK-konvertering (delas av edge-funktionen via _shared-mirror:n).
export { rawVapidToJwkPair } from './vapid-jwk';
export type { EcJwk, VapidJwkPair } from './vapid-jwk';

// Prenumerations-serialisering + payload-form (delas av klient + SW-parsning).
export { serializePushSubscription, buildTestNotificationPayload } from './push-subscription';
export type { PushSubscriptionRow, PushPayload } from './push-subscription';

// Service-worker payload-parsning (samma regel SW-filen speglar inline).
export { parsePushPayload, DEFAULT_PUSH_NOTIFICATION } from './sw-payload';
export type { ParsedPushNotification } from './sw-payload';
