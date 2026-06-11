import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResultsProvider } from './ResultsProvider';
import { useResultsStore } from './results-context';
import { RoomsStoreContext, type RoomsStore } from '../rooms/rooms-context';
import {
  OfficialResultsStoreContext,
  type OfficialResultsStore,
} from '../official-results/official-results-context';
import type { OfficialMatchResult } from '../../data/official';
import type { RoomMatchResult } from '../../data/rooms';
import type { Match } from '../../domain/types';

// ============================================================================
// REGRESSIONSTEST: T48 (#81, Copilot R2) , RUM-BYTE TRIGGAR INTE OMVÄVNING I LIVE.
//
// Facit-källan är `live ? officialResults : sharedResults` (ResultsProvider). Rummet
// driver alltså facit BARA i fixtures-läge; i LIVE driver de globala officiella
// resultaten facit, OBEROENDE av aktivt rum. Reweave-effekten gatade tidigare på
// `roomChanged` oavsett läge, så ett rent rums-byte i LIVE vävde om i onödan.
//
// DET FAKTISKA INVARIANTET vi låser (lessons uttommande-test-vaktar-svagare-invariant
// , vakta den FAKTISKA invarianten, inte en svagare proxy): en reweave anropar
// setRealMatchesState(woven) med en NY array, vilket ger en NY `store.matches`-referens.
// "Ingen reweave" = `store.matches` behåller EXAKT SAMMA referens över rums-bytet;
// "reweave" = referensen byts. Vi byter BARA `activeRoom.id` mellan de två rendringarna
// och håller `sharedResults`/`officialResults` på SAMMA array-referens, så det enda som
// kan trigga (eller inte) en reweave är just rums-bytes-grenen, inget annat.
// ============================================================================

function liveEnv(): ImportMetaEnv {
  return {
    VITE_SUPABASE_URL: 'https://x.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key',
  } as ImportMetaEnv;
}

function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

/** Rooms-store med ett givet rum-id, men ALLTID samma `results`-array-referens. */
function roomsStoreWith(roomId: string, results: RoomMatchResult[]): RoomsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    userId: 'me',
    myRooms: [],
    activeRoom: { id: roomId, name: 'Vänner', code: 'aaa11', memberCount: 1 },
    members: [],
    results,
    createRoom: async () => {},
    joinRoom: async () => false,
    selectRoom: async () => {},
    leaveRoom: async () => {},
    refresh: async () => {},
    saveResult: async () => {},
  } as unknown as RoomsStore;
}

function officialStoreWith(results: OfficialMatchResult[]): OfficialResultsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    results,
    isAdmin: false,
    client: null,
    saveOfficialResult: async () => {},
    refresh: async () => {},
  };
}

function roomResult(home: number, away: number): RoomMatchResult {
  return {
    matchId: 'g-A-1',
    homeGoals: home,
    awayGoals: away,
    penalties: null,
    status: 'finished',
    updatedBy: 'rum-medlem',
    updatedAt: '2026-06-12T20:00:00Z',
  };
}

function officialResult(home: number, away: number): OfficialMatchResult {
  return {
    matchId: 'g-A-1',
    homeGoals: home,
    awayGoals: away,
    penalties: null,
    status: 'finished',
    updatedBy: 'admin',
    updatedAt: '2026-06-12T21:00:00Z',
  };
}

// Fångar den SENASTE `store.matches`-referensen (+ status) ur den delade storen, så
// testet kan jämföra referens-identitet före/efter ett rums-byte.
function Probe({ sink }: { sink: { matches: Match[]; status: string } }) {
  const store = useResultsStore();
  sink.matches = store.matches;
  sink.status = store.status;
  return <output data-testid="probe" data-status={store.status} data-mode={store.mode} />;
}

describe('T48 (#81, Copilot R2): rums-byte och reweave', () => {
  it('LIVE-läge: ett rent rums-byte väver INTE om (store.matches behåller referensen)', async () => {
    // Stabila käll-referenser: bara rum-id byts mellan rendringarna. `env` hålls
    // STABIL (samma referens) så seed-effekten inte kör om och skapar en ny matchlista
    // av ett orelaterat skäl, då vore referens-jämförelsen meningslös.
    const env = liveEnv();
    const official = [officialResult(5, 0)];
    const shared = [roomResult(1, 1)];
    const sink = { matches: [] as Match[], status: 'loading' };

    function tree(roomId: string) {
      return (
        <RoomsStoreContext.Provider value={roomsStoreWith(roomId, shared)}>
          <OfficialResultsStoreContext.Provider value={officialStoreWith(official)}>
            <ResultsProvider env={env} liveReady={true}>
              <Probe sink={sink} />
            </ResultsProvider>
          </OfficialResultsStoreContext.Provider>
        </RoomsStoreContext.Provider>
      );
    }

    const { rerender } = render(tree('r1'));
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-status', 'ready')
    );
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveAttribute('data-mode', 'live'));

    // Referensen efter seed (facit redan invävt: official 5-0).
    const before = sink.matches;
    expect(before.find((m) => m.id === 'g-A-1')?.status).toBe('finished');

    // BYT RUM (r1 -> r2). Facit-källan (official) är oförändrad i live, så ingen reweave.
    await act(async () => {
      rerender(tree('r2'));
    });

    // FAKTISKA invariantet: ingen reweave => exakt samma matches-referens.
    expect(sink.matches).toBe(before);
  });

  it('FIXTURES-läge: ett rums-byte väver om som förr (store.matches får ny referens)', async () => {
    // Samma stabila käll-referenser; bara rum-id byts. `env` hålls STABIL så en ny
    // matchlista efter rums-bytet bara kan komma från reweave-grenen (inte en re-seed),
    // annars skulle testet "passera" även om reweaven skedde av fel skäl.
    const env = fixturesEnv();
    const official: OfficialMatchResult[] = [];
    const shared = [roomResult(1, 1)];
    const sink = { matches: [] as Match[], status: 'loading' };

    function tree(roomId: string) {
      return (
        <RoomsStoreContext.Provider value={roomsStoreWith(roomId, shared)}>
          <OfficialResultsStoreContext.Provider value={officialStoreWith(official)}>
            <ResultsProvider env={env} liveReady={false}>
              <Probe sink={sink} />
            </ResultsProvider>
          </OfficialResultsStoreContext.Provider>
        </RoomsStoreContext.Provider>
      );
    }

    const { rerender } = render(tree('r1'));
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-status', 'ready')
    );
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveAttribute('data-mode', 'fixtures')
    );

    const before = sink.matches;
    // I fixtures vävs rummets resultat in (1-1).
    expect(before.find((m) => m.id === 'g-A-1')?.status).toBe('finished');

    await act(async () => {
      rerender(tree('r2'));
    });

    // FAKTISKA invariantet: reweave skedde => ny matches-referens (oförändrat beteende).
    expect(sink.matches).not.toBe(before);
    // Och innehållet är fortfarande korrekt (rummets 1-1 är fortfarande invävt).
    expect(sink.matches.find((m) => m.id === 'g-A-1')?.status).toBe('finished');
  });
});
