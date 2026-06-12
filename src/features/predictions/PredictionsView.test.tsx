import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { PredictionsView } from './PredictionsView';
import { PredictionsStoreContext, type PredictionsStore } from './predictions-context';
import type { Prediction } from '../../data/predictions';
import type { Match, Team } from '../../domain/types';

// Mocka data-laddnings-hooken så vyn matas med deterministiska matcher/lag utan
// att gå via datakällan (vi testar vyns LÄGEN, inte I/O:t som testas på annat håll).
const dataState = vi.hoisted(() => ({
  status: 'ready' as 'loading' | 'ready' | 'error',
  matches: [] as Match[],
  teams: [] as Team[],
  error: null as string | null,
}));
vi.mock('./use-predictable-matches', () => ({
  usePredictableData: () => dataState,
}));

// Spionera på den rena fönster-funktionen (men kör den ÄKTA implementationen) så
// tick-granularitet-testerna kan assertera HUR OFTA fönstret räknas om, inte bara att
// utdatat ser likadant ut (utdatat är värde-identiskt även under buggen, så bara ett
// call-count-spion fångar fel-granulariteten: fönstret räknades om varje minut-tick).
const windowMatchesSpy = vi.hoisted(() => vi.fn());
vi.mock('../results/result-window', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../results/result-window')>();
  windowMatchesSpy.mockImplementation(actual.windowMatches);
  return { ...actual, windowMatches: windowMatchesSpy };
});

const TEAMS: Team[] = [
  { id: 'mex', name: 'Mexiko', code: 'MEX', group: 'A' },
  { id: 'rsa', name: 'Sydafrika', code: 'RSA', group: 'A' },
];

function match(id: string, kickoff: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'mex',
    awayTeamId: 'rsa',
    kickoff,
    venue: 'x',
    result: null,
    status: 'scheduled',
  };
}

/** Samma match men AVGJORD (facit satt), så T58:s poäng-rad kan visas. */
function finishedMatch(id: string, kickoff: string, homeGoals: number, awayGoals: number): Match {
  return { ...match(id, kickoff), status: 'finished', result: { homeGoals, awayGoals } };
}

function store(partial: Partial<PredictionsStore>): PredictionsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    activeRoomId: 'r1',
    myPredictions: new Map(),
    savePrediction: vi.fn().mockResolvedValue(undefined),
    ...partial,
  };
}

function renderView(s: PredictionsStore, now: Date, children?: ReactNode) {
  return render(
    <PredictionsStoreContext.Provider value={s}>
      <PredictionsView now={now} />
      {children}
    </PredictionsStoreContext.Provider>
  );
}

const NOW = new Date('2026-06-15T12:00:00.000Z');

beforeEach(() => {
  dataState.status = 'ready';
  dataState.matches = [];
  dataState.teams = TEAMS;
  dataState.error = null;
  windowMatchesSpy.mockClear();
});

describe('PredictionsView', () => {
  it('UTAN aktivt rum: visar "gå med i ett rum för att tippa"', () => {
    renderView(store({ enabled: false, activeRoomId: null }), NOW);
    expect(screen.getByText(/Gå med i ett rum för att tippa/)).toBeInTheDocument();
    // Ingen tips-lista OCH inget tips-formulär i det läget (tips är per rum).
    expect(document.querySelector('[data-predictions-list]')).toBeNull();
    expect(document.querySelectorAll('[data-prediction-form]')).toHaveLength(0);
  });

  it('READY: listar tippbara matcher (kommande överst), ett formulär per match', () => {
    dataState.matches = [
      match('g-A-3', '2026-06-25T18:00:00.000Z'),
      match('g-A-1', '2026-06-20T18:00:00.000Z'),
    ];
    renderView(store({}), NOW);
    const forms = document.querySelectorAll('[data-prediction-form]');
    expect(forms).toHaveLength(2);
    // Tidigast först: g-A-1 (20 juni) före g-A-3 (25 juni).
    expect((forms[0] as HTMLElement).getAttribute('data-match-id')).toBe('g-A-1');
    expect((forms[1] as HTMLElement).getAttribute('data-match-id')).toBe('g-A-3');
  });

  it('LÅST: en match med passerad avspark renderas som låst form', () => {
    dataState.matches = [match('g-A-1', '2026-06-14T18:00:00.000Z')]; // före NOW
    renderView(store({}), NOW);
    const form = document.querySelector('[data-prediction-form]') as HTMLElement;
    expect(form.getAttribute('data-prediction-locked')).toBe('true');
    expect(screen.getByText(/Tipset är låst/)).toBeInTheDocument();
  });

  // C1-regression: låset räknas om NÄR TIDEN PASSERAR AVSPARK, utan omladdning. En
  // avspark passerar mitt på dagen, så en stabil-inom-dagen-tick (useTodayKey) räcker
  // inte; minut-ticken (use-deadline-tick) måste flippa låset. Vi använder falska
  // timers + en styrd systemklocka och stegar fram förbi avspark.
  it('LÅST räknas om när tiden passerar avspark (öppen -> låst utan omladdning)', () => {
    vi.useFakeTimers();
    try {
      const kickoff = '2026-06-15T15:00:00.000Z';
      const before = new Date('2026-06-15T14:59:00.000Z'); // en minut före avspark
      vi.setSystemTime(before);
      dataState.matches = [match('g-A-1', kickoff)];

      renderView(store({}), before);
      const formBefore = document.querySelector('[data-prediction-form]') as HTMLElement;
      // Före avspark: öppen, dvs låst-attributet är FRÅNVARANDE (formuläret
      // sätter bara data-prediction-locked="true" när det är låst). Räknaren
      // säger "1 match öppen" (singular böjer både substantiv och adjektiv).
      expect(formBefore.getAttribute('data-prediction-locked')).toBeNull();
      expect(screen.getByText(/1 match öppen att tippa/)).toBeInTheDocument();

      // Tiden passerar avspark; minut-ticken bumpar nu:et och låset ska räknas om.
      act(() => {
        vi.setSystemTime(new Date('2026-06-15T15:01:00.000Z'));
        vi.advanceTimersByTime(60_000);
      });

      const formAfter = document.querySelector('[data-prediction-form]') as HTMLElement;
      expect(formAfter.getAttribute('data-prediction-locked')).toBe('true');
      // Inga öppna matcher kvar -> räknaren visas inte längre (den döljs vid 0).
      expect(screen.queryByText(/öppna att tippa/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('mitt tips syns: en redan tippad match seedar formuläret', () => {
    dataState.matches = [match('g-A-1', '2026-06-20T18:00:00.000Z')];
    const mine: Prediction = {
      matchId: 'g-A-1',
      userId: 'me',
      homeGoals: 4,
      awayGoals: 0,
      updatedAt: 't',
    };
    renderView(store({ myPredictions: new Map([['g-A-1', mine]]) }), NOW);
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(inputs[0].value).toBe('4');
    expect(inputs[1].value).toBe('0');
  });

  it('FEL-VÄG: store-status error -> role=alert (fail loud)', () => {
    renderView(store({ status: 'error', error: 'kunde inte ladda' }), NOW);
    expect(screen.getByRole('alert')).toHaveTextContent(/kunde inte ladda/);
  });

  it('LADDNING: visar en laddnings-status', () => {
    renderView(store({ status: 'loading' }), NOW);
    expect(screen.getByRole('status')).toHaveTextContent(/Laddar/);
  });
});

// 3-DAGARS FÖNSTER + expandera (Daniels begäran, samma som resultatlistan #39/T27).
// Den rena fönster-funktionen är uttömmande testad i results/result-window.test.ts;
// här bevisar vi att TIPS-VYN tillämpar fönstret som default och att expandera-
// kontrollen är tillgänglig och fungerar end-to-end (samma kontrakt som resultatvyn).
//
// Vi ankrar "nu" på premiärdagen (11 juni 2026) och sprider matcherna över flera dagar,
// så fönstret (11-13 juni) är en ÄKTA delmängd och resten döljs. Ett SYNLIGT kort = ett
// formulär vars <li> INTE är hidden; ett dolt kort renderas (bevaras) men ligger i ett
// `hidden`-<li>, så getByRole/spinbutton räknar bara de synliga (a11y-korrekt).
describe('PredictionsView, 3-dagars fönster + expandera (Daniels begäran)', () => {
  const PREMIERE = new Date('2026-06-11T08:00:00.000Z');

  /** Alla tippbara formulär i DOM:en (inkl. dolda), ordnade som de renderas. */
  function allForms(): HTMLElement[] {
    return Array.from(document.querySelectorAll('[data-prediction-form]')) as HTMLElement[];
  }
  /** Bara de SYNLIGA korten (formulär i ett icke-hidden <li>). */
  function visibleForms(): HTMLElement[] {
    return allForms().filter((f) => !f.closest('li')?.hasAttribute('hidden'));
  }
  function topToggle(): HTMLButtonElement | null {
    return document.querySelector('button[data-predictions-toggle-position="top"]');
  }
  function bottomToggle(): HTMLButtonElement | null {
    return document.querySelector('button[data-predictions-toggle-position="bottom"]');
  }

  it('default: visar bara matcher inom fönstret, döljer resten, med en expandera-knapp', () => {
    // Fönstret 11-13 juni rymmer p0-p2; p3 (14 juni) och p9 (20 juni) ligger utanför.
    dataState.matches = [
      match('p0', '2026-06-11T18:00:00.000Z'),
      match('p1', '2026-06-12T18:00:00.000Z'),
      match('p2', '2026-06-13T18:00:00.000Z'),
      match('p3', '2026-06-14T18:00:00.000Z'),
      match('p9', '2026-06-20T18:00:00.000Z'),
    ];
    renderView(store({}), PREMIERE);

    // ALLA fem korten finns i DOM:en (inget filtreras bort, så osparad inmatning bevaras).
    expect(allForms()).toHaveLength(5);
    // Men bara fönstrets tre (11-13 juni) är SYNLIGA som default.
    expect(visibleForms().map((f) => f.getAttribute('data-match-id'))).toEqual(['p0', 'p1', 'p2']);

    // Expandera-knappen finns, säger hur många som är dolda, och är ihopfälld.
    const toggle = topToggle();
    expect(toggle).not.toBeNull();
    expect(toggle).toHaveAccessibleName(/Visa alla matcher \(2 dolda\)/i);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // aria-controls pekar på tips-listan (samma id som <ol data-predictions-list>).
    const listId = toggle?.getAttribute('aria-controls');
    expect(listId).toBeTruthy();
    const list = document.getElementById(listId as string);
    expect(list?.tagName).toBe('OL');
    expect(list?.hasAttribute('data-predictions-list')).toBe(true);
  });

  it('expandera -> alla matcher synliga; ihopfäll -> tillbaka till fönstret', async () => {
    dataState.matches = [
      match('p0', '2026-06-11T18:00:00.000Z'),
      match('p1', '2026-06-12T18:00:00.000Z'),
      match('p2', '2026-06-13T18:00:00.000Z'),
      match('p3', '2026-06-14T18:00:00.000Z'),
      match('p9', '2026-06-20T18:00:00.000Z'),
    ];
    renderView(store({}), PREMIERE);

    expect(visibleForms()).toHaveLength(3);

    // Fäll ut -> alla fem synliga, knappen blir "Visa färre" + aria-expanded=true.
    fireEvent.click(topToggle() as HTMLButtonElement);
    await waitFor(() => expect(visibleForms()).toHaveLength(5));
    expect(topToggle()).toHaveAccessibleName(/Visa färre/i);
    expect(topToggle()).toHaveAttribute('aria-expanded', 'true');

    // Fäll ihop igen -> tillbaka till fönstrets tre.
    fireEvent.click(topToggle() as HTMLButtonElement);
    await waitFor(() => expect(visibleForms()).toHaveLength(3));
    expect(topToggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('kontrollen är DUBBLERAD (uppe + nere) med identisk aria-semantik', async () => {
    dataState.matches = [
      match('p0', '2026-06-11T18:00:00.000Z'),
      match('p1', '2026-06-12T18:00:00.000Z'),
      match('p2', '2026-06-13T18:00:00.000Z'),
      match('p9', '2026-06-20T18:00:00.000Z'),
    ];
    renderView(store({}), PREMIERE);

    const top = topToggle();
    const bottom = bottomToggle();
    expect(top).not.toBeNull();
    expect(bottom).not.toBeNull();
    // Samma lista styrs (aria-controls) och samma läge (aria-expanded) på BÅDA.
    const listId = top?.getAttribute('aria-controls');
    expect(listId).toBeTruthy();
    expect(bottom).toHaveAttribute('aria-controls', listId);

    // Klick på DEN NEDRE fäller ut -> BÅDA visar aria-expanded=true (delar EN komponent).
    fireEvent.click(bottom as HTMLButtonElement);
    await waitFor(() => expect(topToggle()).toHaveAttribute('aria-expanded', 'true'));
    expect(bottomToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(topToggle()).toHaveAccessibleName(/Visa färre/i);
    expect(bottomToggle()).toHaveAccessibleName(/Visa färre/i);
  });

  it('EDGE: alla matcher inom fönstret -> ingen expandera-knapp', () => {
    // Bara matcher 11-13 juni (allt inom fönstret) -> hiddenCount 0 -> ingen knapp.
    dataState.matches = [
      match('a', '2026-06-11T18:00:00.000Z'),
      match('b', '2026-06-12T18:00:00.000Z'),
      match('c', '2026-06-13T18:00:00.000Z'),
    ];
    renderView(store({}), PREMIERE);

    expect(visibleForms()).toHaveLength(3);
    expect(topToggle()).toBeNull();
    expect(bottomToggle()).toBeNull();
  });

  // TICK-GRANULARITET (Copilot C, T15:s knep): fönstret (vilka matcher inom 3 dagar)
  // ska bero på DAGEN (useTodayKey), låset (är matchen låst) på MINUT-ticken
  // (useDeadlineTick). Tidigare memoizerades fönstret på `predictable`, som får ny
  // referens varje minut (locked räknas om), så fönstret räknades om varje minut, fel
  // granularitet. Dessa två tester pinnar isär kadenserna: en minut-tick UTAN dagsbyte
  // flippar låset men rör INTE fönstret; ett dagsbyte räknar om fönstret.
  it('minut-tick utan dagsbyte: låset flippar men fönstret står still', () => {
    vi.useFakeTimers();
    try {
      // Svensk tid i juni = UTC+2. Ankra "nu" 16:59 svensk tid 15 juni (14:59Z), strax
      // före en avspark 17:00 svensk tid (15:00Z) SAMMA dag. Fönstret ankrar på 15 juni
      // (svensk), spänner 15-17 juni. p-far (20 juni) ligger utanför -> ett ÄKTA fönster.
      const before = new Date('2026-06-15T14:59:00.000Z');
      dataState.matches = [
        match('p-soon', '2026-06-15T15:00:00.000Z'), // i fönstret, öppen (avspark strax)
        match('p-far', '2026-06-20T18:00:00.000Z'), // utanför fönstret (20 juni)
      ];
      vi.setSystemTime(before);
      renderView(store({}), before);

      // Fönstret före ticken: bara p-soon synlig (p-far dolt), p-soon ännu ÖPPEN.
      const visibleBefore = () =>
        Array.from(document.querySelectorAll('[data-prediction-form]'))
          .filter((f) => !(f as HTMLElement).closest('li')?.hasAttribute('hidden'))
          .map((f) => (f as HTMLElement).getAttribute('data-match-id'));
      expect(visibleBefore()).toEqual(['p-soon']);
      const soonBefore = document.querySelector(
        '[data-prediction-form][data-match-id="p-soon"]'
      ) as HTMLElement;
      expect(soonBefore.getAttribute('data-prediction-locked')).toBeNull();
      // Hur många gånger fönstret räknats om vid startrenderingen (baslinje).
      const callsAtStart = windowMatchesSpy.mock.calls.length;

      // En minut-tick som passerar avsparken men INTE en dygnsgräns (15 juni hela tiden).
      act(() => {
        vi.setSystemTime(new Date('2026-06-15T15:01:00.000Z'));
        vi.advanceTimersByTime(60_000);
      });

      // LÅSET flippade (minut-tickens jobb): p-soon är nu låst.
      const soonAfter = document.querySelector(
        '[data-prediction-form][data-match-id="p-soon"]'
      ) as HTMLElement;
      expect(soonAfter.getAttribute('data-prediction-locked')).toBe('true');
      // FÖNSTRET står still (ingen dygnsväxling): exakt samma synliga uppsättning.
      expect(visibleBefore()).toEqual(['p-soon']);
      // KÄRNAN i fyndet (C): fönstret räknades INTE om på minut-ticken (samma dag, samma
      // todayKey -> memoizerat). Under buggen (memoiserat på `predictable`, som får ny
      // referens varje minut) hade detta ökat. Värde-identiskt utdata döljer buggen, så
      // vi vaktar call-count, inte bara den synliga uppsättningen.
      expect(windowMatchesSpy.mock.calls.length).toBe(callsAtStart);
    } finally {
      vi.useRealTimers();
    }
  });

  it('dagsbyte: fönstret räknas om (ankaret glider till nästa dag)', () => {
    vi.useFakeTimers();
    try {
      // Ankra "nu" 15 juni (svensk). Fönstret 15-17 juni rymmer p-d0 (15 juni); p-d3
      // (18 juni) ligger utanför. Efter att klockan gått till 18 juni ska fönstret
      // (18-20 juni) i stället rymma p-d3, och p-d0 (då passerad) faller utanför det
      // framåtblickande fönstret. Det BEVISAR att fönstret räknas om vid dagsbyte.
      const day0 = new Date('2026-06-15T10:00:00.000Z'); // 12:00 svensk tid 15 juni
      dataState.matches = [
        match('p-d0', '2026-06-15T18:00:00.000Z'), // 15 juni, i startfönstret
        match('p-d3', '2026-06-18T18:00:00.000Z'), // 18 juni, utanför startfönstret
      ];
      vi.setSystemTime(day0);
      renderView(store({}), day0);

      const visibleIds = () =>
        Array.from(document.querySelectorAll('[data-prediction-form]'))
          .filter((f) => !(f as HTMLElement).closest('li')?.hasAttribute('hidden'))
          .map((f) => (f as HTMLElement).getAttribute('data-match-id'));
      // Startfönstret (15-17 juni): p-d0 synlig, p-d3 dold.
      expect(visibleIds()).toEqual(['p-d0']);
      const callsAtStart = windowMatchesSpy.mock.calls.length;

      // Klockan går till 18 juni 12:00 svensk tid (10:00Z) och en minut-tick fyrar.
      // useTodayKey ser dagsbytet -> nytt nowMs/todayKey -> fönstret räknas om.
      act(() => {
        vi.setSystemTime(new Date('2026-06-18T10:00:00.000Z'));
        vi.advanceTimersByTime(60_000);
      });

      // Nya fönstret (18-20 juni): p-d3 synlig, p-d0 (passerad, före fönstret) dold.
      expect(visibleIds()).toEqual(['p-d3']);
      // Vid dagsbyte SKA fönstret räknas om (todayKey bytte): call-count ökade.
      expect(windowMatchesSpy.mock.calls.length).toBeGreaterThan(callsAtStart);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bevarar osparad inmatning i ett out-of-window-kort över expandera/ihopfäll', async () => {
    dataState.matches = [
      match('p0', '2026-06-11T18:00:00.000Z'),
      match('p9', '2026-06-20T18:00:00.000Z'), // utanför fönstret 11-13 juni
    ];
    renderView(store({}), PREMIERE);

    // p9 är dolt som default. Fäll ut så det blir interaktivt.
    fireEvent.click(topToggle() as HTMLButtonElement);
    const selector = '[data-prediction-form][data-match-id="p9"]';
    await waitFor(() => {
      const form = document.querySelector(selector) as HTMLElement | null;
      expect(form?.closest('li')?.hasAttribute('hidden')).toBe(false);
    });

    // Skriv en OSPARAD siffra i out-of-window-kortets hemma-fält.
    const homeBefore = within(document.querySelector(selector) as HTMLElement).getByLabelText(
      /\(hemma\)/
    ) as HTMLInputElement;
    fireEvent.change(homeBefore, { target: { value: '7' } });
    expect(homeBefore.value).toBe('7');

    // Fäll ihop (kortet blir hidden men UNMOUNTAS inte) och fäll ut igen.
    fireEvent.click(topToggle() as HTMLButtonElement);
    await waitFor(() => {
      const form = document.querySelector(selector) as HTMLElement;
      expect(form.closest('li')?.hasAttribute('hidden')).toBe(true);
    });
    fireEvent.click(topToggle() as HTMLButtonElement);
    await waitFor(() => {
      const form = document.querySelector(selector) as HTMLElement;
      expect(form.closest('li')?.hasAttribute('hidden')).toBe(false);
    });

    // Den osparade siffran ska finnas kvar (samma React-instans, ingen unmount).
    const homeAfter = within(document.querySelector(selector) as HTMLElement).getByLabelText(
      /\(hemma\)/
    ) as HTMLInputElement;
    expect(homeAfter.value).toBe('7');
  });
});

// BAKÅT-FÖNSTRET (T62/#111): Daniels rapport var "jag ser fortfarande inte aktuell
// tips-resultat på varje matchtips-kort". T58:s poäng-bricka finns men visas bara på
// AVGJORDA matcher, och de enda avgjorda är gårdagens, som det rena framåtblickande
// fönstret gömde. Detta block är callsite-/render-beviset (lessons "handoff-pastar-
// ett-krav-levererat-men-koden-wirar-aldrig-in-ytan"): att gårdagens avgjorda+tippade
// match faktiskt är SYNLIG i default-vyn OCH att poäng-brickan renderas DÄR, inte bara
// att den rena windowMatches innehåller igår (det testas i result-window.test.ts).
//
// Vi FRYSER klockan (T60-mönstret, toFake:['Date'] så useDeadlineTick/useTodayKey-
// pollingen inte stör waitFor) på en dag MITT i turneringen, med en avgjord match igår.
describe('PredictionsView, bakåt-fönstret visar gårdagens poäng (T62/#111)', () => {
  // 16 juni 2026, 12:00 svensk tid (10:00Z). Igår = 15 juni.
  const TODAY = new Date('2026-06-16T10:00:00.000Z');

  function visibleForms(): HTMLElement[] {
    return Array.from(document.querySelectorAll('[data-prediction-form]')).filter(
      (f) => !(f as HTMLElement).closest('li')?.hasAttribute('hidden')
    ) as HTMLElement[];
  }

  it('gårdagens avgjorda + tippade match är SYNLIG i default och visar T58-poäng-brickan', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(TODAY);
      // Igår (15 juni): avgjord 2-1, jag tippade 2-1 = EXAKT (3 p). Idag/imorgon: kommande.
      dataState.matches = [
        finishedMatch('y-played', '2026-06-15T18:00:00.000Z', 2, 1),
        match('t-today', '2026-06-16T18:00:00.000Z'),
        match('t-tomorrow', '2026-06-17T18:00:00.000Z'),
      ];
      const mine: Prediction = {
        matchId: 'y-played',
        userId: 'me',
        homeGoals: 2,
        awayGoals: 1,
        updatedAt: 't',
      };
      renderView(store({ myPredictions: new Map([['y-played', mine]]) }), TODAY);

      // KÄRNAN (AC1): gårdagens kort är inte hidden -> det är i default-fönstret.
      const visibleIds = visibleForms().map((f) => f.getAttribute('data-match-id'));
      expect(visibleIds).toContain('y-played');

      // ...och poäng-brickan (T58) renderas på just det kortet, i default-vyn.
      const card = document.querySelector(
        '[data-prediction-form][data-match-id="y-played"]'
      ) as HTMLElement;
      const badge = card.querySelector('[data-tip-result]') as HTMLElement | null;
      expect(badge).not.toBeNull();
      // Exakt tips -> exact-typen, så vi vet att det är RÄTT poäng-väg (T58), inte tom.
      expect(badge?.getAttribute('data-tip-point-type')).toBe('exact');
    } finally {
      vi.useRealTimers();
    }
  });

  it('kronologisk ordning (AC3): gårdagens avgjorda ligger FÖRE dagens kommande, inte huller om buller', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(TODAY);
      // Avsiktligt indata-OORDNAT: idag före igår i listan. Vyn ska ändå rendera
      // tidigast-först (selectPredictableMatches sorterar), så gårdagens avgjorda
      // (lägst kickoff) hamnar överst, dagens kommande efter. Det är kronologiskt
      // korrekt och inte förvirrande: gårdagens kort bär låst-etikett + poäng.
      dataState.matches = [
        match('t-today', '2026-06-16T18:00:00.000Z'),
        finishedMatch('y-played', '2026-06-15T18:00:00.000Z', 0, 0),
      ];
      const mine: Prediction = {
        matchId: 'y-played',
        userId: 'me',
        homeGoals: 0,
        awayGoals: 0,
        updatedAt: 't',
      };
      renderView(store({ myPredictions: new Map([['y-played', mine]]) }), TODAY);

      const order = visibleForms().map((f) => f.getAttribute('data-match-id'));
      expect(order).toEqual(['y-played', 't-today']); // tidigast (igår) först
    } finally {
      vi.useRealTimers();
    }
  });

  it('räknaren (AC4) räknar bara ÖPPNA matcher, inte gårdagens låsta avgjorda', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(TODAY);
      // Igår avgjord (låst), idag + imorgon öppna = 2 öppna att tippa. Gårdagens
      // låsta match får INTE räknas in (den går inte att tippa längre).
      dataState.matches = [
        finishedMatch('y-played', '2026-06-15T18:00:00.000Z', 1, 0),
        match('t-today', '2026-06-16T22:00:00.000Z'), // 22:00Z = efter "nu" (10:00Z) -> öppen
        match('t-tomorrow', '2026-06-17T18:00:00.000Z'), // öppen
      ];
      renderView(store({}), TODAY);

      // "2 matcher öppna att tippa" (plural), gårdagens låsta exkluderad.
      expect(screen.getByText(/2 matcher öppna att tippa/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
