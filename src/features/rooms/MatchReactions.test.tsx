// Tester för MatchReactions (T24, #24): UI-beteendet (reagera anropar react, byta emoji,
// ta bort egen, aggregat-räkning renderas, väljaren fälls ut, inaktivt lager döljs).

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
// Inget @testing-library/user-event (projektet undviker det beroendet, se ThemeToggle/
// ResultEntryForm-testerna): fireEvent.click + act räcker för dessa klick-flöden.
import { MatchReactions } from './MatchReactions';
import type { ReactionsStore } from './reactions-context';
import type { MatchReactionSummary } from './reaction-aggregate';

// Driv komponenten via en mockad store (vi testar UI:t, inte providern). useReactionsStore
// returnerar vår fejk-store; summaryForMatch är ren och körs mot fejkens byMatch.
const store = vi.hoisted(() => ({ current: null as ReactionsStore | null }));
vi.mock('./reactions-context', () => ({
  useReactionsStore: () => store.current,
}));

function makeStore(over: Partial<ReactionsStore> = {}): ReactionsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    byMatch: new Map(),
    userId: 'me',
    react: vi.fn().mockResolvedValue(undefined),
    removeReaction: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

function summary(over: Partial<MatchReactionSummary> = {}): MatchReactionSummary {
  return { matchId: 'g-A-1', tallies: [], myEmoji: null, total: 0, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.current = null;
});

describe('MatchReactions , synlighet', () => {
  it('renderar INGET när reaktions-lagret är inaktivt (inget rum)', () => {
    store.current = makeStore({ enabled: false });
    const { container } = render(<MatchReactions matchId="g-A-1" />);
    expect(container.querySelector('[data-match-reactions]')).toBeNull();
  });

  it('visar "Reagera"-knappen när inga reaktioner finns än', () => {
    store.current = makeStore();
    render(<MatchReactions matchId="g-A-1" />);
    expect(screen.getByText('Reagera')).toBeInTheDocument();
  });
});

describe('MatchReactions , aggregat-räkning', () => {
  it('renderar brickorna med antal och markerar MIN (aria-pressed)', () => {
    store.current = makeStore({
      byMatch: new Map([
        [
          'g-A-1',
          summary({
            myEmoji: '🔥',
            total: 3,
            tallies: [
              { emoji: '⚽', count: 1, mine: false },
              { emoji: '🔥', count: 2, mine: true },
            ],
          }),
        ],
      ]),
    });
    render(<MatchReactions matchId="g-A-1" />);

    const fire = screen.getByRole('button', { name: /het match, 2 reaktioner, din reaktion/ });
    expect(fire).toHaveAttribute('aria-pressed', 'true');
    expect(within(fire).getByText('2')).toBeInTheDocument();

    const ball = screen.getByRole('button', { name: /mål, 1 reaktion$/ });
    expect(ball).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('MatchReactions , reagera', () => {
  it('väljer en emoji i väljaren -> anropar react(matchId, emoji)', async () => {
    const s = makeStore();
    store.current = s;
    render(<MatchReactions matchId="g-A-1" />);

    // Öppna väljaren, välj 🔥.
    fireEvent.click(screen.getByRole('button', { name: /lägg till en reaktion/i }));
    await waitFor(() =>
      expect(screen.getByRole('group', { name: /välj en reaktion/i })).toBeInTheDocument()
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /reagera med het match/i }));
    });

    expect(s.react).toHaveBeenCalledWith('g-A-1', '🔥');
  });

  it('klick på en BEFINTLIG bricka som INTE är min BYTER till den (react)', async () => {
    const s = makeStore({
      byMatch: new Map([
        [
          'g-A-1',
          summary({
            myEmoji: '⚽',
            total: 2,
            tallies: [
              { emoji: '⚽', count: 1, mine: true },
              { emoji: '🔥', count: 1, mine: false },
            ],
          }),
        ],
      ]),
    });
    store.current = s;
    render(<MatchReactions matchId="g-A-1" />);

    // Klicka 🔥-brickan (inte min) -> byter min reaktion till 🔥.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /het match, 1 reaktion$/ }));
    });
    expect(s.react).toHaveBeenCalledWith('g-A-1', '🔥');
    expect(s.removeReaction).not.toHaveBeenCalled();
  });

  it('klick på MIN egen bricka AVMARKERAR (removeReaction)', async () => {
    const s = makeStore({
      byMatch: new Map([
        [
          'g-A-1',
          summary({
            myEmoji: '🔥',
            total: 1,
            tallies: [{ emoji: '🔥', count: 1, mine: true }],
          }),
        ],
      ]),
    });
    store.current = s;
    render(<MatchReactions matchId="g-A-1" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /het match, 1 reaktion, din reaktion/ }));
    });
    expect(s.removeReaction).toHaveBeenCalledWith('g-A-1');
    expect(s.react).not.toHaveBeenCalled();
  });

  it('väljer MIN nuvarande emoji i väljaren AVMARKERAR (removeReaction)', async () => {
    const s = makeStore({
      byMatch: new Map([
        [
          'g-A-1',
          summary({
            myEmoji: '🔥',
            total: 1,
            tallies: [{ emoji: '🔥', count: 1, mine: true }],
          }),
        ],
      ]),
    });
    store.current = s;
    render(<MatchReactions matchId="g-A-1" />);

    fireEvent.click(screen.getByRole('button', { name: /lägg till en reaktion/i }));
    await waitFor(() =>
      expect(screen.getByRole('group', { name: /välj en reaktion/i })).toBeInTheDocument()
    );
    // 🔥 är redan vald (aria-pressed=true) -> välja den igen avmarkerar.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /reagera med het match, vald/i }));
    });
    expect(s.removeReaction).toHaveBeenCalledWith('g-A-1');
  });

  it('visar ett fel-meddelande om react KASTAR (fail loud i UI)', async () => {
    const s = makeStore({ react: vi.fn().mockRejectedValue(new Error('RLS nekade')) });
    store.current = s;
    render(<MatchReactions matchId="g-A-1" />);

    fireEvent.click(screen.getByRole('button', { name: /lägg till en reaktion/i }));
    await waitFor(() =>
      expect(screen.getByRole('group', { name: /välj en reaktion/i })).toBeInTheDocument()
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /reagera med mål/i }));
    });

    await waitFor(() =>
      expect(screen.getByText('RLS nekade')).toHaveAttribute('data-reactions-error')
    );
  });
});
