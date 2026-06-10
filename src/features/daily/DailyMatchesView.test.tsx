import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { ResultsProvider } from '../results/ResultsProvider';
import { DailyMatchesView } from './DailyMatchesView';

function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

function liveEnv(): ImportMetaEnv {
  return {
    VITE_SUPABASE_URL: 'https://x.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key',
  } as ImportMetaEnv;
}

function renderView(env: ImportMetaEnv, children: ReactNode) {
  return render(<ResultsProvider env={env}>{children}</ResultsProvider>);
}

async function waitSettled() {
  await waitFor(() => {
    // Loading-indikatorn (role=status) ska ha försvunnit (ready eller error).
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
}

describe('DailyMatchesView, tillgänglig struktur + happy path (fixtures)', () => {
  it('renderar i ett etiketterat section-landmark', async () => {
    renderView(fixturesEnv(), <DailyMatchesView />);
    expect(screen.getByRole('region', { name: /dagens matcher/i })).toBeInTheDocument();
    await waitSettled();
  });

  it('visar en datumnavigering med riktiga knappar (tangentbord/a11y)', async () => {
    renderView(fixturesEnv(), <DailyMatchesView />);
    await waitSettled();

    const nav = await screen.findByRole('navigation', { name: /datumnavigering/i });
    // Två navigerings-knappar (föregående/nästa speldag).
    expect(within(nav).getAllByRole('button').length).toBe(2);
  });

  it('renderar dagens matchkort (minst ett) när data är redo', async () => {
    renderView(fixturesEnv(), <DailyMatchesView />);
    await waitSettled();

    await waitFor(() => {
      expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
    });
  });

  it('visar en live-nedräkning till nästa avspark (eller sluttillståndet)', async () => {
    const { container } = renderView(fixturesEnv(), <DailyMatchesView />);
    await waitSettled();

    await waitFor(() => {
      // Antingen tickar nedräkningen (data-countdown=live) eller så är allt spelat.
      const cd = container.querySelector('[data-countdown]');
      expect(cd).not.toBeNull();
    });
  });

  it('flicker-visar ALDRIG tom-dag-panelen med matcher i schemat (Copilot R1, C1)', async () => {
    // REGRESSION: startdagen härleds synkront i render (use-daily-matches), så det
    // finns ingen ready-render där days>0 men selectedDay===null. Tidigare sattes
    // startdagen via en useEffect och då kunde "Ingen match den här dagen" blinka
    // till fast fixtures har matcher. Vi mäter genom att observera DOM:en från
    // första render via en MutationObserver: dyker tom-dag-rubriken någonsin upp,
    // failar testet. Sedan väntar vi tills matchkorten är på plats (ready+dagar).
    let emptyPanelSeen = false;
    const seesEmptyPanel = () =>
      Array.from(document.querySelectorAll('p')).some(
        (p) => p.textContent === 'Ingen match den här dagen'
      );

    const observer = new MutationObserver(() => {
      if (seesEmptyPanel()) {
        emptyPanelSeen = true;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    try {
      renderView(fixturesEnv(), <DailyMatchesView />);
      // Synkront direkt efter mount (innan effekter flushats): inte heller då.
      if (seesEmptyPanel()) emptyPanelSeen = true;

      await waitSettled();
      // Bekräfta att vi faktiskt nådde ready-läget MED matcher (annars vore
      // frånvaron av panelen meningslös).
      await waitFor(() => {
        expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
      });
    } finally {
      observer.disconnect();
    }

    expect(emptyPanelSeen).toBe(false);
  });
});

describe('DailyMatchesView, fel-väg (fail loud)', () => {
  it('visar role=alert när datakällan kastar (live-stub före T14), inte en tyst tom vy', async () => {
    renderView(liveEnv(), <DailyMatchesView />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Kunde inte ladda matcherna/i);
    // Ingen matchlista läcker fram i fel-läget.
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });
});
