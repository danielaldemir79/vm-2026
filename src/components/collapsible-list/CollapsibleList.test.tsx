// Enhetstester för den delade collapsible-list-byggstenen (#173 T82 del 4). Bevisar kärnan
// ägaren uppskattade, generaliserad: börja KOMPRIMERAD (N rader synliga), "Visa alla M"
// fäller ut hela listan, en STICKY kontroll-rad bär en komprimera-kontroll som är nåbar
// OAVSETT scroll-position (den ligger i den sticky raden, inte ovanför fönstret), och list-
// ARIA:n (aria-setsize/-posinset) bär hela listans storlek även när bara en delmängd renderas.
//
// jsdom saknar layout (scrollTop/clientHeight = 0), så vi bevisar STRUKTUREN (sticky raden +
// dess klass + att komprimera bor i den) och BETEENDET (toggla, fokus-återgång), inte den
// faktiska visuella stickyn (den verifieras i webbläsaren, se .vmshots).

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, within } from '@testing-library/react';
import { CollapsibleList } from './CollapsibleList';
import { CollapsibleScrollList } from './CollapsibleScrollList';

interface Item {
  id: string;
  name: string;
}

function items(n: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({ id: `i${i}`, name: `Rad ${i}` }));
}

beforeEach(() => {
  // Smooth-scrollen kastar inte i jsdom (ingen layout); stubba så scrollToIndex är inert.
  Element.prototype.scrollTo = vi.fn();
});

function renderList(n: number, collapsedVisibleCount = 5) {
  return render(
    <CollapsibleList
      items={items(n)}
      collapsedVisibleCount={collapsedVisibleCount}
      rowHeight={48}
      getItemKey={(it) => it.id}
      listId="demo-list"
      name="demo"
      listAriaLabel={`Hela listan, ${n} rader`}
      labels={{ expand: (total) => `Visa alla ${total}`, collapse: 'Komprimera' }}
      renderPreview={({ previewItems }) => (
        <ul data-demo-podium="">
          {previewItems.map((it) => (
            <li key={it.id} data-demo-row="" data-row-id={it.id}>
              {it.name}
            </li>
          ))}
        </ul>
      )}
      renderItem={(it) => (
        <div data-demo-row="" data-row-id={it.id}>
          {it.name}
        </div>
      )}
    />
  );
}

describe('CollapsibleList, börjar komprimerad med N rader synliga', () => {
  it('komprimerat visar BARA de N översta raderna (previewn), inte hela listan', () => {
    const { container } = renderList(240, 5);
    const podium = container.querySelector('[data-demo-podium]')!;
    expect(podium.querySelectorAll('[data-demo-row]').length).toBe(5);
    // Den utfällda listan finns INTE än.
    expect(container.querySelector('[data-demo-full]')).not.toBeInTheDocument();
  });

  it('"Visa alla M" visar rätt antal och kan fälla ut listan', () => {
    const { container } = renderList(240, 5);
    const toggle = container.querySelector('[data-demo-toggle]')!;
    expect(toggle).toHaveTextContent('Visa alla 240');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'demo-list');

    act(() => {
      fireEvent.click(toggle);
    });
    expect(container.querySelector('[data-demo-full]')).toBeInTheDocument();
    // Previewn göms i utfällt läge (full listan tar över).
    expect(container.querySelector('[data-demo-podium]')).not.toBeInTheDocument();
    // Och "Visa alla"-toggeln dupliceras INTE i utfällt läge (sticky komprimera tar över).
    expect(container.querySelector('[data-demo-toggle]')).not.toBeInTheDocument();
  });

  it('en lista som ryms i previewn (<= N) får ingen "Visa alla"-knapp', () => {
    const { container } = renderList(4, 5);
    expect(container.querySelector('[data-demo-toggle]')).not.toBeInTheDocument();
    // Alla 4 raderna syns ändå i previewn.
    expect(container.querySelectorAll('[data-demo-row]').length).toBe(4);
  });
});

describe('CollapsibleList, sticky komprimera nåbar oavsett scroll + virtualisering', () => {
  it('utfällt: KOMPRIMERA bor i den sticky kontroll-raden INUTI fönstret (inte ovanför)', () => {
    const { container } = renderList(240, 5);
    act(() => {
      fireEvent.click(container.querySelector('[data-demo-toggle]')!);
    });
    const controls = container.querySelector('[data-demo-controls]')!;
    // Den sticky raden bär komprimera-kontrollen (inte en separat toggle ovanför fönstret).
    const collapse = within(controls as HTMLElement).getByRole('button', { name: 'Komprimera' });
    expect(collapse).toBeInTheDocument();
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(collapse).toHaveAttribute('aria-controls', 'demo-list');
    // Raden är sticky-stylad (Tailwind sticky + vm-collapsible-controls bär den opaka fonden).
    expect(controls.className).toContain('sticky');
    expect(controls.className).toContain('vm-collapsible-controls');
    // Och komprimera-kontrollen ligger INUTI det scrollande fönstret, inte utanför det.
    const scroll = container.querySelector('[data-demo-scroll]')!;
    expect(scroll.contains(collapse)).toBe(true);
  });

  it('klick på den sticky KOMPRIMERA fäller in listan igen (tillbaka till previewn)', () => {
    const { container } = renderList(240, 5);
    act(() => {
      fireEvent.click(container.querySelector('[data-demo-toggle]')!);
    });
    expect(container.querySelector('[data-demo-full]')).toBeInTheDocument();

    act(() => {
      fireEvent.click(container.querySelector('[data-demo-collapse]')!);
    });
    expect(container.querySelector('[data-demo-full]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-demo-podium]')).toBeInTheDocument();
    // Fokus-återgång: "Visa alla"-toggeln tar fokus när den sticky kontrollen avmonteras.
    const toggle = container.querySelector('[data-demo-toggle]')!;
    expect(toggle).toHaveFocus();
  });

  it('VIRTUALISERING: utfällt renderar bara en DELMÄNGD, men aria-setsize bär hela storleken', () => {
    const { container } = renderList(240, 5);
    act(() => {
      fireEvent.click(container.querySelector('[data-demo-toggle]')!);
    });
    const full = container.querySelector('[data-demo-full]')!;
    const rows = full.querySelectorAll('[data-demo-row]');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(60); // inte 240 i DOM:en
    // Hela storleken bärs av list-ARIA (giltig list-ARIA, inte grid-attribut).
    const firstItem = full.querySelector('[role="listitem"]')!;
    expect(firstItem).toHaveAttribute('aria-setsize', '240');
    expect(firstItem).toHaveAttribute('aria-posinset', '1');
    // Scroll-fönstret är HÖJD-begränsat (det är vad som gör det till en scroll, inte en vägg).
    const scroll = container.querySelector('[data-demo-scroll]') as HTMLElement;
    expect(scroll.style.maxHeight).toBeTruthy();
    expect(scroll).toHaveAttribute('data-demo-count', '240');
  });
});

describe('CollapsibleScrollList, icke-virtualiserat läge (utan rowHeight)', () => {
  it('renderar ALLA rader (ingen virtualisering) men behåller list-ARIA per rad', () => {
    const { container } = render(
      <CollapsibleScrollList
        items={items(12)}
        getItemKey={(it) => it.id}
        renderItem={(it) => <div data-row="" data-row-id={it.id} />}
        ariaLabel="Alla 12 rader"
        listId="plain-list"
        name="plain"
        collapseLabel="Komprimera"
        onCollapse={vi.fn()}
      />
    );
    // Utan rowHeight renderas ALLA 12 raderna (ingen DOM-delmängd).
    expect(container.querySelectorAll('[data-row]').length).toBe(12);
    const firstItem = container.querySelector('[role="listitem"]')!;
    expect(firstItem).toHaveAttribute('aria-setsize', '12');
    expect(firstItem).toHaveAttribute('aria-posinset', '1');
  });

  it('utan onCollapse renderas INGEN komprimera-kontroll (men listan + ev. kontroller finns)', () => {
    const { container } = render(
      <CollapsibleScrollList
        items={items(3)}
        getItemKey={(it) => it.id}
        renderItem={(it) => <div data-row="" data-row-id={it.id} />}
        ariaLabel="Tre rader"
        name="plain"
        controls={<span data-plain-extra="">extra</span>}
      />
    );
    expect(container.querySelector('[data-plain-collapse]')).not.toBeInTheDocument();
    // Men det extra kontroll-innehållet OCH listan finns ändå.
    expect(container.querySelector('[data-plain-extra]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-row]').length).toBe(3);
  });
});
