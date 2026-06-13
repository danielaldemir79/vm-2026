import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SectionNavProvider } from './SectionNavProvider';
import { SectionNav } from './SectionNav';
import { useRegisterSection } from './use-register-section';
import { SECTIONS, type SectionDescriptor } from './section-labels';

// En minimal "sektion" som registrerar sig själv när den renderar, exakt som de
// riktiga vyerna gör (useRegisterSection vid mount, avregistrerar vid unmount). Den
// renderar ett `<section aria-labelledby={id}>` med en rubrik som bär id:t, så scroll-
// målet + spy:n hittar det precis som i appen.
function FakeSection({ section }: { section: SectionDescriptor }) {
  useRegisterSection(section);
  return (
    <section aria-labelledby={section.id}>
      <h2 id={section.id}>{section.label}</h2>
    </section>
  );
}

function renderNav(children: ReactNode) {
  return render(
    <SectionNavProvider>
      <SectionNav />
      {children}
    </SectionNavProvider>
  );
}

/** Chip-etiketterna i renderad ordning (raden är ett nav-landmark). */
function chipLabels(): string[] {
  const nav = screen.getByRole('navigation', { name: 'Sektioner' });
  return within(nav)
    .getAllByRole('button')
    .map((b) => b.textContent ?? '');
}

describe('SectionNav, chip-närvaro speglar registret', () => {
  it('visar bara chips för sektioner som FAKTISKT registrerat sig (inga döda chips)', () => {
    // Bara två tracker-sektioner närvarande (som i fixtures-läge: tips/topplista null).
    renderNav(
      <>
        <FakeSection section={SECTIONS.daily} />
        <FakeSection section={SECTIONS.groups} />
      </>
    );
    expect(chipLabels()).toEqual(['Idag', 'Grupper']);
    // De live-gatade sektionernas chips ska INTE finnas (de registrerade sig aldrig).
    expect(screen.queryByRole('button', { name: 'Match-tips' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Topplista' })).not.toBeInTheDocument();
  });

  it('renderar alla chips i order-ordning när många sektioner är närvarande', () => {
    // Avsiktligt i FEL ordning i JSX: navet ska sortera på order, inte mount-ordning.
    renderNav(
      <>
        <FakeSection section={SECTIONS.leaderboard} />
        <FakeSection section={SECTIONS.daily} />
        <FakeSection section={SECTIONS.bracketPredictions} />
        <FakeSection section={SECTIONS.groups} />
        <FakeSection section={SECTIONS.scenarios} />
        <FakeSection section={SECTIONS.predictions} />
        <FakeSection section={SECTIONS.bracket} />
        <FakeSection section={SECTIONS.groupPredictions} />
      </>
    );
    expect(chipLabels()).toEqual([
      'Idag',
      'Grupper',
      'Vad krävs',
      'Slutspel',
      'Match-tips',
      'Grupp-tips',
      'Mästare',
      'Topplista',
    ]);
  });

  it('döljer hela raden (return null) när ingen sektion är registrerad', () => {
    renderNav(null);
    // Inget nav-landmark alls, så en tom sticky-rad aldrig tar plats (lean).
    expect(screen.queryByRole('navigation', { name: 'Sektioner' })).not.toBeInTheDocument();
  });

  it('tar bort ett chip när dess sektion unmountar (avregistrering)', () => {
    function Harness({ showGroups }: { showGroups: boolean }) {
      return (
        <SectionNavProvider>
          <SectionNav />
          <FakeSection section={SECTIONS.daily} />
          {showGroups ? <FakeSection section={SECTIONS.groups} /> : null}
        </SectionNavProvider>
      );
    }
    const { rerender } = render(<Harness showGroups />);
    expect(chipLabels()).toEqual(['Idag', 'Grupper']);
    // Grupp-sektionen försvinner ur DOM:en -> dess chip ska försvinna (ingen död länk).
    rerender(<Harness showGroups={false} />);
    expect(chipLabels()).toEqual(['Idag']);
  });
});

describe('SectionNav, a11y + tangentbord', () => {
  it('är ett nav-landmark med aria-label och chips som riktiga knappar', () => {
    renderNav(<FakeSection section={SECTIONS.daily} />);
    const nav = screen.getByRole('navigation', { name: 'Sektioner' });
    const chip = within(nav).getByRole('button', { name: 'Idag' });
    expect(chip).toBeInTheDocument();
    // En riktig <button> är fokuserbar via tangentbordet (ingen tabindex-hack behövs).
    chip.focus();
    expect(chip).toHaveFocus();
  });

  it('bär en stabil data-krok för design-frontend', () => {
    renderNav(<FakeSection section={SECTIONS.daily} />);
    const nav = screen.getByRole('navigation', { name: 'Sektioner' });
    expect(nav).toHaveAttribute('data-section-nav');
    const chip = within(nav).getByRole('button', { name: 'Idag' });
    expect(chip).toHaveAttribute('data-section-chip');
  });
});

describe('SectionNav, klick scrollar till rätt mål', () => {
  // jsdom saknar scrollIntoView HELT (kan inte spionera på en metod som inte finns), så
  // vi DEFINIERAR den som en mock på prototypen och städar bort den efteråt.
  let scrollSpy: ReturnType<typeof vi.fn>;
  const proto = HTMLElement.prototype as unknown as { scrollIntoView?: unknown };

  beforeEach(() => {
    scrollSpy = vi.fn();
    proto.scrollIntoView = scrollSpy;
  });
  afterEach(() => {
    delete proto.scrollIntoView;
  });

  it('klick på chip anropar scrollIntoView på rätt sektion + sätter aria-current', () => {
    renderNav(
      <>
        <FakeSection section={SECTIONS.daily} />
        <FakeSection section={SECTIONS.groups} />
      </>
    );
    const nav = screen.getByRole('navigation', { name: 'Sektioner' });
    const groupsChip = within(nav).getByRole('button', { name: 'Grupper' });

    act(() => {
      groupsChip.click();
    });

    // Scroll-målet är `<section>` som bär gruppspels-rubriken (block:'start').
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    const targetSection = document.getElementById(SECTIONS.groups.id)?.closest('section');
    expect(scrollSpy.mock.instances[0]).toBe(targetSection);

    // Klick markerar chip:et direkt (aria-current=true + data-active) för respons.
    expect(groupsChip).toHaveAttribute('aria-current', 'true');
    expect(groupsChip).toHaveAttribute('data-active', 'true');
    // Det andra chip:et är INTE aktivt.
    expect(within(nav).getByRole('button', { name: 'Idag' })).not.toHaveAttribute('aria-current');
  });
});

describe('SectionNav, offset-mätning binder till APP-headern (F1)', () => {
  // measure() sätter --vm-section-nav-header-top = headerns höjd och --vm-section-nav-offset
  // = header + nav på <html>. Det bevisar VILKEN <header> mätningen läste. Vi mockar
  // getBoundingClientRect så varje element rapporterar en distinkt höjd och verifierar att
  // mätningen tar APP-headerns höjd, inte en FRÄMRE dummy-headers, även när dummyn ligger
  // FÖRE app-headern i DOM:en (en ren document.querySelector('header') hade tagit dummyn).
  const DUMMY_HEADER_HEIGHT = 999; // främre, FEL <header> (utan app-kroken)
  const APP_HEADER_HEIGHT = 64; // den rätta app-headern (data-app-header)
  const NAV_HEIGHT = 40; // sektions-navets eget band

  const proto = HTMLElement.prototype as unknown as {
    getBoundingClientRect?: () => { height: number };
  };
  let originalRect: typeof proto.getBoundingClientRect;

  beforeEach(() => {
    originalRect = proto.getBoundingClientRect;
    // Höjd per element-roll: app-header-kroken -> app-höjd, övriga <header> -> dummy-höjd,
    // sektions-navet -> nav-höjd. Allt annat 0 (jsdom-default).
    proto.getBoundingClientRect = function (this: HTMLElement) {
      let height = 0;
      if (this.tagName === 'HEADER') {
        height = this.hasAttribute('data-app-header') ? APP_HEADER_HEIGHT : DUMMY_HEADER_HEIGHT;
      } else if (this.hasAttribute('data-section-nav')) {
        height = NAV_HEIGHT;
      }
      return { height } as DOMRect;
    } as typeof proto.getBoundingClientRect;
  });
  afterEach(() => {
    proto.getBoundingClientRect = originalRect;
    // Städa CSS-variablerna mellan testen så ingen läcker mätning.
    document.documentElement.style.removeProperty('--vm-section-nav-header-top');
    document.documentElement.style.removeProperty('--vm-section-nav-offset');
  });

  it('mäter mot app-headern även när ett ANNAT <header> ligger FÖRE den i DOM:en', () => {
    // En dummy-<header> FÖRE provider/nav i dokument-ordning (t.ex. en framtida banner/portal).
    render(
      <>
        <header>Banner utan app-kroken</header>
        <header data-app-header="">App-header</header>
        <SectionNavProvider>
          <SectionNav />
          <FakeSection section={SECTIONS.daily} />
        </SectionNavProvider>
      </>
    );

    // header-top = APP-headerns höjd (64), INTE dummyns (999). Det bevisar att selektorn
    // band mätningen till data-app-header, inte den FÖRSTA <header> i DOM-ordning.
    const headerTop = document.documentElement.style.getPropertyValue(
      '--vm-section-nav-header-top'
    );
    expect(headerTop).toBe(`${APP_HEADER_HEIGHT}px`);
    expect(headerTop).not.toBe(`${DUMMY_HEADER_HEIGHT}px`);

    // offset = app-header + nav (64 + 40 = 104), också mot app-headern, inte dummyn.
    const offset = document.documentElement.style.getPropertyValue('--vm-section-nav-offset');
    expect(offset).toBe(`${APP_HEADER_HEIGHT + NAV_HEIGHT}px`);
  });

  it('faller säkert till 0 höjd när ingen app-header finns (bara nav-höjden räknas)', () => {
    // Ingen <header data-app-header> alls (bara en dummy som INTE ska matchas).
    render(
      <>
        <header>Bara en dummy, ingen app-header</header>
        <SectionNavProvider>
          <SectionNav />
          <FakeSection section={SECTIONS.daily} />
        </SectionNavProvider>
      </>
    );

    // Saknad app-header -> headerHeight ?? 0, så header-top = 0 (samma säkra fallback som
    // förr), och offset = bara nav-höjden. Mätningen tar ALDRIG dummyns 999.
    expect(document.documentElement.style.getPropertyValue('--vm-section-nav-header-top')).toBe(
      '0px'
    );
    expect(document.documentElement.style.getPropertyValue('--vm-section-nav-offset')).toBe(
      `${NAV_HEIGHT}px`
    );
  });

  it('rensar CSS-variablerna från <html> vid unmount (C5, inget globalt DOM-läckage)', () => {
    // measure() sätter variablerna vid mount (getBoundingClientRect mockad i beforeEach), så
    // de finns FÖRE unmount. C5: effektens cleanup måste ta bort dem igen, annars ligger en
    // stale offset/header-top kvar på <html> och förgiftar en senare mount eller ett senare test.
    const { unmount } = render(
      <>
        <header data-app-header="">App-header</header>
        <SectionNavProvider>
          <SectionNav />
          <FakeSection section={SECTIONS.daily} />
        </SectionNavProvider>
      </>
    );

    // Sanity: mätningen satte faktiskt ett värde, annars bevisar rensningen ingenting.
    expect(document.documentElement.style.getPropertyValue('--vm-section-nav-header-top')).toBe(
      `${APP_HEADER_HEIGHT}px`
    );
    expect(document.documentElement.style.getPropertyValue('--vm-section-nav-offset')).toBe(
      `${APP_HEADER_HEIGHT + NAV_HEIGHT}px`
    );

    act(() => {
      unmount();
    });

    // Efter unmount ska BÅDA variablerna vara borta (getPropertyValue ger tom sträng).
    expect(document.documentElement.style.getPropertyValue('--vm-section-nav-header-top')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--vm-section-nav-offset')).toBe('');
  });

  it('rensar CSS-variablerna när navet går till 0 sektioner (return null)', () => {
    // När alla sektioner avregistreras renderar SectionNav null. Effekten kör då för
    // sections.length === 0: cleanup tar bort variablerna och measure sätter dem inte om
    // (navRef.current är null när navet inte renderas). C5: ingen stale offset blir kvar.
    function Harness({ showSection }: { showSection: boolean }) {
      return (
        <>
          <header data-app-header="">App-header</header>
          <SectionNavProvider>
            <SectionNav />
            {showSection ? <FakeSection section={SECTIONS.daily} /> : null}
          </SectionNavProvider>
        </>
      );
    }
    const { rerender } = render(<Harness showSection />);

    // Med en sektion närvarande satte mätningen variablerna.
    expect(document.documentElement.style.getPropertyValue('--vm-section-nav-offset')).toBe(
      `${APP_HEADER_HEIGHT + NAV_HEIGHT}px`
    );

    // Ta bort sektionen -> sections.length blir 0 -> navet returnerar null.
    act(() => {
      rerender(<Harness showSection={false} />);
    });

    expect(document.documentElement.style.getPropertyValue('--vm-section-nav-header-top')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--vm-section-nav-offset')).toBe('');
  });
});
