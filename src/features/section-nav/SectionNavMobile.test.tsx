import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SectionNavProvider } from './SectionNavProvider';
import { SectionNavMobile } from './SectionNavMobile';
import { useRegisterSection } from './use-register-section';
import { SECTIONS, type SectionDescriptor } from './section-labels';

// En minimal "sektion" som registrerar sig själv när den renderar, exakt som de riktiga
// vyerna gör (useRegisterSection vid mount). Renderar ett <section aria-labelledby={id}> med
// rubriken som bär id:t, så scroll-målet finns (samma form som chip-radens test-fake).
function FakeSection({ section }: { section: SectionDescriptor }) {
  useRegisterSection(section);
  return (
    <section aria-labelledby={section.id}>
      <h2 id={section.id}>{section.label}</h2>
    </section>
  );
}

function renderMenu(children: ReactNode) {
  return render(
    <SectionNavProvider>
      <SectionNavMobile />
      {children}
    </SectionNavProvider>
  );
}

/** Hamburgare-knappen (meny-knappen). Tillgängligt namn = "Sektioner" / "Sektioner: <aktiv>". */
function menuButton(): HTMLElement {
  return screen.getByRole('button', { name: /^Sektioner/ });
}

/** Panelens menyrader (riktiga knappar med data-section-menu-item). */
function menuItems(): HTMLElement[] {
  const panel = document.querySelector('[data-section-menu-panel]');
  if (!panel) {
    return [];
  }
  return within(panel as HTMLElement).getAllByRole('button');
}

describe('SectionNavMobile, hamburgare-knapp + responsiv närvaro', () => {
  it('renderar en meny-knapp (mobil-varianten) när sektioner finns', () => {
    renderMenu(<FakeSection section={SECTIONS.daily} />);
    const btn = menuButton();
    expect(btn).toBeInTheDocument();
    // Bandet bär sm:hidden-kroken (design-frontend / CSS döljer den >= sm).
    const band = screen.getByRole('navigation', { name: 'Sektioner' });
    expect(band).toHaveAttribute('data-section-nav-mobile');
    expect(band.className).toContain('sm:hidden');
  });

  it('döljer hela bandet (return null) när ingen sektion är registrerad', () => {
    renderMenu(null);
    expect(screen.queryByRole('button', { name: /^Sektioner/ })).not.toBeInTheDocument();
  });

  it('visar aktiv sektion i knapp-etiketten (scroll-spy-värdet tappas inte på mobil)', () => {
    // Utan aktiv sektion: bara "Sektioner".
    renderMenu(<FakeSection section={SECTIONS.daily} />);
    expect(menuButton()).toHaveAccessibleName('Sektioner');
  });
});

describe('SectionNavMobile, panel öppnar/stänger + aria-kontrakt', () => {
  it('togglar aria-expanded och binder aria-controls till panelens id', () => {
    renderMenu(<FakeSection section={SECTIONS.daily} />);
    const btn = menuButton();
    // Stängd: aria-expanded=false, ingen panel. aria-controls får INTE vara satt, panelen är
    // inte monterad och en IDREF dit vore ogiltig ARIA (C6, Copilot-runda-2 #168).
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('[data-section-menu-panel]')).toBeNull();
    expect(btn).not.toHaveAttribute('aria-controls');

    act(() => btn.click());

    // Öppen: aria-expanded=true, panelen finns, aria-controls pekar på dess id.
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    const panel = document.querySelector('[data-section-menu-panel]');
    expect(panel).not.toBeNull();
    expect(btn.getAttribute('aria-controls')).toBe((panel as HTMLElement).id);
    expect((panel as HTMLElement).id).toBeTruthy();

    // Klick igen stänger: aria-controls faller bort igen (ingen monterad panel att peka på).
    act(() => btn.click());
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('[data-section-menu-panel]')).toBeNull();
    expect(btn).not.toHaveAttribute('aria-controls');
  });

  it('listar ALLA registrerade sektioner som rader (samma registry-sanning, inga döda rader)', () => {
    renderMenu(
      <>
        {/* Avsiktligt i FEL ordning i JSX: panelen ska följa registrets order. */}
        <FakeSection section={SECTIONS.bracket} />
        <FakeSection section={SECTIONS.daily} />
        <FakeSection section={SECTIONS.groups} />
        <FakeSection section={SECTIONS.scenarios} />
      </>
    );
    act(() => menuButton().click());
    expect(menuItems().map((b) => b.textContent)).toEqual([
      'Idag',
      'Grupper',
      'Vad krävs',
      'Slutspel',
    ]);
    // En sektion som inte registrerat sig (live-gatad) får ingen rad.
    expect(screen.queryByRole('button', { name: 'Topplista' })).not.toBeInTheDocument();
  });

  it('Escape stänger panelen', () => {
    renderMenu(<FakeSection section={SECTIONS.daily} />);
    const btn = menuButton();
    act(() => btn.click());
    expect(document.querySelector('[data-section-menu-panel]')).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('[data-section-menu-panel]')).toBeNull();
  });

  it('klick UTANFÖR band + panel stänger; klick inuti panelen stänger INTE', () => {
    renderMenu(
      <>
        <FakeSection section={SECTIONS.daily} />
        <FakeSection section={SECTIONS.groups} />
      </>
    );
    const btn = menuButton();
    act(() => btn.click());
    const panel = document.querySelector('[data-section-menu-panel]') as HTMLElement;
    expect(panel).not.toBeNull();

    // Klick INUTI panelen (pointerdown på panelytan, inte en rad) ska INTE stänga.
    act(() => {
      panel.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(btn).toHaveAttribute('aria-expanded', 'true');

    // Klick UTANFÖR (på body) stänger.
    act(() => {
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('SectionNavMobile, fokus-hantering', () => {
  it('flyttar fokus IN i panelen (första raden) vid öppning', () => {
    renderMenu(
      <>
        <FakeSection section={SECTIONS.daily} />
        <FakeSection section={SECTIONS.groups} />
      </>
    );
    act(() => menuButton().click());
    const items = menuItems();
    expect(items[0]).toHaveFocus();
    expect(items[0]).toHaveTextContent('Idag');
  });

  it('ÅTERSTÄLLER fokus till knappen vid stängning (Escape)', () => {
    renderMenu(<FakeSection section={SECTIONS.daily} />);
    const btn = menuButton();
    act(() => btn.click());
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(btn).toHaveFocus();
  });

  it('stjäl INTE fokus till knappen vid första render (menyn är stängd från start)', () => {
    // Ett yttre element som har fokus vid mount: app-skalet ska inte rycka fokus till
    // hamburgare-knappen bara för att SectionNavMobile monteras stängd.
    function Harness() {
      return (
        <SectionNavProvider>
          <button type="button" data-outside="">
            Utanför
          </button>
          <SectionNavMobile />
          <FakeSection section={SECTIONS.daily} />
        </SectionNavProvider>
      );
    }
    render(<Harness />);
    const outside = document.querySelector('[data-outside]') as HTMLElement;
    act(() => outside.focus());
    expect(outside).toHaveFocus();
    // Knappen ska INTE ha stulit fokus (wasOpen-guarden hindrar fokus-flytt vid mount).
    expect(menuButton()).not.toHaveFocus();
  });
});

describe('SectionNavMobile, rad-klick scrollar + stänger', () => {
  // jsdom saknar scrollIntoView helt; definiera den som en mock på prototypen.
  let scrollSpy: ReturnType<typeof vi.fn>;
  const proto = HTMLElement.prototype as unknown as { scrollIntoView?: unknown };
  beforeEach(() => {
    scrollSpy = vi.fn();
    proto.scrollIntoView = scrollSpy;
  });
  afterEach(() => {
    delete proto.scrollIntoView;
  });

  it('klick på en rad anropar scrollTo med rätt mål och stänger panelen', () => {
    renderMenu(
      <>
        <FakeSection section={SECTIONS.daily} />
        <FakeSection section={SECTIONS.groups} />
      </>
    );
    const btn = menuButton();
    act(() => btn.click());

    const groupsRow = within(
      document.querySelector('[data-section-menu-panel]') as HTMLElement
    ).getByRole('button', { name: 'Grupper' });

    act(() => groupsRow.click());

    // Scroll-målet är <section> som bär gruppspels-rubriken (block:'start').
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    const targetSection = document.getElementById(SECTIONS.groups.id)?.closest('section');
    expect(scrollSpy.mock.instances[0]).toBe(targetSection);

    // Panelen stängdes vid valet.
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('[data-section-menu-panel]')).toBeNull();
    // Knapp-etiketten visar nu den valda (aktiva) sektionen (scroll-spy-värdet syns).
    expect(btn).toHaveAccessibleName('Sektioner: Grupper');
  });

  it('aria-current="true" sätts på den aktiva raden efter val', () => {
    renderMenu(
      <>
        <FakeSection section={SECTIONS.daily} />
        <FakeSection section={SECTIONS.groups} />
      </>
    );
    const btn = menuButton();
    // Välj Grupper (sätter activeId via scrollTo) och öppna igen för att se markeringen.
    act(() => btn.click());
    act(() =>
      within(document.querySelector('[data-section-menu-panel]') as HTMLElement)
        .getByRole('button', { name: 'Grupper' })
        .click()
    );
    act(() => btn.click());

    const panel = document.querySelector('[data-section-menu-panel]') as HTMLElement;
    const groupsRow = within(panel).getByRole('button', { name: 'Grupper' });
    const dailyRow = within(panel).getByRole('button', { name: 'Idag' });
    expect(groupsRow).toHaveAttribute('aria-current', 'true');
    expect(groupsRow).toHaveAttribute('data-active', 'true');
    expect(dailyRow).not.toHaveAttribute('aria-current');
  });

  it('bär de stabila data-krokarna för design-frontend', () => {
    renderMenu(<FakeSection section={SECTIONS.daily} />);
    const btn = menuButton();
    expect(btn).toHaveAttribute('data-section-menu-button');
    act(() => btn.click());
    const panel = document.querySelector('[data-section-menu-panel]') as HTMLElement;
    expect(panel).toHaveAttribute('data-section-menu-panel');
    const row = within(panel).getByRole('button', { name: 'Idag' });
    expect(row).toHaveAttribute('data-section-menu-item');
  });
});

describe('SectionNavMobile, ikon-skifte-staten (hamburgare <-> kryss)', () => {
  // data-section-menu-open är en REN styling-krok (design-lager): den driver ikon-skiftet
  // (hamburgare -> kryss) och knappens öppet-läge i CSS. Semantiken bär aria-expanded; det
  // här testet vaktar att styling-kroken speglar open-staten exakt, så CSS-skiftet aldrig
  // kan hamna ur synk med panelens verkliga tillstånd. Tre individuella streck (data-icon-bar)
  // ersatte det tidigare path:et så de kan roteras till ett kryss; testet vaktar att de finns.

  it('saknar data-section-menu-open i STÄNGT läge och sätter "true" i ÖPPET', () => {
    renderMenu(<FakeSection section={SECTIONS.daily} />);
    const btn = menuButton();
    // Stängd från start: kroken är inte satt (undefined -> attributet utelämnas).
    expect(btn).not.toHaveAttribute('data-section-menu-open');

    act(() => btn.click());
    // Öppen: styling-kroken speglar open + är i synk med aria-expanded.
    expect(btn).toHaveAttribute('data-section-menu-open', 'true');
    expect(btn).toHaveAttribute('aria-expanded', 'true');

    act(() => btn.click());
    // Stängd igen: kroken faller bort (ikonen återgår till hamburgare i CSS).
    expect(btn).not.toHaveAttribute('data-section-menu-open');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('ikonen har tre individuella streck (data-icon-bar) för kryss-rotationen', () => {
    renderMenu(<FakeSection section={SECTIONS.daily} />);
    const icon = document.querySelector('[data-section-menu-icon]') as HTMLElement;
    expect(icon).not.toBeNull();
    const bars = icon.querySelectorAll('[data-icon-bar]');
    expect(bars).toHaveLength(3);
    // Strecken är aria-hidden via svg:ns aria-hidden (ikonen bär ingen a11y-betydelse).
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});

// C1 + C2 (Copilot #168): section-nav.css stylar mobil-menyns element via KLASS-selektorer
// (.vm-section-menu-button/-icon/-label/-panel/-item), inte via data-attributen. Tidigare bar
// <svg> (ikonen) och <span> (etiketten) BARA sina data-attribut, inte klassen, så CSS:en (ikon-
// skiftets overflow/transform-box, etikettens ellips-trunkering) uteblev. data-attributen är
// rena BETEENDE-/test-krokar; KLASSEN är styling-kontraktet. Detta test vaktar att varje element
// faktiskt BÄR sin matchande klass, så regressionen (klass borttappad -> styling uteblir) fångas.
describe('SectionNavMobile, CSS-klass-kontrakt (styling-krokarna matchar section-nav.css)', () => {
  it('varje mobil-meny-element bär sin matchande .vm-section-menu-*-klass', () => {
    renderMenu(<FakeSection section={SECTIONS.daily} />);
    const btn = menuButton();
    // Knapp + ikon + etikett finns i STÄNGT läge.
    expect(btn).toHaveClass('vm-section-menu-button');
    const icon = document.querySelector('[data-section-menu-icon]') as HTMLElement;
    expect(icon).toHaveClass('vm-section-menu-icon'); // C1
    const label = document.querySelector('[data-section-menu-label]') as HTMLElement;
    expect(label).toHaveClass('vm-section-menu-label'); // C2

    // Panel + rader finns först i ÖPPET läge.
    act(() => btn.click());
    const panel = document.querySelector('[data-section-menu-panel]') as HTMLElement;
    expect(panel).toHaveClass('vm-section-menu-panel');
    const item = within(panel).getByRole('button', { name: 'Idag' });
    expect(item).toHaveClass('vm-section-menu-item');
  });
});
