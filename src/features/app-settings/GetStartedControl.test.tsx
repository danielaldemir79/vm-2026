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

  it('install-varianten (T63) är en kompakt "Installera som app"-pill som öppnar dialogen', async () => {
    render(<GetStartedControl variant="install" />);
    const trigger = screen.getByRole('button', { name: /Installera som app/i });
    expect(trigger).toHaveAttribute('data-get-started-open', 'install');
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: /Använd appen direkt/i })).toBeInTheDocument();
  });

  it('initialPlatform (T63) tvingar dialogens START-flik (iPhone), oavsett browser-härledning', async () => {
    // jsdom-default (setup.ts matchMedia matches:false) ger en desktop-härledd förvald
    // flik. initialPlatform='ios' ska ändå öppna dialogen PÅ iPhone-fliken, så install-
    // knappens iOS-gren landar rätt även när browsern inte ser ut som en iPhone.
    render(<GetStartedControl variant="install" initialPlatform="ios" />);
    fireEvent.click(screen.getByRole('button', { name: /Installera som app/i }));
    const dialog = await screen.findByRole('dialog', { name: /Använd appen direkt/i });
    const iphoneTab = within(dialog).getByRole('tab', { name: /iPhone/i });
    expect(iphoneTab).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('[data-get-started-steps="ios"]')).toBeInTheDocument();
  });

  it('återställer fokus till triggern när dialogen stängs (a11y)', async () => {
    render(<GetStartedControl variant="settings" />);
    const trigger = screen.getByRole('button', { name: /Kom igång/i });
    // Fokusera triggern INNAN klick: den delade <Modal> (T33) minns det element som var
    // fokuserat vid öppning (document.activeElement) och återför fokus dit vid stängning,
    // den a11y-korrekta universella regeln. I en RIKTIG webbläsare flyttar ett klick på en
    // <button> fokus dit, men jsdom:s fireEvent.click gör INTE det, så vi fokuserar
    // explicit för att spegla browser-beteendet (samma grepp som TeamProfile-/Onboarding-
    // testerna). Tidigare fångade GetStartedControl triggern via en ref oavsett fokus;
    // <Modal>:s document.activeElement-fångst är mer generell (rätt opener i alla fall).
    trigger.focus();
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

// Regressionstest för capture-Escape-fixen (copilot R2, GetStartedControl.tsx:49-61):
// dialogen lyssnar på document i CAPTURE-fas och kallar stopPropagation, så när
// kom-igång-dialogen öppnas OVANPÅ en annan modal (onboardingens "Visa hur") stänger
// EN Escape bara den översta dialogen, inte båda. Vi simulerar den underliggande
// modalens lyssnare med en bubbel-spion på document: efter Escape ska dialogen vara
// stängd OCH spionen ALDRIG ha anropats (capture + stopPropagation slukar eventet).
//
// Mutationsverifiering: tas `true` (capture) bort på rad 59/60, ELLER stopPropagation
// på rad 55, så når bubbel-fasen den underliggande lyssnaren och spionen anropas =>
// detta test blir rött. Bekräftat manuellt under utveckling.
describe('Escape stoppas i capture-fas (staplade modaler stängs inte båda på en gång)', () => {
  it('en Escape stänger bara kom-igång-dialogen, inte en underliggande modals lyssnare', async () => {
    // Spion för "underliggande modals" Escape-lyssnare: bubbel-fas (default, capture=false),
    // precis som en vanlig modal-lyssnare. Den ska ALDRIG nås medan kom-igång-dialogen är
    // öppen, eftersom dialogens capture-lyssnare stoppar propagationen först.
    const underlyingEscape = vi.fn();
    const underlyingListener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        underlyingEscape();
      }
    };
    document.addEventListener('keydown', underlyingListener);

    try {
      render(<GetStartedControl variant="settings" />);
      const trigger = screen.getByRole('button', { name: /Kom igång/i });
      fireEvent.click(trigger);
      await screen.findByRole('dialog');

      // EN Escape.
      fireEvent.keyDown(document, { key: 'Escape' });

      // Översta dialogen stängs...
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      // ...men den underliggande modalens lyssnare nåddes ALDRIG (stopPropagation i capture).
      expect(underlyingEscape).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', underlyingListener);
    }
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
