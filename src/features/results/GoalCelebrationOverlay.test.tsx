import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoalCelebrationOverlay } from './GoalCelebrationOverlay';
import type { GoalCelebration } from './goal-celebration';

// Mocka motion/react så jsdom slipper köra riktiga animationer:
//  - useReducedMotion styrs per test (true/false),
//  - AnimatePresence renderar bara sina barn (vi testar VAD som renderas, inte
//    hur det animerar in/ut),
//  - motion.div/motion.span blir vanliga element så vi kan asserta innehåll +
//    räkna konfetti-bitar deterministiskt.
const mockUseReducedMotion = vi.fn<() => boolean>();

vi.mock('motion/react', () => {
  // Motion-bara props plockas bort så de inte läcker till DOM (React-varning).
  // Vi filtrerar via en nyckel-lista i stället för att destrukturera dem till
  // oanvända variabler (skulle trippa no-unused-vars).
  const MOTION_ONLY = new Set(['initial', 'animate', 'exit', 'transition']);
  const passthrough =
    (Tag: 'div' | 'span') =>
    ({ children, ...rest }: { children?: ReactNode; [key: string]: unknown }) => {
      const domProps: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (!MOTION_ONLY.has(k)) {
          domProps[k] = v;
        }
      }
      return <Tag {...domProps}>{children}</Tag>;
    };

  return {
    useReducedMotion: () => mockUseReducedMotion(),
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: { div: passthrough('div'), span: passthrough('span') },
  };
});

function celebration(overrides: Partial<GoalCelebration> = {}): GoalCelebration {
  return { key: 'm1#1', matchId: 'm1', totalGoals: 3, ...overrides };
}

beforeEach(() => {
  mockUseReducedMotion.mockReturnValue(false); // default: rörelse tillåten
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GoalCelebrationOverlay, vila', () => {
  it('renderar ingen fira-yta när inget firande är aktivt (null)', () => {
    const { container } = render(<GoalCelebrationOverlay celebration={null} />);
    // Den yttre overlay-lådan finns alltid (tom, pointer-events-none), men inget
    // firande-innehåll (ingen "Mål!"-bricka) ska ha renderats.
    expect(screen.queryByText('Mål!')).not.toBeInTheDocument();
    expect(container.querySelector('.absolute.top-0')).toBeNull();
  });
});

describe('GoalCelebrationOverlay, aktivt firande', () => {
  it('visar mål-pop-brickan när ett firande är aktivt', () => {
    render(<GoalCelebrationOverlay celebration={celebration()} />);
    expect(screen.getByText('Mål!')).toBeInTheDocument();
  });

  it('skalar antalet konfetti med totalGoals (fler mål = fler bitar)', () => {
    const { container, rerender } = render(
      <GoalCelebrationOverlay celebration={celebration({ key: 'm1#1', totalGoals: 1 })} />
    );
    const oneGoal = container.querySelectorAll('.absolute.top-0').length;

    rerender(<GoalCelebrationOverlay celebration={celebration({ key: 'm2#1', totalGoals: 3 })} />);
    const threeGoals = container.querySelectorAll('.absolute.top-0').length;

    expect(oneGoal).toBeGreaterThan(0);
    expect(threeGoals).toBeGreaterThan(oneGoal);
  });

  it('kapar konfetti-antalet vid många mål (smakfullt, inte stökigt)', () => {
    const { container } = render(
      <GoalCelebrationOverlay celebration={celebration({ totalGoals: 99 })} />
    );
    // Taket är 70 (CONFETTI_MAX); ett orimligt högt mål-antal får inte spränga det.
    expect(container.querySelectorAll('.absolute.top-0').length).toBe(70);
  });
});

describe('GoalCelebrationOverlay, reducerad rörelse (a11y)', () => {
  it('renderar INGEN konfetti vid reducerad rörelse, men brickan visas statiskt', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const { container } = render(<GoalCelebrationOverlay celebration={celebration()} />);
    // Ingen regnande konfetti (rörelse-tung yta tystas, WCAG 2.3.3) ...
    expect(container.querySelector('.absolute.top-0')).toBeNull();
    // ... men brickan finns kvar (statisk), så ett firande som ändå nådde hit (t.ex.
    // via en framtida icke-rörelse-trigger) inte blir en helt tom yta. I praktiken
    // tänder kroken inget vid reducerad rörelse, så detta är en extra skyddsnät-grind.
    expect(screen.getByText('Mål!')).toBeInTheDocument();
  });
});
