import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SectionNav, type SectionNavItem } from './SectionNav';

const ITEMS: SectionNavItem[] = [
  { id: 'sec-grupper', label: 'Grupper' },
  { id: 'sec-slutspel', label: 'Slutspel' },
  { id: 'sec-statistik', label: 'Statistik' },
];

function renderNav() {
  // Mata in mål-sektionerna så ett klick har något att skrolla till.
  document.body.insertAdjacentHTML(
    'beforeend',
    ITEMS.map((it) => `<section id="${it.id}">${it.label}</section>`).join('')
  );
  return render(<SectionNav items={ITEMS} ariaLabel="Hoppa till sektion i Turnering" />);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('SectionNav (T103: genvägs-meny i en lång flik)', () => {
  it('är en tillgänglig <nav> med ett beskrivande namn', () => {
    renderNav();
    expect(
      screen.getByRole('navigation', { name: /Hoppa till sektion i Turnering/i })
    ).toBeInTheDocument();
  });

  it('renderar en knapp per sektion med dess svenska etikett', () => {
    renderNav();
    for (const item of ITEMS) {
      expect(screen.getByRole('button', { name: item.label })).toBeInTheDocument();
    }
  });

  it('markerar den första sektionen som aktiv (aria-current) vid sid-topp', () => {
    renderNav();
    // Utan emitterad scroll-spy är default-aktiv = första sektionen.
    const active = screen.getByRole('button', { name: 'Grupper' });
    expect(active).toHaveAttribute('aria-current', 'true');
    expect(active).toHaveAttribute('data-active', 'true');
    // De andra är inte aktiva.
    expect(screen.getByRole('button', { name: 'Slutspel' })).not.toHaveAttribute('aria-current');
  });

  it('skrollar till sektionen vid klick (kallar window.scrollTo)', () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    renderNav();

    fireEvent.click(screen.getByRole('button', { name: 'Slutspel' }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    // Smooth som default (ingen reduced-motion-preferens i test-stubben).
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
  });

  it('renderar ingenting för en tom sektionslista (inget tomt band)', () => {
    const { container } = render(<SectionNav items={[]} ariaLabel="tom" />);
    expect(container.querySelector('[data-section-nav]')).toBeNull();
  });

  it('knapparna är vanliga, fokuserbara buttons (Tab-navigerbara, inte en tablist)', () => {
    renderNav();
    // Det är en genvägs-meny, inte en tablist: knapparna ska INTE bära role="tab"
    // eller tabindex=-1 (roving), så varje chip nås med Tab.
    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn).toHaveAttribute('type', 'button');
      expect(btn).not.toHaveAttribute('role', 'tab');
      expect(btn).not.toHaveAttribute('tabindex', '-1');
    }
  });
});
