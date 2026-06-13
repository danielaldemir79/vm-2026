// Tester för ReactionAuthorsPopover (T74, #157): tillgänglig text (role=tooltip, namn +
// tid), tom-fallback, och POSITIONERINGS-MEKANIKEN (fixed + klampad inom viewport) , inte
// pixel-position (jsdom har ingen layout; rect:ar är 0). Vi bevisar att den placeras med
// position:fixed och inte hamnar utanför vänster kant (left >= marginalen).

import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, within } from '@testing-library/react';
import { ReactionAuthorsPopover } from './ReactionAuthorsPopover';
import type { ReactionAuthorRow } from './reaction-authors';

function row(over: Partial<ReactionAuthorRow> = {}): ReactionAuthorRow {
  return {
    userId: 'u1',
    name: 'Daniel',
    createdAtIso: '2026-06-12T10:00:00Z',
    mine: false,
    ...over,
  };
}

function renderPopover(authors: ReactionAuthorRow[]) {
  const anchorRef = createRef<HTMLElement>();
  return render(
    <div>
      <button ref={anchorRef as React.Ref<HTMLButtonElement>}>ankare</button>
      <ReactionAuthorsPopover
        id="pop-1"
        emoji="🔥"
        emojiLabel="het match"
        authors={authors}
        anchorRef={anchorRef}
      />
    </div>
  );
}

describe('ReactionAuthorsPopover , tillgänglighet + innehåll', () => {
  it('har role=tooltip + det id triggern pekar på via aria-describedby', () => {
    renderPopover([row()]);
    const popover = screen.getByRole('tooltip');
    expect(popover).toHaveAttribute('id', 'pop-1');
    expect(popover).toHaveAttribute('data-reaction-authors-popover');
  });

  it('listar VILKA som reagerat med namn + en <time> med rå ISO i dateTime', () => {
    renderPopover([row({ name: 'Daniel' }), row({ userId: 'u2', name: 'Elin', mine: true })]);
    const popover = screen.getByRole('tooltip');
    expect(within(popover).getByText('Daniel')).toBeInTheDocument();
    expect(within(popover).getByText('Elin')).toBeInTheDocument();
    // Min rad bär "(du)" (färg-oberoende markering).
    expect(within(popover).getByText(/\(du\)/)).toBeInTheDocument();
    // <time> bär den råa ISO-stämpeln i dateTime (maskinläsbar tid).
    const times = popover.querySelectorAll('time');
    expect(times.length).toBe(2);
    expect(times[0]).toHaveAttribute('dateTime', '2026-06-12T10:00:00Z');
  });

  it('rubriken anger emoji-namnet + antalet', () => {
    renderPopover([row(), row({ userId: 'u2', name: 'Elin' })]);
    expect(screen.getByText(/Reagerade med het match \(2\)/)).toBeInTheDocument();
  });

  it('tom lista ger en begriplig text, inte en trasig tom ruta (defensivt)', () => {
    renderPopover([]);
    expect(screen.getByText(/Ingen har reagerat med den här emojin/)).toBeInTheDocument();
  });
});

describe('ReactionAuthorsPopover , positionering (mekanik, ej pixel)', () => {
  it('placeras med position:fixed och klampas inom viewporten (left >= marginal)', () => {
    renderPopover([row()]);
    const popover = screen.getByRole('tooltip');
    // position:fixed via Tailwind-klassen (klampningen sätter left/top i px).
    expect(popover.className).toContain('fixed');
    // left ska aldrig vara negativt (utanför vänster skärmkant). I jsdom är rect:ar 0,
    // så klampningen faller till marginalen, beviset är att den inte är < 0.
    const left = parseFloat(popover.style.left);
    expect(Number.isNaN(left)).toBe(false);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it('klampar top mot viewportens NEDERKANT (hög popover spiller inte ut under skärmen)', () => {
    // Copilot PR #160: top klampades förr bara mot toppen, så en hög popover kunde
    // hamna delvis under skärmkanten. Mocka en LÅG ankare (nära/under viewport-botten)
    // + en HÖG popover + en liten viewport, och bevisa att top + höjd ryms inom viewporten.
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    const originalInnerHeight = window.innerHeight;
    const POPOVER_HEIGHT = 150;
    const VIEWPORT_H = 200;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
      const isPopover = this.getAttribute('data-reaction-authors-popover') !== null;
      const rect = isPopover
        ? {
            top: 0,
            left: 0,
            right: 200,
            bottom: POPOVER_HEIGHT,
            width: 200,
            height: POPOVER_HEIGHT,
          }
        : { top: 210, left: 50, right: 80, bottom: 234, width: 30, height: 24 }; // ankare lågt
      return { ...rect, x: rect.left, y: rect.top, toJSON: () => ({}) } as DOMRect;
    };
    window.innerHeight = VIEWPORT_H;
    try {
      renderPopover([row()]);
      const popover = screen.getByRole('tooltip');
      const top = parseFloat(popover.style.top);
      // Underkanten (top + höjd) ryms inom viewporten (annars spillde popovern ut).
      // Gamla koden gav top=52 -> 52+150=202 > 200 (overflow); nya klampar top <= 42.
      expect(top + POPOVER_HEIGHT).toBeLessThanOrEqual(VIEWPORT_H);
      expect(top).toBeGreaterThanOrEqual(0);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalRect;
      window.innerHeight = originalInnerHeight;
    }
  });
});
