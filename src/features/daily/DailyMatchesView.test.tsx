import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { ResultsProvider } from '../results/ResultsProvider';
import { TeamProfileProvider } from '../team-profile';
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

// liveReady=true driver LIVE-grenen (stubben som kastar) i fel-vägs-testet.
// Default false speglar produktion (#37): env satt utan byggd klient -> fixtures.
function renderView(env: ImportMetaEnv, children: ReactNode, liveReady = false) {
  return render(
    <ResultsProvider env={env} liveReady={liveReady}>
      <TeamProfileProvider>{children}</TeamProfileProvider>
    </ResultsProvider>
  );
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

  it('en VILODAG är nåbar via "nästa speldag"-knappen och visar vilodags-panelen (C7)', async () => {
    // F4 + C7: VM 2026 har vilodagar mellan ronderna. Tidigare hoppade navigeringen
    // rakt över dem (days saknade tomma dagar) och vilodags-panelen var oåtkomlig.
    // Nu går navigeringen dag för dag; bläddrar vi framåt ska vi förr eller senare
    // landa på en vilodag och se panelen "Ingen match den här dagen".
    renderView(fixturesEnv(), <DailyMatchesView />);
    await waitSettled();
    await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0));

    const nextButton = () =>
      within(screen.getByRole('navigation', { name: /datumnavigering/i })).getAllByRole(
        'button'
      )[1];

    // Spannet är 11 juni-19 juli (< 45 dagar). En gräns skyddar mot oändlig loop
    // om navigeringen skulle gå sönder; vilodagen ska nås långt innan dess.
    let restPanelSeen = false;
    for (let step = 0; step < 45; step += 1) {
      if (screen.queryByText('Ingen match den här dagen')) {
        restPanelSeen = true;
        break;
      }
      const btn = nextButton();
      if ((btn as HTMLButtonElement).disabled) break; // nått sista dagen
      fireEvent.click(btn);
    }

    expect(restPanelSeen).toBe(true);
  });
});

describe('DailyMatchesView, dynamiskt dags-tema (T8)', () => {
  it('hero:n bär dags-temats data-attribut + en --vm-day-hue när en dag har lag', async () => {
    const { container } = renderView(fixturesEnv(), <DailyMatchesView />);
    await waitSettled();
    await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0));

    const hero = container.querySelector<HTMLElement>('[data-daily-hero]');
    expect(hero).not.toBeNull();
    // Seamen är på plats: stabilt data-attribut för design-frontend/test.
    expect(hero?.getAttribute('data-day-theme')).not.toBeNull();
    // Fixtures startar på premiärdagen (matcher med kända lag) -> aktivt tema med
    // en hue satt som inline CSS-variabel på hero:ns dekor-yta.
    expect(hero?.getAttribute('data-day-theme')).toBe('active');
    expect(hero?.getAttribute('data-day-theme-source')).toBe('teams');
    const hue = hero?.style.getPropertyValue('--vm-day-hue');
    expect(hue).toBeTruthy();
    expect(Number(hue)).toBeGreaterThanOrEqual(0);
    expect(Number(hue)).toBeLessThan(360);
  });

  it('dags-temat ändras INTE av matchkortens text-/yt-färger (rör bara dekor)', async () => {
    // Kontrast-vakt (DOM-lagret): hero:ns dekor får en hue, men matchkorten (som
    // bär text) ska ALDRIG SÄTTA en inline --vm-day-hue själva. Vi bekräftar att
    // inget matchkort SÄTTER variabeln/attributet (seamen sitter bara på hero-ytan).
    //
    // VAD DEN HÄR VAKTEN VILAR PÅ (F2): den läser bara kortets EGNA inline-style,
    // alltså att kortet inte SÄTTER variabeln. Den kan INTE se ARV: "Dagens match"-
    // kortet renderas inne i .vm-daily-hero (som sätter --vm-day-hue inline), och
    // CSS-custom-properties ärvs nedåt, så en framtida kort-CSS-regel som LÄSER
    // var(--vm-day-hue) skulle vara osynlig för det här testet. Den luckan täcks av
    // den DOM-OBEROENDE käll-scannen i day-theme-contrast-guard.test.ts, som failar
    // om var(--vm-day-hue) konsumeras utanför .vm-daily-hero*-scopet. De två testen
    // är komplementära: detta vaktar SÄTTNING i DOM, käll-scannen vaktar KONSUMTION
    // i källan.
    const { container } = renderView(fixturesEnv(), <DailyMatchesView />);
    await waitSettled();
    await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0));

    for (const card of Array.from(container.querySelectorAll<HTMLElement>('[data-match-card]'))) {
      expect(card.style.getPropertyValue('--vm-day-hue')).toBe('');
      expect(card.getAttribute('data-day-theme')).toBeNull();
    }
  });
});

describe('DailyMatchesView, fel-väg (fail loud)', () => {
  it('visar role=alert när datakällan kastar (live-stub före T14), inte en tyst tom vy', async () => {
    renderView(liveEnv(), <DailyMatchesView />, true);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Kunde inte ladda matcherna/i);
    // Ingen matchlista läcker fram i fel-läget.
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });
});
