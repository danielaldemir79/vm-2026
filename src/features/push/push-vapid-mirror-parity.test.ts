// @vitest-environment node
//
// Kör i NODE-miljön (inte jsdom): esbuild kräver en äkta TextEncoder/Uint8Array-invariant
// som jsdom bryter (samma skäl som livescore v3-mirror-parity). Detta test rör ingen DOM.
//
// MIRROR-PARITETSTEST (T85, #177): bevisa att Deno-mirror:n
// supabase/functions/_shared/push-vapid.ts ger EXAKT samma JWK-par som src-originalet
// src/features/push/vapid-jwk.ts för en battericuppsättning RAW VAPID-nycklar.
//
// VARFÖR (patterns.md "ren-logik-i-src-speglad-till-edge-funktion..."): mirror:n typas/lintas
// INTE av app-grafen och importeras bara av den @ts-nocheck:ade push-sender (körs inte i CI).
// En synk-kommentar är en mänsklig påminnelse, ingen grind , en en-sidig redigering driver
// isär tills en riktig push-sändning avvisas av push-tjänsten (fel nyckel). DETTA test är
// grinden: vi bundlar mirror-filen med esbuild och kör samma indata mot båda.

import { build } from 'esbuild';
import { beforeAll, describe, expect, it } from 'vitest';
import { rawVapidToJwkPair as srcConvert, type VapidJwkPair } from './vapid-jwk';

interface MirrorModule {
  rawVapidToJwkPair: (pub: string, priv: string) => VapidJwkPair;
}

let mirror: MirrorModule;

beforeAll(async () => {
  const result = await build({
    entryPoints: ['supabase/functions/_shared/push-vapid.ts'],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
  });
  const code = result.outputFiles[0].text;
  const dataUrl = `data:text/javascript,${encodeURIComponent(code)}`;
  mirror = (await import(/* @vite-ignore */ dataUrl)) as MirrorModule;
});

/** Generera ett färskt P-256-par och ge dess RAW base64url-former (som web-push ger). */
async function freshRawKeys(): Promise<{ pub: string; priv: string }> {
  const subtle = globalThis.crypto.subtle;
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const rawPub = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  const jwkPriv = await subtle.exportKey('jwk', pair.privateKey);
  let s = '';
  for (const b of rawPub) s += String.fromCharCode(b);
  const pub = btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { pub, priv: jwkPriv.d as string };
}

describe('push-vapid mirror-paritet (Deno-mirror == src)', () => {
  it('ger identiskt JWK-par för flera färska nyckelpar', async () => {
    for (let i = 0; i < 5; i += 1) {
      const { pub, priv } = await freshRawKeys();
      expect(mirror.rawVapidToJwkPair(pub, priv)).toEqual(srcConvert(pub, priv));
    }
  });

  it('mirror:n kastar på samma ogiltiga indata som src (fel publik-längd)', () => {
    const badPub = 'abc';
    const priv = 'x'.repeat(43);
    expect(() => srcConvert(badPub, priv)).toThrow();
    expect(() => mirror.rawVapidToJwkPair(badPub, priv)).toThrow();
  });

  it('NEGATIV KONTROLL: en muterad mirror skulle faila (testet vaktar på riktigt)', async () => {
    // Bevisa att paritets-assertionen kan RÖDNA: jämför src mot ett medvetet FEL resultat
    // (x och y omkastade). Ett test som aldrig kan faila vaktar ingenting (befordrad regel).
    const { pub, priv } = await freshRawKeys();
    const correct = srcConvert(pub, priv);
    const swapped = {
      ...correct,
      publicKey: { ...correct.publicKey, x: correct.publicKey.y, y: correct.publicKey.x },
    };
    expect(swapped).not.toEqual(correct);
  });
});
