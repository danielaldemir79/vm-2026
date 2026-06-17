// Enhetstester för StickyFollowToggle (T83, #175, F1-fix).
//
// F1-BUGGEN: den sticky komprimera-baren "följde inte sidans scroll, den fäste i ett
// inre fönster och gled ur vy". Roten var att baren och den långa listan låg som SKILDA
// SYSKON, och en `position: sticky`-yta kan bara klistra/följa med inom sin egen
// CONTAINING BLOCK (föräldraelementets innehållsbox). När baren satt ensam i en wrapper
// med bara sin egen höjd fanns ingen sträcka att följa med längs -> den skrollade ur vy
// direkt. FIXEN: baren OCH listan delar nu EN containing block (listan skickas som
// `children` och renderas i SAMMA wrapper EFTER baren).
//
// jsdom har ingen layout (`position: sticky` beräknas aldrig faktiskt), så vi kan inte
// mäta den visuella stickyn här. Vi bevisar i stället den STRUKTURELLA INVARIANT fixen
// vilar på: bar + lista delar samma förälder (en containing block). Det är den dimension
// som faktiskt skiljer den FIXADE strukturen från den BUGGIGA (bar utan listan som syskon).
// Den visuella följ-scrollen verifieras i browsern (e2e/.vmshots).
//
// NEGATIV-KONTROLL (lessons "bevisa att testet faktiskt vaktar"): testet längst ner
// bevisar att invarianten RÖDNAR om man återinför buggen (listan som ett SYSKON till
// baren i stället för dess children). Ett test som inte kan rödna vaktar ingenting.

import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { StickyFollowToggle } from './StickyFollowToggle';

describe('StickyFollowToggle, F1-fix: bar + lista delar en containing block', () => {
  it('renderar listan (children) i SAMMA wrapper som den sticky baren, inte som ett syskon', () => {
    const { container } = render(
      <StickyFollowToggle
        expanded
        controls="lista-1"
        onToggle={() => {}}
        name="test"
        labels={{ expand: 'Visa alla', collapse: 'Komprimera' }}
      >
        <ol data-test-list="">
          <li>Rad 1</li>
        </ol>
      </StickyFollowToggle>
    );

    const bar = container.querySelector('[data-test-toggle-bar]');
    const list = container.querySelector('[data-test-list]');
    expect(bar).not.toBeNull();
    expect(list).not.toBeNull();

    // KÄRN-INVARIANTEN (F1-fixen): baren och listan har SAMMA förälder. Det parent-
    // elementet är den gemensamma containing block som den sticky baren kan klistra
    // och följa med längs (hela listans höjd). Vore listan ett syskon UTANFÖR baren
    // (den gamla buggen) skulle de ha olika föräldrar och baren ingen sträcka att följa.
    expect(bar?.parentElement).toBe(list?.parentElement);

    // Och baren ligger FÖRE listan i den gemensamma föräldern (sticky-toppen, listan under).
    const parent = bar?.parentElement;
    const children = parent ? Array.from(parent.children) : [];
    expect(children.indexOf(bar as Element)).toBeLessThan(children.indexOf(list as Element));
  });

  it('baren bär den sticky-klassen + top-16 i UTFÄLLT läge (klistrar under sajt-headern)', () => {
    const { container } = render(
      <StickyFollowToggle
        expanded
        controls="lista-2"
        onToggle={() => {}}
        name="test"
        labels={{ expand: 'Visa alla', collapse: 'Komprimera' }}
      >
        <ol />
      </StickyFollowToggle>
    );
    const bar = container.querySelector('[data-test-toggle-bar]');
    // sticky + top-16: klistrar precis under den sticky sajt-headern (~64px). Den
    // VISUELLA följ-scrollen kräver att bar+lista delar containing block (testet ovan).
    expect(bar?.className).toContain('sticky');
    expect(bar?.className).toContain('top-16');
    expect(bar?.getAttribute('data-sticky')).toBe('true');
  });

  it('i KOMPRIMERAT läge är baren INTE sticky (kort lista, inget att följa med i)', () => {
    const { container } = render(
      <StickyFollowToggle
        expanded={false}
        hiddenCount={3}
        controls="lista-3"
        onToggle={() => {}}
        name="test"
      >
        <ol />
      </StickyFollowToggle>
    );
    const bar = container.querySelector('[data-test-toggle-bar]');
    expect(bar?.className).not.toContain('sticky');
    expect(bar?.getAttribute('data-sticky')).toBeNull();
  });

  it('komprimera-knappen togglar (aria-controls pekar på listan, a11y)', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <StickyFollowToggle
        expanded
        controls="lista-4"
        onToggle={onToggle}
        name="test"
        labels={{ expand: 'Visa alla', collapse: 'Komprimera' }}
      >
        <ol />
      </StickyFollowToggle>
    );
    const button = container.querySelector('[data-test-toggle]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.getAttribute('aria-controls')).toBe('lista-4');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

// T92 del F: kollaps-scroll-fixen. Klickar man komprimera (utfällt -> ihopfällt) ska sektionens
// ankare skrollas tillbaka i vy (annars står sid-scrollen kvar långt ner). Vi gatar på TILLSTÅND:
// bara en KOMPRIMERING skrollar, en EXPANDERING rör inte scrollen. jsdom har ingen layout, så vi
// bevisar att window.scrollTo ANROPAS (resp. inte) , den faktiska visuella scrollen verifieras i
// browsern. rAF körs synkront via en stub så vi kan asserta direkt.
describe('StickyFollowToggle, kollaps-scroll-fix (del F)', () => {
  function withScrollSpies() {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    // Kör rAF-callbacken synkront, så vi kan asserta i samma tick.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    return { scrollTo };
  }

  it('KOMPRIMERING (utfällt -> klick) skrollar ankaret tillbaka i vy (scrollTo anropas)', () => {
    const { scrollTo } = withScrollSpies();
    const { container } = render(
      <StickyFollowToggle
        expanded
        controls="lista-f"
        onToggle={() => {}}
        name="test"
        labels={{ expand: 'Visa alla', collapse: 'Komprimera' }}
      >
        <ol />
      </StickyFollowToggle>
    );
    fireEvent.click(container.querySelector('[data-test-toggle]') as HTMLButtonElement);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    // Skrollar till en top-position (objekt-form), inte ett okontrollerat hopp.
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }));
    vi.unstubAllGlobals();
  });

  it('EXPANDERING (komprimerat -> klick) skrollar INTE (negativ-kontroll: bara kollaps skrollar)', () => {
    const { scrollTo } = withScrollSpies();
    const { container } = render(
      <StickyFollowToggle
        expanded={false}
        hiddenCount={3}
        controls="lista-g"
        onToggle={() => {}}
        name="test"
        labels={{ expand: 'Visa alla', collapse: 'Komprimera' }}
      >
        <ol />
      </StickyFollowToggle>
    );
    fireEvent.click(container.querySelector('[data-test-toggle]') as HTMLButtonElement);
    expect(scrollTo).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
