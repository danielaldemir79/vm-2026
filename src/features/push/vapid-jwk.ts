// Raw VAPID base64url -> JWK-konvertering (T85, #177). REN logik, så den gissningskänsliga
// byte-uppdelningen (uncompressed EC-punkt -> x/y, privat d) enhetstestas direkt OCH bevisas
// importerbar i Web Crypto (vapid-jwk.test.ts kör en signera/verifiera-prob).
//
// VARFÖR: app_config lagrar VAPID-nycklarna i RAW base64url-form (precis som `web-push
// generate-vapid-keys --json` ger dem, samma "secret i app_config"-mönster som
// api_football_key). Men @negrel/webpush (Deno-libben push-sender använder) importerar dem
// som JWK (ECDSA P-256). Den här filen är konverteringen mellan de två formerna, och den
// SPEGLAS till supabase/functions/_shared/push-vapid.ts (edge-funktionen kan inte importera
// src/), bevisad identisk av push-vapid-mirror-parity.test.ts.
//
// FORMAT (bevisat mot Web Crypto, gissa-aldrig-prob i testet + decisions.md):
//   * Publik nyckel: 65 byte, okomprimerad SEC1-punkt 0x04 || X(32) || Y(32). JWK x = X,
//     y = Y (var och en base64url-kodad).
//   * Privat nyckel: 32 byte skalär d. JWK lägger till d ovanpå samma x/y.
//   Källa: RFC 8292 (VAPID) + W3C Push API + Web Crypto EC JWK (kty:'EC', crv:'P-256').

/** En JWK för en EC P-256-nyckel (publik: x/y; privat: + d). */
export interface EcJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
  d?: string;
  ext: boolean;
}

/** Paret @negrel/webpush.importVapidKeys förväntar sig. */
export interface VapidJwkPair {
  publicKey: EcJwk;
  privateKey: EcJwk;
}

/** base64url -> bytes (RFC 4648 §5). Paddar + byter URL-säkra tecken, sedan atob. */
function base64UrlToBytes(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

/** bytes -> base64url (ingen padding), så x/y/d hamnar i JWK-formen JWK kräver. */
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Konvertera RAW base64url VAPID-nycklar till JWK-paret @negrel/webpush importerar.
 *
 * @param publicKeyRaw   Publik nyckel (okomprimerad P-256-punkt, base64url, 65 byte).
 * @param privateKeyRaw  Privat nyckel (32-byte skalär d, base64url).
 * @returns              { publicKey, privateKey } i EC P-256 JWK-form.
 * @throws               Vid fel längd , en felaktig nyckel ska smälla här (fail-loud),
 *                       inte ge en obegriplig krypto-krasch djupare ner.
 */
export function rawVapidToJwkPair(publicKeyRaw: string, privateKeyRaw: string): VapidJwkPair {
  const pub = base64UrlToBytes(publicKeyRaw);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error(
      `[VM2026] Ogiltig VAPID-publiknyckel: förväntade 65 byte okomprimerad punkt (0x04-prefix), fick ${pub.length} byte.`
    );
  }
  const priv = base64UrlToBytes(privateKeyRaw);
  if (priv.length !== 32) {
    throw new Error(
      `[VM2026] Ogiltig VAPID-privatnyckel: förväntade 32 byte, fick ${priv.length} byte.`
    );
  }

  const x = bytesToBase64Url(pub.subarray(1, 33));
  const y = bytesToBase64Url(pub.subarray(33, 65));
  const d = bytesToBase64Url(priv);

  return {
    publicKey: { kty: 'EC', crv: 'P-256', x, y, ext: true },
    privateKey: { kty: 'EC', crv: 'P-256', x, y, d, ext: true },
  };
}
