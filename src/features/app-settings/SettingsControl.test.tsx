import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsProvider } from './SettingsProvider';
import { SettingsControl } from './SettingsControl';
import { HAPTICS_KEY, SOUND_KEY } from './storage-keys';

function renderControl() {
  return render(
    <SettingsProvider>
      <SettingsControl />
    </SettingsProvider>
  );
}

describe('SettingsControl, kugghjul + haptik/ljud-toggles', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('visar ett kugghjul med tillgängligt namn, dialog stängd som default', () => {
    renderControl();
    const trigger = screen.getByRole('button', { name: 'Inställningar' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('öppnar en a11y-dialog med två toggles (role="switch"), BÅDA av som standard', async () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Inställningar' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(/Inställningar/);

    const haptics = within(dialog).getByRole('switch', { name: 'Haptik' });
    const sound = within(dialog).getByRole('switch', { name: 'Ljud' });
    // AV som standard (SPEC §12).
    expect(haptics).toHaveAttribute('aria-checked', 'false');
    expect(sound).toHaveAttribute('aria-checked', 'false');
  });

  it('slår PÅ haptik -> aria-checked blir true OCH värdet persistas', async () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Inställningar' }));
    const haptics = await screen.findByRole('switch', { name: 'Haptik' });

    fireEvent.click(haptics);
    expect(haptics).toHaveAttribute('aria-checked', 'true');
    expect(window.localStorage.getItem(HAPTICS_KEY)).toBe('1');

    // Slå av igen -> nyckeln tas bort (ingen "0"-rad lämnas).
    fireEvent.click(haptics);
    expect(haptics).toHaveAttribute('aria-checked', 'false');
    expect(window.localStorage.getItem(HAPTICS_KEY)).toBeNull();
  });

  it('slår PÅ ljud oberoende av haptik (varje toggle styr sin egen flagga)', async () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Inställningar' }));
    const sound = await screen.findByRole('switch', { name: 'Ljud' });

    fireEvent.click(sound);
    expect(sound).toHaveAttribute('aria-checked', 'true');
    expect(window.localStorage.getItem(SOUND_KEY)).toBe('1');
    expect(window.localStorage.getItem(HAPTICS_KEY)).toBeNull();
  });

  it('läser ett tidigare PÅslaget val vid mount (persistensen lever över sessioner)', async () => {
    window.localStorage.setItem(SOUND_KEY, '1');
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Inställningar' }));
    const sound = await screen.findByRole('switch', { name: 'Ljud' });
    expect(sound).toHaveAttribute('aria-checked', 'true');
  });

  it('Escape stänger dialogen (a11y)', async () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Inställningar' }));
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('stäng-knappen stänger dialogen', async () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Inställningar' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stäng inställningar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  // BUGGFIX T32 (#54): overlayn PORTALERAS till document.body, inte renderad inline
  // bredvid kugghjuls-triggern. Annars klämmer headerns backdrop-filter +
  // sticky-stacking-context in den (den hamnar bakom/utanför sidan, Daniels fynd).
  // jsdom räknar inte stacking contexts, så vi vaktar den TESTBARA invarianten:
  // overlayn är ett direkt barn av <body> (portalerad ut ur trigger-trädet), inte
  // nästlad i kontrollens egen container. Det är just det som lyfter den till ett
  // topplager oberoende av var triggern sitter.
  it('portalerar overlayn till document.body (topplager, inte instängd i triggerns träd)', () => {
    const { container } = renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Inställningar' }));

    const overlay = document.querySelector('[data-settings-overlay]');
    expect(overlay).not.toBeNull();
    // Portalerad: ligger UTANFÖR komponentens render-container (RTL-roten)...
    expect(container.contains(overlay)).toBe(false);
    // ...och är ett DIREKT barn av <body> (rot-stacking-contexten), inte nästlad
    // under något stacking-context/containing-block-skapande element.
    expect(overlay?.parentElement).toBe(document.body);
  });
});
