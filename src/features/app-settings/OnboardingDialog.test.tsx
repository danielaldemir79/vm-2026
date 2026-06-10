import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OnboardingDialog } from './OnboardingDialog';
import { ONBOARDING_DONE_KEY } from './storage-keys';
import { ONBOARDING_STEPS, ONBOARDING_STEP_COUNT } from './onboarding';

describe('OnboardingDialog, första-start-tour', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('visar en a11y-dialog vid första start, märkt av första stegets rubrik', () => {
    render(<OnboardingDialog />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(ONBOARDING_STEPS[0].title);
    // Steg-räknaren visar 1 av N.
    expect(screen.getByText(`Steg 1 av ${ONBOARDING_STEP_COUNT}`)).toBeInTheDocument();
  });

  it('renderar INGET när touren redan setts (flaggan satt)', () => {
    window.localStorage.setItem(ONBOARDING_DONE_KEY, '1');
    render(<OnboardingDialog />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('"Nästa" stegar framåt; sista steget visar "Klart" och stänger + persistar', async () => {
    render(<OnboardingDialog />);
    // Stega till sista steget.
    for (let i = 0; i < ONBOARDING_STEP_COUNT - 1; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Nästa' }));
    }
    // Sista steget: knappen heter "Klart", och "Hoppa över" finns inte längre.
    const finishBtn = screen.getByRole('button', { name: 'Klart' });
    expect(screen.queryByRole('button', { name: 'Hoppa över' })).not.toBeInTheDocument();

    fireEvent.click(finishBtn);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(window.localStorage.getItem(ONBOARDING_DONE_KEY)).toBe('1');
  });

  it('"Hoppa över" stänger touren direkt + persistar (visas inte igen)', async () => {
    render(<OnboardingDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Hoppa över' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(window.localStorage.getItem(ONBOARDING_DONE_KEY)).toBe('1');
  });

  it('Escape stänger touren (= hoppa över) och persistar', async () => {
    render(<OnboardingDialog />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(window.localStorage.getItem(ONBOARDING_DONE_KEY)).toBe('1');
  });

  it('flyttar fokus till den primära knappen vid öppning (tappar inte tangentbordet)', async () => {
    render(<OnboardingDialog />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nästa' })).toHaveFocus());
  });
});
