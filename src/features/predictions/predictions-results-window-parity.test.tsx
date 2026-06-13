// FÖNSTER-KONTRAKT (T68/#129): tips-vyn och resultatvyn har MEDVETET OLIKA default-
// fönster, och detta test LÅSER den skillnaden så den inte tyst regredierar.
//
// HISTORIK: fram till T68 delade de två vyerna EXAKT samma igår+framåt-fönster
// (windowMatches), och detta test vaktade att de inte fick drifta isär. Daniels spec
// T68 ÄNDRADE tips-vyns default till BARA DAGENS matcher (selectTodayMatches), medan
// resultat-/poängvyn BEHÅLLER sitt bredare fönster (igår + idag + 2 fram, T62, där
// gårdagens avgjorda matchers poäng ska synas). Paritetsguarden är därför MEDVETET
// uppdaterad: den vaktar inte längre LIKHET, utan den AVSEDDA SKILLNADEN, så att
//   (a) tips-vyn aldrig av misstag faller tillbaka till resultatvyns bredare fönster
//       (då skulle gårdagens redan spelade matcher dyka upp i tippnings-listan), OCH
//   (b) resultatvyn aldrig av misstag krymper till bara-idag (då skulle gårdagens
//       poäng försvinna ur default, exakt det T62 löste).
//
// Vi monterar BÅDA vyerna med IDENTISK matchuppsättning och ett pinnat "nu" (klockan
// FRYST), och jämför vilka match-id som är default-SYNLIGA (kort-<li> ej `hidden`).
// Tips-vyn ska visa BARA dagens; resultatvyn igår + dagens + morgondagens.

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

// De match-id vars kort-<li> INTE är hidden (= default-synliga). BÅDA formulär-rötterna
// (PredictionForm + ResultEntryForm) bär data-match-id på sitt yttersta element, så vi
// mäter symmetriskt via samma attribut i båda vyerna.
function visibleMatchIds(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('[data-match-id]'))
    .filter((f) => !(f as HTMLElement).closest('li')?.hasAttribute('hidden'))
    .map((f) => (f as HTMLElement).getAttribute('data-match-id'))
    .filter((id): id is string => id !== null)
    .sort();
}

const MATCHES: Match[] = [
  match('y', '2026-06-15T18:00:00.000Z'), // igår
  match('t0', '2026-06-16T18:00:00.000Z'), // idag
  match('t1', '2026-06-16T20:00:00.000Z'), // idag
  match('tom', '2026-06-17T18:00:00.000Z'), // i morgon
  match('far', '2026-06-20T18:00:00.000Z'), // långt fram
];

beforeEach(() => {
  predData.matches = MATCHES;
  predData.teams = TEAMS;
  // Fake timers så resultatvyns useTodayKey() läser en PINNAD klocka (samma "nu"
  // som tips-vyn får via now-propen, så BÅDA ankrar på samma dag). Varje test sätter
  // sin egen systemtid via setSystemTime.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Mät de default-synliga match-id:na i BÅDA vyerna för en given matchuppsättning +
 * pinnat "nu". Resultatvyn laddar matcher asynkront via DataSource, så vi flushar det
 * redan-resolvade löftet inom act() (en mikro-task-tick) innan vi mäter.
 */
async function visibleInBothViews(
  matches: Match[],
  now: Date
): Promise<{ res: string[]; pred: string[] }> {
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

describe('Fönster-kontrakt: tips-vyn = bara IDAG, resultatvyn = igår + idag + framåt (T68)', () => {
  it('tips-vyn visar BARA dagens matcher, resultatvyn det bredare fönstret (medveten skillnad)', async () => {
    const MID = new Date('2026-06-16T10:00:00.000Z'); // 12:00 svensk, idag = 16 juni
    const { res, pred } = await visibleInBothViews(MATCHES, MID);

    // TIPS-VYN: bara dagens (16 juni) matcher. Inte gårdagens, inte morgondagens.
    expect(pred).toEqual(['t0', 't1']);

    // RESULTAT-VYN: igår (15) + idag (16) + i morgon (17), far (20) döljs. Den BEHÅLLER
    // sitt bredare fönster (T62: gårdagens poäng ska synas där).
    expect(res).toEqual(['t0', 't1', 'tom', 'y']);

    // KÄRNAN: de två fönstren är MEDVETET OLIKA (annars regrederade en av ändringarna).
    expect(pred).not.toEqual(res);
    // Gårdagens spelade match syns i RESULTATvyn (poäng) men INTE i tips-vyn (otippbar gammal).
    expect(res).toContain('y');
    expect(pred).not.toContain('y');
    // Morgondagens match är dold i tips-default (bara idag) men nås via expandera.
    expect(pred).not.toContain('tom');
  });

  it('premiärdagen: tips-vyn visar premiärdagens matcher (inte tom port före VM-start)', async () => {
    const PREMIERE = new Date('2026-06-11T08:00:00.000Z'); // före alla MATCHES (15-20 juni)
    const premiereMatches: Match[] = [
      match('p0', '2026-06-11T18:00:00.000Z'), // premiär = ankaret
      match('p1', '2026-06-12T18:00:00.000Z'), // dagen efter
    ];
    const { pred } = await visibleInBothViews(premiereMatches, PREMIERE);
    // Idag (11 juni) ÄR premiärdagen, så bara premiärdagens match syns, inte 12 juni.
    expect(pred).toEqual(['p0']);
  });
});
