import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider } from './SettingsProvider';
import { HAPTICS_KEY } from './storage-keys';
import { ResultsProvider } from '../results/ResultsProvider';
import { ResultEntryView } from '../results/ResultEntryView';

// INTEGRATIONSTEST: bevisar att den valbara haptik-feedbacken faktiskt hänger på
// den BEFINTLIGA spar-seamen (handleSaved i ResultEntryView), och att den är
// GATAD av inställningen. Vi sparar ett riktigt resultat mot fixtures-datan och
// kollar om navigator.vibrate anropades, beroende på om haptik är PÅ eller AV.
//
// VARFÖR haptik och inte ljud i seam-testet: navigator.vibrate är trivialt att
// spionera på i jsdom; Web Audio-grafen är enhetstestad separat (feedback.test.ts)
// med en fejk-AudioContext. Här bevisar vi KOPPLINGEN + gatingen end-to-end.

function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

/** Mata in och spara ett finished-resultat för gruppens första match. */
async function saveFirstResult() {
  await waitFor(() => {
    expect(screen.getAllByRole('group').length).toBeGreaterThan(0);
  });
  const form = document.querySelector('form[data-match-id="g-A-1"]') as HTMLFormElement | null;
  expect(form).not.toBeNull();
  const scoped = within(form as HTMLFormElement);
  // T31 (#51): att fylla i båda målen sätter statusen automatiskt till spelad
  // (finished), så spar-seamen + målfirandet/feedbacken triggas, ingen status-väljare.
  fireEvent.change(scoped.getByLabelText(/\(hemma\)/), { target: { value: '2' } });
  fireEvent.change(scoped.getByLabelText(/\(borta\)/), { target: { value: '1' } });
  fireEvent.click(scoped.getByRole('button', { name: /Spara/ }));
}

describe('haptik-feedback på spar-seamen (gating end-to-end)', () => {
  let vibrate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.clear();
    vibrate = vi.fn().mockReturnValue(true);
    // jsdom saknar navigator.vibrate; lägg på en spionbar stub.
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      writable: true,
      value: vibrate,
    });
  });

  afterEach(() => {
    window.localStorage.clear();
    // Ta bort stuben så den inte läcker till andra tester. delete kräver att
    // egenskapen är optional i typen, så vi går via en index-signatur-cast.
    delete (navigator as unknown as Record<string, unknown>).vibrate;
  });

  it('vibrerar INTE vid spar när haptik är AV (standardläget)', async () => {
    render(
      <SettingsProvider>
        <ResultsProvider env={fixturesEnv()}>
          <ResultEntryView />
        </ResultsProvider>
      </SettingsProvider>
    );
    await saveFirstResult();
    // Sparet ska ha gått igenom (ingen krasch), men ingen vibration i standardläget.
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('vibrerar vid spar när haptik är PÅ (inställningen läses från storage vid mount)', async () => {
    // Slå PÅ haptik FÖRE mount (providern lazy-läser flaggan).
    window.localStorage.setItem(HAPTICS_KEY, '1');
    render(
      <SettingsProvider>
        <ResultsProvider env={fixturesEnv()}>
          <ResultEntryView />
        </ResultsProvider>
      </SettingsProvider>
    );
    await saveFirstResult();
    await waitFor(() => expect(vibrate).toHaveBeenCalled());
  });

  it('fungerar utan SettingsProvider (tolerant fallback: tyst, ingen krasch)', async () => {
    // ResultEntryView ska fungera fristående (feedback = valfri yta), exakt som
    // det valfria firande-lagret. useFeedbackSettings faller till tyst standard.
    render(
      <ResultsProvider env={fixturesEnv()}>
        <ResultEntryView />
      </ResultsProvider>
    );
    await saveFirstResult();
    expect(vibrate).not.toHaveBeenCalled();
  });
});
