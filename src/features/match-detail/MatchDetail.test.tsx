// Tester för den rika matchvyns drill-in (T86, #178). Bevisar:
//  - PROVIDER + TRIGGER: en trigger öppnar vyn för rätt match-id, Stäng/Escape stänger,
//    fail-loud utan provider (wiring-kontraktet),
//  - VYN ur fixtures-läge (skarven): tidslinje + statistik + laguppställning (+ tränare)
//    renderas ur den committade demo-matchen (g-F-1), och "vad alla tippade" SCOPAS till
//    just den matchen,
//  - GRACIÖS FALLBACK: en match UTAN live-data visar en lugn rad, ingen krasch/tom ruta,
//  - A11y: dialogen är en role="dialog" med ett tillgängligt namn (matchens lag).
//
// useLiveData körs i FIXTURES-läge (inga env-vars i test), så den laddar den committade
// demo-matchen utan backend , vi väntar in den med findBy*/waitFor (async load).

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MatchDetailProvider } from './MatchDetailProvider';
import { MatchDetailTrigger } from './MatchDetailView';
import { useMatchDetail } from './match-detail-context';
import { ResultsStoreContext, type ResultsStore } from '../results/results-context';
import { LeaderboardStoreContext, type LeaderboardStore } from '../leaderboard/leaderboard-context';
import type { Match, Team } from '../../domain/types';
import type { RevealedMatch } from '../leaderboard';

// Den committade demo-matchen (g-F-1) är Nederländerna-Japan. Vi bygger en results-store där
// g-F-1 finns med rätt lag-id, så hemma/borta-sidningen + namnen stämmer i vyn.
const TEAMS: Team[] = [
  { id: 'ned', name: 'Nederländerna', code: 'NED', group: 'F' },
  { id: 'jpn', name: 'Japan', code: 'JPN', group: 'F' },
  { id: 'mex', name: 'Mexiko', code: 'MEX', group: 'A' },
  { id: 'kor', name: 'Sydkorea', code: 'KOR', group: 'A' },
];

/** Bygg en (schemalagd) match med rätt diskriminerat kontrakt (status + groupId). */
function scheduledMatch(over: Partial<Match> = {}): Match {
  return {
    id: 'g-F-1',
    stage: 'group',
    status: 'scheduled',
    groupId: 'F',
    homeTeamId: 'ned',
    awayTeamId: 'jpn',
    kickoff: '2026-06-14T20:00:00Z',
    venue: 'Demo Arena',
    tvChannel: 'SVT',
    result: null,
    ...over,
  } as Match;
}

const DEMO_MATCH: Match = scheduledMatch();

function resultsStore(matches: Match[]): ResultsStore {
  return {
    status: 'ready',
    matches,
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

function leaderboardStore(reveal: RevealedMatch[]): LeaderboardStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    activeRoomId: 'r1',
    leaderboard: [],
    reveal,
    teams: TEAMS,
    currentUserId: null,
    selfBreakdown: null,
    selfBadges: null,
    selfStats: null,
  };
}

/** Montera providern + stubbade storar runt valfritt innehåll. */
function harness(ui: ReactNode, { matches = [DEMO_MATCH], reveal = [] as RevealedMatch[] } = {}) {
  return render(
    <ResultsStoreContext.Provider value={resultsStore(matches)}>
      <LeaderboardStoreContext.Provider value={leaderboardStore(reveal)}>
        <MatchDetailProvider>{ui}</MatchDetailProvider>
      </LeaderboardStoreContext.Provider>
    </ResultsStoreContext.Provider>
  );
}

describe('MatchDetailTrigger + Provider', () => {
  it('öppnar vyn för rätt match-id och visar matchens lag som dialog-namn', async () => {
    harness(
      <MatchDetailTrigger matchId="g-F-1" ariaLabel="Öppna matchsida för Nederländerna mot Japan">
        Öppna
      </MatchDetailTrigger>
    );
    // Stängd från start: ingen dialog.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /öppna matchsida/i }));

    const dialog = await screen.findByRole('dialog');
    // Dialogens tillgängliga namn (aria-labelledby -> rubriken) bär matchens lag.
    expect(dialog).toHaveAccessibleName(/Nederländerna.*Japan/);
  });

  it('Stäng-knappen stänger vyn', async () => {
    harness(
      <MatchDetailTrigger matchId="g-F-1" ariaLabel="Öppna">
        Öppna
      </MatchDetailTrigger>
    );
    fireEvent.click(screen.getByText('Öppna'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /stäng matchvyn/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Escape stänger vyn (a11y-dialog-kontraktet, ärvs av Modal)', async () => {
    harness(
      <MatchDetailTrigger matchId="g-F-1" ariaLabel="Öppna">
        Öppna
      </MatchDetailTrigger>
    );
    fireEvent.click(screen.getByText('Öppna'));
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('fail-loud när triggern saknar provider (wiring-fel, inte tyst no-op)', () => {
    // useMatchDetail kastar utan provider; en trigger utanför provideren ska braka högt.
    function Bare() {
      useMatchDetail();
      return null;
    }
    // Tysta den förväntade React-felgränsloggen för detta avsiktliga fel.
    expect(() => render(<Bare />)).toThrow(/MatchDetailProvider/);
  });
});

describe('MatchDetailView ur fixtures (skarven)', () => {
  it('renderar tidslinje, statistik och laguppställning (+ tränare) ur demo-matchen', async () => {
    harness(
      <MatchDetailTrigger matchId="g-F-1" ariaLabel="Öppna">
        Öppna
      </MatchDetailTrigger>
    );
    fireEvent.click(screen.getByText('Öppna'));
    const dialog = await screen.findByRole('dialog');

    // De rika sektionerna laddas async (useLiveData fixtures), vänta in dem.
    await waitFor(() =>
      expect(dialog.querySelector('[data-match-detail-timeline]')).toBeInTheDocument()
    );
    expect(dialog.querySelector('[data-match-detail-stats]')).toBeInTheDocument();
    expect(dialog.querySelector('[data-match-detail-lineups]')).toBeInTheDocument();
    // De rika demo-blobbarna är 2022-data (England/Iran): tränaren G. Southgate bevisar att
    // coach-fältet bärs hela vägen genom parsern -> projektionen -> vyn.
    expect(within(dialog).getByText(/Tränare:\s*G\. Southgate/)).toBeInTheDocument();
  });

  it('scopar "vad alla tippade" till DENNA match (rätt reveal-rad, inte andra matchers)', async () => {
    const reveal: RevealedMatch[] = [
      {
        matchId: 'g-F-1',
        status: 'finished',
        homeTeamId: 'ned',
        awayTeamId: 'jpn',
        kickoff: '2026-06-14T20:00:00Z',
        actual: { homeGoals: 2, awayGoals: 1 },
        picks: [
          {
            userId: 'u1',
            displayName: 'Anna',
            predicted: { homeGoals: 2, awayGoals: 1 },
            points: 3,
            pointType: 'exact',
          },
        ],
      },
      {
        matchId: 'g-A-9', // en ANNAN match , ska INTE synas i g-F-1:s drill-in
        status: 'finished',
        homeTeamId: 'mex',
        awayTeamId: 'kor',
        kickoff: '2026-06-12T18:00:00Z',
        actual: { homeGoals: 0, awayGoals: 0 },
        picks: [
          {
            userId: 'u9',
            displayName: 'Zlatan',
            predicted: { homeGoals: 0, awayGoals: 0 },
            points: 3,
            pointType: 'exact',
          },
        ],
      },
    ];
    harness(
      <MatchDetailTrigger matchId="g-F-1" ariaLabel="Öppna">
        Öppna
      </MatchDetailTrigger>,
      { reveal }
    );
    fireEvent.click(screen.getByText('Öppna'));
    const dialog = await screen.findByRole('dialog');

    const revealSection = await waitFor(() => {
      const el = dialog.querySelector('[data-match-detail-reveal]');
      expect(el).toBeInTheDocument();
      return el as HTMLElement;
    });
    // Pick:en för g-F-1 (Anna) syns; den andra matchens pick (Zlatan) syns INTE.
    expect(within(revealSection).getByText('Anna')).toBeInTheDocument();
    expect(within(revealSection).queryByText('Zlatan')).not.toBeInTheDocument();
    // Bara EN reveal-match renderas (scopad), inte hela listan.
    expect(revealSection.querySelectorAll('[data-reveal-match]')).toHaveLength(1);
  });

  it('graciös fallback: en match UTAN live-data visar en lugn rad, ingen krasch', async () => {
    // En match-id som inte finns i fixtures-demon -> ingen live-data -> fallback-raden.
    const other = scheduledMatch({
      id: 'g-A-9',
      groupId: 'A',
      homeTeamId: 'mex',
      awayTeamId: 'kor',
    });
    harness(
      <MatchDetailTrigger matchId="g-A-9" ariaLabel="Öppna">
        Öppna
      </MatchDetailTrigger>,
      { matches: [other] }
    );
    fireEvent.click(screen.getByText('Öppna'));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(dialog.querySelector('[data-match-detail-empty]')).toBeInTheDocument()
    );
    // Ingen tidslinje/statistik (det finns ingen live-data), men ingen krasch.
    expect(dialog.querySelector('[data-match-detail-timeline]')).not.toBeInTheDocument();
  });
});
