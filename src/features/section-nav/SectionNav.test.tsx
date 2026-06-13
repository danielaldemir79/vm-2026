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
