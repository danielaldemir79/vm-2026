// Tester för STRAFFLÄGGNINGS-sektionen i den rika matchvyn (modalen). Egen fil eftersom den
// MOCKAR useLiveData (för att injicera en straffavgjord live-rad), medan MatchDetail.test.tsx
// medvetet kör den RIKTIGA fixtures-laddningen för demo-matchen , de två får inte krocka.
//
// Bevisar (a) att straffsektionen renderas avskild från tidslinjen med satt/missad + resultat,
// och (b) vinnar-grinden: "vann straffläggningen" BARA när matchen är avgjord (status finished),
// annars "pågår" (en pågående serie ska aldrig utropa en vinnare på en tillfällig ledning).

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MatchDetailProvider } from './MatchDetailProvider';
import { MatchDetailTrigger } from './MatchDetailView';
import { ResultsStoreContext, type ResultsStore } from '../results/results-context';
import { LeaderboardStoreContext, type LeaderboardStore } from '../leaderboard/leaderboard-context';
import type { LiveDataResult } from '../daily';
import type { Match, Team } from '../../domain/types';
import type { LiveData, LiveEvent } from '../../data/livescore';

// useLiveData mockas så vi kan styra exakt vilken live-rad matchvyn ser (en straffavgjord
// respektive pågående match), deterministiskt och utan async fixtures-laddning. Övriga
// exporter ur modulen bevaras (importActual), så inget annat som rör modulen går sönder.
let liveResult: LiveDataResult = { status: 'ready', byMatchId: new Map(), error: null };
vi.mock('../daily/use-live-data', async (importActual) => ({
  ...(await importActual<typeof import('../daily/use-live-data')>()),
  useLiveData: (): LiveDataResult => liveResult,
}));

const NED = 1118;
const JPN = 12;

const TEAMS: Team[] = [
  { id: 'ned', name: 'Nederländerna', code: 'NED', group: 'F' },
  { id: 'jpn', name: 'Japan', code: 'JPN', group: 'F' },
];

/** En FÄRDIGSPELAD match g-F-1 (Nederländerna-Japan), 1-1 + straffar 2-3. */
const MATCH: Match = {
  id: 'g-F-1',
  stage: 'group',
  status: 'finished',
  groupId: 'F',
  homeTeamId: 'ned',
  awayTeamId: 'jpn',
  kickoff: '2026-06-14T20:00:00Z',
  venue: 'Demo Arena',
  tvChannel: 'SVT',
  result: { homeGoals: 1, awayGoals: 1, penalties: { homeGoals: 2, awayGoals: 3 } },
} as Match;

function resultsStore(): ResultsStore {
  return {
    status: 'ready',
    matches: [MATCH],
    teams: TEAMS,
    groups: [],
    mode: 'fixtures',
    error: null,
    setMatches: () => {},
    submitResult: () => ({ ok: true }) as ReturnType<ResultsStore['submitResult']>,
    simulating: false,
    enterSimulation: () => {},
    exitSimulation: () => {},
    resetSimulation: () => {},
  };
}

function leaderboardStore(): LeaderboardStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    activeRoomId: 'r1',
    leaderboard: [],
    livePreliminary: false,
    reveal: [],
    teams: TEAMS,
    currentUserId: null,
    selfBreakdown: null,
    selfBadges: null,
    selfStats: null,
  };
}

/** En straffläggnings-spark (comments-markör + global ordning + satt/missad ur detail). */
function kick(order: number, scored: boolean, teamApiId: number, player: string): LiveEvent {
  return {
    minute: 120,
    extra: order,
    kind: 'goal',
    rawType: 'Goal',
    detail: scored ? 'Penalty' : 'Missed Penalty',
    teamApiId,
    teamName: teamApiId === NED ? 'Netherlands' : 'Japan',
    playerId: null,
    playerName: player,
    assistId: null,
    assistName: null,
    cardColor: null,
    comments: 'Penalty Shootout',
  };
}

/** En live-rad för g-F-1 med en straffläggning (borta vinner 2-3), valbar status. */
function shootoutLive(status: LiveData['status']): LiveData {
  return {
    matchId: 'g-F-1',
    apiFixtureId: 1489376,
    status,
    elapsedMinute: 120,
    homeGoals: 1,
    awayGoals: 1,
    events: [
      kick(1, true, NED, 'Koopmeiners'),
      kick(2, true, JPN, 'Tanaka'),
      kick(3, true, NED, 'Kluivert'),
      kick(4, true, JPN, 'Kubo'),
      kick(5, false, NED, 'Weghorst'),
      kick(6, true, JPN, 'Mitoma'),
    ],
    statistics: [],
    lineups: [],
    frozen: status === 'finished',
    lastSyncedAt: '2026-06-14T22:00:00.000Z',
  };
}

function openModal(status: LiveData['status']) {
  liveResult = {
    status: 'ready',
    byMatchId: new Map([['g-F-1', shootoutLive(status)]]),
    error: null,
  };
  render(
    <ResultsStoreContext.Provider value={resultsStore()}>
      <LeaderboardStoreContext.Provider value={leaderboardStore()}>
        <MatchDetailProvider>
          <MatchDetailTrigger matchId="g-F-1" ariaLabel="Öppna">
            Öppna
          </MatchDetailTrigger>
        </MatchDetailProvider>
      </LeaderboardStoreContext.Provider>
    </ResultsStoreContext.Provider>
  );
  fireEvent.click(screen.getByText('Öppna'));
  return screen.findByRole('dialog');
}

describe('MatchDetailView, straffläggnings-sektionen', () => {
  it('avgjord match: visar straffsektion (avskild), satt/missad och en vinnare', async () => {
    const dialog = await openModal('finished');
    const block = await waitFor(() => {
      const el = dialog.querySelector('[data-match-detail-shootout]');
      expect(el).toBeInTheDocument();
      return el as HTMLElement;
    });
    // Avgjord -> en "vann"-etikett visas.
    expect(within(block).getByText(/vann straffläggningen/)).toBeInTheDocument();
    // Missad spark markerad färg-oberoende (dold "missad" + data-hak), skild från målen.
    const missed = within(block)
      .getByText('Weghorst')
      .closest('[data-shootout-kick]') as HTMLElement;
    expect(missed.getAttribute('data-shootout-outcome')).toBe('missed');
    expect(within(missed).getByText('missad')).toBeInTheDocument();
    // Straffskyttarna ligger INTE i tidslinjen (de räknas aldrig som mål).
    const timeline = dialog.querySelector('[data-match-detail-timeline]');
    if (timeline) {
      expect(within(timeline as HTMLElement).queryByText('Kluivert')).toBeNull();
    }
  });

  it('pågående serie (paused): visar "pågår", aldrig en felaktig "vann"-etikett', async () => {
    const dialog = await openModal('paused');
    const block = await waitFor(() => {
      const el = dialog.querySelector('[data-match-detail-shootout]');
      expect(el).toBeInTheDocument();
      return el as HTMLElement;
    });
    expect(block.querySelector('[data-shootout-ongoing]')?.textContent).toBe('pågår');
    expect(within(block).queryByText(/vann straffläggningen/)).toBeNull();
  });
});
