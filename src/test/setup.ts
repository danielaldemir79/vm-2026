// Global testuppsättning för Vitest.
// jest-dom ger läsbara DOM-assertions (t.ex. toBeInTheDocument) och rensas
// automatiskt mellan tester av @testing-library/react.
import '@testing-library/jest-dom/vitest';
import { MotionGlobalConfig } from 'motion/react';
import { vi } from 'vitest';

// Gör ALL motion-animation momentan i testmiljön (deterministisk svit).
//
// VARFÖR: motion-komponenter (motion.div m.fl.) kör annars sina in-animationer
// asynkront över rAF-loopen. När en panel villkorsrenderas bort (t.ex. lag-
// profilen vid Escape) hinner en sådan animation/teardown ibland inte slutföras
// innan testet assertar att dialogen är borta, vilket gör tester intermittent
// flaky under full svit-last (#10, T10). skipAnimations löser detta vid roten:
// motion sätter slut-värdet direkt och hoppar över tweening helt, så öppning OCH
// stängning är synkrona i jsdom. Detta skyddar HELA sviten (alla nuvarande och
// framtida motion-tester), inte bara den ena panelen, och är inte ett timeout-
// plåster, utan tar bort tidsberoendet. Vi rör inte produktionsbeteendet.
MotionGlobalConfig.skipAnimations = true;

// jsdom saknar matchMedia. Både tema-systemet (prefers-color-scheme) och
// motion (prefers-reduced-motion) anropar window.matchMedia, så vi ger en
// neutral standard-stub: inga preferenser matchar (matches: false). Enskilda
// tester som behöver en specifik preferens kan spionera över denna.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
