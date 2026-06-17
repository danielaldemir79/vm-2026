import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TotalSelfHero } from './TotalSelfHero';
import type { TotalSelfSummary } from './aggregate-total';
import type { SelfRankChange } from './self-rank-snapshot';

const SUMMARY: TotalSelfSummary = { points: 87, rank: 5, totalParticipants: 240 };

function renderHero(change: SelfRankChange | null) {
  return render(<TotalSelfHero summary={SUMMARY} change={change} />);
}

describe('TotalSelfHero, din förändring-indikator (T92 del C)', () => {
  it('visar en UPP-indikator (▲ + antal) när man klättrat sedan senaste besök', () => {
    const { container } = renderHero({ direction: 'up', delta: 3 });
    const change = container.querySelector('[data-total-hero-change]');
    expect(change).toBeInTheDocument();
    expect(change).toHaveAttribute('data-direction', 'up');
    expect(change).toHaveTextContent('▲');
    expect(change).toHaveTextContent('3');
    // Skärmläsar-orden bär rörelsen i text (färg-oberoende redundans).
    expect(change).toHaveTextContent('Upp 3 sedan ditt senaste besök');
  });

  it('visar en NER-indikator (▼ + antal) när man tappat', () => {
    const { container } = renderHero({ direction: 'down', delta: 2 });
    const change = container.querySelector('[data-total-hero-change]');
    expect(change).toHaveAttribute('data-direction', 'down');
    expect(change).toHaveTextContent('▼');
    expect(change).toHaveTextContent('Ner 2 sedan ditt senaste besök');
  });

  it('visar INGEN indikator vid första besöket ("new") , vi gissar ingen rörelse', () => {
    const { container } = renderHero({ direction: 'new', delta: 0 });
    expect(container.querySelector('[data-total-hero-change]')).not.toBeInTheDocument();
  });

  it('visar INGEN indikator vid oförändrad placering ("same")', () => {
    const { container } = renderHero({ direction: 'same', delta: 0 });
    expect(container.querySelector('[data-total-hero-change]')).not.toBeInTheDocument();
  });

  it('visar INGEN indikator när change är null (ingen data)', () => {
    const { container } = renderHero(null);
    expect(container.querySelector('[data-total-hero-change]')).not.toBeInTheDocument();
    // Hjälten själv finns ändå (placeringen ska aldrig hänga på förändrings-datan).
    expect(container.querySelector('[data-total-self-hero]')).toBeInTheDocument();
  });
});
