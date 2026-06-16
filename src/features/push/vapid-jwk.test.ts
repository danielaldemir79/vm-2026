import { describe, expect, it } from 'vitest';
import { rawVapidToJwkPair } from './vapid-jwk';
import { VAPID_PUBLIC_KEY } from './vapid';

// Det FAKTISKA nyckelparet (publik = den committade konstanten; privat = den i app_config).
// Privatnyckeln är PUBLIK PER TEST här bara som testfixtur , den är INTE en hemlighet i
// koden (hemligheten lever i app_config; detta är samma nyckel men testet bevisar bara
// konverteringen, det committas ingen produktionshemlighet via denna sträng eftersom den
// publika konstanten + en testskalar inte räcker för att... nej: detta ÄR privatnyckeln.)
// VIKTIGT: vi committar INTE privatnyckeln. Testet genererar därför sitt EGET nyckelpar
// (subtle.generateKey + exportKey raw) och konverterar DET, så ingen produktionshemlighet
// hamnar i repot. Konverteringen är nyckel-agnostisk, så det bevisar regeln lika väl.

const subtle = globalThis.crypto.subtle;
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const;

/** Generera ett färskt P-256-par och returnera dess RAW base64url-former (som web-push ger). */
async function freshRawKeys(): Promise<{ publicKeyRaw: string; privateKeyRaw: string }> {
  const pair = await subtle.generateKey(ECDSA, true, ['sign', 'verify']);
  const rawPub = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  const jwkPriv = await subtle.exportKey('jwk', pair.privateKey);
  return {
    publicKeyRaw: toB64Url(rawPub),
    // d ur JWK är redan base64url , exakt formen web-push lagrar privatnyckeln i.
    privateKeyRaw: jwkPriv.d as string,
  };
}

function toB64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('rawVapidToJwkPair', () => {
  it('GISSA-ALDRIG-PROB: den konverterade JWK:n importeras i Web Crypto och paret signerar/verifierar', async () => {
    const { publicKeyRaw, privateKeyRaw } = await freshRawKeys();
    const { publicKey, privateKey } = rawVapidToJwkPair(publicKeyRaw, privateKeyRaw);

    // Importera båda , detta är det enda som verkligen bevisar att x/y/d är rätt placerade.
    const pubKey = await subtle.importKey('jwk', publicKey, ECDSA, true, ['verify']);
    const privKey = await subtle.importKey('jwk', privateKey, ECDSA, false, ['sign']);

    // Sign/verify-paritet: bevisar att d hör ihop med x/y (annars verifierar inte signaturen).
    const msg = new TextEncoder().encode('vapid');
    const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privKey, msg);
    const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, sig, msg);
    expect(ok).toBe(true);
  });

  it('raw-roundtrip: exporterar publik nyckeln raw och får tillbaka EXAKT ursprungssträngen', async () => {
    const { publicKeyRaw, privateKeyRaw } = await freshRawKeys();
    const { publicKey } = rawVapidToJwkPair(publicKeyRaw, privateKeyRaw);
    const pubKey = await subtle.importKey('jwk', publicKey, ECDSA, true, ['verify']);
    const rawOut = new Uint8Array(await subtle.exportKey('raw', pubKey));
    expect(toB64Url(rawOut)).toBe(publicKeyRaw);
  });

  it('sätter de statiska JWK-fälten (kty/crv/ext) och d bara på privatnyckeln', async () => {
    const { publicKeyRaw, privateKeyRaw } = await freshRawKeys();
    const { publicKey, privateKey } = rawVapidToJwkPair(publicKeyRaw, privateKeyRaw);
    expect(publicKey.kty).toBe('EC');
    expect(publicKey.crv).toBe('P-256');
    expect(publicKey.d).toBeUndefined();
    expect(privateKey.d).toBeTruthy();
    // x/y delas mellan publik och privat (samma punkt).
    expect(privateKey.x).toBe(publicKey.x);
    expect(privateKey.y).toBe(publicKey.y);
  });

  it('kastar fail-loud på fel publik-nyckel-längd (inte en obegriplig krypto-krasch)', () => {
    // Den committade publika konstanten ÄR 65 byte; en avhuggen variant ska smälla tydligt.
    const truncated = VAPID_PUBLIC_KEY.slice(0, 20);
    expect(() => rawVapidToJwkPair(truncated, 'x'.repeat(43))).toThrow(/publiknyckel/i);
  });

  it('kastar fail-loud på fel privat-nyckel-längd', async () => {
    const { publicKeyRaw } = await freshRawKeys();
    // En 16-byte (för kort) privat nyckel.
    const shortPriv = toB64Url(new Uint8Array(16));
    expect(() => rawVapidToJwkPair(publicKeyRaw, shortPriv)).toThrow(/privatnyckel/i);
  });

  it('den committade publika VAPID-konstanten är en giltig 65-byte-punkt (importbar)', async () => {
    // Bevisar att den FAKTISKA publika konstanten i koden duger som application server key,
    // utan att röra privatnyckeln. Vi parar den med en genererad d bara för formens skull;
    // importen av publik-delen är det som bevisas (en trasig konstant skulle kasta här).
    const { privateKeyRaw } = await freshRawKeys();
    // Den riktiga publika nyckeln + en ICKE-matchande d: publik-importen ska ändå lyckas
    // (d rör bara privat-importen). Vi importerar bara publik-delen.
    const { publicKey } = rawVapidToJwkPair(VAPID_PUBLIC_KEY, privateKeyRaw);
    const pubKey = await subtle.importKey('jwk', publicKey, ECDSA, true, ['verify']);
    expect(pubKey.type).toBe('public');
  });
});
