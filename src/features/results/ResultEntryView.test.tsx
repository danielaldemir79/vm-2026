import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultEntryView } from './ResultEntryView';
import { ResultsProvider } from './ResultsProvider';
import { GroupStageView } from '../groups/GroupStageView';
// GroupStageView har klickbara lagnamn (TeamNameButton, T10), så integrationstestet
// som monterar den wrappas i TeamProfileProvider.
import { TeamProfileProvider } from '../team-profile';
import { createFailingDataSource } from '../../test/failing-data-source';

function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
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
  it('visar ett fel-meddelande när datakällan rejectar (genuint datakälle-fel)', async () => {
    // Sedan T14 kastar live-källan inte längre (ger giltig data), så ett genuint
    // datakälle-fel injiceras via en rejectande datakälla.
    render(
      <ResultsProvider env={fixturesEnv()} dataSource={createFailingDataSource()}>
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
        <TeamProfileProvider>
          <GroupStageView />
          <ResultEntryView />
        </TeamProfileProvider>
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

    // Mata in resultatet Sydafrika 0-5 och spara. T31 (#51): att fylla i båda målen
    // sätter statusen automatiskt till spelad, ingen status-väljare att röra.
    fireEvent.change(scoped.getByLabelText(/Mexiko \(hemma\)/), { target: { value: '0' } });
    fireEvent.change(scoped.getByLabelText(/Sydafrika \(borta\)/), { target: { value: '5' } });
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

  // ÖVRE toggeln. Kontrollen är DUBBLERAD (T28/#42: en uppe + en nere), så ett bart
  // getByRole på toggle-namnet vore tvetydigt. Vi siktar på den övre (stabil hake
  // data-results-toggle-position="top") för dessa #39-tester; T28-blocket nedan
  // bevisar att den nedre bär identisk semantik.
  function topToggle(): HTMLButtonElement {
    return document.querySelector(
      'button[data-results-toggle-position="top"]'
    ) as HTMLButtonElement;
  }

  it('visar bara matcher inom fönstret som default (inte hela listan), med en expandera-knapp', async () => {
    await renderView();
    const windowedCount = screen.getAllByRole('group').length;
    // Fönstret döljer matcher -> knappen finns och säger hur många som är dolda.
    const toggle = topToggle();
    expect(toggle).toHaveAccessibleName(/Visa alla matcher \(\d+ dold/i);
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
    const collapse = topToggle();
    expect(collapse).toHaveAccessibleName(/Visa färre/i);
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(collapse).toHaveAttribute('aria-controls', listId);

    // Fäll ihop igen -> tillbaka till fönster-antalet.
    fireEvent.click(collapse);
    await waitFor(() => {
      expect(screen.getAllByRole('group').length).toBe(windowedCount);
    });
    expect(topToggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('utfälld lista visar fler matcher än fönstret (ingen match går förlorad)', async () => {
    await renderView();
    const windowedCount = screen.getAllByRole('group').length;
    fireEvent.click(topToggle());
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
    fireEvent.click(topToggle());
    await waitFor(() => {
      expect(document.querySelectorAll('li[hidden] form[data-match-id]').length).toBe(0);
    });

    // Hitta ett kort som ligger UTANFÖR fönstret: i ihopfällt läge är dess <li>
    // `hidden`. Vi fäller ihop, läser av ett dolt match-id, och fäller ut igen så
    // kortet är interaktivt men vi vet att det är ett out-of-window-kort.
    fireEvent.click(topToggle());
    const hiddenForm = await waitFor(() => {
      const form = document.querySelector('li[hidden] form[data-match-id]');
      expect(form).not.toBeNull();
      return form as HTMLFormElement;
    });
    const outOfWindowId = hiddenForm.getAttribute('data-match-id') as string;

    // Fäll ut igen och skriv en OSPARAD siffra i out-of-window-kortets hemma-fält.
    fireEvent.click(topToggle());
    const formSelector = `form[data-match-id="${outOfWindowId}"]`;
    await waitFor(() => {
      // Kortet får inte vara dolt nu (utfällt), annars är inmatningen inte möjlig.
      // closest('li') = det INNERSTA korts-<li>:t (#39-invarianten bevarad trots
      // den nya dag-grupp-nivån: kortets egna hidden står oberoende av dag-<li>:t).
      const form = document.querySelector(formSelector) as HTMLFormElement | null;
      expect(form?.closest('li')?.hasAttribute('hidden')).toBe(false);
    });
    const homeInputBefore = within(
      document.querySelector(formSelector) as HTMLFormElement
    ).getByLabelText(/\(hemma\)/) as HTMLInputElement;
    fireEvent.change(homeInputBefore, { target: { value: '7' } });
    expect(homeInputBefore.value).toBe('7');

    // Fäll ihop (kortet blir hidden, men UNMOUNTAS inte) och fäll ut igen.
    fireEvent.click(topToggle());
    await waitFor(() => {
      const form = document.querySelector(formSelector) as HTMLFormElement;
      expect(form.closest('li')?.hasAttribute('hidden')).toBe(true);
    });
    fireEvent.click(topToggle());
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
    // Ett kort är SYNLIGT när dess EGNA (innersta) <li> inte är hidden. Vi måste
    // läsa closest('li') (inte en `li:not([hidden]) form`-selektor): med den nya
    // dag-grupp-nivån (T28) är ett dolt kort-<li> fortfarande descendant av ett
    // SYNLIGT dag-<li>, så den lösare selektorn skulle felaktigt räkna det som synligt.
    document.querySelectorAll('form[data-match-id]').forEach((f) => {
      if (!(f as HTMLElement).closest('li')?.hasAttribute('hidden')) {
        ids.add((f as HTMLElement).getAttribute('data-match-id') as string);
      }
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

// T28 (#42, Daniels feedback 2): (1) dag-rubriker + kontext per kort, (2) lättåtkomlig
// ihopfällning (dubblerad kontroll uppe+nere, konsekvent aria, fokus till toppen vid
// ihopfällning). De rena modulerna är enhetstestade fristående (group-matches-for-entry,
// MatchContextRow); här bevisar vi att VYN väver in dem korrekt, inkl. samspelet med
// #39:s fönster (rubriker även i ihopfällt läge, korrekta över fönster-gränsen).
describe(
  'ResultEntryView, dag-rubriker + lättåtkomlig ihopfällning (T28)',
  { timeout: 20000 },
  () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      // Premiärdagen 2026-06-11: fönstret ankrar på 11 juni (spänner 11-13 juni).
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
      await waitFor(() => {
        expect(screen.getAllByRole('group').length).toBeGreaterThan(0);
      });
      return utils;
    }

    function topToggle(): HTMLButtonElement {
      return document.querySelector(
        'button[data-results-toggle-position="top"]'
      ) as HTMLButtonElement;
    }
    function bottomToggle(): HTMLButtonElement {
      return document.querySelector(
        'button[data-results-toggle-position="bottom"]'
      ) as HTMLButtonElement;
    }

    it('grupperar listan under dag-rubriker (h3), korrekt även i IHOPFÄLLT läge', async () => {
      await renderView();
      // I ihopfällt läge visas bara fönstrets dagar (11-13 juni). Premiärdagen ska
      // ha en synlig dag-rubrik (kravet: rubriker korrekta även i ihopfällt läge).
      const headings = screen.getAllByRole('heading', { level: 3 });
      expect(headings.length).toBeGreaterThan(0);
      // Premiärdagen 11 juni 2026 är en torsdag, dag-rubriken bär den svenska dagen.
      const premiereDay = document.querySelector('[data-result-day="2026-06-11"]');
      expect(premiereDay).not.toBeNull();
      expect(premiereDay?.querySelector('[data-result-day-heading]')).toHaveTextContent(
        /torsdag 11 juni 2026/i
      );
      // En dag-rubrik efter fönstret (16 juni, utanför 11-13-fönstret) finns i DOM:en
      // men dess dag-<li> är dolt i ihopfällt läge (ingen tom rubrik utanför fönstret).
      // (Slutspelsdagar saknas i editable tills lagen seedats; vi väljer en
      // gruppspelsdag som säkert har inmatningsbara matcher men ligger utanför fönstret.)
      const lateDay = document.querySelector('[data-result-day="2026-06-16"]');
      expect(lateDay).not.toBeNull();
      expect((lateDay as HTMLElement).hasAttribute('hidden')).toBe(true);
    });

    it('fäller ut -> dag-rubriker över HELA turneringen blir synliga (fönster-gränsen)', async () => {
      await renderView();
      // Innan utfällning: en sen dag (16 juni, utanför 11-13-fönstret) är dold.
      const midDaySelector = '[data-result-day="2026-06-16"]';
      const before = document.querySelector(midDaySelector) as HTMLElement | null;
      expect(before).not.toBeNull();
      expect(before?.hasAttribute('hidden')).toBe(true);

      // Fäll ut: alla dag-rubriker blir synliga (inget dag-<li> är hidden längre),
      // så rubrikerna är korrekta på BÅDA sidor om fönster-gränsen.
      fireEvent.click(topToggle());
      await waitFor(() => {
        expect(document.querySelectorAll('li[data-result-day][hidden]').length).toBe(0);
      });
      expect((document.querySelector(midDaySelector) as HTMLElement).hasAttribute('hidden')).toBe(
        false
      );
    });

    it('kontrollen är DUBBLERAD (uppe + nere) med IDENTISK aria-semantik på båda', async () => {
      await renderView();
      const top = topToggle();
      const bottom = bottomToggle();
      expect(top).not.toBeNull();
      expect(bottom).not.toBeNull();
      // Samma lista styrs (aria-controls) och samma utfäll-läge (aria-expanded) på BÅDA.
      const listId = top.getAttribute('aria-controls');
      expect(listId).toBeTruthy();
      expect(bottom).toHaveAttribute('aria-controls', listId);
      expect(top).toHaveAttribute('aria-expanded', 'false');
      expect(bottom).toHaveAttribute('aria-expanded', 'false');

      // Klick på DEN NEDRE fäller ut -> BÅDA visar aria-expanded=true (konsekvent).
      fireEvent.click(bottom);
      await waitFor(() => {
        expect(topToggle()).toHaveAttribute('aria-expanded', 'true');
      });
      expect(bottomToggle()).toHaveAttribute('aria-expanded', 'true');
      // Etiketten byts på båda (delar EN komponent, kan inte drifta isär).
      expect(topToggle()).toHaveAccessibleName(/Visa färre/i);
      expect(bottomToggle()).toHaveAccessibleName(/Visa färre/i);
    });

    it('vid IHOPFÄLLNING flyttas fokus till den ÖVRE kontrollen (listans topp, a11y)', async () => {
      await renderView();
      // Fäll ut via den nedre kontrollen.
      fireEvent.click(bottomToggle());
      await waitFor(() => {
        expect(bottomToggle()).toHaveAccessibleName(/Visa färre/i);
      });
      // Fäll ihop via den nedre kontrollen (den ligger långt ner i en utfälld lista).
      fireEvent.click(bottomToggle());
      await waitFor(() => {
        expect(topToggle()).toHaveAccessibleName(/Visa alla matcher/i);
      });
      // Fokus ska ha flyttats till den ÖVRE kontrollen så användaren förs upp till
      // listans topp i stället för att bli kvar där den nedre kontrollen försvann.
      // requestAnimationFrame-callbacken körs av jsdom; vänta in att fokus landat.
      await waitFor(() => {
        expect(document.activeElement).toBe(topToggle());
      });
    });
  }
);
