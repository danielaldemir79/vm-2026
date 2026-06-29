import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCallback, useState, type ReactNode } from 'react';
import { ResultsProvider } from '../results/ResultsProvider';
import { ResultsStoreContext, type ResultsStore } from '../results/results-context';
import { TeamProfilePanel } from './TeamProfilePanel';
import { TeamProfileProvider } from './TeamProfileProvider';
import { useTeamProfile } from './team-profile-context';
import { GroupStageView } from '../groups/GroupStageView';
import { DailyMatchesView } from '../daily/DailyMatchesView';
import { MatchDetailProvider } from '../match-detail';
import type { Group, Match, Team } from '../../domain/types';

// Profil-modalen + navigeringen testas END-TO-END mot fixtures-datan (den verifierade
// VM 2026-datan med profil-fälten invävda, T10), under samma delade store som resten
// av appen. Så testet bevisar att ett klick på ett lagnamn (i tabell eller matchkort)
// öppnar rätt profil med källånkrad data, och att modalen är en korrekt a11y-dialog.

function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

// Sim-seamen (T12) ingår i ResultsStore men dessa profil-tester rör inte
// what-if-läget; en delad no-op-stub håller store-objekten kompletta utan att
// upprepa fyra identiska fält-block (DRY).
const simStub = {
  simulating: false,
  enterSimulation: () => {},
  exitSimulation: () => {},
  resetSimulation: () => {},
} satisfies Pick<
  ResultsStore,
  'simulating' | 'enterSimulation' | 'exitSimulation' | 'resetSimulation'
>;

function renderWithProviders(children: ReactNode) {
  return render(
    <ResultsProvider env={fixturesEnv()}>
      <TeamProfileProvider>
        {/* MatchDetailProvider (T86, #178): den dagliga vyns matchkort bär nu en drill-in-
            trigger som kräver provideren. Den riktiga appen wrappar Idag i den; testet med. */}
        <MatchDetailProvider>{children}</MatchDetailProvider>
      </TeamProfileProvider>
    </ResultsProvider>
  );
}

/** En liten knapp som öppnar en profil via context (för att testa öppning isolerat). */
function OpenButton({ teamId, label }: { teamId: string; label: string }) {
  const { openProfile } = useTeamProfile();
  return (
    <button type="button" onClick={() => openProfile(teamId)}>
      {label}
    </button>
  );
}

describe('TeamProfilePanel, öppnas och visar källånkrad profil', () => {
  it('är stängd som default (ingen dialog i DOM)', async () => {
    renderWithProviders(<OpenButton teamId="swe" label="öppna" />);
    // Vänta in ResultsProviderns async-seedning (fixtures laddas i en useEffect)
    // INNAN vi assertar, annars läcker dess setState ut ur testet och triggar en
    // act()-varning + en intermittent race under full svit-last (#10). findBy*
    // re-queryar inuti act tills knappen finns, vilket flushar seedningen.
    await screen.findByText('öppna');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('öppnar en dialog med lagets namn, FIFA-ranking, stjärnspelare och kuriosa', async () => {
    renderWithProviders(<OpenButton teamId="fra" label="öppna Frankrike" />);
    fireEvent.click(screen.getByText('öppna Frankrike'));

    const dialog = await screen.findByRole('dialog');
    // Dialogen är märkt av lagnamns-rubriken (aria-labelledby).
    expect(dialog).toHaveAccessibleName(/Frankrike/);
    // FIFA-ranking #3 (källånkrad, Frankrike trea i juniutgåvan 2026, T69;
    // Argentina återtog 1:a-platsen, se docs/decisions.md T69).
    expect(within(dialog).getByText('#3')).toBeInTheDocument();
    // En källbelagd stjärnspelare (Mbappé) + en kuriosa-rad.
    expect(within(dialog).getByText('Kylian Mbappé')).toBeInTheDocument();
    expect(within(dialog).getByText(/VM-slutspel|VM-titlar/)).toBeInTheDocument();
  });

  it('visar lagets väg (gruppmatcher i kronologisk ordning)', async () => {
    renderWithProviders(<OpenButton teamId="swe" label="öppna Sverige" />);
    fireEvent.click(screen.getByText('öppna Sverige'));

    const dialog = await screen.findByRole('dialog');
    const path = within(dialog).getByRole('list', { name: /Lagets väg/i });
    // Sverige spelar 3 gruppmatcher -> 3 rader i vägen.
    expect(within(path).getAllByRole('listitem')).toHaveLength(3);
  });

  it('visar det FULLA namnet i profilen, även för ett lag med kortform (T50)', async () => {
    // Lagprofilen är den RYMLIGA ytan: här står hela "Bosnien och Hercegovina",
    // medan de trånga ytorna (grupptabell/matchkort) visar kortformen "Bosnien".
    renderWithProviders(<OpenButton teamId="bih" label="öppna Bosnien" />);
    fireEvent.click(screen.getByText('öppna Bosnien'));

    const dialog = await screen.findByRole('dialog');
    // Rubriken (och dialogens a11y-namn) bär det FULLA landsnamnet.
    expect(within(dialog).getByRole('heading', { level: 2 })).toHaveTextContent(
      'Bosnien och Hercegovina'
    );
    expect(dialog).toHaveAccessibleName(/Bosnien och Hercegovina/);
  });
});

describe('TeamProfilePanel, stängning (a11y-dialog)', () => {
  // Fokus-testerna nedan flyttar document.activeElement (focus-fälla + fokus-retur).
  // RTL:s auto-cleanup unmountar DOM:en men nollar INTE jsdom:s activeElement, så en
  // kvardröjande fokus skulle kunna läcka in i nästa fils första panel-render (där
  // closeButtonRef.focus() konkurrerar). Vi blurar därför aktivt element efter varje
  // test i blocket, så fokus-baslinjen alltid är ren (ingen cross-fil-läcka).
  afterEach(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
  });

  // Öppna profilen OCH vänta in att dialogens öppnings-effekter har flushat.
  //
  // ROTORSAK till tidigare flake (#10): panelen flyttar fokus till stäng-knappen
  // OCH registrerar Escape-lyssnaren i passiva useEffect:er. React 19 kör passiva
  // effekter ASYNKRONT, så findByRole('dialog') kan resolva i en poll-tick där
  // dialog-noden är committad men effekterna ännu INTE har körts (activeElement är
  // då body). Under full parallell svit-last (24 forks) inträffar det glappet, och
  // tester som direkt assertar toHaveFocus()/Escape-stängning rödnade ~2/6 körningar.
  // Empiriskt bevisat: vid felet är activeElement = BODY trots committad dialog.
  // Genom att vänta in fokus-flytten (findByRole hittar redan dialogen; vi pollar
  // tills stäng-knappen FÅR fokus) garanterar vi att BÅDA öppnings-effekterna har
  // flushat innan testet går vidare. Samma invariant testas, utan effekt-flush-race.
  async function openSweden() {
    renderWithProviders(<OpenButton teamId="swe" label="öppna" />);
    fireEvent.click(screen.getByText('öppna'));
    const dialog = await screen.findByRole('dialog');
    const closeBtn = screen.getByRole('button', { name: /Stäng lagprofil/i });
    await waitFor(() => expect(closeBtn).toHaveFocus());
    return dialog;
  }

  it('stängs med stäng-knappen', async () => {
    await openSweden();
    fireEvent.click(screen.getByRole('button', { name: /Stäng lagprofil/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('stängs med Escape', async () => {
    await openSweden();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('stängs vid klick på bakgrunden (overlay) men INTE vid klick på panelen', async () => {
    const dialog = await openSweden();
    // Klick på panelen (dialogen) stänger inte.
    fireEvent.click(dialog);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Klick på overlay-bakgrunden stänger.
    const overlay = document.querySelector('[data-team-profile-overlay]')!;
    fireEvent.click(overlay);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('är aria-modal och flyttar fokus till stäng-knappen vid öppning', async () => {
    const dialog = await openSweden();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: /Stäng lagprofil/i })).toHaveFocus();
  });

  // F3 (a11y-fokus-fälla): Tab får aldrig vandra ut ur dialogen. Fälla-koden
  // (onDialogKeyDown) cyklar Tab sista->första och Shift+Tab första->sista. Vi
  // bevisar BÅDE det reella en-element-fallet (fokus stannar trappat, preventDefault
  // hedras) OCH det genuina två-element-fallet (cykeln wrapar mellan DISTINKTA element).
  it('Tab på det enda fokuserbara elementet håller fokus trappat i dialogen', async () => {
    await openSweden();
    const closeBtn = screen.getByRole('button', { name: /Stäng lagprofil/i });
    expect(closeBtn).toHaveFocus(); // enda fokuserbara -> first === last
    const dialog = screen.getByRole('dialog');
    // Tab (active === last) ska cykla till first (samma element) och PREVENTA default,
    // så fokus aldrig läcker till bakgrunden bakom modalen.
    const tab = fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(tab).toBe(false); // preventDefault() anropades -> fokus-fällan grep in
    expect(closeBtn).toHaveFocus();
    // Shift+Tab (active === first) ska cykla till last (samma element), också preventat.
    const shiftTab = fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(shiftTab).toBe(false);
    expect(closeBtn).toHaveFocus();
  });

  it('Tab på sista elementet cyklar till första (och Shift+Tab första->sista)', async () => {
    const dialog = await openSweden();
    const closeBtn = screen.getByRole('button', { name: /Stäng lagprofil/i });
    // Injicera ett andra fokuserbart element i dialogen så first !== last, och cykeln
    // mellan DISTINKTA element blir observerbar (fälla-koden querySelectar dialogens
    // fokuserbara live, så en riktig knapp i DOM:en räcker). Städas efter testet.
    const extra = document.createElement('button');
    extra.textContent = 'extra';
    dialog.appendChild(extra);
    try {
      // first = closeBtn (renderas först), last = extra. Tab från last (extra) -> first.
      extra.focus();
      expect(extra).toHaveFocus();
      fireEvent.keyDown(dialog, { key: 'Tab' });
      expect(closeBtn).toHaveFocus(); // wrap sista -> första
      // Shift+Tab från first (closeBtn) -> last (extra), omvänt håll.
      closeBtn.focus();
      fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
      expect(extra).toHaveFocus(); // wrap första -> sista
    } finally {
      extra.remove();
    }
  });

  // F3 (a11y-fokus-retur): när modalen stängs ska fokus återgå till elementet som
  // öppnade den (openerRef), så tangentbordsanvändaren inte tappas ut i body.
  it('återför fokus till öppnaren när modalen stängs', async () => {
    renderWithProviders(<OpenButton teamId="swe" label="öppna Sverige" />);
    const opener = screen.getByText('öppna Sverige');
    opener.focus();
    expect(opener).toHaveFocus();
    fireEvent.click(opener); // öppnaren är activeElement vid öppning -> minns som opener
    await screen.findByRole('dialog');
    // Vänta in fokus-flytten in i dialogen (passiv effekt, se openSweden:s rotorsak),
    // annars kan assertion läsa activeElement INNAN effekten flushat under svit-last.
    const closeBtn = screen.getByRole('button', { name: /Stäng lagprofil/i });
    await waitFor(() => expect(closeBtn).toHaveFocus());
    // Stäng -> fokus ska återgå till öppnar-knappen (cleanup-effekten i panelen).
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});

describe('TeamProfilePanel, fokus stabilt vid store-uppdatering mitt under öppen modal (C7)', () => {
  // ROTORSAK (C7): fokus-restore-effekten band tidigare till `profile`, ett HÄRLETT
  // objekt (deriveTeamProfile). I live-/realtidsläge (T18) anropas setMatches medan
  // modalen är öppen -> profile får NY identitet -> effektens cleanup körde mitt under
  // öppen modal (ryckte fokus tillbaka till öppnaren) och openerRef skrevs över med fel
  // element. Detta test driver just den seamen: vi uppdaterar matchlistan (ny identitet,
  // samma sak setMatches gör) MEDAN dialogen är öppen och bevisar att fokus INTE flyttas
  // och att dialogen förblir öppen med fokus intakt; sen stänger vi och bevisar att fokus
  // ändå återförs korrekt till öppnaren. Med den gamla [profile]-bindningen FAILAR detta
  // (cleanup yankar fokus ur dialogen vid store-uppdateringen); med [openProfileId] hålls
  // fokus. afterEach blurar (samma cross-fil-läckskydd som a11y-blocket ovan).
  afterEach(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
  });

  // Ett känt lag (så deriveTeamProfile ger en icke-null profil och dialogen renderas).
  const swedenTeam: Team = {
    id: 'swe',
    name: 'Sverige',
    code: 'SWE',
    group: 'A',
    fifaRanking: 25,
    starPlayers: ['Alexander Isak'],
  };
  const groups: Group[] = [{ id: 'A', teamIds: ['swe'] }];

  /** En gruppmatch för Sverige (ger storen ett innehåll att byta identitet på). */
  function swedenMatch(id: string): Match {
    return {
      id,
      stage: 'group',
      groupId: 'A',
      homeTeamId: 'swe',
      awayTeamId: null,
      kickoff: '2026-06-12T18:00:00.000Z',
      venue: 'Testarena',
      status: 'scheduled',
      result: null,
    };
  }

  // Harness: håller matchlistan i state och bygger storen runt den (storen får ny
  // identitet per render, precis som ResultsProvider efter en live-uppdatering). En
  // knapp byter in en FÄRSK matchlista (ny array-identitet) = exakt det setMatches gör
  // i T18:s realtids-seam. Öppnar-knappen styr openTeamId så vi kan öppna/stänga modalen.
  function LiveUpdateHarness() {
    const [openTeamId, setOpenTeamId] = useState<string | null>(null);
    const [matches, setMatches] = useState<Match[]>([swedenMatch('m1')]);
    const store: ResultsStore = {
      status: 'ready',
      matches,
      teams: [swedenTeam],
      groups,
      mode: 'fixtures',
      error: null,
      setMatches,
      submitResult: () => ({ ok: true }),
      ...simStub,
    };
    return (
      <ResultsStoreContext.Provider value={store}>
        <button type="button" onClick={() => setOpenTeamId('swe')}>
          öppna Sverige
        </button>
        <button type="button" onClick={() => setMatches([swedenMatch('m2')])}>
          live-uppdatera
        </button>
        <TeamProfilePanel openTeamId={openTeamId} onClose={() => setOpenTeamId(null)} />
      </ResultsStoreContext.Provider>
    );
  }

  it('behåller fokus i dialogen (och modalen öppen) när storen uppdateras, och återför fokus vid stäng', async () => {
    render(<LiveUpdateHarness />);
    const opener = screen.getByText('öppna Sverige');
    opener.focus();
    expect(opener).toHaveFocus(); // öppnaren är activeElement vid öppning -> minns som opener

    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog');
    const closeBtn = screen.getByRole('button', { name: /Stäng lagprofil/i });
    // Vänta in fokus-flytten in i dialogen (passiv effekt, samma rotorsak som openSweden).
    await waitFor(() => expect(closeBtn).toHaveFocus());

    // Simulera att användaren INTERAGERAR i den öppna modalen: flytta fokus till ett
    // annat element INUTI dialogen (en injicerad knapp, som en länk/knapp i innehållet).
    // Detta är det avgörande draget för att skilja buggen från fixen: med [profile]-
    // bindningen kör effektens re-run vid store-uppdateringen `closeButtonRef.focus()`
    // igen och RYCKER fokus tillbaka till stäng-knappen, bort från där användaren står.
    const inner = document.createElement('button');
    inner.textContent = 'inre kontroll';
    dialog.appendChild(inner);
    try {
      inner.focus();
      expect(inner).toHaveFocus();

      // KÄRN-ASSERTIONEN (C7): uppdatera storen MEDAN modalen är öppen (ny matchlista-
      // identitet, exakt det setMatches gör i T18:s realtids-seam). Profile får ny
      // identitet. Med den gamla [profile]-bindningen kör effekt-cleanup + re-run här
      // mitt under öppen modal: fokus rycks bort från `inner` (cleanup yankar till
      // öppnaren, re-run flyttar till stäng-knappen). Med [openProfileId] händer inget,
      // fokus stannar där användaren satte den.
      fireEvent.click(screen.getByText('live-uppdatera'));
      // Vänta in att store-uppdateringen FAKTISKT slog igenom (profilens väg renderar nu
      // den nya matchen m2, gamla m1 är borta), så vi vet att effekterna haft sin chans
      // att (felaktigt) köra innan vi assertar fokus.
      await waitFor(() =>
        expect(dialog.querySelector('[data-profile-path-match="m2"]')).not.toBeNull()
      );
      expect(dialog.querySelector('[data-profile-path-match="m1"]')).toBeNull();
      expect(inner).toHaveFocus(); // fokus rycktes INTE bort från den inre kontrollen
      expect(closeBtn).not.toHaveFocus(); // re-run yankade INTE tillbaka till stäng-knappen
      expect(opener).not.toHaveFocus(); // cleanup yankade INTE ut till öppnaren
      expect(screen.getByRole('dialog')).toBeInTheDocument(); // modalen förblir öppen
    } finally {
      inner.remove();
    }

    // Och stängningen fungerar fortfarande: openerRef ska inte ha skrivits över av
    // store-uppdateringen, så fokus återförs korrekt till den ursprungliga öppnaren.
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});

describe('TeamProfilePanel, Escape-lyssnaren churnar inte vid store-uppdatering (C9)', () => {
  // ROTORSAK (C9, samma klass som C7): Escape-effekten band till `profile`, ett HÄRLETT
  // objekt som får ny identitet vid varje store-uppdatering (live/realtid T18 anropar
  // setMatches -> deriveTeamProfile körs om -> ny identitet). Då remove/add:ades keydown-
  // lyssnaren i onödan vid varje datauppdatering medan modalen står öppen (churn).
  // Ofarligt för beteendet (Escape stängde ändå), men onödig avregistrering/registrering
  // per tick. Fixen binder till det STABILA openProfileId, så lyssnaren läggs EXAKT en
  // gång per öppning, oberoende av hur ofta datan bakom uppdateras. Detta test räknar
  // add/remove av just `keydown` på document över en store-uppdatering: med [profile]
  // skulle uppdateringen ge +1 remove och +1 add (churn); med [openProfileId] noll.
  afterEach(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    vi.restoreAllMocks();
  });

  const swedenTeam: Team = {
    id: 'swe',
    name: 'Sverige',
    code: 'SWE',
    group: 'A',
    fifaRanking: 25,
    starPlayers: ['Alexander Isak'],
  };
  const groups: Group[] = [{ id: 'A', teamIds: ['swe'] }];

  function swedenMatch(id: string): Match {
    return {
      id,
      stage: 'group',
      groupId: 'A',
      homeTeamId: 'swe',
      awayTeamId: null,
      kickoff: '2026-06-12T18:00:00.000Z',
      venue: 'Testarena',
      status: 'scheduled',
      result: null,
    };
  }

  function LiveUpdateHarness() {
    const [openTeamId, setOpenTeamId] = useState<string | null>(null);
    const [matches, setMatches] = useState<Match[]>([swedenMatch('m1')]);
    // onClose stabil (useCallback, [] deps) precis som appens TeamProfileProvider
    // (closeProfile = useCallback(() => setOpenTeamId(null), [])). Det är avgörande:
    // Escape-effekten deps:ar på [openProfileId, onClose], så en CHURNANDE onClose
    // (inline-arrow med ny identitet per render) skulle ge churn via onClose och dölja
    // att fixen ligger i det stabila openProfileId. Med en stabil onClose isolerar
    // testet exakt det C9 åtgärdar: profile-identitetens churn, inte onClose:s.
    const onClose = useCallback(() => setOpenTeamId(null), []);
    const store: ResultsStore = {
      status: 'ready',
      matches,
      teams: [swedenTeam],
      groups,
      mode: 'fixtures',
      error: null,
      setMatches,
      submitResult: () => ({ ok: true }),
      ...simStub,
    };
    return (
      <ResultsStoreContext.Provider value={store}>
        <button type="button" onClick={() => setOpenTeamId('swe')}>
          öppna Sverige
        </button>
        <button type="button" onClick={() => setMatches([swedenMatch('m2')])}>
          live-uppdatera
        </button>
        <TeamProfilePanel openTeamId={openTeamId} onClose={onClose} />
      </ResultsStoreContext.Provider>
    );
  }

  it('lägger keydown-lyssnaren EN gång per öppning och remove/add:ar den INTE vid en store-uppdatering', async () => {
    // Räkna bara `keydown`-registreringar på document (panelens Escape-lyssnare),
    // andra event-typer (t.ex. RTL/jsdom-interna) ignoreras.
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const keydownAdds = () => addSpy.mock.calls.filter(([type]) => type === 'keydown').length;
    const keydownRemoves = () => removeSpy.mock.calls.filter(([type]) => type === 'keydown').length;

    render(<LiveUpdateHarness />);
    fireEvent.click(screen.getByText('öppna Sverige'));
    const dialog = await screen.findByRole('dialog');
    const closeBtn = screen.getByRole('button', { name: /Stäng lagprofil/i });
    await waitFor(() => expect(closeBtn).toHaveFocus()); // öppnings-effekterna flushade

    // Baslinje: lyssnaren ska vara lagd exakt en gång vid öppning, inget remove än.
    expect(keydownAdds()).toBe(1);
    expect(keydownRemoves()).toBe(0);

    // Uppdatera storen MEDAN modalen är öppen (ny matchlista-identitet = det setMatches
    // gör i T18:s realtids-seam). Profile får ny identitet. Med [profile]-deps hade
    // detta avregistrerat + återregistrerat keydown (churn); med [openProfileId] inte.
    fireEvent.click(screen.getByText('live-uppdatera'));
    await waitFor(() =>
      expect(dialog.querySelector('[data-profile-path-match="m2"]')).not.toBeNull()
    );

    // KÄRN-ASSERTIONEN (C9): ingen churn, fortfarande exakt en add och noll remove.
    expect(keydownAdds()).toBe(1);
    expect(keydownRemoves()).toBe(0);

    // Beteendet är intakt: Escape stänger fortfarande, och DÅ städas lyssnaren (en remove).
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(keydownRemoves()).toBe(1);
  });
});

describe('TeamProfilePanel, navigering: öppnas från tabell och matchkort', () => {
  it('öppnas när man klickar ett lagnamn i en gruppspelstabell', async () => {
    renderWithProviders(<GroupStageView />);
    // Vänta in seedningen (12 tabeller).
    await waitFor(() => expect(screen.getAllByRole('table')).toHaveLength(12));

    // Klicka ett lagnamns-knapp (Mexiko, grupp A) -> profilen öppnas.
    const trigger = screen.getAllByRole('button', { name: /Visa lagprofil för Mexiko/i })[0];
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName(/Mexiko/);
  });

  it('öppnas när man klickar ett lagnamn i ett matchkort (daglig vy)', async () => {
    // DATUM-STABILT (annars datum-kopplat): den dagliga vyn väljer dagen ur det VERKLIGA
    // "nu". Under slutspelet är dagens matcher knockout-platser med null-lag (löses först
    // när bracket-seedningen körts mot inmatade gruppresultat, som fixtures-läget saknar),
    // och då saknar matchkorten lagnamns-knappar. Vi pinnar klockan till premiärdagen
    // (11 juni 2026, en gruppdag med kända lag) så ett matchkort deterministiskt bär en
    // "Visa lagprofil för ..."-knapp oavsett verkligt datum. Bara Date fejkas
    // (toFake: ['Date']) så providerns async-seedning + findBy kör på riktiga timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-11T08:00:00.000Z'));
    try {
      renderWithProviders(<DailyMatchesView />);
      // Vänta in seedningen: minst en lagprofil-trigger finns i ett matchkort.
      const triggers = await screen.findAllByRole('button', { name: /Visa lagprofil för/i });
      expect(triggers.length).toBeGreaterThan(0);
      fireEvent.click(triggers[0]);
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('TeamProfilePanel, edge-fall: stjärnspelare saknas (ärligt tomt, inte gissat)', () => {
  // Bygg en delad results-store med ETT lag som finns men SAKNAR källbelagda
  // stjärnspelare (starPlayers utelämnat). Alla riktiga fixtures-lag HAR
  // stjärnspelare, så starPlayers.length === 0-grenen i panelen kan bara nås med
  // en konstruerad store. Vi renderar panelen DIREKT mot denna store (ingen
  // async-seedning), så grenen testas deterministiskt och utan race.
  function storeWith(teams: Team[], groups: Group[]): ResultsStore {
    return {
      status: 'ready',
      matches: [],
      teams,
      groups,
      mode: 'fixtures',
      error: null,
      setMatches: () => {},
      submitResult: () => ({ ok: true }),
      ...simStub,
    };
  }

  it('visar "Data saknas" i stjärnspelar-sektionen när laget saknar källbelagda namn', () => {
    // Laget finns i storen (så dialogen RENDERAS) men har inga starPlayers ->
    // panelen ska ta den ärliga tom-grenen, inte gissa fram en spelare. Vi ger
    // laget en fifaRanking så att ranking-badgen INTE också visar "Data saknas"
    // (annars matchar texten två ställen), och isolerar assertionen till just
    // stjärnspelar-sektionens tom-markör (data-profile-stars="empty").
    const starless: Team = {
      id: 'ghost',
      name: 'Spöklandet',
      code: 'GHO',
      group: 'A',
      fifaRanking: 99,
    };
    const groups: Group[] = [{ id: 'A', teamIds: ['ghost'] }];
    render(
      <ResultsStoreContext.Provider value={storeWith([starless], groups)}>
        <TeamProfilePanel openTeamId="ghost" onClose={() => {}} />
      </ResultsStoreContext.Provider>
    );

    // Dialogen renderas (laget finns), märkt av lagnamnet.
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName(/Spöklandet/);
    // Stjärnspelar-sektionen visar det ärliga tom-tillståndet: tom-markören
    // data-profile-stars="empty" med texten "Data saknas", och INGEN spelar-lista.
    // Sök i den ÖPPNA dialog-noden (inte RTL-container): modalen portaleras numera
    // till document.body (T33 delade <Modal>), så innehållet ligger utanför container.
    const emptyStars = dialog.querySelector('[data-profile-stars="empty"]');
    expect(emptyStars).not.toBeNull();
    expect(emptyStars).toHaveTextContent('Data saknas');
    expect(within(dialog).queryByRole('list', { name: /Stjärnspelare/i })).not.toBeInTheDocument();
  });
});

describe('TeamProfilePanel, edge-fall: okänt lag-id (fail-safe, ingen dialog)', () => {
  it('renderar ingen dialog för ett okänt lag-id (deriveTeamProfile får ingen träff -> null)', async () => {
    // Här testas en ANNAN gren än tom-stjärnor ovan: ett id som inte finns i storen
    // alls. deriveTeamProfile får då ingen träff, panelen renderar null -> ingen
    // dialog (fail-safe, ingen krasch på okänt id).
    function Harness() {
      const { openProfile } = useTeamProfile();
      return (
        <button type="button" onClick={() => openProfile('saknas-id')}>
          öppna okänt
        </button>
      );
    }
    renderWithProviders(<Harness />);
    // Vänta in ResultsProviderns async-seedning INNAN klick/assert, så dess setState
    // inte läcker ut ur testet (act()-varning + intermittent race under svit-last, #10).
    // Annars är storen tom enbart för att datan inte hunnit laddas (rätt svar av fel
    // skäl); vi vill bevisa null-grenen för ett OKÄNT id mot en SEEDAD store.
    const trigger = await screen.findByText('öppna okänt');
    fireEvent.click(trigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('TeamProfilePanel, lagets väg: motståndare saknas i uppslaget (fail-loud-light, C10)', () => {
  // C10: en match i lagets väg kan peka på ett opponentId som är ICKE-null men SAKNAS i
  // teamsById (data-inkonsistens, t.ex. en match seedad mot ett lag som inte finns i
  // store-uppslaget). Tidigare maskerade panelen det som "Ej klart" (samma text som ett
  // genuint okänt slutspels-slot), vilket DOLDE felet. Fixen visar i stället id-strängen
  // när uppslaget missar, men behåller "Ej klart" för ett GENUINT null (tomt slutspels-
  // slot). Vi renderar panelen direkt mot en konstruerad store (ingen async-seedning) så
  // grenen testas deterministiskt; alla riktiga fixtures-matcher har kända motståndare.
  function storeWith(teams: Team[], groups: Group[], matches: Match[]): ResultsStore {
    return {
      status: 'ready',
      matches,
      teams,
      groups,
      mode: 'fixtures',
      error: null,
      setMatches: () => {},
      submitResult: () => ({ ok: true }),
      ...simStub,
    };
  }

  const swedenTeam: Team = {
    id: 'swe',
    name: 'Sverige',
    code: 'SWE',
    group: 'A',
    fifaRanking: 25,
    starPlayers: ['Alexander Isak'],
  };
  const groups: Group[] = [{ id: 'A', teamIds: ['swe'] }];

  /** En Sverige-match mot ett givet borta-id (null = obestämt slutspels-slot). */
  function sweMatch(id: string, awayTeamId: string | null): Match {
    return {
      id,
      stage: 'group',
      groupId: 'A',
      homeTeamId: 'swe',
      awayTeamId,
      kickoff: '2026-06-12T18:00:00.000Z',
      venue: 'Testarena',
      status: 'scheduled',
      result: null,
    };
  }

  it('visar opponent-id-strängen (inte "Ej klart") när motståndaren saknas i uppslaget', () => {
    // Matchen pekar på 'phantom' som borta-lag, men 'phantom' finns INTE i store-teamen
    // -> teamsById-uppslaget missar. Panelen ska då visa id:t synligt (fail-loud-light),
    // inte gömma inkonsistensen bakom "Ej klart".
    const match = sweMatch('m-phantom', 'phantom');
    render(
      <ResultsStoreContext.Provider value={storeWith([swedenTeam], groups, [match])}>
        <TeamProfilePanel openTeamId="swe" onClose={() => {}} />
      </ResultsStoreContext.Provider>
    );

    // Sök i dialog-noden (portalerad till body via delade <Modal>, T33), inte container.
    const row = screen.getByRole('dialog').querySelector('[data-profile-path-match="m-phantom"]')!;
    expect(row).not.toBeNull();
    // Id-strängen syns (felet är synligt), och raden visar INTE det maskerande "Ej klart".
    expect(row).toHaveTextContent('phantom');
    expect(row).not.toHaveTextContent('Ej klart');
  });

  it('behåller "Ej klart" när motståndaren är genuint obestämd (null, tomt slutspels-slot)', () => {
    // Kontroll-fall: ett ÄKTA null-motstånd (matchen har ingen borta-motståndare än) ska
    // FORTSATT visa "Ej klart". Fixen får inte över-korrigera och börja visa något annat
    // för det legitima obestämda fallet.
    const match = sweMatch('m-open', null);
    render(
      <ResultsStoreContext.Provider value={storeWith([swedenTeam], groups, [match])}>
        <TeamProfilePanel openTeamId="swe" onClose={() => {}} />
      </ResultsStoreContext.Provider>
    );

    // Sök i dialog-noden (portalerad till body via delade <Modal>, T33), inte container.
    const row = screen.getByRole('dialog').querySelector('[data-profile-path-match="m-open"]')!;
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('Ej klart');
  });
});

describe('useTeamProfile, fail loud utan provider', () => {
  it('kastar om den används utan TeamProfileProvider (wiring-fel, inte tyst no-op)', () => {
    function Bare() {
      useTeamProfile();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/TeamProfileProvider/);
  });
});
