import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Vi mockar motion/react så att:
//  - useReducedMotion kan styras per test (true/false),
//  - motion.div blir en enkel <div> som exponerar de motion-props den fick
//    via data-attribut, så vi kan asserta initial/transition deterministiskt
//    utan att köra en riktig animation i jsdom.
//  - MotionConfig renderar bara sina barn.
const mockUseReducedMotion = vi.fn<() => boolean>();

vi.mock('motion/react', () => {
  return {
    useReducedMotion: () => mockUseReducedMotion(),
    MotionConfig: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      div: ({
        children,
        initial,
        animate,
        transition,
        ...rest
      }: {
        children?: React.ReactNode;
        initial?: unknown;
        animate?: unknown;
        transition?: unknown;
        [key: string]: unknown;
      }) => (
        <div
          data-initial={JSON.stringify(initial)}
          data-animate={JSON.stringify(animate)}
          data-transition={JSON.stringify(transition)}
          {...(rest as React.HTMLAttributes<HTMLDivElement>)}
        >
          {children}
        </div>
      ),
    },
  };
});

// Importeras EFTER mocken så att komponenterna plockar upp den mockade modulen.
const { Fade } = await import('./Fade');
const { Slide } = await import('./Slide');
const { Spring } = await import('./Spring');
const { MotionProvider } = await import('./MotionProvider');

afterEach(() => {
  vi.clearAllMocks();
});

function initialOf(testId: string): Record<string, unknown> {
  const raw = screen.getByTestId(testId).getAttribute('data-initial');
  return JSON.parse(raw ?? '{}') as Record<string, unknown>;
}

function animateOf(testId: string): Record<string, unknown> {
  const raw = screen.getByTestId(testId).getAttribute('data-animate');
  return JSON.parse(raw ?? '{}') as Record<string, unknown>;
}

describe('rörelse-primitiver, render', () => {
  it('Fade renderar sina barn', () => {
    mockUseReducedMotion.mockReturnValue(false);
    render(<Fade data-testid="fade">innehåll</Fade>);
    expect(screen.getByText('innehåll')).toBeInTheDocument();
  });

  it('Slide renderar sina barn', () => {
    mockUseReducedMotion.mockReturnValue(false);
    render(<Slide data-testid="slide">innehåll</Slide>);
    expect(screen.getByText('innehåll')).toBeInTheDocument();
  });

  it('Spring renderar sina barn', () => {
    mockUseReducedMotion.mockReturnValue(false);
    render(<Spring data-testid="spring">innehåll</Spring>);
    expect(screen.getByText('innehåll')).toBeInTheDocument();
  });

  it('MotionProvider renderar sina barn', () => {
    render(
      <MotionProvider>
        <span>mp-barn</span>
      </MotionProvider>
    );
    expect(screen.getByText('mp-barn')).toBeInTheDocument();
  });
});

describe('Slide, prefers-reduced-motion', () => {
  it('glider (har y-förskjutning) NÄR rörelse är tillåten', () => {
    mockUseReducedMotion.mockReturnValue(false);
    render(<Slide data-testid="slide">x</Slide>);
    const initial = initialOf('slide');
    // Default-riktning 'up' => positiv y-förskjutning som start.
    expect(initial.y).toBeTypeOf('number');
    expect(initial.y).not.toBe(0);
  });

  it('reser tillbaka till x/y=0 i animate-målet NÄR rörelse är tillåten', () => {
    mockUseReducedMotion.mockReturnValue(false);
    render(<Slide data-testid="slide">x</Slide>);
    const animate = animateOf('slide');
    // Med rörelse tillåten ska målet nollställa transform: tona in OCH resa hem.
    expect(animate.opacity).toBe(1);
    expect(animate.x).toBe(0);
    expect(animate.y).toBe(0);
  });

  it('glider INTE (ingen transform, bara opacitet) NÄR användaren bett om reducerad rörelse', () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<Slide data-testid="slide">x</Slide>);
    const initial = initialOf('slide');
    // Reducerad rörelse: bara opacitet, ingen x/y-resa.
    expect(initial).toHaveProperty('opacity');
    expect(initial.x).toBeUndefined();
    expect(initial.y).toBeUndefined();
  });

  it('animate-målet utelämnar x/y (bara opacitet) NÄR användaren bett om reducerad rörelse', () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<Slide data-testid="slide">x</Slide>);
    const animate = animateOf('slide');
    // Kärnan i fyndet: animate fick tidigare alltid x/y=0 och applicerade
    // transform även i reduced-motion-läge. Nu ska målet bara vara opacitet.
    expect(animate.opacity).toBe(1);
    expect(animate.x).toBeUndefined();
    expect(animate.y).toBeUndefined();
  });

  it('respekterar riktning (left ger x-förskjutning) när rörelse är tillåten', () => {
    mockUseReducedMotion.mockReturnValue(false);
    render(
      <Slide data-testid="slide" direction="left">
        x
      </Slide>
    );
    const initial = initialOf('slide');
    expect(initial.x).toBeTypeOf('number');
    expect(initial.x).not.toBe(0);
  });
});

describe('Spring, prefers-reduced-motion', () => {
  it('poppar (har skala) NÄR rörelse är tillåten', () => {
    mockUseReducedMotion.mockReturnValue(false);
    render(<Spring data-testid="spring">x</Spring>);
    const initial = initialOf('spring');
    expect(initial.scale).toBeTypeOf('number');
    expect(initial.scale).not.toBe(1);
  });

  it('poppar INTE (ingen skala, bara opacitet) vid reducerad rörelse', () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<Spring data-testid="spring">x</Spring>);
    const initial = initialOf('spring');
    expect(initial).toHaveProperty('opacity');
    expect(initial.scale).toBeUndefined();
  });
});
