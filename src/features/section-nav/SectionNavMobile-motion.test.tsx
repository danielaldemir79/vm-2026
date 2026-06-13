import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import { SectionNavProvider } from './SectionNavProvider';
import { SectionNavMobile } from './SectionNavMobile';
import { useRegisterSection } from './use-register-section';
import { SECTIONS } from './section-labels';

// Styr prefers-reduced-motion DETERMINISTISKT genom att mocka motion/react:s useReducedMotion
// (samma grepp som section-nav-motion.test). En matchMedia-spion är opålitlig efter motions
// lazy-init (setup.ts warm:ar den mot matches:false), en direkt hook-mock är entydig.
const mockUseReducedMotion = vi.fn<() => boolean | null>();
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => mockUseReducedMotion() };
});

function FakeSection() {
  useRegisterSection(SECTIONS.daily);
  return (
    <section aria-labelledby={SECTIONS.daily.id}>
      <h2 id={SECTIONS.daily.id}>{SECTIONS.daily.label}</h2>
    </section>
  );
}

function renderMenu() {
  return render(
    <SectionNavProvider>
      <SectionNavMobile />
      <FakeSection />
    </SectionNavProvider>
  );
}

function menuButton(): HTMLElement {
  return screen.getByRole('button', { name: /^Sektioner/ });
}

describe('SectionNavMobile, reduced-motion-gren vid rad-val', () => {
  // Rad-valet går genom provider:ns scrollTo, som väljer behavior utifrån reduced-motion.
  let scrollSpy: ReturnType<typeof vi.fn>;
  const proto = HTMLElement.prototype as unknown as { scrollIntoView?: unknown };
  beforeEach(() => {
    scrollSpy = vi.fn();
    proto.scrollIntoView = scrollSpy;
  });
  afterEach(() => {
    delete proto.scrollIntoView;
    vi.clearAllMocks();
  });

  it('hoppar DIREKT (behavior:auto) när prefers-reduced-motion är på', () => {
    mockUseReducedMotion.mockReturnValue(true);
    renderMenu();
    act(() => menuButton().click());
    act(() =>
      within(document.querySelector('[data-section-menu-panel]') as HTMLElement)
        .getByRole('button', { name: 'Idag' })
        .click()
    );
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    // WCAG 2.3.3: ingen animerad scroll vid reducerad rörelse.
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('mjuk scroll (behavior:smooth) när rörelse är tillåten', () => {
    mockUseReducedMotion.mockReturnValue(false);
    renderMenu();
    act(() => menuButton().click());
    act(() =>
      within(document.querySelector('[data-section-menu-panel]') as HTMLElement)
        .getByRole('button', { name: 'Idag' })
        .click()
    );
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});
