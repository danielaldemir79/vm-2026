import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CollapsibleBody, CollapsibleSection } from './CollapsibleSection';

// Den DELADE komprimerings-primitiven (T68, #129). EN komponent som ger hela sidan
// ETT överblickbart komprimerings-mönster: rubrik + beskrivning ALLTID synliga,
// "toppen" av innehållet synlig komprimerat (höjd-klipp + gradient-fade), och en
// tydlig expandera/komprimera-kontroll (delad ExpandToggle-semantik). Kontraktet
// testas EN gång här, i stället för indirekt via varje konsument-sektion.
describe('CollapsibleSection', () => {
  function renderSection(props?: Partial<Parameters<typeof CollapsibleSection>[0]>) {
    return render(
      <CollapsibleSection
        name="groups"
        heading={<h2 id="h">Gruppspelet</h2>}
        labelledBy="h"
        description={<p>Beskrivning av sektionen.</p>}
        toggleLabels={{
          expand: 'Visa alla grupper',
          collapse: 'Visa färre',
        }}
        {...props}
      >
        <div data-testid="content">Innehåll som ska kunna komprimeras.</div>
      </CollapsibleSection>
    );
  }

  it('rubrik + beskrivning + innehåll renderas, komprimerat som default', () => {
    renderSection();
    // Rubriken bär sektionens tillgängliga namn (aria-labelledby).
    const section = screen.getByRole('region', { name: 'Gruppspelet' });
    expect(within(section).getByText('Beskrivning av sektionen.')).toBeInTheDocument();
    expect(within(section).getByTestId('content')).toBeInTheDocument();
    // Default = komprimerat: data-haken speglar läget för design-frontend + tester.
    expect(section.querySelector('[data-collapsible-body]')).toHaveAttribute(
      'data-collapsed',
      'true'
    );
  });

  it('komprimerat: en expandera-kontroll med aria-expanded=false som styr kroppen', () => {
    renderSection();
    const btn = screen.getByRole('button', { name: /Visa alla grupper/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    // Knappen pekar (aria-controls) på samma element som bär data-collapsible-body.
    const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
    expect(btn).toHaveAttribute('aria-controls', body.id);
  });

  it('expandera -> innehållet fälls ut (data-collapsed=false, aria-expanded=true)', () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /Visa alla grupper/i }));
    const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
    expect(body).toHaveAttribute('data-collapsed', 'false');
    // Nu finns BÅDE en övre OCH en nedre toggle (lång sektion, alltid nåbar utan skroll).
    const toggles = screen.getAllByRole('button', { name: /Visa färre/i });
    expect(toggles.length).toBe(2);
    toggles.forEach((t) => expect(t).toHaveAttribute('aria-expanded', 'true'));
  });

  it('komprimera tillbaka -> tillbaka till komprimerat (toppen synlig igen)', () => {
    renderSection();
    const expandBtn = screen.getByRole('button', { name: /Visa alla grupper/i });
    fireEvent.click(expandBtn);
    // Komprimera via den ÖVRE toggeln.
    const [topCollapse] = screen.getAllByRole('button', { name: /Visa färre/i });
    fireEvent.click(topCollapse);
    const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
    expect(body).toHaveAttribute('data-collapsed', 'true');
    // Bara den övre toggeln kvar i komprimerat läge.
    expect(screen.getAllByRole('button', { name: /Visa alla grupper/i })).toHaveLength(1);
  });

  it('vid IHOPFÄLLNING flyttas fokus till den ÖVRE kontrollen (listans topp, a11y)', async () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /Visa alla grupper/i }));
    const toggles = screen.getAllByRole('button', { name: /Visa färre/i });
    const bottom = toggles[1];
    bottom.focus();
    fireEvent.click(bottom);
    // Efter ihopfällning ligger fokus på den (nu enda) övre expandera-kontrollen.
    // requestAnimationFrame-callbacken körs av jsdom; vänta in att fokus landat.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Visa alla grupper/i })).toHaveFocus();
    });
  });

  it('namnrymd: data-attributen är per-sektion (stabila, egna krokar)', () => {
    renderSection({ name: 'admin' });
    const btn = screen.getByRole('button', { name: /Visa alla grupper/i });
    expect(btn).toHaveAttribute('data-admin-toggle', 'expand');
    expect(btn).toHaveAttribute('data-admin-toggle-position', 'top');
  });

  it('forwardar section-ref (för fokus/scroll efter komprimering från en annan sektion)', () => {
    const ref = createRef<HTMLElement>();
    renderSection({ sectionRef: ref });
    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current?.getAttribute('data-collapsible-section')).toBe('groups');
  });

  it('startExpanded styr default-läget (avslöjandet expanderat direkt, #129 punkt 11)', () => {
    renderSection({ startExpanded: true });
    const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
    expect(body).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getAllByRole('button', { name: /Visa färre/i }).length).toBe(2);
  });
});

// CollapsibleBody är den variant sektionerna i appen använder (de äger redan sin egen
// <section>/header, och lägger bara en CollapsibleBody runt sitt INNEHÅLL). Här testas
// att den komprimerar utan att kräva en egen rubrik-struktur.
describe('CollapsibleBody (innehålls-kompressorn sektionerna använder)', () => {
  it('komprimerar innehållet som default, men innehållet är kvar i DOM (a11y)', () => {
    render(
      <CollapsibleBody name="admin" toggleLabels={{ expand: 'Visa admin', collapse: 'Visa färre' }}>
        <p data-testid="inner">Admin-innehåll.</p>
      </CollapsibleBody>
    );
    const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
    expect(body).toHaveAttribute('data-collapsed', 'true');
    // KOMPRIMERAT betyder klippt, INTE borttaget: innehållet ska fortfarande finnas
    // (det syns visuellt + nås av skärmläsare; bara höjden klipps).
    expect(screen.getByTestId('inner')).toBeInTheDocument();
    // En gradient-fade signalerar "det finns mer" i komprimerat läge.
    expect(body.querySelector('[data-collapsible-fade]')).toBeInTheDocument();
  });

  it('utfälld -> faden försvinner (hela innehållet syns)', () => {
    render(
      <CollapsibleBody name="admin" toggleLabels={{ expand: 'Visa admin', collapse: 'Visa färre' }}>
        <p>Admin-innehåll.</p>
      </CollapsibleBody>
    );
    fireEvent.click(screen.getByRole('button', { name: /Visa admin/i }));
    const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
    expect(body).toHaveAttribute('data-collapsed', 'false');
    expect(body.querySelector('[data-collapsible-fade]')).toBeNull();
  });
});
