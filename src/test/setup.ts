// Global testuppsättning för Vitest.
// jest-dom ger läsbara DOM-assertions (t.ex. toBeInTheDocument) och rensas
// automatiskt mellan tester av @testing-library/react.
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

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
