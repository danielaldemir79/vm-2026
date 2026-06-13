// Tester för MatchReactions (T24, #24): UI-beteendet (reagera anropar react, byta emoji,
// ta bort egen, aggregat-räkning renderas, väljaren fälls ut, inaktivt lager döljs).

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
// Inget @testing-library/user-event (projektet undviker det beroendet, se ThemeToggle/
// ResultEntryForm-testerna): fireEvent.click + act räcker för dessa klick-flöden.
import { MatchReactions } from './MatchReactions';
import type { ReactionsStore } from './reactions-context';
import type { MatchReactionSummary, ReactionReactor, ReactionTally } from './reaction-aggregate';
import type { ReactionEmoji } from '../../data/rooms';

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
    nameByUser: new Map(),
    react: vi.fn().mockResolvedValue(undefined),
    removeReaction: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

/**
 * Bygg en ReactionTally med reagerare. Default: `count` syntetiska reagerare (u0, u1...),
 * äldst-först, så popover-rader finns att visa i T74-testerna. `reactors` kan överstyras.
 */
function tally(
  emoji: ReactionEmoji,
  count: number,
  mine: boolean,
  reactors?: ReactionReactor[]
): ReactionTally {
  const fallback: ReactionReactor[] = Array.from({ length: count }, (_, i) => ({
    userId: `u${i}`,
    createdAt: `2026-06-12T10:0${i}:00Z`,
  }));
  return { emoji, count, mine, reactors: reactors ?? fallback };
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
            tallies: [tally('⚽', 1, false), tally('🔥', 2, true)],
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
            tallies: [tally('⚽', 1, true), tally('🔥', 1, false)],
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
            tallies: [tally('🔥', 1, true)],
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
            tallies: [tally('🔥', 1, true)],
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

describe('MatchReactions , se VILKA som reagerat (T74, #157)', () => {
  // En match med 🔥 från två personer (en känd, en okänd = lämnat rummet) + namn-uppslag.
  function fireStore() {
    return makeStore({
      userId: 'me',
      nameByUser: new Map([
        ['u1', 'Daniel'],
        ['me', 'Jag Själv'],
      ]),
      byMatch: new Map([
        [
          'g-A-1',
          summary({
            myEmoji: '🔥',
            total: 2,
            tallies: [
              tally('🔥', 2, true, [
                { userId: 'u1', createdAt: '2026-06-12T10:00:00Z' },
                { userId: 'me', createdAt: '2026-06-12T10:05:00Z' },
              ]),
            ],
          }),
        ],
      ]),
    });
  }

  it('långtryck (håll förbi tröskeln) visar popovern med VILKA som reagerat', () => {
    vi.useFakeTimers();
    try {
      store.current = fireStore();
      render(<MatchReactions matchId="g-A-1" />);
      const tallyBtn = screen.getByRole('button', { name: /het match, 2 reaktioner/ });

      // Ingen popover före hållet.
      expect(screen.queryByRole('tooltip')).toBeNull();

      act(() => {
        fireEvent.pointerDown(tallyBtn);
        vi.advanceTimersByTime(500); // tröskeln nådd -> popover
      });

      const popover = screen.getByRole('tooltip');
      expect(popover).toBeInTheDocument();
      // Namnen syns (en känd medlem + jag), inte råa user-id:n.
      expect(within(popover).getByText('Daniel')).toBeInTheDocument();
      expect(within(popover).getByText(/Jag Själv/)).toBeInTheDocument();
      // aria-describedby knyter brickan till popovern (skärmläsare).
      expect(tallyBtn).toHaveAttribute('aria-describedby', popover.id);
    } finally {
      vi.useRealTimers();
    }
  });

  it('släpper man fingret (pointerup) försvinner popovern', () => {
    vi.useFakeTimers();
    try {
      store.current = fireStore();
      render(<MatchReactions matchId="g-A-1" />);
      const tallyBtn = screen.getByRole('button', { name: /het match, 2 reaktioner/ });

      act(() => {
        fireEvent.pointerDown(tallyBtn);
        vi.advanceTimersByTime(500);
      });
      expect(screen.getByRole('tooltip')).toBeInTheDocument();

      act(() => fireEvent.pointerUp(tallyBtn));
      expect(screen.queryByRole('tooltip')).toBeNull(); // dold igen
    } finally {
      vi.useRealTimers();
    }
  });

  it('ett LÅNGTRYCK togglar INTE reaktionen (click efter långtryck sväljs)', () => {
    vi.useFakeTimers();
    try {
      const s = fireStore();
      store.current = s;
      render(<MatchReactions matchId="g-A-1" />);
      const tallyBtn = screen.getByRole('button', { name: /het match, 2 reaktioner/ });

      act(() => {
        fireEvent.pointerDown(tallyBtn);
        vi.advanceTimersByTime(500); // blev ett långtryck
        fireEvent.pointerUp(tallyBtn);
        fireEvent.click(tallyBtn); // click:et som följer ett långtryck
      });
      // Håll-gesten ska bara VISA vilka, inte avmarkera/byta reaktionen.
      expect(s.removeReaction).not.toHaveBeenCalled();
      expect(s.react).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ett vanligt TAP (släpp före tröskeln) togglar reaktionen som förr, ingen popover', () => {
    vi.useFakeTimers();
    try {
      const s = fireStore();
      store.current = s;
      render(<MatchReactions matchId="g-A-1" />);
      const tallyBtn = screen.getByRole('button', { name: /het match, 2 reaktioner/ });

      act(() => {
        fireEvent.pointerDown(tallyBtn);
        vi.advanceTimersByTime(150); // släpp tidigt = tap
        fireEvent.pointerUp(tallyBtn);
        fireEvent.click(tallyBtn);
      });
      expect(screen.queryByRole('tooltip')).toBeNull();
      // 🔥 är min -> tap avmarkerar (removeReaction), precis som utan T74.
      expect(s.removeReaction).toHaveBeenCalledWith('g-A-1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('FOCUS på brickan visar popovern (tangentbord/desktop, utan touch)', () => {
    store.current = fireStore();
    render(<MatchReactions matchId="g-A-1" />);
    const tallyBtn = screen.getByRole('button', { name: /het match, 2 reaktioner/ });

    act(() => fireEvent.focus(tallyBtn));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    act(() => fireEvent.blur(tallyBtn));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('HOVER (pointerenter mus) visar popovern, pointerleave döljer', () => {
    store.current = fireStore();
    render(<MatchReactions matchId="g-A-1" />);
    const tallyBtn = screen.getByRole('button', { name: /het match, 2 reaktioner/ });

    act(() => fireEvent.pointerEnter(tallyBtn, { pointerType: 'mouse' }));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    act(() => fireEvent.pointerLeave(tallyBtn));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('en reagerare som LÄMNAT rummet visas som "Tidigare medlem" (fallback)', () => {
    store.current = makeStore({
      userId: 'me',
      nameByUser: new Map(), // ingen medlem känd
      byMatch: new Map([
        [
          'g-A-1',
          summary({
            total: 1,
            tallies: [
              tally('🎉', 1, false, [{ userId: 'ghost', createdAt: '2026-06-12T10:00:00Z' }]),
            ],
          }),
        ],
      ]),
    });
    render(<MatchReactions matchId="g-A-1" />);
    act(() => fireEvent.focus(screen.getByRole('button', { name: /fira, 1 reaktion/ })));
    expect(within(screen.getByRole('tooltip')).getByText('Tidigare medlem')).toBeInTheDocument();
  });
});
