// UI-tester för den totala topplistans vy (T82 del 3, #173). Injicerar storen direkt
// (samma mönster som T17:s LeaderboardView.test), så vyn testas isolerat. Bevisar:
// hjälte-kortet visar rätt rang + total, egen rad markerad, utfäll fungerar, och
// virtualiseringen renderar INTE alla 240 rader på en gång (DOM-vägg-skyddet).

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { TotalLeaderboardView } from './TotalLeaderboardView';
import {
  TotalLeaderboardStoreContext,
  type TotalLeaderboardStore,
} from './total-leaderboard-context';
import type { TotalLeaderboardEntry, TotalSelfSummary } from './aggregate-total';

function store(partial: Partial<TotalLeaderboardStore>): TotalLeaderboardStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    total: [],
    selfSummary: null,
    currentUserId: null,
    ...partial,
  };
}

function renderView(s: TotalLeaderboardStore) {
  return render(
    <TotalLeaderboardStoreContext.Provider value={s}>
      <TotalLeaderboardView />
    </TotalLeaderboardStoreContext.Provider>
  );
}

const entry = (
  userId: string,
  displayName: string,
  points: number,
  rank: number
): TotalLeaderboardEntry => ({ userId, displayName, points, rank, exactHits: 0 });

/** Bygg N spridda rader (för virtualiserings-/utfälls-testet). */
function manyEntries(n: number): TotalLeaderboardEntry[] {
  return Array.from({ length: n }, (_, i) => entry(`u${i}`, `Spelare ${i}`, n - i, i + 1));
}

// jsdom har ingen layout, så scrollToIndex/scroll-mätningen är inert; det räcker för att
// bevisa att fönstret renderar en DELMÄNGD. Stubba scrollTo så smooth-scrollen inte kastar.
beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
});

describe('TotalLeaderboardView, lägen', () => {
  it('renderar i ett etiketterat section-landmark', () => {
    renderView(store({ total: [entry('u1', 'Anna', 5, 1)] }));
    expect(screen.getByRole('heading', { name: 'Global topplista' })).toBeInTheDocument();
  });

  it('FEL-väg fail-loud:ar i en role=alert', () => {
    renderView(store({ status: 'error', error: 'Kunde inte ladda.' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Kunde inte ladda.');
  });

  it('LADDNING visar en role=status', () => {
    const { container } = renderView(store({ status: 'loading' }));
    expect(container.querySelector('[data-total-loading]')).toBeInTheDocument();
  });

  it('TOM total visar tom-text', () => {
    const { container } = renderView(store({ total: [] }));
    expect(container.querySelector('[data-total-empty]')).toBeInTheDocument();
  });
});

describe('TotalLeaderboardView, hjälten (din placering)', () => {
  it('visar rätt rang + total + poäng i hjälten', () => {
    const selfSummary: TotalSelfSummary = {
      points: 87,
      rank: 2,
      totalParticipants: 240,
    };
    const { container } = renderView(
      store({
        total: [entry('lead', 'Ledaren', 99, 1), entry('me', 'Daniel', 87, 2)],
        selfSummary,
        currentUserId: 'me',
      })
    );
    const hero = container.querySelector('[data-total-self-hero]');
    expect(hero).toBeInTheDocument();
    expect(hero).toHaveAttribute('data-rank', '2');
    expect(hero).toHaveAttribute('data-points', '87');
    // Skärmläsar-meningen bär hela placeringen i ord ("2:a av 240 ... 87 poäng").
    expect(hero).toHaveTextContent('2:a av 240');
    expect(hero).toHaveTextContent('87 poäng');
  });

  it('utan känd egen rad (selfSummary null) visas ingen hjälte', () => {
    const { container } = renderView(
      store({ total: [entry('u1', 'Anna', 5, 1)], selfSummary: null, currentUserId: null })
    );
    expect(container.querySelector('[data-total-self-hero]')).not.toBeInTheDocument();
  });
});

describe('TotalLeaderboardView, egen rad markerad', () => {
  it('markerar den inloggade spelarens rad med data-self (komprimerat läge)', () => {
    const { container } = renderView(
      store({
        total: [entry('a', 'Anna', 9, 1), entry('me', 'Daniel', 7, 2)],
        currentUserId: 'me',
      })
    );
    const podium = container.querySelector('[data-total-podium]')!;
    const myRow = podium.querySelector('[data-user-id="me"]')!;
    expect(myRow).toHaveAttribute('data-self', 'true');
    // En DU-bricka bär "du" som TEXT (färg-oberoende redundans).
    expect(within(myRow as HTMLElement).getByText('Du')).toBeInTheDocument();
    // En ANNAN rad är inte markerad.
    const other = podium.querySelector('[data-user-id="a"]')!;
    expect(other).not.toHaveAttribute('data-self');
  });

  it('ledaren (rank 1) markeras med data-leader', () => {
    const { container } = renderView(store({ total: [entry('a', 'Anna', 9, 1)] }));
    const row = container.querySelector('[data-user-id="a"]')!;
    expect(row).toHaveAttribute('data-leader', 'true');
  });
});

describe('TotalLeaderboardView, komprimerat -> utfällt', () => {
  it('komprimerat visar BARA topp-5 (pallen), inte hela listan', () => {
    const { container } = renderView(store({ total: manyEntries(240) }));
    const podium = container.querySelector('[data-total-podium]')!;
    const rows = podium.querySelectorAll('[data-total-row]');
    expect(rows.length).toBe(5); // pallen = 5, inte 240
    // Den utfällda listan finns INTE än.
    expect(container.querySelector('[data-total-full]')).not.toBeInTheDocument();
  });

  it('"Visa alla N"-knappen visar rätt antal och fäller ut den fulla listan', () => {
    const { container } = renderView(store({ total: manyEntries(240) }));
    const toggle = container.querySelector('[data-total-expand-toggle]')!;
    expect(toggle).toHaveTextContent('Visa alla 240');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    act(() => {
      fireEvent.click(toggle);
    });

    // I utfällt läge tar listans sticky KOMPRIMERA-kontroll över; View:ns egen expand-toggle
    // duplicerar inte en kontroll ovanför fönstret (den skulle skrolla ur synhåll).
    expect(container.querySelector('[data-total-expand-toggle]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-total-full]')).toBeInTheDocument();
    const collapse = container.querySelector('[data-total-collapse]')!;
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    // Pallen göms i utfällt läge (full listan tar över).
    expect(container.querySelector('[data-total-podium]')).not.toBeInTheDocument();
  });

  it('VIRTUALISERING: utfällt renderar bara en DELMÄNGD av 240 rader, inte alla', () => {
    const { container } = renderView(store({ total: manyEntries(240) }));
    act(() => {
      fireEvent.click(container.querySelector('[data-total-expand-toggle]')!);
    });
    const full = container.querySelector('[data-total-full]')!;
    const rows = full.querySelectorAll('[data-total-row]');
    // Bara det synliga fönstret (+ overscan) ska vara i DOM:en, LÅNGT under 240.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(60);
    // Men aria-setsize talar om att HELA listan har 240 rader (AT får sanningen).
    const firstItem = full.querySelector('[role="listitem"]')!;
    expect(firstItem).toHaveAttribute('aria-setsize', '240');
  });

  it('utfällt: en KOMPRIMERA-kontroll bor i den sticky kontroll-raden INUTI listan (alltid nåbar)', () => {
    // Ägarens fynd: man måste kunna komprimera från ALLA scroll-lägen utan att skrolla
    // tillbaka. Den sticky komprimera-kontrollen ligger i listans kontroll-rad, inte
    // ovanför fönstret, så den följer med när man bläddrar djupt i listan.
    const { container } = renderView(store({ total: manyEntries(240) }));
    act(() => {
      fireEvent.click(container.querySelector('[data-total-expand-toggle]')!);
    });
    const full = container.querySelector('[data-total-full]')!;
    const collapse = full.querySelector('[data-total-collapse]')!;
    expect(collapse).toBeInTheDocument();
    expect(collapse).toHaveAttribute('aria-controls', 'total-leaderboard-full');
  });

  it('utfällt: View duplicerar INTE sin egen expand-toggle (sticky komprimera tar över)', () => {
    // I utfällt läge skulle View:ns egen toggle skrolla ur synhåll (det var hela problemet).
    // Den kanoniska komprimera-kontrollen är den sticky inuti listan, så View:ns toggle
    // ska bara finnas i KOMPRIMERAT läge (för "Visa alla N"-affordansen), inte dupliceras.
    const { container } = renderView(store({ total: manyEntries(240) }));
    act(() => {
      fireEvent.click(container.querySelector('[data-total-expand-toggle]')!);
    });
    expect(container.querySelector('[data-total-expand-toggle]')).not.toBeInTheDocument();
  });

  it('klick på listans sticky KOMPRIMERA fäller in den fulla listan igen (tillbaka till pallen)', () => {
    const { container } = renderView(store({ total: manyEntries(240) }));
    act(() => {
      fireEvent.click(container.querySelector('[data-total-expand-toggle]')!);
    });
    expect(container.querySelector('[data-total-full]')).toBeInTheDocument();

    // Komprimera via den sticky kontrollen INUTI listan (inte via en toggle ovanför fönstret).
    act(() => {
      fireEvent.click(container.querySelector('[data-total-collapse]')!);
    });

    expect(container.querySelector('[data-total-full]')).not.toBeInTheDocument();
    // Tillbaka till komprimerat: pallen + "Visa alla N"-toggeln syns igen.
    expect(container.querySelector('[data-total-podium]')).toBeInTheDocument();
    const toggle = container.querySelector('[data-total-expand-toggle]')!;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Fokus-återgång: efter komprimering ska expand-toggeln ta fokus (ingen tappad fokus
    // när den sticky kontrollen försvinner ur DOM:en).
    expect(toggle).toHaveFocus();
  });
});
