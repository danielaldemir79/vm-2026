import { render, screen, waitFor } from '@testing-library/react';
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

// ============================================================================
// INTEGRATIONSTEST: T48 (#81) , FACIT-KÄLLAN FÖR LIVE-TRACKERN.
//
// Det STARKA invariantet (lessons uttommande-test-vaktar-svagare-invariant): i
// LIVE-läge ska live-trackern (store.matches, som GroupStageView/BracketView
// härleder ur) drivas av de GLOBALA officiella resultaten
// (official_match_results, admin-only) , och INTE av rummets delade resultat
// (room_match_results, pre-share-blockeraren). Vi matar IN BÅDA källorna samtidigt,
// med OLIKA värden för samma match, och bevisar att officiella vinner i live och
// rummets vinner i fixtures. Ett test som bara matade EN källa skulle inte skilja
// "läser official" från "läser room".
//
// ResultsProvider seedar via getDataSource (fixtures-läge ger den statiska VM-planen,
// 72 gruppmatcher g-A-1.., 32 slutspel M73..). I LIVE-läge injicerar vi en
// fixtures-datakälla (samma plan) men sätter mode='live' via env+liveReady, så bara
// FACIT-KÄLLAN (official vs room) skiljer, inte basplanen.
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

/** Minimal rooms-store som bär ETT delat rums-resultat för g-A-1. */
function roomsStoreWith(results: RoomMatchResult[]): RoomsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    userId: 'me',
    myRooms: [],
    activeRoom: { id: 'r1', name: 'Vänner', code: 'aaa11', memberCount: 1 },
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

/** Minimal facit-store som bär ETT officiellt resultat för g-A-1. */
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

/** Probe som exponerar g-A-1:s ställning ur den delade results-storen. */
function Probe() {
  const store = useResultsStore();
  const m = store.matches.find((x) => x.id === 'g-A-1');
  return (
    <output
      data-testid="probe"
      data-status={store.status}
      data-mode={store.mode}
      data-score={
        m && m.status === 'finished' ? `${m.result.homeGoals}-${m.result.awayGoals}` : 'none'
      }
    />
  );
}

/**
 * Montera ResultsProvider med BÅDE en rooms-context (room-facit) OCH en facit-context
 * (official-facit) ovanför, i samma ordning som appen, och en injicerbar env för läget.
 */
function renderTracker(opts: {
  env: ImportMetaEnv;
  liveReady: boolean;
  room: RoomMatchResult[];
  official: OfficialMatchResult[];
}) {
  return render(
    <RoomsStoreContext.Provider value={roomsStoreWith(opts.room)}>
      <OfficialResultsStoreContext.Provider value={officialStoreWith(opts.official)}>
        <ResultsProvider env={opts.env} liveReady={opts.liveReady}>
          <Probe />
        </ResultsProvider>
      </OfficialResultsStoreContext.Provider>
    </RoomsStoreContext.Provider>
  );
}

describe('T48: facit-källan för live-trackern', () => {
  it('LIVE-läge: officiella resultaten driver trackern (rummets ignoreras)', async () => {
    // BÅDA källor satta med OLIKA värden för g-A-1: official 5-0, room 1-1.
    renderTracker({
      env: liveEnv(),
      liveReady: true,
      room: [roomResult(1, 1)],
      official: [officialResult(5, 0)],
    });

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveAttribute('data-mode', 'live');
    });
    // STARKA invariantet: official (5-0) vann, INTE rummets (1-1).
    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveAttribute('data-score', '5-0');
    });
  });

  it('FIXTURES-läge: rummets resultat driver trackern (oförändrat, official ignoreras)', async () => {
    // Samma BÅDA källor, men nu fixtures-läge: rummets (1-1) ska vinna, official (5-0) ignoreras.
    renderTracker({
      env: fixturesEnv(),
      liveReady: false,
      room: [roomResult(1, 1)],
      official: [officialResult(5, 0)],
    });

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveAttribute('data-mode', 'fixtures');
    });
    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveAttribute('data-score', '1-1');
    });
  });

  it('LIVE-läge utan officiellt facit: trackern är ren plan (rummets väver INTE in)', async () => {
    // Rummet har ett resultat men facit är tomt: i live ska g-A-1 förbli planens
    // scheduled (ingen ställning), eftersom rummets resultat inte längre är facit.
    renderTracker({
      env: liveEnv(),
      liveReady: true,
      room: [roomResult(3, 2)],
      official: [],
    });

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveAttribute('data-mode', 'live');
    });
    // Vänta in seedad plan (Copilot R3): data-score är 'none' även när store.matches
    // ännu är tom, så utan ready-vakten kunde testet passera FÖRE vävningen och vore
    // en falsk positiv. Med planen seedad bevisar 'none' det riktiga invariantet:
    // rummets 3-2 vävdes INTE in.
    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveAttribute('data-status', 'ready');
    });
    expect(screen.getByTestId('probe')).toHaveAttribute('data-score', 'none');
  });
});
