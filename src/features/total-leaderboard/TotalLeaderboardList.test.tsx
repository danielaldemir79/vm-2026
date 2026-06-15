// UI-tester för den utfällda, virtualiserade listan (T82 del 3, #173): sök, hoppa-till-mig
// och virtualiserings-fönstret. jsdom saknar layout (scrollTop/clientHeight = 0), så vi
// bevisar (a) att rätt scroll-ÅTGÄRD anropas (scrollTo) och (b) att fönstret är en
// delmängd + aria-rowcount bär hela storleken.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, within } from '@testing-library/react';
import { TotalLeaderboardList } from './TotalLeaderboardList';
import type { TotalLeaderboardEntry } from './aggregate-total';

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
