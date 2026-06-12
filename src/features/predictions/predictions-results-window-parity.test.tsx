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
  // Fake timers så resultatvyns useTodayKey() läser en PINNAD klocka (samma "nu"
  // som tips-vyn får via now-propen, så BÅDA ankrar på samma dag). Varje test sätter
  // sin egen systemtid (premiär resp. mitt i turneringen) via setSystemTime.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Mät de default-synliga match-id:na i BÅDA vyerna för en given matchuppsättning +
 * pinnat "nu", och returnera dem för en likhets-assertion. Resultatvyn laddar
 * matcher asynkront via DataSource, så vi flushar det redan-resolvade löftet inom
 * act() (en mikro-task-tick, ingen riktig fördröjning) innan vi mäter.
 */
async function visibleInBothViews(
  matches: Match[],
  now: Date
): Promise<{ res: string[]; pred: string[] }> {
  // Tips-vyns data-hook är mockad mot predData; mata den SAMMA matcher som
  // resultatvyns DataSource får, annars jämför vi äpplen och päron.
  predData.matches = matches;
  const res = render(
    <ResultsProvider env={{} as ImportMetaEnv} dataSource={fixedDataSource(matches)}>
      <ResultEntryView />
    </ResultsProvider>
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(res.container.querySelectorAll('[data-match-id]')).toHaveLength(matches.length);
  const resVisible = visibleMatchIds(res.container);

  const pred = render(
    <PredictionsStoreContext.Provider value={predictionsStore()}>
      <PredictionsView now={now} />
    </PredictionsStoreContext.Provider>
  );
  const predVisible = visibleMatchIds(pred.container);
  return { res: resVisible, pred: predVisible };
}

describe('Fönster-paritet: tips-vyn och resultatvyn döljer SAMMA matcher', () => {
  it('default-synliga matcher är identiska i båda vyerna (premiärfönstret)', async () => {
    vi.setSystemTime(PREMIERE);
    const { res, pred } = await visibleInBothViews(MATCHES, PREMIERE);

    // KÄRNAN: samma fönster -> samma synliga mängd. På premiärdagen golvas bakåt-
    // spannet på premiären (inget före första matchen), så fönstret är de tre
    // (p0-p2), inte tomt och inte allt: ett ÄKTA fönster bevisar att BÅDA döljer.
    expect(pred).toEqual(['p0', 'p1', 'p2']);
    expect(res).toEqual(pred);
  });

  // T62: pariteten måste hålla även för det NYA bakåt-fönstret. Ankra mitt i
  // turneringen (16 juni) med en match igår (15 juni). BÅDA vyerna ska ta med igår
  // identiskt, annars driver de isär och en vy visar poäng som den andra gömmer.
  it('bakåt-fönstret (igår) är identiskt i båda vyerna (T62)', async () => {
    const MID = new Date('2026-06-16T10:00:00.000Z'); // 12:00 svensk, igår = 15 juni
    const midMatches: Match[] = [
      match('y', '2026-06-15T18:00:00.000Z'), // igår -> i BÅDAS fönster (T62)
      match('t0', '2026-06-16T18:00:00.000Z'), // idag
      match('t1', '2026-06-17T18:00:00.000Z'), // i morgon
      match('far', '2026-06-20T18:00:00.000Z'), // utanför -> dolt i BÅDA
    ];
    vi.setSystemTime(MID);
    const { res, pred } = await visibleInBothViews(midMatches, MID);

    // Fönstret 15-18 juni: igår + idag + 2 fram. far (20 juni) döljs i BÅDA.
    expect(pred).toEqual(['t0', 't1', 'y']); // visibleMatchIds sorterar, så ordningen är alfabetisk
    expect(res).toEqual(pred);
    // Explicit: gårdagens match är med i BÅDA (kärnan i T62, inte bara "lika").
    expect(pred).toContain('y');
  });
});
