import { describe, expect, it } from 'vitest';
import { VM_2026_MANIFEST } from './app-manifest';

// Källankrat test för WebAPK-MINTNINGSKRAVEN (T30/#50). Detta är inte coverage-
// jakt: manifestet avgör om Chrome lyckas minta en RIKTIG WebAPK vid Android-
// installation (i stället för en legacy genvägs-APK som Play Protect flaggar
// hårdare). Varje assertion nedan motsvarar ett dokumenterat krav i decisions.md
// (T30), så en framtida hand-edit som bryter ett krav failar här i stället för
// att tyst försämra delnings-upplevelsen.
//
// Källor (se decisions.md T30): web.dev "Add a web app manifest" (id + ikoner),
// Chrome Lighthouse "installable-manifest" / "maskable-icon" (192+512, maskable),
// progressier/DEV "why an icon shouldn't be 'any maskable'" (separat maskable).

// `sizes` är enligt W3C App Manifest en WHITESPACE-separerad mängd tokens (t.ex.
// "192x192 512x512"), där varje token antingen är "any" eller WxH (case-insensitivt
// x). En ENDA ikon kan alltså deklarera flera storlekar. Källa: W3C App Manifest,
// "sizes member" (https://www.w3.org/TR/appmanifest/). Därför parsar vi varje
// sizes-sträng spec-troget i stället för att jämföra hela strängen exakt, annars
// vaktar testet en SVAGARE invariant än kravet (jfr senior-developer-lessons).

/** En parsad WxH-storlek i råa pixlar (token "any" -> width/height = Infinity). */
interface ParsedSize {
  width: number;
  height: number;
}

/**
 * Parsar en W3C `sizes`-sträng till dess enskilda storlekar. Splittar på godtycklig
 * whitespace (spec: "space-separated tokens"), tål "any", och ignorerar tomma tokens.
 */
function parseSizes(sizes: string): ParsedSize[] {
  return sizes
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => {
      if (token.toLowerCase() === 'any') {
        return { width: Infinity, height: Infinity };
      }
      const [w, h] = token.toLowerCase().split('x');
      return { width: Number(w), height: Number(h) };
    });
}

/** Sant om någon av ikonens deklarerade storlekar är minst minPx x minPx. */
function hasSizeAtLeast(icon: { sizes: string }, minPx: number): boolean {
  return parseSizes(icon.sizes).some((size) => size.width >= minPx && size.height >= minPx);
}

/** Sant om någon av ikonens deklarerade storlekar är exakt px x px. */
function hasExactSize(icon: { sizes: string }, px: number): boolean {
  return parseSizes(icon.sizes).some((size) => size.width === px && size.height === px);
}

describe('VM_2026_MANIFEST, WebAPK-mintningskrav', () => {
  it('har en stabil app-identitet (id satt, inte tom)', () => {
    // id frikopplar app-identiteten från start_url. Utan id default:ar den till
    // start_url och en framtida start_url-ändring skulle räknas som en NY app
    // (ny WebAPK, tappad install). web.dev rekommenderar att sätta den explicit.
    expect(VM_2026_MANIFEST.id).toBeTruthy();
    expect(typeof VM_2026_MANIFEST.id).toBe('string');
  });

  it('är installerbar: standalone display + start_url + scope satta', () => {
    expect(VM_2026_MANIFEST.display).toBe('standalone');
    expect(VM_2026_MANIFEST.start_url).toBeTruthy();
    expect(VM_2026_MANIFEST.scope).toBeTruthy();
  });

  it('har namn-fält som WebAPK behöver (name + short_name)', () => {
    expect(VM_2026_MANIFEST.name).toBeTruthy();
    expect(VM_2026_MANIFEST.short_name).toBeTruthy();
  });

  it('uppfyller Chromiums ikon-krav: minst en 192x192 OCH en 512x512', () => {
    // Spec-troget: en sizes-sträng kan lista FLERA storlekar ("192x192 512x512"),
    // så vi parsar varje token i stället för att jämföra hela strängen exakt. En
    // 192-storlek deklarerad i en multi-size-ikon räknas alltså, precis som Chrome
    // tolkar den. (W3C App Manifest, sizes member.)
    expect(VM_2026_MANIFEST.icons.some((icon) => hasExactSize(icon, 192))).toBe(true);
    expect(VM_2026_MANIFEST.icons.some((icon) => hasExactSize(icon, 512))).toBe(true);
  });

  it('har EXAKT en maskable-ikon (adaptiv Android-ikon), minst 512x512', () => {
    const maskable = VM_2026_MANIFEST.icons.filter((icon) => icon.purpose === 'maskable');
    expect(maskable).toHaveLength(1);
    // Kravet är MINST 512x512, inte exakt 512x512 (Lighthouse maskable-icon-audit).
    // Vi parsar bredd/höjd numeriskt och assertar >= 512, så en större maskable-ikon
    // (t.ex. 1024x1024) också passerar i stället för att felaktigt failas.
    expect(hasSizeAtLeast(maskable[0], 512)).toBe(true);
  });

  it('använder ALDRIG den skadliga kombinerade purpose "any maskable"', () => {
    // En maskable-ikon har säkerhetszon-padding; återanvänd som "any" ser den
    // för inzoomad ut. Därför hålls maskable SKILD från any-ikonerna. Vakta att
    // ingen ikon bär en kombinerad/space-separerad purpose med "any".
    for (const icon of VM_2026_MANIFEST.icons) {
      if (icon.purpose !== undefined) {
        expect(icon.purpose).toBe('maskable');
        expect(icon.purpose).not.toContain('any');
        expect(icon.purpose).not.toContain(' ');
      }
    }
  });

  it('har minst en vanlig ("any") ikon utan purpose, skild från maskable', () => {
    // Mintningen + hemskärms-ikonen vill ha en ren any-ikon också, inte bara den
    // maskable. Här: de två png-ikonerna utan purpose-fält.
    const anyIcons = VM_2026_MANIFEST.icons.filter((icon) => icon.purpose === undefined);
    expect(anyIcons.length).toBeGreaterThanOrEqual(1);
  });
});
