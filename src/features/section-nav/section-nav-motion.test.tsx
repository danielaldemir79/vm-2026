import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import { SectionNavProvider } from './SectionNavProvider';
import { SectionNav } from './SectionNav';
import { useRegisterSection } from './use-register-section';
import { SECTIONS } from './section-labels';

// Styr prefers-reduced-motion per test genom att mocka motion/react:s useReducedMotion.
// Resten av motion/react behålls äkta (vi importerar den och spreadar den), så bara
// reduced-motion-svaret är kontrollerat, samma anda som motion-primitives.test.
const mockUseReducedMotion = vi.fn<() => boolean | null>();
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => mockUseReducedMotion() };
});

function FakeSection({ id, label, order }: { id: string; label: string; order: number }) {
  useRegisterSection({ id, label, order });
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{label}</h2>
    </section>
  );
}

function renderNav() {
  return render(
    <SectionNavProvider>
      <SectionNav />
      <FakeSection
        id={SECTIONS.daily.id}
        label={SECTIONS.daily.label}
        order={SECTIONS.daily.order}
      />
    </SectionNavProvider>
  );
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
    const chip = within(screen.getByRole('navigation', { name: 'Sektioner' })).getByRole('button', {
      name: 'Idag',
    });
    act(() => chip.click());
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    // Ingen smooth-animation vid reducerad rörelse (WCAG 2.3.3): block:start, behavior:auto.
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('mjuk scroll (behavior:smooth) när rörelse är tillåten', () => {
    mockUseReducedMotion.mockReturnValue(false);
    renderNav();
    const chip = within(screen.getByRole('navigation', { name: 'Sektioner' })).getByRole('button', {
      name: 'Idag',
    });
    act(() => chip.click());
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});
