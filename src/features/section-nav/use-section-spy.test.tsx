import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import { SectionNavProvider } from './SectionNavProvider';
import { SectionNav } from './SectionNav';
import { useRegisterSection } from './use-register-section';
import { useSectionSpy } from './use-section-spy';
import { SECTIONS, type SectionDescriptor } from './section-labels';

// En kontrollerbar IntersectionObserver-mock: den FÅNGAR callbacken + de observerade
// elementen så testet kan DRIVA scroll-spy:n (jsdom emitterar aldrig riktig
// intersection). Vi ersätter den globala IO:n (setup.ts ger bara en inert stub) med
// denna för spy-testerna, och återställer efter. Detta är just den "injicerade/
// kontrollerade observer-callback" som setup-kommentaren hänvisar till.
interface MockObserverInstance {
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  observed: Element[];
  observer: IntersectionObserver;
}
let instances: MockObserverInstance[] = [];

class MockIntersectionObserver {
  observed: Element[] = [];
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    instances.push({
      callback,
      options,
      observed: this.observed,
      observer: this as unknown as IntersectionObserver,
    });
  }
  observe(el: Element): void {
    this.observed.push(el);
  }
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

/**
 * Emittera ett intersection-utfall: för varje (section-id -> boundingTop) bygger vi en
 * minimal entry och kör spy:ns callback. boundingClientRect.top driver "vilken sektion
 * har passerat raden" (logiken i use-section-spy väljer den nedersta vars topp <= tröskel).
 */
function emit(tops: Record<string, number>): void {
  const inst = instances[instances.length - 1];
  if (!inst) {
    throw new Error('Ingen IntersectionObserver skapades (spy:n monterades inte).');
  }
  const entries: IntersectionObserverEntry[] = inst.observed.map((target) => {
    const headingId = target.getAttribute('aria-labelledby') ?? '';
    const top = tops[headingId] ?? 9999;
    return {
      target,
      isIntersecting: top < 600,
      intersectionRatio: top < 600 ? 1 : 0,
      boundingClientRect: { top } as DOMRectReadOnly,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
      time: 0,
    } as IntersectionObserverEntry;
  });
  act(() => {
    inst.callback(entries, inst.observer);
  });
}

function FakeSection({ id, label, order }: { id: string; label: string; order: number }) {
  useRegisterSection({ id, label, order });
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{label}</h2>
    </section>
  );
}

function renderNavWithThreeSections() {
  return render(
    <SectionNavProvider>
      <SectionNav />
      <FakeSection {...SECTIONS.daily} />
      <FakeSection {...SECTIONS.groups} />
      <FakeSection {...SECTIONS.scenarios} />
    </SectionNavProvider>
  );
}

function chip(name: string): HTMLElement {
  return within(screen.getByRole('navigation', { name: 'Sektioner' })).getByRole('button', {
    name,
  });
}

describe('scroll-spy markerar aktivt chip (aria-current)', () => {
  let originalIO: typeof IntersectionObserver;
  beforeEach(() => {
    instances = [];
    originalIO = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });
  afterEach(() => {
    globalThis.IntersectionObserver = originalIO;
  });

  it('markerar den sektion man scrollat in i (nedersta vars topp passerat raden)', () => {
    renderNavWithThreeSections();
    // Man har scrollat så att Grupper ligger precis under raden (topp strax ovanför
    // tröskeln) medan Idag är ovan/förbi och Vad krävs ligger längre ner.
    emit({
      [SECTIONS.daily.id]: -200,
      [SECTIONS.groups.id]: 2,
      [SECTIONS.scenarios.id]: 500,
    });
    expect(chip('Grupper')).toHaveAttribute('aria-current', 'true');
    expect(chip('Idag')).not.toHaveAttribute('aria-current');
    expect(chip('Vad krävs')).not.toHaveAttribute('aria-current');
  });

  it('flyttar markeringen när man scrollar vidare till nästa sektion', () => {
    renderNavWithThreeSections();
    emit({
      [SECTIONS.daily.id]: -400,
      [SECTIONS.groups.id]: -100,
      [SECTIONS.scenarios.id]: 3,
    });
    expect(chip('Vad krävs')).toHaveAttribute('aria-current', 'true');
    expect(chip('Grupper')).not.toHaveAttribute('aria-current');
  });

  it('markerar första sektionen när man är högst upp (ingen har passerat raden)', () => {
    renderNavWithThreeSections();
    // Alla sektioner ligger UNDER raden (positiva toppar > tröskel): man är överst.
    emit({
      [SECTIONS.daily.id]: 50,
      [SECTIONS.groups.id]: 400,
      [SECTIONS.scenarios.id]: 800,
    });
    expect(chip('Idag')).toHaveAttribute('aria-current', 'true');
  });
});

// C3: rootMargin (observer-zonens topp) härleds ur --vm-section-nav-offset. SectionNav mäter
// om offseten vid resize/radbrytning/zoom. Tidigare frystes offseten vid mount (effektens deps
// är idsKey + setActiveId, inte offseten), så rootMargin blev STALE efter en höjdändring och fel
// chip kunde markeras. Hooken bevakar nu offset-ändringar (ResizeObserver på banden + window
// 'resize') och bygger om observern med ny rootMargin. ResizeObserver-stubben i setup.ts
// emitterar inte, så vi driver via window 'resize'-fallbacken (samma kanal hooken lyssnar på).
//
// VARFÖR en fristående harness (inte renderNavWithThreeSections): SectionNav-komponentens egen
// mount-effekt MÄTER banden (höjd 0 i jsdom utan layout) och SKRIVER --vm-section-nav-offset,
// vilket skulle skriva över offseten testet sätter. Här driver vi useSectionSpy DIREKT mot
// sektioner i DOM, så testet äger offset-variabeln helt och bevisar spy-hookens räkne-/ombyggnads-
// logik isolerat (samma anda som use-active-chip-scroll.test injicerar sin egen geometri).
function SpyHarness({ sections }: { sections: SectionDescriptor[] }) {
  const setActiveId = vi.fn();
  useSectionSpy(sections, setActiveId);
  return (
    <>
      {sections.map((s) => (
        <section key={s.id} aria-labelledby={s.id}>
          <h2 id={s.id}>{s.label}</h2>
        </section>
      ))}
    </>
  );
}

describe('scroll-spy bygger om observern med ny rootMargin när offseten ändras (C3)', () => {
  let originalIO: typeof IntersectionObserver;
  const sections = [SECTIONS.daily, SECTIONS.groups, SECTIONS.scenarios];
  beforeEach(() => {
    instances = [];
    originalIO = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });
  afterEach(() => {
    globalThis.IntersectionObserver = originalIO;
    // Städa offset-variabeln så den inte läcker till andra tester (default = 0/saknas).
    document.documentElement.style.removeProperty('--vm-section-nav-offset');
  });

  it('skapar en ny observer med uppdaterad rootMargin efter att offseten höjts', () => {
    // Initial offset 64px -> rootMargin-toppen ska vara -64px.
    document.documentElement.style.setProperty('--vm-section-nav-offset', '64px');
    render(<SpyHarness sections={sections} />);

    const firstCount = instances.length;
    const firstRootMargin = instances[instances.length - 1].options?.rootMargin;
    expect(firstRootMargin).toBe('-64px 0px -55% 0px');

    // Bandet växer (t.ex. radbrytning/zoom): SectionNav skulle skriva en ny offset. Vi
    // simulerar den nya mätningen och triggar resize-kanalen hooken bevakar.
    document.documentElement.style.setProperty('--vm-section-nav-offset', '120px');
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    // En NY observer ska ha byggts (ombyggnad), med den uppdaterade rootMargin-toppen -120px.
    expect(instances.length).toBe(firstCount + 1);
    const rebuiltRootMargin = instances[instances.length - 1].options?.rootMargin;
    expect(rebuiltRootMargin).toBe('-120px 0px -55% 0px');
  });

  it('bygger INTE om observern när offseten inte ändrats meningsfullt (samma avrundade px)', () => {
    document.documentElement.style.setProperty('--vm-section-nav-offset', '64px');
    render(<SpyHarness sections={sections} />);
    const countAfterMount = instances.length;

    // En resize som inte ändrar den avrundade höjden (64.2px rundas till 64) ska inte
    // riva/bygga om observern i onödan.
    document.documentElement.style.setProperty('--vm-section-nav-offset', '64.2px');
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(instances.length).toBe(countAfterMount);
  });
});
