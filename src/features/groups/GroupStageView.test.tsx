import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GroupStageView } from './GroupStageView';
import { ResultsProvider } from '../results/ResultsProvider';

// Fixtures-miljö (ingen Supabase-env) => datakällan ger fixtures-datan, dvs den
// verifierade VM 2026-datan med alla 12 grupper. Env injiceras nu i den delade
// ResultsProvider (T6 lyfte seedningen dit), inte i vyn, så vi wrappar vyn.
function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

function liveEnv(): ImportMetaEnv {
  return {
    VITE_SUPABASE_URL: 'https://x.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key',
  } as ImportMetaEnv;
}

// GroupStageView är nu en ren konsument av den delade storen (T6). Rendera den
// inuti en ResultsProvider med rätt env så seedningen sker som förr.
function renderView(env: ImportMetaEnv) {
  return render(
    <ResultsProvider env={env}>
      <GroupStageView />
    </ResultsProvider>
  );
}

describe('GroupStageView, renderar gruppspelet', () => {
  it('visar alla 12 grupper (A-L) som tabeller när datan laddats', async () => {
    renderView(fixturesEnv());

    // Vänta in den async datahämtningen, sedan ska 12 tabeller finnas.
    await waitFor(() => {
      expect(screen.getAllByRole('table')).toHaveLength(12);
    });

    // Punktkoll: grupp A och grupp L (första och sista) finns med caption.
    expect(screen.getByRole('table', { name: /Grupp A/i })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /Grupp L/i })).toBeInTheDocument();
  });

  it('renderar i ett etiketterat section-landmark (a11y)', async () => {
    renderView(fixturesEnv());
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /Gruppspelet/i })).toBeInTheDocument();
    });
    // Region med tillgängligt namn = navigerbart för skärmläsare.
    expect(screen.getByRole('region', { name: /Gruppspelet/i })).toBeInTheDocument();
  });

  it('visar de riktiga lagnamnen ur den verifierade datan (t.ex. Sverige i grupp F)', async () => {
    renderView(fixturesEnv());
    await waitFor(() => {
      // Sverige finns i grupp F (verifierad T4-data), bevisar att vyn kopplats
      // mot den riktiga lag-/gruppdatan, inte platshållare.
      expect(screen.getByRole('rowheader', { name: /Sverige/ })).toBeInTheDocument();
    });
  });

  it('renderar de HÄRLEDDA tabellcellerna (S/V/O/F/GM/IM/MS/P i grupp A)', async () => {
    renderView(fixturesEnv());
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /Grupp A/i })).toBeInTheDocument();
    });

    // Den riktiga matchplanen (T4b) är ospelad (alla matcher scheduled, VM har
    // inte börjat 2026-06-09), så varje lags HÄRLEDDA statistik ska vara noll.
    // Det är ett giltigt och viktigt UI-läge: tabellerna renderas nollställda och
    // fylls när resultat matas in. Vi verifierar Mexikos rad rad-scopat (inte en
    // global text-match), så ett fel i cell-renderingen/härledningen fångas. Den
    // LIVE omräkningen vid inmatning bevisas av ResultEntryView/results-store-testen.
    const mexRow = screen.getByRole('rowheader', { name: /Mexiko/ }).closest('tr');
    expect(mexRow).not.toBeNull();

    // Cellerna i raden i kolumnordning: [Placering, S, V, O, F, GM, IM, MS, P]
    // (lagnamnet är en rowheader, inte en cell).
    const cells = within(mexRow as HTMLElement).getAllByRole('cell');
    const COLUMN_INDEX = { played: 1, points: 8 } as const;
    expect(cells[COLUMN_INDEX.played]).toHaveTextContent('0'); // S: 0 spelade än
    expect(cells[COLUMN_INDEX.points]).toHaveTextContent('0'); // P: 0 poäng än
  });
});

describe('GroupStageView, datakälla-läge', () => {
  it('visar ett demo-data-märke i fixtures-läge (transparens)', async () => {
    renderView(fixturesEnv());
    await waitFor(() => {
      expect(screen.getByText(/demo-data/i)).toBeInTheDocument();
    });
  });
});

describe('GroupStageView, fel-väg (fail loud, inte tyst tom vy)', () => {
  it('visar ett fel-meddelande när datakällan kastar (live-stub före T14)', async () => {
    // Live-env utan riktig klient => datakällans stub KASTAR vid getMatches.
    // Vyn ska visa felet via role="alert", inte tyst rendera en tom vy.
    renderView(liveEnv());

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/Kunde inte ladda gruppspelet/i);
    });

    // Ingen tabell när hämtningen misslyckades.
    expect(screen.queryAllByRole('table')).toHaveLength(0);
  });
});
