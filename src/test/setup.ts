// Global testuppsättning för Vitest.
// jest-dom ger läsbara DOM-assertions (t.ex. toBeInTheDocument) och rensas
// automatiskt mellan tester av @testing-library/react.
import '@testing-library/jest-dom/vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionGlobalConfig, useReducedMotion } from 'motion/react';
import { vi } from 'vitest';

// virtual:pwa-register finns BARA i ett riktigt Vite-bygge, inte i Vitest. Tester
// som monterar hela appen (App.test) går via den riktiga useAppUpdate ->
// registerAppSw som dynamiskt importerar modulen. Vi mockar den globalt till en
// no-op registerSW så app-monteringen inte försöker lösa ett obefintligt modul-id.
// useAppUpdate-LOGIKEN testas separat mot en INJICERAD fake-register
// (use-app-update.test.tsx), så denna mock döljer inget beteende, den gör bara
// monterings-seam:et inert (T43/#74).
vi.mock('virtual:pwa-register', () => ({
  registerSW: () => async () => {},
}));

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

// jsdom saknar IntersectionObserver (scroll-spy:n, T78) OCH ResizeObserver (sektions-
// navets band-höjd-mätning, T78). Vi ger en inert, återanvändbar stub för båda så
// komponenter som monterar dem inte kraschar i testmiljön. Stubbarna OBSERVERAR utan att
// emittera (ingen scroll i jsdom), vilket är rätt default: spy-/mät-LOGIKEN testas separat
// med en INJICERAD/kontrollerad observer-callback (use-section-spy.test.ts), så stubben
// döljer inget beteende, den gör bara monterings-seam:et inert (samma anda som
// matchMedia-/virtual:pwa-register-stubbarna). Enskilda tester kan ersätta global
// IntersectionObserver med en spion när de vill driva callbacken.
if (!('IntersectionObserver' in globalThis)) {
  // Konstruktor-argumenten (callback/options) ignoreras medvetet, stubben emitterar
  // aldrig. JS tar emot extra argument oavsett, så vi tar inga formella parametrar
  // (slipper "oanvänd parameter" utan att tappa beteende). Cast:en bär typkontraktet.
  class IntersectionObserverStub {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: ReadonlyArray<number> = [];
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  globalThis.IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver;
}

if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// EAGER motion-reduced-motion-init (T33): motion lazy-initierar sin globala
// prefers-reduced-motion-lyssnare FÖRSTA gången useReducedMotion() anropas i en worker,
// via window.matchMedia('(prefers-reduced-motion)').addEventListener(...). Förr körde
// varje dialog-ägande komponent useReducedMotion EAGERT vid mount (mot den rena stubben
// ovan), så init skedde tidigt och säkert. Med den delade <Modal>-primitiven (T33) körs
// useReducedMotion först när en dialog ÖPPNAS, vilket kan inträffa i ett test där en
// matchMedia-spion (vi.spyOn ... mockImplementation/restoreAllMocks) tillfälligt gör att
// reduced-motion-frågan saknar addEventListener -> motion-init kraschar (recovered
// concurrent-render-fel, brusar i svit-loggen). Vi WARM:ar motion-init EN gång här genom
// att rendera en minimal komponent som anropar useReducedMotion, mot den KOMPLETTA stubben
// ovan (innan någon spion hinner störa), så motions globala flagga sätts säkert och lazy-
// init aldrig sker mot ett transient matchMedia-läge senare. Produktionen påverkas inte
// (riktig matchMedia finns alltid); detta härdar bara testmiljön, samma anda som
// matchMedia-/MotionGlobalConfig-stubbarna ovan.
function MotionInitWarmup() {
  useReducedMotion();
  return null;
}
const warmupRoot = createRoot(document.createElement('div'));
act(() => {
  warmupRoot.render(createElement(MotionInitWarmup));
});
warmupRoot.unmount();
