import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RevealView } from './RevealView';
import { LeaderboardStoreContext, type LeaderboardStore } from './leaderboard-context';
import type { RevealedMatch } from './reveal';
import type { Team } from '../../domain/types';

const TEAMS: Team[] = [
  { id: 'mex', name: 'Mexiko', code: 'MEX', group: 'A' },
  { id: 'kor', name: 'Sydkorea', code: 'KOR', group: 'A' },
];

function store(partial: Partial<LeaderboardStore>): LeaderboardStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    activeRoomId: 'r1',
    leaderboard: [],
    reveal: [],
    teams: TEAMS,
    currentUserId: null,
    selfBreakdown: null,
    ...partial,
  };
}

function renderView(s: LeaderboardStore) {
  return render(
    <LeaderboardStoreContext.Provider value={s}>
      <RevealView />
    </LeaderboardStoreContext.Provider>
  );
}

const revealedMatch: RevealedMatch = {
  matchId: 'g-A-1',
  status: 'finished',
  homeTeamId: 'mex',
  awayTeamId: 'kor',
  kickoff: '2026-06-12T18:00:00Z',
  actual: { homeGoals: 2, awayGoals: 1 },
  picks: [
    {
      userId: 'u1',
      displayName: 'Anna',
      predicted: { homeGoals: 2, awayGoals: 1 },
      points: 3,
      pointType: 'exact',
    },
    {
      userId: 'u2',
      displayName: 'Bertil',
      predicted: { homeGoals: 0, awayGoals: 0 },
      points: 0,
      pointType: 'miss',
    },
  ],
};

// T55 (#96): en LÅST men PÅGÅENDE match, allas tips synliga UTAN facit/poäng.
const pendingMatch: RevealedMatch = {
  matchId: 'g-A-1',
  status: 'live',
  homeTeamId: 'mex',
  awayTeamId: 'kor',
  kickoff: '2026-06-12T18:00:00Z',
  actual: null,
  picks: [
    { userId: 'u1', displayName: 'Anna', predicted: { homeGoals: 2, awayGoals: 1 } },
    { userId: 'u2', displayName: 'Bertil', predicted: { homeGoals: 0, awayGoals: 0 } },
  ],
};

describe('RevealView, avslöjande-vyn', () => {
  it('renderar INGET när det inte finns något avgjort att avslöja (tyst)', () => {
    const { container } = renderView(store({ reveal: [] }));
    expect(container.querySelector('[data-reveal-view]')).not.toBeInTheDocument();
  });

  it('renderar INGET innan storen är ready (laddar/utan rum)', () => {
    const { container } = renderView(
      store({ enabled: false, status: 'idle', reveal: [revealedMatch] })
    );
    expect(container.querySelector('[data-reveal-view]')).not.toBeInTheDocument();
  });

  it('visar match-rubrik med lagnamn + facit', () => {
    // En enda render (inte två i samma it), så DOM:en har EN uppsättning noder och
    // assertionerna inte blir spröka mot dubbletter. Båda kollarna scopas till samma träd.
    const { container } = renderView(store({ reveal: [revealedMatch] }));
    expect(screen.getByText('Mexiko mot Sydkorea')).toBeInTheDocument();
    expect(container.querySelector('[data-reveal-actual]')).toHaveTextContent('2-1');
  });

  it('listar allas tips med predikterad ställning + poäng', () => {
    const { container } = renderView(store({ reveal: [revealedMatch] }));
    const picks = container.querySelectorAll('[data-reveal-pick]');
    expect(picks).toHaveLength(2);
    const first = picks[0] as HTMLElement;
    expect(first.getAttribute('data-user-id')).toBe('u1');
    expect(first.getAttribute('data-points')).toBe('3');
    expect(within(first).getByText('Anna')).toBeInTheDocument();
    expect(within(first).getByText('2-1')).toBeInTheDocument();
  });

  it('visar "ingen tippade" när en avgjord match saknar picks', () => {
    const noPicks: RevealedMatch = { ...revealedMatch, picks: [] };
    const { container } = renderView(store({ reveal: [noPicks] }));
    expect(container.querySelector('[data-reveal-no-picks]')).toBeInTheDocument();
  });

  it('okänt lag-id faller tillbaka på "Okänt lag" (ingen krasch)', () => {
    const unknown: RevealedMatch = { ...revealedMatch, homeTeamId: null, awayTeamId: 'xyz' };
    renderView(store({ reveal: [unknown] }));
    expect(screen.getByText('Okänt lag mot xyz')).toBeInTheDocument();
  });
});

describe('RevealView, FÄRG-OBEROENDE facit-markörer (premium-finish)', () => {
  const threePicks: RevealedMatch = {
    ...revealedMatch,
    picks: [
      {
        userId: 'u1',
        displayName: 'Anna',
        predicted: { homeGoals: 2, awayGoals: 1 },
        points: 3,
        pointType: 'exact',
      },
      {
        userId: 'u2',
        displayName: 'Bo',
        predicted: { homeGoals: 3, awayGoals: 1 },
        points: 1,
        pointType: 'outcome',
      },
      {
        userId: 'u3',
        displayName: 'Cia',
        predicted: { homeGoals: 0, awayGoals: 0 },
        points: 0,
        pointType: 'miss',
      },
    ],
  };

  it('speglar pick.pointType i data-outcome (exact/outcome/miss), inte en egen tröskel', () => {
    const { container } = renderView(store({ reveal: [threePicks] }));
    const picks = Array.from(container.querySelectorAll('[data-reveal-pick]'));
    expect(picks.map((p) => p.getAttribute('data-outcome'))).toEqual(['exact', 'outcome', 'miss']);
  });

  it('varje pick bär en markör som skiljer sig i FORM/IKON, inte bara färg', () => {
    const { container } = renderView(store({ reveal: [threePicks] }));
    const marks = Array.from(container.querySelectorAll('.vm-reveal-mark'));
    // Tre olika markör-klasser (form) + tre olika glyfer (ikon) = färg-oberoende.
    expect(marks[0].classList.contains('vm-reveal-mark--exact')).toBe(true);
    expect(marks[1].classList.contains('vm-reveal-mark--outcome')).toBe(true);
    expect(marks[2].classList.contains('vm-reveal-mark--miss')).toBe(true);
    const glyphs = marks.map((m) => m.textContent);
    expect(new Set(glyphs).size).toBe(3); // tre DISTINKTA glyfer
  });

  it('visar VARFÖR i ORD bredvid poängen (T46): orsak + poängtillägg, synligt', () => {
    const { container } = renderView(store({ reveal: [threePicks] }));
    const reasons = Array.from(container.querySelectorAll('[data-reveal-reason]')).map((r) =>
      r.textContent?.replace(/\s+/g, ' ').trim()
    );
    // Orsaken står som ren text (läses även av skärmläsare), med poängtillägget: 0 utan
    // plustecken (ingen vinst), vinster med +. Facit 2-1 (hemmavinst) -> "Rätt vinnare".
    expect(reasons).toEqual(['Exakt resultat +3', 'Rätt vinnare +1', 'Miss 0']);
  });

  // HARD (#69 kryss-noten): på ett OAVGJORT facit får en 1-poängare ALDRIG heta "Rätt
  // vinnare". Detta är just buggen T58 rättar (etiketten var fel, poängen rätt).
  it('rätt utfall på ett OAVGJORT facit visar "Rätt kryss +1", aldrig "Rätt vinnare"', () => {
    const drawMatch: RevealedMatch = {
      ...revealedMatch,
      actual: { homeGoals: 1, awayGoals: 1 }, // facit OAVGJORT
      picks: [
        {
          userId: 'u1',
          displayName: 'Anna',
          predicted: { homeGoals: 0, awayGoals: 0 }, // rätt kryss, ej exakt -> 1p
          points: 1,
          pointType: 'outcome',
        },
      ],
    };
    const { container } = renderView(store({ reveal: [drawMatch] }));
    const reason = container.querySelector('[data-reveal-reason]');
    expect(reason?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Rätt kryss +1');
    expect(container).not.toHaveTextContent('Rätt vinnare');
  });
});

describe('RevealView, PÅGÅR-läget (T55: avslöja vid avspark, inget facit/poäng)', () => {
  it('en pågående match markeras data-reveal-status="live" och visar "Pågår", inget facit-tal', () => {
    const { container } = renderView(store({ reveal: [pendingMatch] }));
    const card = container.querySelector('[data-reveal-match]');
    expect(card?.getAttribute('data-reveal-status')).toBe('live');
    // Inget facit-tal (matchen är inte avgjord), men en synlig "Pågår"-markör.
    expect(container.querySelector('[data-reveal-actual]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-reveal-pending]')).toHaveTextContent('Pågår');
  });

  it('visar allas tips UTAN poäng/utfalls-markör (ärligt pågår, ingen gissad poäng)', () => {
    const { container } = renderView(store({ reveal: [pendingMatch] }));
    const picks = container.querySelectorAll('[data-reveal-pick]');
    expect(picks).toHaveLength(2);
    // Pågående picks bär INGEN poäng-/utfalls-attribut och ingen VARFÖR-etikett.
    for (const pick of Array.from(picks)) {
      expect(pick.getAttribute('data-reveal-live-pick')).not.toBeNull();
      expect(pick.getAttribute('data-points')).toBeNull();
      expect(pick.getAttribute('data-outcome')).toBeNull();
    }
    expect(container.querySelector('[data-reveal-reason]')).not.toBeInTheDocument();
    expect(container.querySelector('.vm-reveal-mark')).not.toBeInTheDocument();
    // Men namn + gissad ställning syns (det är poängen med avslöjandet vid avspark).
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Bertil')).toBeInTheDocument();
  });

  it('en pågående match utan tips visar "ingen tippade", ingen krasch', () => {
    const noPicks: RevealedMatch = { ...pendingMatch, picks: [] };
    const { container } = renderView(store({ reveal: [noPicks] }));
    expect(
      container.querySelector('[data-reveal-status]')?.getAttribute('data-reveal-status')
    ).toBe('live');
    expect(container.querySelector('[data-reveal-no-picks]')).toBeInTheDocument();
  });

  it('blandad lista: en pågående + en färdig match renderas båda, var med rätt status', () => {
    const finished: RevealedMatch = { ...revealedMatch, matchId: 'g-A-2' };
    const { container } = renderView(store({ reveal: [pendingMatch, finished] }));
    const cards = Array.from(container.querySelectorAll('[data-reveal-match]'));
    expect(cards.map((c) => c.getAttribute('data-reveal-status'))).toEqual(['live', 'finished']);
  });
});
