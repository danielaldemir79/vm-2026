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
    const sizes = VM_2026_MANIFEST.icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('har EXAKT en maskable-ikon (adaptiv Android-ikon), minst 512x512', () => {
    const maskable = VM_2026_MANIFEST.icons.filter((icon) => icon.purpose === 'maskable');
    expect(maskable).toHaveLength(1);
    // En maskable-ikon ska vara minst 512x512 (Lighthouse maskable-icon-audit).
    expect(maskable[0].sizes).toBe('512x512');
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
