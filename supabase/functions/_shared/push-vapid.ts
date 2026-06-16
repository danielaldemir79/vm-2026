// RAW VAPID base64url -> JWK-konvertering , DENO-MIRROR av src/features/push/vapid-jwk.ts (T85, #177).
//
// SYNK (HARD): den här filen MÅSTE vara beteende-identisk med src/features/push/vapid-jwk.ts.
// Edge-funktionen (push-sender) kan inte importera src/, så konverteringen finns dubbelt.
// En en-sidig redigering driver isär utan att något rödnar förrän en riktig push-sändning
// (fel nyckel -> push-tjänsten avvisar). GRINDEN: src/features/push/push-vapid-mirror-parity.test.ts
// bundlar den HÄR filen med esbuild och kör samma indata mot båda , en divergens failar i CI.
// Ändrar du konverteringen: ändra BÅDA filerna och kör paritets-testet.
//
// Format-bevis (Web Crypto signera/verifiera-prob): se src-filen + docs/decisions.md (T85).

export interface EcJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
  d?: string;
  ext: boolean;
}

export interface VapidJwkPair {
  publicKey: EcJwk;
  privateKey: EcJwk;
}

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

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

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
