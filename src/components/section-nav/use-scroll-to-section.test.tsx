import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScrollToSection } from './use-scroll-to-section';

// En liten test-host som exponerar scrollToSection så vi kan driva den utanför render.
let scrollToSection: ReturnType<typeof useScrollToSection>;
function Host() {
  scrollToSection = useScrollToSection();
  return null;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('useScrollToSection (T103: hoppa till sektion under det sticky bandet)', () => {
  it('skrollar målet till clearancePx + 8 ner från toppen (under app-bar + nav)', () => {
    // Bygg ett mål-element och ge det en känd viewport-position. jsdom har ingen layout,
    // så vi stubbar getBoundingClientRect (samma teknik som befintliga scroll-tester).
    const target = document.createElement('section');
    target.id = 'sektion-x';
    document.body.appendChild(target);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect);

    // Sidan är redan nedskrollad 200px; bandets pinnade höjd är 112px.
    Object.defineProperty(window, 'scrollY', { value: 200, configurable: true });
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;

    render(<Host />);
    act(() => scrollToSection('sektion-x', 112));

    // Mål: scrollY(200) + rect.top(500) - (clearance 112 + 8px luft) = 580.
    expect(scrollTo).toHaveBeenCalledWith({ top: 580, behavior: 'smooth' });
  });

  it('respekterar prefers-reduced-motion (hoppar direkt, ingen smooth)', () => {
    const target = document.createElement('section');
    target.id = 'sektion-y';
    document.body.appendChild(target);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 0 } as DOMRect);
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    // Tvinga reduced-motion via matchMedia-spionen.
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);

    render(<Host />);
    act(() => scrollToSection('sektion-y', 100));

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
  });

  it('är en no-op om målet inte finns (kraschar inte)', () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    render(<Host />);
    act(() => scrollToSection('finns-inte', 112));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('klampar målet till >= 0 (aldrig negativ scroll)', () => {
    const target = document.createElement('section');
    target.id = 'sektion-z';
    document.body.appendChild(target);
    // Målet ligger ovanför nuvarande scroll: rect.top negativt, stort band.
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: -50 } as DOMRect);
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;

    render(<Host />);
    act(() => scrollToSection('sektion-z', 100));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});
