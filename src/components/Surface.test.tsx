// Enhetstester för Surface, den ENA kort-/panel-primitiven (D3/D4, #175).
//
// Surface är DRY-grunden för appens kort-stil: alla `surface={...}`-render-props
// funnlas hit. Dessa tester låser kontraktet de andra ytorna litar på: rätt
// default-form (radie + token-skugga, INTE Tailwinds shadow-md), att tone/padding-
// varianterna byter rätt klasser, och att skuggan ALLTID går via --vm-shadow-*.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Surface } from './Surface';

describe('Surface, den delade kort-primitiven', () => {
  it('default: rundat kort med kant, surface-fond och KORT-SKUGGAN via token (inte shadow-md)', () => {
    const { container } = render(<Surface>innehåll</Surface>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('rounded-card');
    expect(el.className).toContain('border-border');
    expect(el.className).toContain('bg-surface');
    // Skuggan går via token (D4), aldrig Tailwinds generiska shadow-md/sm/lg.
    expect(el.className).toContain('shadow-[var(--vm-shadow-card)]');
    expect(el.className).not.toMatch(/\bshadow-(md|sm|lg)\b/);
    // Default-elementet är ett <section> (app-sektions-form).
    expect(el.tagName).toBe('SECTION');
  });

  it('tone="raised" byter till surface-raised-fonden (panel-i-panel)', () => {
    const { container } = render(<Surface tone="raised">x</Surface>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('bg-surface-raised');
  });

  it('tone="plain" lägger INGEN egen fond/kant (ytan bär sin egen dekor)', () => {
    const { container } = render(<Surface tone="plain">x</Surface>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('rounded-card');
    expect(el.className).not.toContain('border-border');
    expect(el.className).not.toContain('bg-surface');
  });

  it('padding="compact"/"none" styr den inre luften; "comfortable" är default', () => {
    const { container: comfortable } = render(<Surface>x</Surface>);
    expect((comfortable.firstElementChild as HTMLElement).className).toContain('p-5');

    const { container: compact } = render(<Surface padding="compact">x</Surface>);
    expect((compact.firstElementChild as HTMLElement).className).toContain('p-4');

    const { container: none } = render(<Surface padding="none">x</Surface>);
    const el = none.firstElementChild as HTMLElement;
    expect(el.className).not.toMatch(/\bp-5\b/);
    expect(el.className).not.toMatch(/\bp-4\b/);
  });

  it('interactive=true lägger en token-driven hover-elevation (inte en default-skugga)', () => {
    const { container } = render(<Surface interactive>x</Surface>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('hover:shadow-[var(--vm-shadow-raised)]');
  });

  it('as + extra props (className, data-*) komponeras igenom', () => {
    const { container } = render(
      <Surface as="article" className="custom-x" data-test-surface="">
        x
      </Surface>
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe('ARTICLE');
    expect(el.className).toContain('custom-x');
    expect(el.getAttribute('data-test-surface')).toBe('');
  });
});
