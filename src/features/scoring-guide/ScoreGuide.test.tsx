import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScoreGuide } from './ScoreGuide';
import { formatScorePoints, buildScoreExplainer } from './score-explainer-items';
import {
  PREDICTION_POINTS,
  GROUP_PREDICTION_POINTS,
  BRACKET_ROUND_POINTS,
  CHAMPION_PREDICTION_POINTS,
} from '../../data/predictions';

describe('ScoreGuide, "Så funkar poängen"-knapp + a11y-dialog', () => {
  it('visar en inbjudande knapp, dialogen är stängd som default', () => {
    render(<ScoreGuide />);
    const trigger = screen.getByRole('button', { name: /Så funkar poängen/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('öppnar en korrekt modal-dialog (role=dialog + aria-modal + märkt av rubriken)', async () => {
    render(<ScoreGuide />);
    fireEvent.click(screen.getByRole('button', { name: /Så funkar poängen/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(/Så funkar poängen/);
  });

  it('Escape stänger dialogen (a11y)', async () => {
    render(<ScoreGuide />);
    fireEvent.click(screen.getByRole('button', { name: /Så funkar poängen/i }));
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('stäng-knappen stänger dialogen', async () => {
    render(<ScoreGuide />);
    fireEvent.click(screen.getByRole('button', { name: /Så funkar poängen/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stäng förklaringen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('klick på bakgrunden (overlay) stänger, klick i panelen gör det inte', async () => {
    render(<ScoreGuide />);
    fireEvent.click(screen.getByRole('button', { name: /Så funkar poängen/i }));
    const dialog = await screen.findByRole('dialog');

    // Klick i panelen ska INTE stänga (stopPropagation).
    fireEvent.click(dialog);
    expect(screen.queryByRole('dialog')).toBeInTheDocument();

    // Klick på overlayn (bakgrunden) stänger.
    const overlay = document.querySelector('[data-score-guide-overlay]');
    fireEvent.click(overlay as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  // BUGGFIX-mönster ärvt från SettingsControl (T32, #54): overlayn PORTALERAS till
  // document.body så en header med sticky/backdrop-filter inte klämmer in den.
  // jsdom räknar inte stacking contexts, så vi vaktar den TESTBARA invarianten:
  // overlayn är ett direkt barn av <body>, inte nästlad i komponentens egen container.
  it('portalerar overlayn till document.body (topplager, inte instängd i triggerns träd)', () => {
    const { container } = render(<ScoreGuide />);
    fireEvent.click(screen.getByRole('button', { name: /Så funkar poängen/i }));
    const overlay = document.querySelector('[data-score-guide-overlay]');
    expect(overlay).not.toBeNull();
    expect(container.contains(overlay)).toBe(false);
    expect(overlay?.parentElement).toBe(document.body);
  });

  it('surface-namnrymd ger stabila, egna data-krokar per mount-punkt', async () => {
    render(<ScoreGuide surface="topplista" />);
    const trigger = screen.getByRole('button', { name: /Så funkar poängen/i });
    expect(trigger).toHaveAttribute('data-score-guide-open', 'topplista');
    fireEvent.click(trigger);
    await screen.findByRole('dialog');
    expect(document.querySelector('[data-score-guide-overlay="topplista"]')).not.toBeNull();
    expect(document.querySelector('[data-score-guide-dialog="topplista"]')).not.toBeNull();
  });
});

// MUTATIONS-VAKT i UI:t (HARD-krav, #62): den RENDERADE poäng-texten ska vara exakt
// vad konstanterna ger (via formatScorePoints), inte en hårdkodad siffra. Ändras en
// konstant följer både den härledda förväntan OCH den renderade texten med, så testet
// förblir grönt OCH sant. En hårdkodad siffra i ScoreGuide.tsx skulle drifta från
// konstanten och rödna här. Vi läser texten ur SJÄLVA regel-radens DOM-nod (det
// användaren ser), inte bara ur hela dialogen.
describe('ScoreGuide, renderade tal följer poäng-konstanterna (ingen hårdkodad dubblett)', () => {
  function openAndGetRuleText(ruleId: string): string {
    render(<ScoreGuide />);
    fireEvent.click(screen.getByRole('button', { name: /Så funkar poängen/i }));
    const rule = document.querySelector(`[data-score-guide-rule="${ruleId}"]`);
    expect(rule).not.toBeNull();
    return (rule as HTMLElement).textContent ?? '';
  }

  it('matchtips, exakt: visar formatScorePoints(PREDICTION_POINTS.exact)', () => {
    const text = openAndGetRuleText('match-exact');
    expect(text).toContain(formatScorePoints({ kind: 'fixed', value: PREDICTION_POINTS.exact }));
  });

  it('matchtips, rätt vinnare: visar formatScorePoints(PREDICTION_POINTS.outcome)', () => {
    const text = openAndGetRuleText('match-outcome');
    expect(text).toContain(formatScorePoints({ kind: 'fixed', value: PREDICTION_POINTS.outcome }));
  });

  it('grupptips, vinnare: visar formatScorePoints(GROUP_PREDICTION_POINTS.winner)', () => {
    const text = openAndGetRuleText('group-winner');
    expect(text).toContain(
      formatScorePoints({ kind: 'fixed', value: GROUP_PREDICTION_POINTS.winner })
    );
  });

  it('grupptips, tvåa: visar formatScorePoints(GROUP_PREDICTION_POINTS.runnerUp)', () => {
    const text = openAndGetRuleText('group-runner-up');
    expect(text).toContain(
      formatScorePoints({ kind: 'fixed', value: GROUP_PREDICTION_POINTS.runnerUp })
    );
  });

  it('slutspelet: visar BRACKET_ROUND_POINTS faktiska min-max som intervall', () => {
    const values = Object.values(BRACKET_ROUND_POINTS);
    const expected = formatScorePoints({
      kind: 'range',
      min: Math.min(...values),
      max: Math.max(...values),
    });
    expect(openAndGetRuleText('bracket-advance')).toContain(expected);
  });

  it('VM-vinnaren: visar formatScorePoints(CHAMPION_PREDICTION_POINTS)', () => {
    const text = openAndGetRuleText('champion-pick');
    expect(text).toContain(formatScorePoints({ kind: 'fixed', value: CHAMPION_PREDICTION_POINTS }));
  });

  it('alla regel-rader ur buildScoreExplainer renderas i dialogen', () => {
    render(<ScoreGuide />);
    fireEvent.click(screen.getByRole('button', { name: /Så funkar poängen/i }));
    for (const item of buildScoreExplainer().flatMap((s) => s.items)) {
      expect(document.querySelector(`[data-score-guide-rule="${item.id}"]`)).not.toBeNull();
    }
  });
});
