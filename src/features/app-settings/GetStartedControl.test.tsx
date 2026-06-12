import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GetStartedControl } from './GetStartedControl';
import { SettingsProvider } from './SettingsProvider';
import { SettingsControl } from './SettingsControl';
import { OnboardingDialog } from './OnboardingDialog';

// jsdom har ingen matchMedia som standard i alla testfiler; setup.ts mockar den till
// matches:false, vilket ger desktop + icke-standalone (en vanlig "ej installerad"-
// webbläsare). Det räcker för call-site-/integrationstesterna här (plattformsgrenarna
// täcks i GetStartedDialog.test.tsx). userAgent lämnas som jsdom-default.

describe('GetStartedControl, varianter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('settings-varianten är en full rad-knapp med beskrivande text', () => {
    render(<GetStartedControl variant="settings" />);
    const trigger = screen.getByRole('button', { name: /Kom igång/i });
    expect(trigger).toHaveAttribute('data-get-started-open', 'settings');
    expect(trigger).toHaveTextContent(/använd direkt i webbläsaren/i);
  });

  it('inline-varianten är en kompakt "Visa hur"-knapp som öppnar samma dialog', async () => {
    render(<GetStartedControl variant="inline" />);
    const trigger = screen.getByRole('button', { name: /Visa hur/i });
    expect(trigger).toHaveAttribute('data-get-started-open', 'inline');
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('återställer fokus till triggern när dialogen stängs (a11y)', async () => {
    render(<GetStartedControl variant="settings" />);
    const trigger = screen.getByRole('button', { name: /Kom igång/i });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stäng kom igång' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(trigger);
  });
});

// AC: alltid nåbar EFTER onboardingen. Call-site-test: kom-igång-ytan finns i
// inställnings-portalen (SettingsControl), så en vän når den när som helst, inte bara
// vid första start.
describe('Kom igång är nåbar via inställningarna (alltid efter onboardingen)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('inställnings-dialogen innehåller "Kom igång"-knappen som öppnar kom-igång-dialogen', async () => {
    render(
      <SettingsProvider>
        <SettingsControl />
      </SettingsProvider>
    );
    // Öppna inställningarna (kugghjulet)...
    fireEvent.click(screen.getByRole('button', { name: 'Inställningar' }));
    const settingsDialog = await screen.findByRole('dialog', { name: /Inställningar/i });

    // ...kom-igång-raden ska finnas där (alltid nåbar).
    const getStarted = within(settingsDialog).getByRole('button', { name: /Kom igång/i });
    fireEvent.click(getStarted);

    // Kom-igång-dialogen öppnas (portalerad till body, så vi letar globalt).
    expect(await screen.findByRole('dialog', { name: /Använd appen direkt/i })).toBeInTheDocument();
  });
});

// AC: kom-igång-ytan visas också i onboardingen. Call-site-test: install-steget bär
// "Visa hur"-CTA:n; tidigare steg gör det inte.
describe('Kom igång är nåbar i onboardingens install-steg', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('första steget visar INGEN kom-igång-CTA (bara install-steget gör det)', () => {
    // Färsk localStorage => touren öppnas på steg 1 (art !== install).
    render(<OnboardingDialog />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.querySelector('[data-onboarding-get-started]')).toBeNull();
  });

  it('install-steget (sista) visar "Visa hur"-CTA:n som öppnar kom-igång-dialogen', async () => {
    render(<OnboardingDialog />);
    // Klicka "Nästa" tills vi når install-steget (sista, art=install). Stegen är
    // live, results, whatif, install (onboarding.ts), så tre "Nästa"-klick räcker.
    const dialog = screen.getByRole('dialog');
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(within(dialog).getByRole('button', { name: /Nästa/i }));
    }
    // Nu är vi på install-steget: CTA:n finns.
    const cta = within(dialog).getByRole('button', { name: /Visa hur/i });
    expect(document.querySelector('[data-onboarding-get-started]')).not.toBeNull();

    fireEvent.click(cta);
    // Kom-igång-dialogen (portalerad) öppnas ovanpå touren.
    expect(await screen.findByRole('dialog', { name: /Använd appen direkt/i })).toBeInTheDocument();
  });
});
