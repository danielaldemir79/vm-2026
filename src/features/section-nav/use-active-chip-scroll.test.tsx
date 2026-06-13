import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useRef } from 'react';
import { useActiveChipScroll } from './use-active-chip-scroll';

// Styr prefers-reduced-motion DETERMINISTISKT via samma mock-grepp som section-nav-motion.test:
// mocka motion/react:s useReducedMotion (resten av paketet behålls äkta via importOriginal-
// spread). VARFÖR mock och inte matchMedia-spion: motion lazy-cachar sin globala reduced-
// motion-flagga vid första anropet (setup.ts warm:ar den mot matches:false), så en spion satt
// efter init ger inte ett pålitligt true. En direkt mock av hooken är entydig.
const mockUseReducedMotion = vi.fn<() => boolean | null>();
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => mockUseReducedMotion() };
});

// jsdom har ingen layout: offsetLeft/offsetWidth/clientWidth = 0 och scrollTo saknas. Vi
// bygger därför en kontrollerad chip-rad och INJICERAR geometri per element + en scrollTo-
// spion på track:en, så hookens RÄKNE-logik (är chip:et utanför vyn? vart ska track:en
// scrolla?) kan bevisas deterministiskt, oberoende av att jsdom inte layoutar.

interface ChipGeom {
  id: string;
  offsetLeft: number;
  offsetWidth: number;
}

/** Definiera ett tal-värde som en (skrivskyddad) layout-egenskap på ett element. */
function defineNumber(el: HTMLElement, prop: string, value: number): void {
  Object.defineProperty(el, prop, { configurable: true, value });
}

/**
 * Rendera en chip-rad med de stabila krokarna (data-section-nav-track + data-section-chip),
 * injicera geometri (offsetLeft/offsetWidth per li, clientWidth/scrollLeft + scrollTo-spion
 * på track:en) och driv useActiveChipScroll med activeId. Returnerar scrollTo-spionen.
 */
function renderTrack(opts: {
  chips: ChipGeom[];
  activeId: string | null;
  clientWidth: number;
  scrollLeft: number;
}): { scrollTo: ReturnType<typeof vi.fn>; track: HTMLElement } {
  const scrollTo = vi.fn();
  let trackEl: HTMLElement | null = null;

  function Harness() {
    const navRef = useRef<HTMLElement>(null);
    // Wire:a geometrin EFTER mount, FÖRE hookens effekt observerar den. En layout-effekt-
    // liknande ref-callback på nav:en räcker inte rent; vi sätter geometrin i en ref-callback
    // på track:en (körs under commit, före passiva effekter), så hooken läser rätt värden.
    return (
      <nav ref={navRef} data-section-nav="" aria-label="Sektioner">
        <ul
          data-section-nav-track=""
          ref={(el) => {
            if (!el) {
              return;
            }
            trackEl = el;
            defineNumber(el, 'clientWidth', opts.clientWidth);
            // scrollLeft är läs/skriv i riktiga DOM; i jsdom är den 0 och icke-spårbar.
            // Vi definierar den som ett fast värde (vyns nuvarande horisontella position).
            Object.defineProperty(el, 'scrollLeft', {
              configurable: true,
              value: opts.scrollLeft,
              writable: true,
            });
            (el as unknown as { scrollTo: typeof scrollTo }).scrollTo = scrollTo;
          }}
        >
          {opts.chips.map((c) => {
            const isActive = c.id === opts.activeId;
            return (
              <li
                key={c.id}
                ref={(li) => {
                  if (!li) {
                    return;
                  }
                  defineNumber(li, 'offsetLeft', c.offsetLeft);
                  defineNumber(li, 'offsetWidth', c.offsetWidth);
                }}
              >
                <button
                  type="button"
                  data-section-chip=""
                  data-active={isActive ? 'true' : undefined}
                  aria-current={isActive ? 'true' : undefined}
                >
                  {c.id}
                </button>
              </li>
            );
          })}
        </ul>
        <ActiveChipScrollDriver navRef={navRef} activeId={opts.activeId} />
      </nav>
    );
  }

  render(<Harness />);
  return { scrollTo, track: trackEl as unknown as HTMLElement };
}

// Liten driver-komponent så hooken körs med nav-ref:en EFTER att li/track-geometrin satts
// (children-effekter körs före förälderns; här ligger driver:n sist i nav:en, så dess effekt
// körs efter att ref-callbacken på track/li hunnit definiera geometrin i samma commit).
function ActiveChipScrollDriver({
  navRef,
  activeId,
}: {
  navRef: React.RefObject<HTMLElement | null>;
  activeId: string | null;
}) {
  useActiveChipScroll(navRef, activeId);
  return null;
}

describe('useActiveChipScroll, håller aktivt chip synligt i raden', () => {
  beforeEach(() => {
    mockUseReducedMotion.mockReturnValue(false);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('scrollar in ett aktivt chip som ligger utanför vyn till HÖGER (mjukt)', () => {
    // Vy: 0..200 (clientWidth 200, scrollLeft 0). Aktivt chip "d" ligger 320..380, helt
    // utanför till höger -> track:en ska scrolla så högerkanten + gutter (16) syns.
    const { scrollTo } = renderTrack({
      clientWidth: 200,
      scrollLeft: 0,
      activeId: 'd',
      chips: [
        { id: 'a', offsetLeft: 0, offsetWidth: 60 },
        { id: 'b', offsetLeft: 70, offsetWidth: 60 },
        { id: 'c', offsetLeft: 140, offsetWidth: 60 },
        { id: 'd', offsetLeft: 320, offsetWidth: 60 },
      ],
    });
    // nextLeft = itemRight(380) - clientWidth(200) + gutter(16) = 196.
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ left: 196, behavior: 'smooth' });
  });

  it('scrollar in ett aktivt chip som ligger utanför vyn till VÄNSTER (mjukt)', () => {
    // Vy: 300..500 (scrollLeft 300). Aktivt chip "a" ligger 0..60, utanför till vänster ->
    // track:en ska scrolla så vänsterkanten - gutter syns (klampat till >= 0).
    const { scrollTo } = renderTrack({
      clientWidth: 200,
      scrollLeft: 300,
      activeId: 'a',
      chips: [
        { id: 'a', offsetLeft: 0, offsetWidth: 60 },
        { id: 'b', offsetLeft: 320, offsetWidth: 60 },
        { id: 'c', offsetLeft: 400, offsetWidth: 60 },
      ],
    });
    // nextLeft = itemLeft(0) - gutter(16) = -16 -> Math.max(0, -16) = 0.
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, behavior: 'smooth' });
  });

  it('hoppar DIREKT (behavior:auto) vid prefers-reduced-motion', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const { scrollTo } = renderTrack({
      clientWidth: 200,
      scrollLeft: 0,
      activeId: 'd',
      chips: [
        { id: 'a', offsetLeft: 0, offsetWidth: 60 },
        { id: 'd', offsetLeft: 320, offsetWidth: 60 },
      ],
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ left: expect.any(Number), behavior: 'auto' });
  });

  it('rör INGENTING när det aktiva chip:et redan är helt synligt', () => {
    // Vy: 0..200. Aktivt chip "b" ligger 70..130, helt inom vyn -> ingen scroll.
    const { scrollTo } = renderTrack({
      clientWidth: 200,
      scrollLeft: 0,
      activeId: 'b',
      chips: [
        { id: 'a', offsetLeft: 0, offsetWidth: 60 },
        { id: 'b', offsetLeft: 70, offsetWidth: 60 },
        { id: 'c', offsetLeft: 320, offsetWidth: 60 },
      ],
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('rör ingenting när inget chip är aktivt (activeId null)', () => {
    const { scrollTo } = renderTrack({
      clientWidth: 200,
      scrollLeft: 0,
      activeId: null,
      chips: [{ id: 'a', offsetLeft: 0, offsetWidth: 60 }],
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

// Säkerställ att en saknad scrollTo-stub inte skulle smyga förbi: en sanity-act-rad gör att
// effekten faktiskt kört. (act-wrappar render redan; denna describe dokumenterar bara intentet.)
describe('useActiveChipScroll, körs i act utan att kasta', () => {
  it('kastar inte när track/chip finns men geometrin är trivial', () => {
    mockUseReducedMotion.mockReturnValue(false);
    expect(() =>
      act(() => {
        renderTrack({
          clientWidth: 0,
          scrollLeft: 0,
          activeId: 'a',
          chips: [{ id: 'a', offsetLeft: 0, offsetWidth: 0 }],
        });
      })
    ).not.toThrow();
  });
});
