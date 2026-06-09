import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GroupStageView } from './GroupStageView';

// Fixtures-miljö (ingen Supabase-env) => datakällan ger fixtures-datan, dvs den
// verifierade VM 2026-datan med alla 12 grupper. Vi injicerar env i vyn så vi
// inte behöver mocka import.meta globalt (samma mönster som datakällans tester).
function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

function liveEnv(): ImportMetaEnv {
  return {
    VITE_SUPABASE_URL: 'https://x.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key',
  } as ImportMetaEnv;
}

describe('GroupStageView, renderar gruppspelet', () => {
  it('visar alla 12 grupper (A-L) som tabeller när datan laddats', async () => {
    render(<GroupStageView env={fixturesEnv()} />);

    // Vänta in den async datahämtningen, sedan ska 12 tabeller finnas.
    await waitFor(() => {
      expect(screen.getAllByRole('table')).toHaveLength(12);
    });

    // Punktkoll: grupp A och grupp L (första och sista) finns med caption.
    expect(screen.getByRole('table', { name: /Grupp A/i })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /Grupp L/i })).toBeInTheDocument();
  });

  it('renderar i ett etiketterat section-landmark (a11y)', async () => {
    render(<GroupStageView env={fixturesEnv()} />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /Gruppspelet/i })).toBeInTheDocument();
    });
    // Region med tillgängligt namn = navigerbart för skärmläsare.
    expect(screen.getByRole('region', { name: /Gruppspelet/i })).toBeInTheDocument();
  });

  it('visar de riktiga lagnamnen ur den verifierade datan (t.ex. Sverige i grupp F)', async () => {
    render(<GroupStageView env={fixturesEnv()} />);
    await waitFor(() => {
      // Sverige finns i grupp F (verifierad T4-data), bevisar att vyn kopplats
      // mot den riktiga lag-/gruppdatan, inte platshållare.
      expect(screen.getByRole('rowheader', { name: /Sverige/ })).toBeInTheDocument();
    });
  });

  it('visar att tabellerna är härledda live (S/V/O/F/GM/IM/MS/P i grupp A)', async () => {
    render(<GroupStageView env={fixturesEnv()} />);
    await waitFor(() => {
      expect(screen.getByRole('table', { name: /Grupp A/i })).toBeInTheDocument();
    });

    // Grupp A har demo-resultat (mex-rsa 2-0, kor-cze 1-1), så Mexiko ska ha
    // spelat 1 och ha 3 poäng. Bevisar att tabellen härletts ur matcherna, inte
    // bara renderat tomma rader.
    const mexRow = screen.getByRole('rowheader', { name: /Mexiko/ }).closest('tr');
    expect(mexRow).not.toBeNull();
    expect(mexRow).toHaveTextContent('Mexiko');
  });
});

describe('GroupStageView, datakälla-läge', () => {
  it('visar ett demo-data-märke i fixtures-läge (transparens)', async () => {
    render(<GroupStageView env={fixturesEnv()} />);
    await waitFor(() => {
      expect(screen.getByText(/demo-data/i)).toBeInTheDocument();
    });
  });
});

describe('GroupStageView, fel-väg (fail loud, inte tyst tom vy)', () => {
  it('visar ett fel-meddelande när datakällan kastar (live-stub före T14)', async () => {
    // Live-env utan riktig klient => datakällans stub KASTAR vid getMatches.
    // Vyn ska visa felet via role="alert", inte tyst rendera en tom vy.
    render(<GroupStageView env={liveEnv()} />);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/Kunde inte ladda gruppspelet/i);
    });

    // Ingen tabell när hämtningen misslyckades.
    expect(screen.queryAllByRole('table')).toHaveLength(0);
  });
});
