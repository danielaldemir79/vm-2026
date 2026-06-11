// PARITETS-KONTRAKT (regressionsguard, fix/tips-regression): tips-vyn och
// resultatvyn MÅSTE tillämpa SAMMA 3-dagars fönster för samma matcher + samma
// "nu". Båda återanvänder den rena windowMatches (results/result-window.ts) och
// den delade ExpandToggle, men de wirar den var för sig i sin egen JSX. Detta
// test låser att de inte kan DRIFTA isär: om en framtida ändring tappar fönstret
// (eller `hidden`-wiringen) från ENA vyn medan den andra behåller det, rödnar
// detta test.
//
// VARFÖR just detta test (felets FORM): den rapporterade regressionen var "tips-
// delen syns inte / beter sig annorlunda än resultatdelen även med ett rum". Den
// rena fönster-funktionen och varje vys eget fönster testas redan uttömmande
// (result-window.test.ts, PredictionsView.test.tsx, ResultEntryView). Det som
// SAKNADES var ett kontrakt som binder de TVÅ vyerna till EN sanning, så att
// "den ena vyn tappade sitt fönster" inte kan smyga förbi grön svit. Det är inte
// coverage-jakt: det vaktar exakt den divergens som reproducerar symptomet.
//
// Vi monterar BÅDA vyerna med IDENTISK matchuppsättning och ett pinnat "nu"
// (premiärdagen), och jämför vilka match-id som är SYNLIGA som default (i fönstret,
// dvs deras kort-<li> är inte `hidden`). Mängderna ska vara EXAKT lika.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { PredictionsView } from './PredictionsView';
import { PredictionsStoreContext, type PredictionsStore } from './predictions-context';
import { ResultEntryView } from '../results/ResultEntryView';
import { ResultsProvider } from '../results/ResultsProvider';
import type { DataSource } from '../../data';
import { fixtureGroups, fixtureTeams } from '../../data/fixtures';
import type { Match, Team } from '../../domain/types';

// Tips-vyns data-hook mockas (samma grepp som PredictionsView.test.tsx): vi matar
// vyn med deterministiska matcher utan att gå via datakällan. Resultatvyn matas i
// stället via en injicerad DataSource (ResultsProvider.dataSource), så BÅDA ser
// exakt samma matcher.
const predData = vi.hoisted(() => ({
  status: 'ready' as const,
  matches: [] as Match[],
  teams: [] as Team[],
  error: null as string | null,
}));
vi.mock('./use-predictable-matches', () => ({
  usePredictableData: () => predData,
}));

const TEAMS: Team[] = [
  { id: 'mex', name: 'Mexiko', code: 'MEX', group: 'A' },
  { id: 'rsa', name: 'Sydafrika', code: 'RSA', group: 'A' },
];

/** En gruppmatch med kända lag (tippbar OCH inmatningsbar) på en given UTC-tid. */
function match(id: string, kickoff: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'mex',
    awayTeamId: 'rsa',
    kickoff,
    venue: 'Testarena',
    result: null,
    status: 'scheduled',
  };
}

/** DataSource som ger en fast matchlista (lag/grupper från fixtures räcker för vyn). */
function fixedDataSource(matches: Match[]): DataSource {
  return {
    getTeams: () => Promise.resolve(fixtureTeams),
    getGroups: () => Promise.resolve(fixtureGroups),
    getMatches: () => Promise.resolve(matches),
  };
}

function predictionsStore(): PredictionsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    activeRoomId: 'r1',
    myPredictions: new Map(),
    savePrediction: vi.fn().mockResolvedValue(undefined),
  };
}

// De match-id vars kort-<li> INTE är hidden (= synliga i default-fönstret). BÅDA
// formulär-rötterna (PredictionForm + ResultEntryForm) bär data-match-id på sitt
// yttersta element, så vi mäter symmetriskt via samma attribut i båda vyerna.
function visibleMatchIds(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('[data-match-id]'))
    .filter((f) => !(f as HTMLElement).closest('li')?.hasAttribute('hidden'))
    .map((f) => (f as HTMLElement).getAttribute('data-match-id'))
    .filter((id): id is string => id !== null)
    .sort();
}

// Premiärdagen 11 juni 2026 (svensk). Matcher sprids över flera dagar så fönstret
// (11-13 juni) är en ÄKTA delmängd: en del kort syns, resten döljs i BÅDA vyerna.
const PREMIERE = new Date('2026-06-11T08:00:00.000Z');
const MATCHES: Match[] = [
  match('p0', '2026-06-11T18:00:00.000Z'), // i fönstret
  match('p1', '2026-06-12T18:00:00.000Z'), // i fönstret
  match('p2', '2026-06-13T18:00:00.000Z'), // i fönstret
  match('p3', '2026-06-14T18:00:00.000Z'), // utanför
  match('p9', '2026-06-20T18:00:00.000Z'), // långt utanför
];

beforeEach(() => {
  predData.matches = MATCHES;
  predData.teams = TEAMS;
  // Pinna klockan på premiärdagen: resultatvyns useTodayKey() läser Date.now(),
  // tips-vyn får samma "nu" via now-propen. Så BÅDA ankrar på samma dag.
  vi.useFakeTimers();
  vi.setSystemTime(PREMIERE);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Fönster-paritet: tips-vyn och resultatvyn döljer SAMMA matcher', () => {
  it('default-synliga matcher är identiska i båda vyerna (samma 3-dagars fönster)', async () => {
    // Tips-vyn (mockad data-hook + aktiv-rum-store).
    // Resultatvyn FÖRST (den laddar matcher asynkront via DataSource). Vi flushar
    // det väntande löftet inom act() (fake timers + en mikro-task-tick) så React
    // har commitat korten innan vi mäter, utan act-varning.
    const res = render(
      <ResultsProvider env={{} as ImportMetaEnv} dataSource={fixedDataSource(MATCHES)}>
        <ResultEntryView />
      </ResultsProvider>
    );
    await act(async () => {
      // Låt det redan resolvade getMatches-löftet (mikro-tasks) köra klart; ingen
      // riktig fördröjning behövs (källan resolvar synkront), bara en flush.
      await Promise.resolve();
    });
    expect(res.container.querySelectorAll('[data-match-id]')).toHaveLength(MATCHES.length);
    const resVisible = visibleMatchIds(res.container);

    // Tips-vyn (mockad data-hook + aktiv-rum-store): renderar synkront med samma
    // matcher och samma pinnade "nu".
    const pred = render(
      <PredictionsStoreContext.Provider value={predictionsStore()}>
        <PredictionsView now={PREMIERE} />
      </PredictionsStoreContext.Provider>
    );
    const predVisible = visibleMatchIds(pred.container);

    // KÄRNAN: samma fönster -> samma synliga mängd. Och den ska vara fönstrets tre
    // (p0-p2), inte tomt och inte allt: ett ÄKTA fönster bevisar att BÅDA döljer.
    expect(predVisible).toEqual(['p0', 'p1', 'p2']);
    expect(resVisible).toEqual(predVisible);
  });
});
