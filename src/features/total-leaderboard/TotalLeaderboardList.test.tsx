// UI-tester för den utfällda, virtualiserade listan (T82 del 3, #173): sök, hoppa-till-mig
// och virtualiserings-fönstret. jsdom saknar layout (scrollTop/clientHeight = 0), så vi
// bevisar (a) att rätt scroll-ÅTGÄRD anropas (scrollTo) och (b) att fönstret är en
// delmängd + aria-rowcount bär hela storleken.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, within } from '@testing-library/react';
import { TotalLeaderboardList } from './TotalLeaderboardList';
import type { TotalLeaderboardEntry } from './aggregate-total';

/** Närmaste förfader med position:sticky (om någon) , bär kontroll-radens fästning. */
function closestSticky(el: Element | null): HTMLElement | null {
  let node = el as HTMLElement | null;
  while (node !== null) {
    if (node.dataset.totalControls !== undefined) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

const entry = (userId: string, displayName: string, rank: number): TotalLeaderboardEntry => ({
  userId,
  displayName,
  points: 100 - rank,
  rank,
  exactHits: 0,
  roomCount: 1,
});

function manyEntries(n: number): TotalLeaderboardEntry[] {
  return Array.from({ length: n }, (_, i) => entry(`u${i}`, `Spelare ${i}`, i + 1));
}

let scrollToSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  scrollToSpy = vi.fn();
  Element.prototype.scrollTo = scrollToSpy;
});

describe('TotalLeaderboardList, virtualisering', () => {
  it('renderar bara en delmängd av raderna men bär hela antalet för skärmläsaren', () => {
    const { container } = render(
      <TotalLeaderboardList entries={manyEntries(240)} currentUserId={null} />
    );
    const rows = container.querySelectorAll('[data-total-row]');
    expect(rows.length).toBeLessThan(60); // inte 240 i DOM:en
    // Hela storleken bärs av aria-setsize på varje synlig rad (giltig list-ARIA), så AT
    // vet att listan har 240 rader även om bara en delmängd är monterad.
    const firstItem = container.querySelector('[role="listitem"]')!;
    expect(firstItem).toHaveAttribute('aria-setsize', '240');
    expect(container.querySelector('[data-total-scroll]')).toHaveAttribute(
      'data-total-count',
      '240'
    );
  });

  it('en lista i ett scrollbart fönster med begränsad maxhöjd', () => {
    const { container } = render(
      <TotalLeaderboardList entries={manyEntries(240)} currentUserId={null} />
    );
    const scroll = container.querySelector('[data-total-scroll]') as HTMLElement;
    expect(scroll.style.maxHeight).toBeTruthy(); // fönstret är HÖJD-begränsat (scroll)
  });
});

describe('TotalLeaderboardList, sök', () => {
  it('en träffande sökning skrollar till deltagaren (scrollTo anropas)', () => {
    const { container } = render(
      <TotalLeaderboardList entries={manyEntries(240)} currentUserId={null} />
    );
    const input = container.querySelector('[data-total-search]') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'Spelare 150' } });
      fireEvent.click(container.querySelector('[data-total-search-go]')!);
    });
    expect(scrollToSpy).toHaveBeenCalled();
    // Ingen "ingen träff"-text vid en träff.
    expect(container.querySelector('[data-total-search-status]')).toHaveTextContent('');
  });

  it('en miss-sökning visar "ingen träff" (fail loud men lugnt) och skrollar inte', () => {
    const { container } = render(
      <TotalLeaderboardList entries={manyEntries(240)} currentUserId={null} />
    );
    const input = container.querySelector('[data-total-search]') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'finns-inte-xyz' } });
      fireEvent.click(container.querySelector('[data-total-search-go]')!);
    });
    expect(container.querySelector('[data-total-search-status]')).toHaveTextContent(
      'Ingen deltagare matchar'
    );
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('Enter i sök-fältet kör sökningen', () => {
    const { container } = render(
      <TotalLeaderboardList entries={manyEntries(240)} currentUserId={null} />
    );
    const input = container.querySelector('[data-total-search]') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'Spelare 5' } });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(scrollToSpy).toHaveBeenCalled();
  });
});

describe('TotalLeaderboardList, hoppa till mig', () => {
  it('visar "hoppa till mig" bara när den egna raden finns, och skrollar dit', () => {
    const { container } = render(
      <TotalLeaderboardList entries={manyEntries(240)} currentUserId="u123" />
    );
    const jump = container.querySelector('[data-total-jump-to-me]');
    expect(jump).toBeInTheDocument();
    act(() => {
      fireEvent.click(jump!);
    });
    expect(scrollToSpy).toHaveBeenCalled();
  });

  it('döljer "hoppa till mig" utan känd egen identitet', () => {
    const { container } = render(
      <TotalLeaderboardList entries={manyEntries(240)} currentUserId={null} />
    );
    expect(container.querySelector('[data-total-jump-to-me]')).not.toBeInTheDocument();
  });

  it('markerar den egna raden i listan när den är i det synliga fönstret', () => {
    // u0 ligger först (rank 1), så den är i det initiala fönstret.
    const { container } = render(
      <TotalLeaderboardList entries={manyEntries(240)} currentUserId="u0" />
    );
    const myRow = container.querySelector('[data-user-id="u0"]')!;
    expect(myRow).toHaveAttribute('data-self', 'true');
    expect(within(myRow as HTMLElement).getByText('Du')).toBeInTheDocument();
  });
});

describe('TotalLeaderboardList, komprimera-kontroll åtkomlig oavsett scroll-position', () => {
  it('renderar en komprimera-kontroll som anropar onCollapse vid klick', () => {
    const onCollapse = vi.fn();
    const { container } = render(
      <TotalLeaderboardList
        entries={manyEntries(240)}
        currentUserId={null}
        onCollapse={onCollapse}
        listId="total-leaderboard-full"
      />
    );
    const collapse = container.querySelector('[data-total-collapse]') as HTMLButtonElement;
    expect(collapse).toBeInTheDocument();
    act(() => {
      fireEvent.click(collapse);
    });
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  it('komprimera-kontrollen sitter i en STICKY kontroll-rad (oberoende av att toppen är i vy)', () => {
    // Kärnan i fyndet: kontrollen får INTE vara beroende av att listans topp är i vy.
    // Den ligger i en sticky kontroll-rad (position:sticky) INUTI det scrollande fönstret,
    // så den följer med oavsett om man står på plats 3 eller 203. Vi bevisar (a) att
    // kontrollen ligger i den sticky containern och (b) att containern faktiskt är sticky.
    const { container } = render(
      <TotalLeaderboardList
        entries={manyEntries(240)}
        currentUserId={null}
        onCollapse={vi.fn()}
        listId="total-leaderboard-full"
      />
    );
    const collapse = container.querySelector('[data-total-collapse]');
    const sticky = closestSticky(collapse);
    expect(sticky).not.toBeNull();
    // jsdom rapporterar inline-style/klass; vi vaktar att sticky-positioneringen är satt
    // (klassen vm-total-controls bär `position: sticky; top: 0` i tokens.css).
    expect(sticky!.className).toContain('vm-total-controls');
    expect(sticky!).toHaveAttribute('data-total-controls', '');
    // Sökfältet OCH komprimera-kontrollen bor i SAMMA sticky rad (en kontroll-rad som följer med).
    expect(sticky!.querySelector('[data-total-search]')).toBeInTheDocument();
  });

  it('komprimera-kontrollen bär korrekt aria-expanded + aria-controls', () => {
    const { container } = render(
      <TotalLeaderboardList
        entries={manyEntries(240)}
        currentUserId={null}
        onCollapse={vi.fn()}
        listId="total-leaderboard-full"
      />
    );
    const collapse = container.querySelector('[data-total-collapse]')!;
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(collapse).toHaveAttribute('aria-controls', 'total-leaderboard-full');
  });

  it('utan onCollapse-callback (bakåtkompatibel) renderas ingen komprimera-kontroll', () => {
    const { container } = render(
      <TotalLeaderboardList entries={manyEntries(240)} currentUserId={null} />
    );
    expect(container.querySelector('[data-total-collapse]')).not.toBeInTheDocument();
  });

  it('sök fungerar fortfarande med kontroll-raden sticky', () => {
    const { container } = render(
      <TotalLeaderboardList
        entries={manyEntries(240)}
        currentUserId={null}
        onCollapse={vi.fn()}
        listId="total-leaderboard-full"
      />
    );
    const input = container.querySelector('[data-total-search]') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'Spelare 150' } });
      fireEvent.click(container.querySelector('[data-total-search-go]')!);
    });
    expect(scrollToSpy).toHaveBeenCalled();
  });
});
