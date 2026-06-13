import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import { SectionNavProvider } from './SectionNavProvider';
import { SectionNav } from './SectionNav';
import { useRegisterSection } from './use-register-section';
import { SECTIONS } from './section-labels';

// Styr prefers-reduced-motion DETERMINISTISKT genom att mocka motion/react:s
// useReducedMotion (samma grepp som motion-primitives.test). VARFÖR mock och inte en
// matchMedia-spion: motion lazy-cachar sin globala reduced-motion-flagga vid första
// useReducedMotion-anropet (setup.ts warm:ar den mot matchMedia matches:false), så en
// matchMedia-spion satt EFTER den init:en ger inte ett pålitligt true. En direkt mock av
// hooken är entydig. Resten av motion/react behålls äkta (spread av importOriginal), så
// bara reduced-motion-svaret är kontrollerat.
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

function renderNav() {
  return render(
    <SectionNavProvider>
      <SectionNav />
      <FakeSection />
    </SectionNavProvider>
  );
}

function idagChip(): HTMLElement {
  return within(screen.getByRole('navigation', { name: 'Sektioner' })).getByRole('button', {
    name: 'Idag',
  });
}

describe('SectionNav, reduced-motion-väg vid scroll', () => {
  // jsdom saknar scrollIntoView helt; definiera den som en mock på prototypen.
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
    renderNav();
    act(() => idagChip().click());
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    // Ingen smooth-animation vid reducerad rörelse (WCAG 2.3.3): block:start, behavior:auto.
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('mjuk scroll (behavior:smooth) när rörelse är tillåten', () => {
    mockUseReducedMotion.mockReturnValue(false);
    renderNav();
    act(() => idagChip().click());
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});
