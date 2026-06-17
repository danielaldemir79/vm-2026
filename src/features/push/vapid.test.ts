import { describe, expect, it } from 'vitest';
import { urlBase64ToUint8Array, VAPID_PUBLIC_KEY } from './vapid';

describe('urlBase64ToUint8Array (VAPID-nyckel -> Uint8Array)', () => {
  it('konverterar den faktiska publika VAPID-nyckeln till 65 byte (okomprimerad P-256-punkt)', () => {
    const bytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    // En okomprimerad P-256-publiknyckel är exakt 65 byte (1 prefix-byte 0x04 + 32 + 32).
    // Det är den invariant pushManager.subscribe kräver; fel längd = trasig prenumeration.
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(65);
    // Okomprimerad punkt börjar med 0x04 (SEC1). En bra skarv-koll: bevisar att vi inte
    // bara fick "någon" buffer utan rätt format-prefix.
    expect(bytes[0]).toBe(0x04);
  });

  it('avkodar en känd base64url-sträng byte-exakt (inkl. URL-säkra tecken - och _)', () => {
    // "subjects?_d" -> base64 "c3ViamVjdHM_X2Q" i base64url-form (innehåller _ och saknar
    // padding). Bevisar BÅDE tecken-mappningen (_ -> /) OCH paddningen. Framräknat med
    // Buffer.from('subjects?_d').toString('base64url') = 'c3ViamVjdHM_X2Q'.
    const bytes = urlBase64ToUint8Array('c3ViamVjdHM_X2Q');
    const decoded = String.fromCharCode(...bytes);
    expect(decoded).toBe('subjects?_d');
  });

  it('hanterar - (base64url för +) korrekt', () => {
    // 0xfb 0xff 0xbf -> base64 "+/+/" -> base64url "-_-_" (alla tre URL-säkra substitut).
    // Framräknat: Buffer.from([0xfb,0xff,0xbf]).toString('base64url') === '-_-_'.
    const bytes = urlBase64ToUint8Array('-_-_');
    expect(Array.from(bytes)).toEqual([0xfb, 0xff, 0xbf]);
  });

  it('paddar en sträng vars längd inte är en multipel av 4', () => {
    // "Zg" (2 tecken, behöver "==") -> "f". Bevisar paddnings-grenen (rest 2).
    const bytes = urlBase64ToUint8Array('Zg');
    expect(String.fromCharCode(...bytes)).toBe('f');
  });

  it('kastar fail-loud på en ogiltig base64-sträng (ingen tyst trasig nyckel)', () => {
    // atob kastar på tecken utanför base64-alfabetet. Vi vill ha smällen, inte en
    // halv-avkodad nyckel som ger en obegriplig subscribe-krasch senare.
    expect(() => urlBase64ToUint8Array('@@@invalid@@@')).toThrow();
  });

  it('VAPID_PUBLIC_KEY är en base64url-sträng (inga +, /, eller = , URL-säker form)', () => {
    // Vakt mot att någon av misstag klistrar in en klassisk base64-nyckel (med +//=)
    // som applicationServerKey skulle avvisa i vissa browsers.
    expect(VAPID_PUBLIC_KEY).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
