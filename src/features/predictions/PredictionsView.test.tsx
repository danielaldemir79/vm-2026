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

// Spionera på den rena DAGENS-fönster-funktionen (men kör den ÄKTA implementationen) så
// tick-granularitet-testerna kan assertera HUR OFTA fönstret räknas om, inte bara att
// utdatat ser likadant ut (utdatat är värde-identiskt även under buggen, så bara ett
// call-count-spion fångar fel-granulariteten: fönstret räknades om varje minut-tick).
// T68 (#129): tips-vyn bytte från windowMatches (igår+framåt) till selectTodayMatches
// (bara dagens), så vi spionerar nu på den.
const windowMatchesSpy = vi.hoisted(() => vi.fn());
vi.mock('../results/result-window', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../results/result-window')>();
  windowMatchesSpy.mockImplementation(actual.selectTodayMatches);
  return { ...actual, selectTodayMatches: windowMatchesSpy };
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
// Den rena dagens-fönster-funktionen är uttömmande testad i results/result-window.test.ts;
// här bevisar vi att TIPS-VYN tillämpar DAGENS-fönstret som default (T68/#129) och att
// expandera-kontrollen är tillgänglig och fungerar end-to-end.
//
// Vi ankrar "nu" på premiärdagen (11 juni 2026) och sprider matcherna över flera dagar,
// så dagens-fönstret (bara 11 juni) är en ÄKTA delmängd och resten döljs. Ett SYNLIGT
// kort = ett formulär vars <li> INTE är hidden; ett dolt kort renderas (bevaras) men
// ligger i ett `hidden`-<li>, så getByRole/spinbutton räknar bara de synliga (a11y).
describe('PredictionsView, dagens-fönster + expandera (T68/#129)', () => {
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

  it('default: visar BARA dagens matcher, döljer resten, med en expandera-knapp', () => {
    // Premiärdagen 11 juni: bara p0 (11 juni) är dagens. p1-p9 (12 juni och framåt) döljs.
    dataState.matches = [
      match('p0', '2026-06-11T18:00:00.000Z'), // idag
      match('p1', '2026-06-12T18:00:00.000Z'),
      match('p2', '2026-06-13T18:00:00.000Z'),
      match('p3', '2026-06-14T18:00:00.000Z'),
      match('p9', '2026-06-20T18:00:00.000Z'),
    ];
    renderView(store({}), PREMIERE);

    // ALLA fem korten finns i DOM:en (inget filtreras bort, så osparad inmatning bevaras).
    expect(allForms()).toHaveLength(5);
    // Men bara dagens (11 juni) är SYNLIGT som default.
    expect(visibleForms().map((f) => f.getAttribute('data-match-id'))).toEqual(['p0']);

    // Expandera-knappen finns, säger hur många som är dolda (4), och är ihopfälld.
    const toggle = topToggle();
    expect(toggle).not.toBeNull();
    expect(toggle).toHaveAccessibleName(/Visa alla matcher \(4 dolda\)/i);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // aria-controls pekar på tips-listan (samma id som <ol data-predictions-list>).
    const listId = toggle?.getAttribute('aria-controls');
    expect(listId).toBeTruthy();
    const list = document.getElementById(listId as string);
    expect(list?.tagName).toBe('OL');
    expect(list?.hasAttribute('data-predictions-list')).toBe(true);
  });

  it('expandera -> alla matcher synliga; ihopfäll -> tillbaka till dagens', async () => {
    dataState.matches = [
      match('p0', '2026-06-11T18:00:00.000Z'), // idag
      match('p1', '2026-06-12T18:00:00.000Z'),
      match('p2', '2026-06-13T18:00:00.000Z'),
      match('p3', '2026-06-14T18:00:00.000Z'),
      match('p9', '2026-06-20T18:00:00.000Z'),
    ];
    renderView(store({}), PREMIERE);

    expect(visibleForms()).toHaveLength(1);

    // Fäll ut -> alla fem synliga, knappen blir "Visa färre" + aria-expanded=true.
    fireEvent.click(topToggle() as HTMLButtonElement);
    await waitFor(() => expect(visibleForms()).toHaveLength(5));
    expect(topToggle()).toHaveAccessibleName(/Visa färre/i);
    expect(topToggle()).toHaveAttribute('aria-expanded', 'true');

    // Fäll ihop igen -> tillbaka till dagens enda match.
    fireEvent.click(topToggle() as HTMLButtonElement);
    await waitFor(() => expect(visibleForms()).toHaveLength(1));
    expect(topToggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('kontrollen är DUBBLERAD (uppe + nere) med identisk aria-semantik', async () => {
    dataState.matches = [
      match('p0', '2026-06-11T18:00:00.000Z'), // idag
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

  it('EDGE: alla matcher är dagens -> ingen expandera-knapp', () => {
    // Alla tre matcher 11 juni (= dagens) -> hiddenCount 0 -> ingen knapp.
    dataState.matches = [
      match('a', '2026-06-11T15:00:00.000Z'),
      match('b', '2026-06-11T18:00:00.000Z'),
      match('c', '2026-06-11T21:00:00.000Z'),
    ];
    renderView(store({}), PREMIERE);

    expect(visibleForms()).toHaveLength(3);
    expect(topToggle()).toBeNull();
    expect(bottomToggle()).toBeNull();
  });

  // TICK-GRANULARITET (Copilot C, T15:s knep): dagens-fönstret (vilka matcher som är
  // IDAG) ska bero på DAGEN (useTodayKey), låset (är matchen låst) på MINUT-ticken
  // (useDeadlineTick). Tidigare memoizerades fönstret på `predictable`, som får ny
  // referens varje minut (locked räknas om), så fönstret räknades om varje minut, fel
  // granularitet. Dessa två tester pinnar isär kadenserna: en minut-tick UTAN dagsbyte
  // flippar låset men rör INTE fönstret; ett dagsbyte räknar om fönstret.
  it('minut-tick utan dagsbyte: låset flippar men fönstret står still', () => {
    vi.useFakeTimers();
    try {
      // Svensk tid i juni = UTC+2. Ankra "nu" 16:59 svensk tid 15 juni (14:59Z), strax
      // före en avspark 17:00 svensk tid (15:00Z) SAMMA dag. Dagens-fönstret ankrar på
      // 15 juni. p-far (20 juni) ligger utanför -> ett ÄKTA fönster (p-far dolt).
      const before = new Date('2026-06-15T14:59:00.000Z');
      dataState.matches = [
        match('p-soon', '2026-06-15T15:00:00.000Z'), // idag, öppen (avspark strax)
        match('p-far', '2026-06-20T18:00:00.000Z'), // utanför dagens-fönstret (20 juni)
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
      // Ankra "nu" 15 juni (svensk). Dagens-fönstret (15 juni) rymmer p-d0; p-d3 (18
      // juni) ligger utanför. Efter att klockan gått till 18 juni ska dagens-fönstret
      // (18 juni) i stället rymma p-d3, och p-d0 (då gårdag/passerad) faller utanför.
      // Det BEVISAR att fönstret räknas om vid dagsbyte.
      const day0 = new Date('2026-06-15T10:00:00.000Z'); // 12:00 svensk tid 15 juni
      dataState.matches = [
        match('p-d0', '2026-06-15T18:00:00.000Z'), // 15 juni, i startfönstret (idag)
        match('p-d3', '2026-06-18T18:00:00.000Z'), // 18 juni, utanför startfönstret
      ];
      vi.setSystemTime(day0);
      renderView(store({}), day0);

      const visibleIds = () =>
        Array.from(document.querySelectorAll('[data-prediction-form]'))
          .filter((f) => !(f as HTMLElement).closest('li')?.hasAttribute('hidden'))
          .map((f) => (f as HTMLElement).getAttribute('data-match-id'));
      // Startfönstret (idag = 15 juni): p-d0 synlig, p-d3 dold.
      expect(visibleIds()).toEqual(['p-d0']);
      const callsAtStart = windowMatchesSpy.mock.calls.length;

      // Klockan går till 18 juni 12:00 svensk tid (10:00Z) och en minut-tick fyrar.
      // useTodayKey ser dagsbytet -> nytt nowMs/todayKey -> fönstret räknas om.
      act(() => {
        vi.setSystemTime(new Date('2026-06-18T10:00:00.000Z'));
        vi.advanceTimersByTime(60_000);
      });

      // Nya fönstret (idag = 18 juni): p-d3 synlig, p-d0 (gårdag/passerad) dold.
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

// DAGENS-FÖNSTRET ERSÄTTER BAKÅT-FÖNSTRET I TIPS-VYN (T68/#129, MEDVETET). T62 (#111)
// utökade tips-vyns default-fönster bakåt så gårdagens avgjorda matchers poäng syntes
// i tippnings-listan. T68 ÄNDRADE riktning: tips-vyn ska visa BARA DAGENS matcher (det
// man kan tippa NU), så gårdagens redan spelade matcher är inte längre i default, de
// nås via expandera. "Se dina poäng på gårdagens matcher" serveras i stället av
// resultat-/avslöjande-vyn (RevealView/LeaderboardSection), som BEHÅLLER sitt bredare
// fönster (det testet ligger i predictions-results-window-parity.test). Detta block
// låser den NYA tips-vy-sanningen: gårdagens match är DOLD i default, dagens synliga,
// men korten finns kvar i DOM (poäng-brickan renderas fortfarande när man fäller ut).
//
// Vi FRYSER klockan (T60-mönstret, toFake:['Date'] så useDeadlineTick/useTodayKey-
// pollingen inte stör waitFor) på en dag MITT i turneringen, med en avgjord match igår.
describe('PredictionsView, dagens-fönster döljer gårdagens spelade (T68/#129)', () => {
  // 16 juni 2026, 12:00 svensk tid (10:00Z). Igår = 15 juni.
  const TODAY = new Date('2026-06-16T10:00:00.000Z');

  function visibleForms(): HTMLElement[] {
    return Array.from(document.querySelectorAll('[data-prediction-form]')).filter(
      (f) => !(f as HTMLElement).closest('li')?.hasAttribute('hidden')
    ) as HTMLElement[];
  }
  function topToggle(): HTMLButtonElement | null {
    return document.querySelector('button[data-predictions-toggle-position="top"]');
  }

  it('gårdagens avgjorda match är DOLD i default (bara dagens visas), nås via expandera', () => {
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

      // KÄRNAN (T68): bara dagens (16 juni) match är synlig i default; gårdagens (15)
      // OCH morgondagens (17) döljs.
      const visibleIds = visibleForms().map((f) => f.getAttribute('data-match-id'));
      expect(visibleIds).toEqual(['t-today']);
      expect(visibleIds).not.toContain('y-played');

      // Men kortet UNMOUNTAS inte: poäng-brickan (T58) finns kvar i DOM och renderas
      // korrekt (den visas när man fäller ut). Bevisar att vi bara döljer, inte tappar.
      fireEvent.click(topToggle() as HTMLButtonElement);
      const card = document.querySelector(
        '[data-prediction-form][data-match-id="y-played"]'
      ) as HTMLElement;
      expect(card.closest('li')?.hasAttribute('hidden')).toBe(false);
      const badge = card.querySelector('[data-tip-result]') as HTMLElement | null;
      expect(badge).not.toBeNull();
      // Exakt tips -> exact-typen, så vi vet att det är RÄTT poäng-väg (T58), inte tom.
      expect(badge?.getAttribute('data-tip-point-type')).toBe('exact');
    } finally {
      vi.useRealTimers();
    }
  });

  it('kronologisk ordning (utfälld): gårdagens avgjorda ligger FÖRE dagens kommande', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(TODAY);
      // Avsiktligt indata-OORDNAT: idag före igår i listan. Vyn ska ändå rendera
      // tidigast-först (selectPredictableMatches sorterar), så gårdagens avgjorda
      // (lägst kickoff) hamnar överst, dagens kommande efter. Mät i UTFÄLLT läge (i
      // default är gårdagens dold av dagens-fönstret, T68).
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

      // Fäll ut så hela listan (oavsett fönster) syns, mät dess inbördes ordning.
      fireEvent.click(topToggle() as HTMLButtonElement);
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
