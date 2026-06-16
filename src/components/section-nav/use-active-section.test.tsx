import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useActiveSection } from './use-active-section';

// Positions-baserad scroll-spy (T103): vi styr varje sektions getBoundingClientRect().top
// + sid-scrollens läge, dispatchar ett scroll-event och verifierar vilken sektion som
// blir aktiv. requestAnimationFrame körs synkront i testet så vi slipper tajming-flak.

const SECTION_IDS = ['a', 'b', 'c'] as const;
const TOP_OFFSET = 100; // läs-linjen = 100 + 8 = 108.

function Probe() {
  const active = useActiveSection({ sectionIds: SECTION_IDS, topOffsetPx: TOP_OFFSET });
  return <span data-testid="active">{active}</span>;
}

/** Sätt varje sektions viewport-topp via en stubbad getBoundingClientRect. */
function setSectionTops(tops: Record<string, number>): void {
  for (const id of SECTION_IDS) {
    const el = document.getElementById(id) as HTMLElement;
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top: tops[id] } as DOMRect);
  }
}

/** Stub sid-höjd + scroll-läge (styr "är vi vid botten?"). */
function setScroll({
  scrollY,
  innerHeight = 800,
  scrollHeight = 3000,
}: {
  scrollY: number;
  innerHeight?: number;
  scrollHeight?: number;
}): void {
  Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true });
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    value: scrollHeight,
    configurable: true,
  });
}

beforeEach(() => {
  document.body.innerHTML = SECTION_IDS.map((id) => `<section id="${id}"></section>`).join('');
  // Nollställ scroll-läget per test (defineProperty läcker annars mellan tester):
  // sid-topp + en icke-skrollbar sida (scrollHeight <= innerHeight), så default = sid-topp.
  setScroll({ scrollY: 0, innerHeight: 800, scrollHeight: 800 });
  // rAF synkront: callbacken körs direkt så compute() hinner sätta state inom act().
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0);
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('useActiveSection (T103 scroll-spy: vilken sektion tittar man på)', () => {
  it('markerar första sektionen vid sid-topp (ingen sektion passerat läs-linjen)', () => {
    // Alla sektioner ligger UNDER läs-linjen (top > 108).
    setScroll({ scrollY: 0 });
    setSectionTops({ a: 200, b: 1000, c: 2000 });
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('active')).toHaveTextContent('a');
  });

  it('markerar den SISTA sektionen vars topp passerat upp förbi läs-linjen', () => {
    setScroll({ scrollY: 900 });
    // a + b har skrollat upp förbi linjen (top <= 108), c är fortfarande under.
    setSectionTops({ a: -700, b: 50, c: 900 });
    const { getByTestId } = render(<Probe />);
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(getByTestId('active')).toHaveTextContent('b');
  });

  it('uppdaterar när man skrollar vidare (c passerar linjen)', () => {
    setScroll({ scrollY: 900 });
    setSectionTops({ a: -700, b: 50, c: 900 });
    const { getByTestId } = render(<Probe />);
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(getByTestId('active')).toHaveTextContent('b');

    // Skrolla så c kommer upp förbi linjen.
    setScroll({ scrollY: 1800 });
    setSectionTops({ a: -1600, b: -800, c: 50 });
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(getByTestId('active')).toHaveTextContent('c');
  });

  it('markerar SISTA sektionen vid sid-botten även om dess topp ligger kvar under linjen', () => {
    // Kort sista-sektion: c:s topp ryms aldrig upp till linjen, men vi är längst ner.
    // innerHeight + scrollY >= scrollHeight => "vid botten".
    setScroll({ scrollY: 2200, innerHeight: 800, scrollHeight: 3000 });
    setSectionTops({ a: -2000, b: -1000, c: 600 });
    const { getByTestId } = render(<Probe />);
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(getByTestId('active')).toHaveTextContent('c');
  });

  it('degraderar tyst till första sektionen utan DOM-mått (kraschar inte)', () => {
    // Inga sektioner i DOM:en -> getElementById null, compute hittar inget passerat.
    document.body.innerHTML = '';
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('active')).toHaveTextContent('a');
  });
});
