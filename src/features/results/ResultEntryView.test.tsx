import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResultEntryView } from './ResultEntryView';
import { ResultsProvider } from './ResultsProvider';
import { GroupStageView } from '../groups/GroupStageView';

function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

function liveEnv(): ImportMetaEnv {
  return {
    VITE_SUPABASE_URL: 'https://x.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key',
  } as ImportMetaEnv;
}

describe('ResultEntryView, rendering + a11y', () => {
  it('renderar i ett etiketterat section-landmark', async () => {
    render(
      <ResultsProvider env={fixturesEnv()}>
        <ResultEntryView />
      </ResultsProvider>
    );
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: /Mata in resultat/i })
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('region', { name: /Mata in resultat/i })).toBeInTheDocument();
  });

  it('listar bara matcher med BÅDA lag kända (inga "okänt lag mot okänt lag")', async () => {
    render(
      <ResultsProvider env={fixturesEnv()}>
        <ResultEntryView />
      </ResultsProvider>
    );
    await waitFor(() => {
      // Fixtures har gruppmatcher med kända lag; minst ett formulär ska finnas.
      expect(screen.getAllByRole('group').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/Okänt lag/)).not.toBeInTheDocument();
  });
});

describe('ResultEntryView, fel-väg (fail loud)', () => {
  it('visar ett fel-meddelande när källan kastar (live-stub före T14)', async () => {
    // liveReady=true driver LIVE-grenen (stubben som kastar). Produktion (#37)
    // använder defaulten false, så env satt utan byggd klient ger fixtures.
    render(
      <ResultsProvider env={liveEnv()} liveReady={true}>
        <ResultEntryView />
      </ResultsProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Kunde inte ladda matcher/i);
    });
  });
});

describe('ResultEntryView, målfirande-seam', () => {
  it('renderar render-prop-lagret (design-frontends krok) i ett aria-hidden slot', async () => {
    const { container } = render(
      <ResultsProvider env={fixturesEnv()}>
        <ResultEntryView
          renderCelebration={(c) => (
            <span data-testid="celebration-layer">{c ? 'aktiv' : 'vilande'}</span>
          )}
        />
      </ResultsProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('celebration-layer')).toHaveTextContent('vilande');
    });
    // Slotet är aria-hidden (ren visuell yta, dubblerar ingen info).
    const slot = container.querySelector('[data-celebration-slot]');
    expect(slot).not.toBeNull();
    expect(slot).toHaveAttribute('aria-hidden', 'true');
  });
});

// Integration: inmatningsvyn OCH gruppspelsvyn under SAMMA provider. En inmatning
// i formuläret ska räkna om grupptabellen (en sanning, härledd state, hela vägen
// genom UI:t, inte bara på hook-nivå).
describe('ResultEntryView + GroupStageView, inmatning uppdaterar tabellen (en sanning)', () => {
  it('att spara ett resultat för en fixtures-match ändrar gruppspelstabellen', async () => {
    render(
      <ResultsProvider env={fixturesEnv()}>
        <GroupStageView />
        <ResultEntryView />
      </ResultsProvider>
    );

    // Vänta in seedningen: grupp A-tabellen + inmatnings-formulären finns.
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /Grupp A/i })).toBeInTheDocument();
      expect(screen.getAllByRole('group').length).toBeGreaterThan(0);
    });

    // Hitta inmatnings-formuläret för g-A-1 (Mexiko mot Sydafrika, gruppens första
    // match i den riktiga matchplanen T4b). Den är scheduled (inget resultat än),
    // så detta är en FÖRSTA inmatning, inte en redigering.
    const form = document.querySelector('form[data-match-id="g-A-1"]') as HTMLFormElement | null;
    expect(form).not.toBeNull();
    const scoped = within(form as HTMLFormElement);

    // Mata in resultatet Sydafrika 0-5 och spara.
    fireEvent.change(scoped.getByLabelText(/Mexiko \(hemma\)/), { target: { value: '0' } });
    fireEvent.change(scoped.getByLabelText(/Sydafrika \(borta\)/), { target: { value: '5' } });
    fireEvent.change(scoped.getByLabelText(/Status/), { target: { value: 'finished' } });
    fireEvent.click(scoped.getByRole('button', { name: /Spara/ }));

    // Grupptabellen ska följa med: Sydafrika (rsa) har nu 3 poäng och leder, och
    // dess MS-cell visar +5. Rad-scopat (rowheader), inte en global text-match.
    await waitFor(() => {
      const rsaRow = screen.getByRole('rowheader', { name: /Sydafrika/ }).closest('tr');
      expect(rsaRow).not.toBeNull();
      const cells = within(rsaRow as HTMLElement).getAllByRole('cell');
      // Kolumnordning: [Placering, S, V, O, F, GM, IM, MS, P].
      expect(cells[8]).toHaveTextContent('3'); // P: 3 poäng
      expect(cells[7]).toHaveTextContent('5'); // MS: +5
    });
  });
});
