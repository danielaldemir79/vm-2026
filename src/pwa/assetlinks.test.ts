import { describe, expect, it } from 'vitest';
// Den FAKTISKA filen som serveras på /.well-known/assetlinks.json laddas som rå
// sträng (Vites ?raw, samma mönster som data-source-testet), så testet vaktar
// exakt det innehåll som hamnar i dist/ , inte en kopia som kan drifta. Den
// relativa vägen pekar ut ur src/pwa till public/.well-known.
import assetlinksRaw from '../../public/.well-known/assetlinks.json?raw';

// Källankrat test för TWA-förberedelsens Digital Asset Links-fil (T36/#64).
//
// assetlinks.json kopplar en framtida Trusted Web Activity (Android-app) till den
// här sajten. Formatet får INTE gissas , det är en W3C/Google-specad struktur som
// Android verifierar bokstavligt. Källor (se docs/decisions.md T36):
//   - Chrome for Developers, "Android Concepts for Web Developers"
//     (https://developer.chrome.com/docs/android/trusted-web-activity/android-for-web-devs):
//     relation = "delegate_permission/common.handle_all_urls", namespace = "android_app".
//   - PWABuilder pwabuilder-google-play/Asset-links.md: target-objektets fält.
//
// Testet bevisar (a) att filen är GILTIG JSON (en trasig fil bryter verifieringen
// tyst i produktion, build/deploy skulle inte fånga det), (b) att den har den
// EXAKTA struktur Android kräver, och (c) att fingerprinten fortfarande är den
// MEDVETNA platshållaren , så ingen råkar tro att TWA:n är verifierad innan Daniel
// fyllt i den riktiga Play-App-Signing-fingerprinten.

/** Den platshållar-markör som måste bytas ut efter signering (se README + guide). */
const PLACEHOLDER_MARKER = 'PLACEHOLDER';

interface AssetLinkTarget {
  namespace: string;
  package_name: string;
  sha256_cert_fingerprints: string[];
}

interface AssetLinkStatement {
  relation: string[];
  target: AssetLinkTarget;
}

describe('assetlinks.json, Digital Asset Links för TWA (T36/#64)', () => {
  it('är giltig JSON (annars bryts TWA-verifieringen tyst i produktion)', () => {
    expect(() => JSON.parse(assetlinksRaw)).not.toThrow();
  });

  it('är en icke-tom array av statements (Digital Asset Links-format)', () => {
    const parsed = JSON.parse(assetlinksRaw) as unknown;
    expect(Array.isArray(parsed)).toBe(true);
    expect((parsed as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it('har den EXAKTA relation + namespace Android kräver för en TWA', () => {
    const [statement] = JSON.parse(assetlinksRaw) as AssetLinkStatement[];
    // relation MÅSTE vara exakt denna sträng (Chrome for Developers, TWA-docs).
    expect(statement.relation).toEqual(['delegate_permission/common.handle_all_urls']);
    // namespace MÅSTE vara "android_app" (det är en Android-app vi länkar till).
    expect(statement.target.namespace).toBe('android_app');
  });

  it('har ett package_name och minst en fingerprint-post (rätt form)', () => {
    const [statement] = JSON.parse(assetlinksRaw) as AssetLinkStatement[];
    expect(statement.target.package_name).toBeTruthy();
    expect(typeof statement.target.package_name).toBe('string');
    expect(Array.isArray(statement.target.sha256_cert_fingerprints)).toBe(true);
    expect(statement.target.sha256_cert_fingerprints.length).toBeGreaterThanOrEqual(1);
  });

  it('bär fortfarande PLATSHÅLLAR-fingerprinten (inte en riktig nyckel än)', () => {
    // Skydd mot att tro att TWA:n är klar: fingerprinten sätts först EFTER att
    // appen signerats med Daniels Play-konto (Play App Signing). Skulle någon byta
    // in en riktig fingerprint utan att gå hela vägen (eller av misstag committa
    // fel nyckel) ska detta test påminna om att det är ett MEDVETET Daniel-steg.
    // När Daniel fyller i den riktiga: uppdatera detta test till att asserta det
    // riktiga formatet (32 kolon-separerade hex-byte) i stället, det är pinnen.
    const [statement] = JSON.parse(assetlinksRaw) as AssetLinkStatement[];
    expect(statement.target.sha256_cert_fingerprints[0]).toContain(PLACEHOLDER_MARKER);
  });
});
