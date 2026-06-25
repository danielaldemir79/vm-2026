import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GroupPredictionsView } from './GroupPredictionsView';
import {
  GroupPredictionsStoreContext,
  type GroupPredictionsStore,
} from './group-predictions-context';
import { PredictionsStoreContext, type PredictionsStore } from '../predictions/predictions-context';
import { ResultsStoreContext, type ResultsStore } from '../results/results-context';
import type { GroupPrediction, Prediction } from '../../data/predictions';
import type { Group, Match, Team } from '../../domain/types';
import { teamCode } from '../../domain/team-code';

// Mocka data-laddnings-hooken (vi testar vyns LÄGEN, inte I/O:t). Hooken är en
// vi.fn() så vi kan RÄKNA anrop: efter T51-fixen (en laddning, ingen dubbel fetch)
// ska den anropas exakt EN gång per render av vyn, inte två (den tips-härledda
// vyn laddar inte längre samma turneringsdata igen, den får den injicerad).
const dataState = vi.hoisted(() => ({
  status: 'ready' as 'loading' | 'ready' | 'error',
  groups: [] as Group[],
  teams: [] as Team[],
  matches: [] as Match[],
  error: null as string | null,
}));
const useGroupPredictableDataMock = vi.hoisted(() => vi.fn());
vi.mock('./use-group-predictable-data', () => ({
  useGroupPredictableData: useGroupPredictableDataMock,
}));

const TEAMS: Team[] = [
  { id: 'mex', name: 'Mexiko', code: 'MEX', group: 'A' },
  { id: 'rsa', name: 'Sydafrika', code: 'RSA', group: 'A' },
  { id: 'can', name: 'Kanada', code: 'CAN', group: 'B' },
  { id: 'bih', name: 'Bosnien', code: 'BIH', group: 'B' },
  { id: 'sui', name: 'Schweiz', code: 'SUI', group: 'G' },
  { id: 'nor', name: 'Norge', code: 'NOR', group: 'G' },
];

const GROUPS: Group[] = [
  { id: 'A', teamIds: ['mex', 'rsa'] },
  { id: 'B', teamIds: ['can', 'bih'] },
  // Grupp G bär här ett SYNTETISKT sent ankare (g-G-1 = 23/6). Under T72:s PLATTA modell
  // låses G vid SAMMA platta tid (17/6 20:00Z) som A/B , dess egna senare ankare styr inte
  // längre. Vaktar att vyn inte tyst återinför per-grupp-fönster oberoende av indata
  // (alla riktiga gruppankare ligger 11-17/6, g-L-1 ÄR maxet, men regeln, inte datat, är garantin).
  { id: 'G', teamIds: ['sui', 'nor'] },
];

function gmatch(id: string, kickoff: string): Match {
  return {
    id,
    stage: 'group',
    groupId: id.charAt(2) as Group['id'],
    homeTeamId: null,
    awayTeamId: null,
    kickoff,
    venue: 'x',
    result: null,
    status: 'scheduled',
  };
}

const MATCHES: Match[] = [
  gmatch('g-A-1', '2026-06-11T19:00:00.000Z'), // tidig -> T72 platt deadline (17/6 20:00Z)
  gmatch('g-B-1', '2026-06-12T19:00:00.000Z'), // tidig -> platt deadline
  gmatch('g-G-1', '2026-06-23T19:00:00.000Z'), // SYNTETISKT sent -> platt deadline ändå (T72)
];

function store(partial: Partial<GroupPredictionsStore>): GroupPredictionsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    activeRoomId: 'r1',
    myGroupPredictions: new Map(),
    saveGroupPrediction: vi.fn().mockResolvedValue(undefined),
    ...partial,
  };
}

/**
 * En match-tips-store (T64): den tips-härledda slutspelsbilden läser nu MINA
 * match-tips ur PredictionsStore för att seeda treorna. Default = inga tips (treorna
 * står öppna), så de befintliga grupp-tips-läges-testerna är oförändrade. Tester som
 * vill seeda treorna kan injicera myPredictions.
 */
function matchStore(myPredictions: ReadonlyMap<string, Prediction> = new Map()): PredictionsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    activeRoomId: 'r1',
    myPredictions,
    savePrediction: vi.fn().mockResolvedValue(undefined),
  };
}

function renderView(
  s: GroupPredictionsStore,
  now: Date,
  predictions?: ReadonlyMap<string, Prediction>
) {
  return render(
    <PredictionsStoreContext.Provider value={matchStore(predictions)}>
      <GroupPredictionsStoreContext.Provider value={s}>
        <GroupPredictionsView now={now} />
      </GroupPredictionsStoreContext.Provider>
    </PredictionsStoreContext.Provider>
  );
}

beforeEach(() => {
  dataState.status = 'ready';
  dataState.groups = GROUPS;
  dataState.teams = TEAMS;
  dataState.matches = MATCHES;
  dataState.error = null;
  useGroupPredictableDataMock.mockReset();
  useGroupPredictableDataMock.mockReturnValue(dataState);
});

describe('GroupPredictionsView', () => {
  it('UTAN aktivt rum: visar "gå med i ett rum" och ingen grupp-lista', () => {
    renderView(store({ enabled: false, activeRoomId: null }), new Date('2026-06-10T00:00:00Z'));
    expect(screen.getByText(/Gå med i ett rum för att tippa grupperna/)).toBeInTheDocument();
    expect(document.querySelector('[data-group-predictions-list]')).toBeNull();
  });

  it('fel-väg: store-error visas som alert', () => {
    renderView(store({ status: 'error', error: 'trasig' }), new Date('2026-06-10T00:00:00Z'));
    expect(screen.getByRole('alert')).toHaveTextContent('trasig');
  });

  it('laddning: visar laddnings-status', () => {
    renderView(store({ status: 'loading' }), new Date('2026-06-10T00:00:00Z'));
    expect(screen.getByText(/Laddar grupper att tippa/)).toBeInTheDocument();
  });

  it('READY: renderar ett formulär per grupp (A + B + G)', () => {
    renderView(store({}), new Date('2026-06-10T00:00:00Z'));
    const forms = document.querySelectorAll('[data-group-prediction-form]');
    expect(forms).toHaveLength(3);
    expect(document.querySelector('[data-group-id="A"]')).not.toBeNull();
    expect(document.querySelector('[data-group-id="B"]')).not.toBeNull();
    expect(document.querySelector('[data-group-id="G"]')).not.toBeNull();
  });

  it('öppen-räknare: visar antal grupper öppna att tippa', () => {
    renderView(store({}), new Date('2026-06-10T00:00:00Z'));
    expect(screen.getByText(/3 grupper öppna att tippa/)).toBeInTheDocument();
  });

  it('PLATT LÅS (T72): efter den platta tiden är ALLA grupper LÅSTA samtidigt (även sen G)', () => {
    // 18/6 08:00: den platta pool-deadlinen (17/6 20:00Z) passerad -> BÅDE A och G låsta.
    // Skillnaden mot T67: G:s syntetiska sena ankare (23/6) styr INTE längre, alla grupper
    // delar EN platt låspunkt (omgång 1 spelad). Inga grupper öppna -> öppen-räknaren
    // renderas inte alls (vyns guard openCount > 0).
    renderView(store({}), new Date('2026-06-18T08:00:00Z'));
    const aForm = document.querySelector('[data-group-id="A"]');
    const gForm = document.querySelector('[data-group-id="G"]');
    expect(aForm?.querySelector('[data-group-prediction-lock]')).not.toBeNull();
    expect(gForm?.querySelector('[data-group-prediction-lock]')).not.toBeNull();
    expect(screen.queryByText(/öppna att tippa/)).toBeNull();
    expect(screen.queryByText(/öppen att tippa/)).toBeNull();
  });

  it('AC#3 DEADLINE (T72): öppen tidig grupp visar den PLATTA tiden, låst grupp inte', () => {
    // 13/6 (mellan g-A-1 och den platta tiden): grupp A är ÖPPEN igen och dess deadline-rad
    // ska visa den PLATTA tiden (onsdag 17/6 22:00 svensk = 20:00Z), inte den gamla 11/6.
    renderView(store({}), new Date('2026-06-13T08:00:00Z'));
    const aForm = document.querySelector('[data-group-id="A"]')!; // nu öppen (reopen)
    const aNotice = aForm.querySelector('[data-deadline-notice]');
    expect(aNotice).not.toBeNull();
    expect(aNotice!.getAttribute('data-deadline-iso')).toBe('2026-06-17T20:00:00.000Z');
    expect(aNotice).toHaveTextContent(/Tippningen låses/);
    expect(aNotice).toHaveTextContent(/onsdag 17 juni kl 22:00/);
  });

  it('EN LADDNING: turneringsdatan laddas exakt en gång, den tips-härledda vyn får den injicerad', () => {
    // T51 Copilot-fynd 5: den simulerade slutspels-vyn laddade tidigare samma
    // turneringsdata IGEN (egen useGroupPredictableData) -> dubbel fetch + extra
    // loading-cykel. Nu skickar värd-vyn ned sin redan-laddade data, så hooken
    // anropas exakt EN gång och sim-sektionen renderas i samma render.
    renderView(store({}), new Date('2026-06-10T00:00:00Z'));
    expect(useGroupPredictableDataMock).toHaveBeenCalledTimes(1);
    // Sim-sektionen är monterad (ready), driven av den injicerade datan.
    expect(document.querySelector('[data-tips-bracket-section]')).not.toBeNull();
    expect(screen.getByText('Slutspelet ur dina tips')).toBeInTheDocument();
  });

  it('seedar formuläret från mitt befintliga grupp-tips', () => {
    const mine: GroupPrediction = {
      groupId: 'A',
      userId: 'me',
      winnerTeamId: teamCode('MEX'),
      runnerUpTeamId: teamCode('RSA'),
      updatedAt: 't1',
    };
    renderView(
      store({ myGroupPredictions: new Map([['A', mine]]) }),
      new Date('2026-06-10T00:00:00Z')
    );
    const aForm = document.querySelector('[data-group-id="A"]')!;
    const selects = aForm.querySelectorAll('select');
    expect((selects[0] as HTMLSelectElement).value).toBe('MEX');
    expect((selects[1] as HTMLSelectElement).value).toBe('RSA');
  });

  // ---- T65 (#119): "Föreslå ur mina matchtips"-knappen, wiring via match-tips ------

  /** Ett match-tips i den form storen bär (matchId -> Prediction). */
  function pred(matchId: string, homeGoals: number, awayGoals: number): Prediction {
    return { matchId, userId: 'me', homeGoals, awayGoals, updatedAt: 't' };
  }

  it('FÖRSLAG: utan match-tips är varje grupps förslags-knapp inaktiverad med ärlig text', () => {
    renderView(store({}), new Date('2026-06-10T00:00:00Z')); // inga match-tips injicerade
    const aForm = document.querySelector('[data-group-id="A"]')!;
    const suggest = aForm.querySelector('[data-group-prediction-suggest]') as HTMLButtonElement;
    expect(suggest).not.toBeNull();
    expect(suggest.disabled).toBe(true);
    expect(aForm.querySelector('[data-group-prediction-suggest-hint]')).not.toBeNull();
  });

  it('FÖRSLAG: komplett tippad grupp (alla dess matcher) -> knappen aktiv för just den gruppen', () => {
    // Grupp A har EN gruppmatch i test-matchplanen (g-A-1). Tippar vi den är A komplett
    // -> knappen aktiv. Grupp B (g-B-1 otippad) förblir inaktiverad, per grupp.
    renderView(
      store({}),
      new Date('2026-06-10T00:00:00Z'),
      new Map([['g-A-1', pred('g-A-1', 2, 0)]])
    );
    const aSuggest = document
      .querySelector('[data-group-id="A"]')!
      .querySelector('[data-group-prediction-suggest]') as HTMLButtonElement;
    const bSuggest = document
      .querySelector('[data-group-id="B"]')!
      .querySelector('[data-group-prediction-suggest]') as HTMLButtonElement;
    expect(aSuggest.disabled).toBe(false);
    expect(bSuggest.disabled).toBe(true);
  });

  it('FÖRSLAG: en LÅST grupp har ingen förslags-knapp', () => {
    // 22/6 08:00: grupp A är låst (den platta pool-deadlinen 17/6 20:00Z passerad). Även med
    // ett komplett match-tips på g-A-1 ska A:s formulär INTE ha någon förslags-knapp (låst).
    renderView(
      store({}),
      new Date('2026-06-22T08:00:00Z'),
      new Map([['g-A-1', pred('g-A-1', 2, 0)]])
    );
    const aForm = document.querySelector('[data-group-id="A"]')!;
    expect(aForm.querySelector('[data-group-prediction-lock]')).not.toBeNull();
    expect(aForm.querySelector('[data-group-prediction-suggest]')).toBeNull();
  });
});

describe('GroupPredictionsView, resultat-panel (avgjord grupp man tippat, via results-storen)', () => {
  // En results-store där grupp A är AVGJORD (mex vann mot rsa, 2-0). Bara fälten
  // groupResults-memon läser behövs; resten castas (test-mock).
  function resultsStore(over: Partial<ResultsStore>): ResultsStore {
    const decidedA: Match = {
      id: 'A-decided',
      stage: 'group',
      groupId: 'A',
      homeTeamId: 'mex',
      awayTeamId: 'rsa',
      kickoff: '2026-06-11T19:00:00.000Z',
      venue: 'x',
      result: { homeGoals: 2, awayGoals: 0 },
      status: 'finished',
    };
    return {
      status: 'ready',
      simulating: false,
      groups: [{ id: 'A', teamIds: ['mex', 'rsa'] }],
      matches: [decidedA],
      teams: TEAMS,
      mode: 'fixtures',
      error: null,
      ...over,
    } as unknown as ResultsStore;
  }

  // Jag har tippat grupp A: 1:a MEX (rätt), 2:a RSA (rätt) -> 5 poäng.
  const myPicks = new Map<string, GroupPrediction>([
    [
      'A',
      {
        groupId: 'A',
        userId: 'me',
        winnerTeamId: teamCode('MEX'),
        runnerUpTeamId: teamCode('RSA'),
        updatedAt: 't',
      },
    ],
  ]);

  function renderWithResults(rs: ResultsStore) {
    return render(
      <ResultsStoreContext.Provider value={rs}>
        <PredictionsStoreContext.Provider value={matchStore()}>
          <GroupPredictionsStoreContext.Provider value={store({ myGroupPredictions: myPicks })}>
            {/* now efter den platta deadlinen -> grupperna låsta -> resultat-panelen visas. */}
            <GroupPredictionsView now={new Date('2026-06-20T00:00:00Z')} />
          </GroupPredictionsStoreContext.Provider>
        </PredictionsStoreContext.Provider>
      </ResultsStoreContext.Provider>
    );
  }

  it('avgjord + tippad grupp: visar resultat-panelen med poäng + facit', () => {
    renderWithResults(resultsStore({}));
    const aForm = document.querySelector('[data-group-id="A"]')!;
    const panel = aForm.querySelector('[data-group-result]');
    expect(panel).not.toBeNull();
    expect(panel).toHaveTextContent(/5 poäng/);
    expect(panel).toHaveTextContent(/Så blev det/);
  });

  it('what-if-läge: resultat-panelen döljs (simulerade placeringar är hypotetiska)', () => {
    renderWithResults(resultsStore({ simulating: true }));
    const aForm = document.querySelector('[data-group-id="A"]')!;
    expect(aForm.querySelector('[data-group-result]')).toBeNull();
  });

  it('utan results-provider (tolerant): ingen panel, kraschar ej', () => {
    // Standard renderView (ingen ResultsStoreContext) -> useContext ger null -> ingen panel.
    renderView(store({ myGroupPredictions: myPicks }), new Date('2026-06-20T00:00:00Z'));
    const aForm = document.querySelector('[data-group-id="A"]')!;
    expect(aForm.querySelector('[data-group-result]')).toBeNull();
  });
});
