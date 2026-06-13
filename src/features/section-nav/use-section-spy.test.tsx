import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import { SectionNavProvider } from './SectionNavProvider';
import { SectionNav } from './SectionNav';
import { useRegisterSection } from './use-register-section';
import { SECTIONS } from './section-labels';

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
