import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import { SectionNavProvider } from './SectionNavProvider';
import { SectionNav } from './SectionNav';
import { useRegisterSection } from './use-register-section';
import { SECTIONS, type SectionDescriptor } from './section-labels';

// C4 (prestanda): bevisa att context-delningen ISOLERAR sektions-vyerna från activeId-byten.
//
// Scroll-spy:n byter aktiv sektion ofta vid scroll. Före delningen låg register/unregister i
// SAMMA context-värde som sections/activeId, så det värdet bytte identitet vid varje activeId-
// uppdatering och ALLA useRegisterSection-konsumenter (de 8 sektions-vyerna) re-renderades, en
// onödig scroll-jank på tunga mobil-vyer. Efter delningen konsumerar useRegisterSection bara
// den STABILA actions-ytan, så en registrerare ska INTE re-renderas av ett activeId-byte, medan
// SectionNav (som läser state-ytan) MÅSTE uppdatera sitt aktiva chip.

// Kontrollerbar IntersectionObserver-mock (samma grepp som use-section-spy.test): den fångar
// callbacken + de observerade elementen så testet kan DRIVA scroll-spy:n och därmed ett äkta
// activeId-byte genom hela provider-kedjan (jsdom emitterar aldrig riktig intersection).
interface MockObserverInstance {
  callback: IntersectionObserverCallback;
  observed: Element[];
  observer: IntersectionObserver;
}
let instances: MockObserverInstance[] = [];

class MockIntersectionObserver {
  observed: Element[] = [];
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    instances.push({
      callback,
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

/** Driv ett intersection-utfall (id -> boundingTop) -> spy:n räknar om aktiv -> setActiveId. */
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

// En registrerande test-komponent med en RENDER-RÄKNAR-spion: exakt det de riktiga sektions-
// vyerna gör (useRegisterSection vid mount) + ett `<section>` med rubrik så scroll-målet finns.
// counts[id] räknas upp vid VARJE render, så vi kan bevisa att den INTE re-renderar vid
// activeId-byte.
function makeCountingSection(counts: Record<string, number>) {
  return function CountingSection({ section }: { section: SectionDescriptor }) {
    useRegisterSection(section);
    counts[section.id] = (counts[section.id] ?? 0) + 1;
    return (
      <section aria-labelledby={section.id}>
        <h2 id={section.id}>{section.label}</h2>
      </section>
    );
  };
}

function chip(name: string): HTMLElement {
  return within(screen.getByRole('navigation', { name: 'Sektioner' })).getByRole('button', {
    name,
  });
}

describe('SectionNav, registrerare isoleras från activeId-byten (C4)', () => {
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

  it('en useRegisterSection-konsument re-renderas INTE när activeId ändras (men chip:et uppdateras)', () => {
    const counts: Record<string, number> = {};
    const CountingSection = makeCountingSection(counts);

    render(
      <SectionNavProvider>
        <SectionNav />
        <CountingSection section={SECTIONS.daily} />
        <CountingSection section={SECTIONS.groups} />
        <CountingSection section={SECTIONS.scenarios} />
      </SectionNavProvider>
    );

    // Sätt ett START-läge för spy:n (Idag aktiv) så vi mäter från en känd punkt EFTER att
    // registreringarna stabiliserat sig, inte under mount-/registrerings-skakningen.
    emit({
      [SECTIONS.daily.id]: -10,
      [SECTIONS.groups.id]: 400,
      [SECTIONS.scenarios.id]: 800,
    });
    expect(chip('Idag')).toHaveAttribute('aria-current', 'true');

    const baseline = {
      daily: counts[SECTIONS.daily.id],
      groups: counts[SECTIONS.groups.id],
      scenarios: counts[SECTIONS.scenarios.id],
    };

    // DRIV ett activeId-byte: scrolla så Grupper blir aktiv. Detta byter STATE-ytan (activeId),
    // som bara SectionNav konsumerar.
    emit({
      [SECTIONS.daily.id]: -400,
      [SECTIONS.groups.id]: -5,
      [SECTIONS.scenarios.id]: 500,
    });

    // BEVIS 1, chip:et uppdaterades (state-ytan nådde fram till navet): Grupper är nu aktiv.
    expect(chip('Grupper')).toHaveAttribute('aria-current', 'true');
    expect(chip('Idag')).not.toHaveAttribute('aria-current');

    // BEVIS 2, ISOLERINGEN: INGEN av registrerarna re-renderade av activeId-bytet. Räknaren
    // står still trots att activeId gick Idag -> Grupper.
    expect(counts[SECTIONS.daily.id]).toBe(baseline.daily);
    expect(counts[SECTIONS.groups.id]).toBe(baseline.groups);
    expect(counts[SECTIONS.scenarios.id]).toBe(baseline.scenarios);

    // Ett TREDJE activeId-byte (Vad krävs) , fortfarande inga registrerar-re-renders.
    emit({
      [SECTIONS.daily.id]: -800,
      [SECTIONS.groups.id]: -400,
      [SECTIONS.scenarios.id]: -3,
    });
    expect(chip('Vad krävs')).toHaveAttribute('aria-current', 'true');
    expect(counts[SECTIONS.daily.id]).toBe(baseline.daily);
    expect(counts[SECTIONS.groups.id]).toBe(baseline.groups);
    expect(counts[SECTIONS.scenarios.id]).toBe(baseline.scenarios);
  });
});
