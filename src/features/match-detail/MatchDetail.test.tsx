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
import type { Group, Match, Team } from '../../domain/types';
import type { RevealedMatch } from '../leaderboard';
import { resolveKnockoutTeams } from '../daily';
import { teamShortName } from '../../domain';
import { WC2026_GROUPS, WC2026_MATCHES, WC2026_TEAMS } from '../../data/wc2026';

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

function resultsStore(matches: Match[], teams: Team[] = TEAMS, groups: Group[] = []): ResultsStore {
  return {
    status: 'ready',
    matches,
    teams,
    groups,
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

function leaderboardStore(reveal: RevealedMatch[], teams: Team[] = TEAMS): LeaderboardStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    activeRoomId: 'r1',
    leaderboard: [],
    livePreliminary: false,
    reveal,
    teams,
    currentUserId: null,
    selfBreakdown: null,
    selfBadges: null,
    selfStats: null,
  };
}

/** Montera providern + stubbade storar runt valfritt innehåll. */
function harness(
  ui: ReactNode,
  {
    matches = [DEMO_MATCH],
    reveal = [] as RevealedMatch[],
    teams = TEAMS,
    groups = [] as Group[],
  } = {}
) {
  return render(
    <ResultsStoreContext.Provider value={resultsStore(matches, teams, groups)}>
      <LeaderboardStoreContext.Provider value={leaderboardStore(reveal, teams)}>
        <MatchDetailProvider>{ui}</MatchDetailProvider>
      </LeaderboardStoreContext.Provider>
    </ResultsStoreContext.Provider>
  );
}

/**
 * Bygg en FÄRDIGSPELAD version av VM 2026:s gruppspel (samma deterministiska mönster som
 * bracket-live.integration.test.tsx) så slutspelsträdet kan SEEDA knockout-matchernas lag.
 * Slutspelsmatcherna (M73-M104) lämnas orörda (null-lag) , deras lag härleds av
 * resolveKnockoutTeams. Varje grupp får en entydig rank 1/2/3/4; tidigare grupper
 * (alfabetiskt) får sina lag fler mål så de 8 bästa treorna blir förutsägbara (A-H).
 */
function completedGroupStage(): Match[] {
  const rankByTeam = new Map<string, number>();
  const groupOrderIndex = new Map<string, number>();
  WC2026_GROUPS.forEach((group, gi) => {
    groupOrderIndex.set(group.id, gi);
    group.teamIds.forEach((teamId, idx) => rankByTeam.set(teamId, idx + 1));
  });

  return WC2026_MATCHES.map((m): Match => {
    if (m.stage !== 'group' || m.homeTeamId === null || m.awayTeamId === null) {
      return m;
    }
    const homeRank = rankByTeam.get(m.homeTeamId)!;
    const awayRank = rankByTeam.get(m.awayTeamId)!;
    const gi = groupOrderIndex.get(m.groupId!)!;
    const bonus = Math.max(0, 12 - gi);
    const winnerGoals = 2 + Math.floor(bonus / 3);
    if (homeRank < awayRank) {
      return { ...m, status: 'finished', result: { homeGoals: winnerGoals, awayGoals: 0 } };
    }
    return { ...m, status: 'finished', result: { homeGoals: 0, awayGoals: winnerGoals } };
  });
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

// SLUTSPELSMATCHENS LAG (bugg 2026-06-29, Daniels skärmdump): matchvyn för en
// knockout-match (M73-M104) visade "Ej klart mot Ej klart" i rubriken och "Okänt lag mot
// Okänt lag" i reveal-kortet, FAST matchen var seedbar/avgjord. Idag-vyn löste redan
// lagen via resolveKnockoutTeams; matchvyn läste matchplanen rakt av (null-lag). Dessa
// tester bevisar att matchvyn nu ÅTERANVÄNDER samma upplösning (rubrik + reveal), och
// graciöst faller tillbaka på platshållaren när matchen ännu inte är seedbar.
describe('MatchDetailView , slutspelsmatchens lag löses (bracket-seedning)', () => {
  it('rubriken visar de RIKTIGA lagen för en seedad slutspelsmatch (M73), inte "Ej klart"', async () => {
    const completed = completedGroupStage();
    // Härled de förväntade lagen ur SAMMA rena upplösning vyn använder (en sanning).
    const m73 = resolveKnockoutTeams(WC2026_GROUPS, completed).find((m) => m.id === 'M73')!;
    // Sanity: scenariot är giltigt , ett klart gruppspel seedar M73:s BÅDA lag.
    expect(m73.homeTeamId).not.toBeNull();
    expect(m73.awayTeamId).not.toBeNull();
    const homeShort = teamShortName(WC2026_TEAMS.find((t) => t.id === m73.homeTeamId)!);
    const awayShort = teamShortName(WC2026_TEAMS.find((t) => t.id === m73.awayTeamId)!);

    harness(
      <MatchDetailTrigger matchId="M73" ariaLabel="Öppna">
        Öppna
      </MatchDetailTrigger>,
      { matches: completed, teams: WC2026_TEAMS, groups: WC2026_GROUPS }
    );
    fireEvent.click(screen.getByText('Öppna'));
    const dialog = await screen.findByRole('dialog');

    const heading = within(dialog).getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent(homeShort);
    expect(heading).toHaveTextContent(awayShort);
    expect(heading).not.toHaveTextContent('Ej klart');
  });

  it('"vad alla tippade"-reveal visar de upplösta lagen, inte "Okänt lag"', async () => {
    const completed = completedGroupStage();
    const m73 = resolveKnockoutTeams(WC2026_GROUPS, completed).find((m) => m.id === 'M73')!;
    const homeFull = WC2026_TEAMS.find((t) => t.id === m73.homeTeamId)!.name;
    const awayFull = WC2026_TEAMS.find((t) => t.id === m73.awayTeamId)!.name;

    // EN SANNING (Del C, #252 F1): reveal-raden bär nu de UPPLÖSTA knockout-lagen redan vid
    // KÄLLAN (LeaderboardProvider kör buildMatchReveal på resolveKnockoutTeams-matcherna), så
    // storen levererar riktiga lag-id:n hit. Den gamla lokala patchen i MatchDetailView är
    // borttagen; matchvyn renderar bara storens (redan upplösta) rad troget. Källans upplösning
    // bevisas separat i LeaderboardProvider.test.tsx (Del C). Här matar vi därför reveal-raden
    // med de upplösta id:na (precis det fixade storen ger) och bevisar att kortet visar dem.
    const reveal: RevealedMatch[] = [
      {
        matchId: 'M73',
        status: 'finished',
        homeTeamId: m73.homeTeamId,
        awayTeamId: m73.awayTeamId,
        kickoff: '2026-07-01T19:00:00Z',
        actual: { homeGoals: 0, awayGoals: 1 },
        picks: [
          {
            userId: 'u1',
            displayName: 'Anna',
            predicted: { homeGoals: 0, awayGoals: 1 },
            points: 3,
            pointType: 'exact',
          },
        ],
      },
    ];

    harness(
      <MatchDetailTrigger matchId="M73" ariaLabel="Öppna">
        Öppna
      </MatchDetailTrigger>,
      { matches: completed, teams: WC2026_TEAMS, groups: WC2026_GROUPS, reveal }
    );
    fireEvent.click(screen.getByText('Öppna'));
    const dialog = await screen.findByRole('dialog');

    const revealSection = await waitFor(() => {
      const el = dialog.querySelector('[data-match-detail-reveal]');
      expect(el).toBeInTheDocument();
      return el as HTMLElement;
    });
    const revealCard = revealSection.querySelector('[data-reveal-match]') as HTMLElement;
    // Reveal-kortets match-rubrik visar de RIKTIGA lagen, inte platshållaren.
    expect(revealCard).toHaveTextContent(homeFull);
    expect(revealCard).toHaveTextContent(awayFull);
    expect(revealCard).not.toHaveTextContent('Okänt lag');
    // Pick:en (Anna) finns kvar , vi rör bara lag-namnen, inte resten av kortet.
    expect(within(revealCard).getByText('Anna')).toBeInTheDocument();
  });

  it('graciös fallback: en EJ seedbar slutspelsmatch visar "Ej klart" utan krasch', async () => {
    // Knockout-match med null-lag + INGET klart gruppspel (tomma grupper) -> ingen
    // upplösning möjlig -> platshållaren visas (gissa aldrig ett lag), ingen krasch.
    const ko = scheduledMatch({
      id: 'M73',
      stage: 'round-of-32',
      groupId: null,
      homeTeamId: null,
      awayTeamId: null,
    });
    harness(
      <MatchDetailTrigger matchId="M73" ariaLabel="Öppna">
        Öppna
      </MatchDetailTrigger>,
      { matches: [ko], teams: WC2026_TEAMS, groups: [] }
    );
    fireEvent.click(screen.getByText('Öppna'));
    const dialog = await screen.findByRole('dialog');
    const heading = within(dialog).getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Ej klart');
  });
});
