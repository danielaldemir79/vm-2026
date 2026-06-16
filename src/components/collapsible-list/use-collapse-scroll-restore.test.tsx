// Enhetstester för useCollapseScrollRestore (T92 del F): app-bar-kompenserad scroll-till-offset
// + reduced-motion-gatning. jsdom har ingen layout, så vi STUBBAR ankarets getBoundingClientRect
// + window.scrollY + --vm-app-bar-height för att bevisa MATEMATIKEN (target = scrollY + top -
// appBarOffset, klampad >= 0) och beteende-valet (smooth vs auto), inte den visuella scrollen.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useRef, useEffect } from 'react';
import { useCollapseScrollRestore } from './use-collapse-scroll-restore';

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty('--vm-app-bar-height');
});

/** En liten testkomponent som exponerar scrollAnchorIntoView via en utåtgiven ref-callback. */
function Harness({ onReady, top }: { onReady: (fn: () => void) => void; top: number }) {
  const { anchorRef, scrollAnchorIntoView } = useCollapseScrollRestore<HTMLDivElement>();
  const setRef = useRef(false);
  useEffect(() => {
    if (anchorRef.current && !setRef.current) {
      setRef.current = true;
      // Stubba ankarets rect (jsdom ger 0:or). top = avstånd från viewport-toppen.
      anchorRef.current.getBoundingClientRect = () =>
        ({
          top,
          left: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
          x: 0,
          y: top,
          toJSON: () => {},
        }) as DOMRect;
      onReady(scrollAnchorIntoView);
    }
  }, [anchorRef, scrollAnchorIntoView, onReady, top]);
  return <div ref={anchorRef} data-anchor="" />;
}

function setupScrollSpy() {
  const scrollTo = vi.fn();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  return scrollTo;
}

describe('useCollapseScrollRestore, app-bar-kompenserad offset', () => {
  it('skrollar till scrollY + rect.top - app-bar-höjd (rubriken hamnar UNDER app-baren)', () => {
    const scrollTo = setupScrollSpy();
    Object.defineProperty(window, 'scrollY', { value: 1000, configurable: true });
    document.documentElement.style.setProperty('--vm-app-bar-height', '64px');

    let fn: () => void = () => {};
    render(<Harness onReady={(f) => (fn = f)} top={300} />);
    fn();

    // target = 1000 (scrollY) + 300 (rect.top) - 64 (app-bar) = 1236.
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 1236 }));
  });

  it('KLAMPAR målet till >= 0 (aldrig en negativ scroll-position)', () => {
    const scrollTo = setupScrollSpy();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    document.documentElement.style.setProperty('--vm-app-bar-height', '120px');

    let fn: () => void = () => {};
    render(<Harness onReady={(f) => (fn = f)} top={10} />); // 0 + 10 - 120 = -110 -> klampas 0
    fn();

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it('faller till offset 0 när --vm-app-bar-height saknas (ankaret i absoluta toppen, synligt)', () => {
    const scrollTo = setupScrollSpy();
    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });
    // Ingen --vm-app-bar-height satt.

    let fn: () => void = () => {};
    render(<Harness onReady={(f) => (fn = f)} top={200} />);
    fn();

    // 500 + 200 - 0 = 700.
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 700 }));
  });
});

describe('useCollapseScrollRestore, reduced-motion-gatning (WCAG 2.3.3)', () => {
  it('använder behavior "smooth" när reducerad rörelse INTE efterfrågas', () => {
    const scrollTo = setupScrollSpy();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;

    let fn: () => void = () => {};
    render(<Harness onReady={(f) => (fn = f)} top={100} />);
    fn();

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
  });

  it('HOPPAR direkt (behavior "auto") när användaren bett om minskad rörelse', () => {
    const scrollTo = setupScrollSpy();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;

    let fn: () => void = () => {};
    render(<Harness onReady={(f) => (fn = f)} top={100} />);
    fn();

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
  });
});
