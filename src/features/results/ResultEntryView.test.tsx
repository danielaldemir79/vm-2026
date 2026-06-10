import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// 3-DAGARS FÖNSTER + expandera (#39). Den rena fönster-funktionen är uttömmande
// testad i result-window.test.ts; här bevisar vi att VYN tillämpar fönstret som
// default och att expandera-kontrollen är tillgänglig och fungerar end-to-end.
// Vi fryser systemklockan till premiärdagen (11 juni 2026) så urvalet är
// deterministiskt oavsett när testet körs (annars styr verklig tid vad som syns).
// Describe-nivå timeout (20 s): varje test här fäller ut/ihop hela listan (72 formulär)
// en eller flera gånger, och varje toggle re-renderar alla kort. Det är legitimt
// långsammare än Vitests 5 s-default (mätt ~5-9 s, inte en hängning) och blir flaky mot
// defaulten under full svit-last. En timeout på describe-nivå (KISS) täcker alla tunga
// tester i blocket likadant, i stället för en per-test-override på varje.
describe('ResultEntryView, 3-dagars fönster + expandera (#39)', { timeout: 20000 }, () => {
  beforeEach(() => {
    // Faka BARA Date (inte setTimeout/microtasks), så providerns async-seedning och
    // testing-librarys `waitFor` fortfarande kör på riktiga timers. Annars fryser
    // fake-timers seed-flushen och waitFor:en når aldrig sitt villkor (timeout).
    vi.useFakeTimers({ toFake: ['Date'] });
    // 2026-06-11 10:00 svensk tid: turneringen pågår (premiärdagen), så fönstret
    // ankrar på idag (11 juni) och spänner 11-13 juni. Fixtures sträcker sig till
    // 19 juli, så långt fler matcher ligger UTANFÖR fönstret än innanför.
    vi.setSystemTime(new Date('2026-06-11T08:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function renderView() {
    const utils = render(
      <ResultsProvider env={fixturesEnv()}>
        <ResultEntryView />
      </ResultsProvider>
    );
    // Seedningen är async; vänta in att formulären finns. (Fake timers påverkar
    // inte microtask-flushen som waitFor driver, men advance:a för säkerhets skull.)
    await waitFor(() => {
      expect(screen.getAllByRole('group').length).toBeGreaterThan(0);
    });
    return utils;
  }

  it('visar bara matcher inom fönstret som default (inte hela listan), med en expandera-knapp', async () => {
    await renderView();
    const windowedCount = screen.getAllByRole('group').length;
    // Fönstret döljer matcher -> knappen finns och säger hur många som är dolda.
    const toggle = screen.getByRole('button', { name: /Visa alla matcher \(\d+ dold/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // aria-controls pekar på listan (ul har samma id).
    const listId = toggle.getAttribute('aria-controls');
    expect(listId).toBeTruthy();
    expect(document.getElementById(listId as string)?.tagName).toBe('UL');
    // Default-fönstret är en ÄKTA delmängd: färre formulär än alla matcher.
    expect(windowedCount).toBeGreaterThan(0);

    // Fäll ut -> fler formulär än i fönstret, knappen blir "Visa färre".
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getAllByRole('group').length).toBeGreaterThan(windowedCount);
    });
    const collapse = screen.getByRole('button', { name: /Visa färre/i });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(collapse).toHaveAttribute('aria-controls', listId);

    // Fäll ihop igen -> tillbaka till fönster-antalet.
    fireEvent.click(collapse);
    await waitFor(() => {
      expect(screen.getAllByRole('group').length).toBe(windowedCount);
    });
    expect(screen.getByRole('button', { name: /Visa alla matcher/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('utfälld lista visar fler matcher än fönstret (ingen match går förlorad)', async () => {
    await renderView();
    const windowedCount = screen.getAllByRole('group').length;
    fireEvent.click(screen.getByRole('button', { name: /Visa alla matcher/i }));
    await waitFor(() => {
      // Hela fixtures-listan (104 matcher, alla med kända lag i gruppspelet) är
      // strikt fler än fönstrets delmängd.
      expect(screen.getAllByRole('group').length).toBeGreaterThan(windowedCount);
    });
  });

  // Copilot R1, C2: ett kort UTANFÖR fönstret renderas (dolt med `hidden`), inte
  // bort-filtrerat, så dess lokala useState överlever en ihopfällning. Bevisar att
  // osparad inmatning INTE tappas när man fäller ihop och fäller ut igen.
  it('bevarar osparad inmatning i ett kort utanför fönstret över expandera/ihopfäll (C2)', async () => {
    await renderView();

    // Fäll ut så ALLA kort är synliga/interaktiva.
    fireEvent.click(screen.getByRole('button', { name: /Visa alla matcher/i }));
    await waitFor(() => {
      expect(document.querySelectorAll('li[hidden] form[data-match-id]').length).toBe(0);
    });

    // Hitta ett kort som ligger UTANFÖR fönstret: i ihopfällt läge är dess <li>
    // `hidden`. Vi fäller ihop, läser av ett dolt match-id, och fäller ut igen så
    // kortet är interaktivt men vi vet att det är ett out-of-window-kort.
    fireEvent.click(screen.getByRole('button', { name: /Visa färre/i }));
    const hiddenForm = await waitFor(() => {
      const form = document.querySelector('li[hidden] form[data-match-id]');
      expect(form).not.toBeNull();
      return form as HTMLFormElement;
    });
    const outOfWindowId = hiddenForm.getAttribute('data-match-id') as string;

    // Fäll ut igen och skriv en OSPARAD siffra i out-of-window-kortets hemma-fält.
    fireEvent.click(screen.getByRole('button', { name: /Visa alla matcher/i }));
    const formSelector = `form[data-match-id="${outOfWindowId}"]`;
    await waitFor(() => {
      // Kortet får inte vara dolt nu (utfällt), annars är inmatningen inte möjlig.
      const form = document.querySelector(formSelector) as HTMLFormElement | null;
      expect(form?.closest('li')?.hasAttribute('hidden')).toBe(false);
    });
    const homeInputBefore = within(
      document.querySelector(formSelector) as HTMLFormElement
    ).getByLabelText(/\(hemma\)/) as HTMLInputElement;
    fireEvent.change(homeInputBefore, { target: { value: '7' } });
    expect(homeInputBefore.value).toBe('7');

    // Fäll ihop (kortet blir hidden, men UNMOUNTAS inte) och fäll ut igen.
    fireEvent.click(screen.getByRole('button', { name: /Visa färre/i }));
    await waitFor(() => {
      const form = document.querySelector(formSelector) as HTMLFormElement;
      expect(form.closest('li')?.hasAttribute('hidden')).toBe(true);
    });
    fireEvent.click(screen.getByRole('button', { name: /Visa alla matcher/i }));
    await waitFor(() => {
      const form = document.querySelector(formSelector) as HTMLFormElement;
      expect(form.closest('li')?.hasAttribute('hidden')).toBe(false);
    });

    // Den osparade siffran ska finnas kvar (samma React-instans, ingen unmount).
    const homeInputAfter = within(
      document.querySelector(formSelector) as HTMLFormElement
    ).getByLabelText(/\(hemma\)/) as HTMLInputElement;
    expect(homeInputAfter.value).toBe('7');
    // Timeout ärvs från describe-nivån (20 s); detta test fäller ut/ihop flera gånger.
  });
});

// DAG-MEDVETET fönster (Copilot R1, C1, PWA-fälla). Den rena fönster-funktionen och
// useTodayKey är enhetstestade fristående (result-window.test.ts, use-today-key.test.tsx,
// inkl. midnatts-flytten). Här bevisar vi att VYN ankrar fönstret på den FAKTISKA dagen,
// inte på ett fruset Date.now(): renderas vyn två olika dagar visas olika kort. Det
// stänger regressionen där fönstret räknades i ett useMemo som bara berodde på matchlistan.
describe('ResultEntryView, fönstret följer dagens datum (C1)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Vilka match-id som är SYNLIGA (i fönstret) just nu = formulär i ett icke-dolt <li>. */
  async function visibleMatchIds(systemTime: string): Promise<Set<string>> {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(systemTime));
    const { unmount } = render(
      <ResultsProvider env={fixturesEnv()}>
        <ResultEntryView />
      </ResultsProvider>
    );
    await waitFor(() => {
      expect(screen.getAllByRole('group').length).toBeGreaterThan(0);
    });
    const ids = new Set<string>();
    document.querySelectorAll('li:not([hidden]) form[data-match-id]').forEach((f) => {
      ids.add((f as HTMLElement).getAttribute('data-match-id') as string);
    });
    unmount();
    vi.useRealTimers();
    return ids;
  }

  it('visar OLIKA kort på premiärdagen (11 juni) än mitt i turneringen (20 juni)', async () => {
    // Premiärdagen: fönstret 11-13 juni -> premiärmatcherna syns.
    const premiere = await visibleMatchIds('2026-06-11T08:00:00.000Z');
    // En vecka senare: fönstret 20-22 juni -> ANDRA matcher syns, premiärmatcherna
    // har glidit ut ur fönstret. Hade vyn frusit Date.now() (C1-buggen) hade samma
    // kort visats båda gångerna.
    const later = await visibleMatchIds('2026-06-20T08:00:00.000Z');

    // Båda fönstren har matcher (turneringen pågår båda dagarna).
    expect(premiere.size).toBeGreaterThan(0);
    expect(later.size).toBeGreaterThan(0);
    // Och de skiljer sig: minst ett kort som syns på premiärdagen är borta senare.
    const premiereOnly = [...premiere].filter((id) => !later.has(id));
    expect(premiereOnly.length).toBeGreaterThan(0);
  });
});
