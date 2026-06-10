import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BracketView } from './BracketView';
import { ResultsProvider } from '../results/ResultsProvider';

// Fixtures-miljö (ingen Supabase-env) => datakällan ger den verifierade VM 2026-
// datan (alla 12 grupper + 104 matcher, alla scheduled). BracketView är en ren
// konsument av den delade storen (samma som gruppspelet), så vi wrappar den.
function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

function liveEnv(): ImportMetaEnv {
  return {
    VITE_SUPABASE_URL: 'https://x.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key',
  } as ImportMetaEnv;
}

function renderView(env: ImportMetaEnv, liveReady = false) {
  return render(
    <ResultsProvider env={env} liveReady={liveReady}>
      <BracketView />
    </ResultsProvider>
  );
}

describe('BracketView, rendering + a11y', () => {
  it('renderar i ett etiketterat section-landmark med rubrik', async () => {
    renderView(fixturesEnv());
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: /Slutspelsträdet/i })
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('region', { name: /Slutspelsträdet/i })).toBeInTheDocument();
  });

  it('renderar alla 6 rundorna (sextondel -> final + bronsmatch) som regioner', async () => {
    renderView(fixturesEnv());
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Sextondelsfinaler/i })).toBeInTheDocument();
    });
    // Varje runda är en etiketterad region (a11y-navigerbar). Exakta namn med
    // antalet matcher, så "Final (1 match)" inte krockar med "Semifinaler ...".
    // Antalet böjs grammatiskt: 1 -> "match", >1 -> "matcher" (C1/C2), så
    // skärmläsaren inte säger "Final (1 matcher)".
    for (const name of [
      'Sextondelsfinaler (16 matcher)',
      'Åttondelsfinaler (8 matcher)',
      'Kvartsfinaler (4 matcher)',
      'Semifinaler (2 matcher)',
      'Final (1 match)',
      'Bronsmatch (1 match)',
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
  });

  it('visar 16 match-kort i sextondelsrundan (M73-M88)', async () => {
    renderView(fixturesEnv());
    const round = await screen.findByRole('region', { name: /Sextondelsfinaler/i });
    // Varje match-kort har en stabil data-hake (design-seam).
    expect(round.querySelectorAll('[data-bracket-match]')).toHaveLength(16);
  });
});

describe('BracketView, GRUPPSPEL PÅGÅR (fixtures: alla matcher scheduled)', () => {
  it('är INTE låst (ingen "Låst seedning"-markör) medan gruppspelet pågår', async () => {
    renderView(fixturesEnv());
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Slutspelsträdet/i })).toBeInTheDocument();
    });
    expect(document.querySelector('[data-bracket-locked]')).toBeNull();
  });

  it('visar grupp-positions-etiketter (möjliga lag), inte gissade lag', async () => {
    renderView(fixturesEnv());
    await screen.findByRole('region', { name: /Sextondelsfinaler/i });
    // M73 = Runner-up A v Runner-up B. Positions-etiketterna ska synas.
    expect(screen.getAllByText(/2:a grupp A/).length).toBeGreaterThan(0);
    // En bästa-trea-slot bär sin eligibleGroups-etikett EXAKT (Article 12.6).
    expect(screen.getAllByText(/3:a A\/B\/C\/D\/F/).length).toBeGreaterThan(0);
  });

  it('markerar obestämda slots med data-slot-resolution (design-seam)', async () => {
    renderView(fixturesEnv());
    await screen.findByRole('region', { name: /Sextondelsfinaler/i });
    const possible = document.querySelectorAll('[data-slot-resolution="possible"]');
    // Gruppvinnar-/tvåa-/bästa-trea-slots är "possible" under gruppspelet.
    expect(possible.length).toBeGreaterThan(0);
    // Ingen slot är "resolved" än (inga grupper klara).
    expect(document.querySelectorAll('[data-slot-resolution="resolved"]')).toHaveLength(0);
  });

  it('bär demo-data-märket i fixtures-läge', async () => {
    renderView(fixturesEnv());
    await waitFor(() => {
      expect(screen.getByText(/Demo-data/i)).toBeInTheDocument();
    });
  });

  it('en horisontellt scrollbar container håller trädet (responsiv-förberedd)', async () => {
    renderView(fixturesEnv());
    await screen.findByRole('region', { name: /Sextondelsfinaler/i });
    const scroll = document.querySelector('[data-bracket-scroll]');
    expect(scroll).not.toBeNull();
    expect(scroll).toHaveClass('overflow-x-auto');
  });
});

describe('BracketView, fel-väg (fail loud)', () => {
  it('visar ett fel-meddelande när källan kastar (live-stub före T14)', async () => {
    // liveReady=true driver LIVE-grenen (stubben som kastar). Produktion (#37)
    // använder defaulten false, så env satt utan byggd klient ger fixtures.
    renderView(liveEnv(), true);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Kunde inte ladda slutspelsträdet/i);
    });
    // Inget träd renderas vid fel (ingen tyst tom-vy med stale data).
    expect(document.querySelector('[data-bracket-match]')).toBeNull();
  });
});
