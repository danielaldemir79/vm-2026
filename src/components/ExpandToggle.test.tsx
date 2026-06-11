import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExpandToggle } from './ExpandToggle';

// Den DELADE ihopfäll-/expandera-kontrollen (lyft ur ResultEntryView, T39/#68).
// Komponenten används nu av resultatlistan OCH tips-listan, så dess kontrakt
// (etikett, aria-expanded/-controls, namnrymd på data-attributen) testas EN gång
// här, i stället för indirekt via varje konsument-vy.
describe('ExpandToggle', () => {
  it('ihopfällt läge: säger "Visa alla" med dolt-antal + aria-expanded=false', () => {
    render(
      <ExpandToggle
        expanded={false}
        hiddenCount={3}
        controls="lst"
        onToggle={vi.fn()}
        position="top"
      />
    );
    const btn = screen.getByRole('button');
    expect(btn).toHaveAccessibleName(/Visa alla matcher \(3 dolda\)/i);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAttribute('aria-controls', 'lst');
  });

  it('singular: ETT dolt -> "1 dold" (böjs korrekt)', () => {
    render(
      <ExpandToggle
        expanded={false}
        hiddenCount={1}
        controls="lst"
        onToggle={vi.fn()}
        position="top"
      />
    );
    expect(screen.getByRole('button')).toHaveAccessibleName(/Visa alla matcher \(1 dold\)/i);
  });

  it('utfällt läge: säger "Visa färre" + aria-expanded=true', () => {
    render(
      <ExpandToggle
        expanded={true}
        hiddenCount={3}
        controls="lst"
        onToggle={vi.fn()}
        position="top"
      />
    );
    const btn = screen.getByRole('button');
    expect(btn).toHaveAccessibleName(/Visa färre/i);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('onToggle anropas vid klick', () => {
    const onToggle = vi.fn();
    render(
      <ExpandToggle
        expanded={false}
        hiddenCount={2}
        controls="lst"
        onToggle={onToggle}
        position="top"
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('name-namnrymd: default "results", annars per-vy egna data-attribut (stabila krokar)', () => {
    // Default (results): bevarar resultatvyns redan testade attribut oförändrade.
    const { rerender, container } = render(
      <ExpandToggle
        expanded={false}
        hiddenCount={1}
        controls="lst"
        onToggle={vi.fn()}
        position="top"
      />
    );
    let btn = container.querySelector('button') as HTMLButtonElement;
    expect(btn.getAttribute('data-results-toggle')).toBe('expand');
    expect(btn.getAttribute('data-results-toggle-position')).toBe('top');

    // Egen namnrymd (predictions): tips-listans stabila, egna krokar.
    rerender(
      <ExpandToggle
        expanded={true}
        hiddenCount={1}
        controls="lst"
        onToggle={vi.fn()}
        position="bottom"
        name="predictions"
      />
    );
    btn = container.querySelector('button') as HTMLButtonElement;
    expect(btn.getAttribute('data-predictions-toggle')).toBe('collapse');
    expect(btn.getAttribute('data-predictions-toggle-position')).toBe('bottom');
    // Den andra vyns namnrymd läcker inte in.
    expect(btn.getAttribute('data-results-toggle')).toBeNull();
  });
});
