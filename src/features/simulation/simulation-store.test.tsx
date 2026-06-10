import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import type { Match } from '../../domain/types';
import { ResultsProvider } from '../results/ResultsProvider';
import { useResultsStore } from '../results/results-context';
import { useGroupData } from '../groups/use-group-data';
import { useBracketData } from '../bracket/use-bracket-data';

// What-if-simulatorns STORE-seam (T12). Bevisar:
//  - ISOLERING: hypotetiska resultat ändrar ALDRIG den riktiga datan; efter
//    avsluta/återställ är de riktiga resultaten orörda.
//  - BLANDA-fallet: riktigt resultat + hypotetiskt overlay samtidigt.
//  - TOGGLE/RESET: enter/exit/reset gör rätt och är idempotenta.
//  - VALIDERING: hypotetiska resultat går genom samma validate-result (T9).
//  - HÄRLEDDA VYER reagerar: tabell OCH slutspelsträd ändras av overlayn.

function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

function wrapper({ children }: { children: ReactNode }) {
  return <ResultsProvider env={fixturesEnv()}>{children}</ResultsProvider>;
}

/** En finished-inmatning (helper för läsbara submit-anrop). */
function finishedEntry(h: number, a: number) {
  return { homeGoals: h, awayGoals: a, status: 'finished' as const };
}

/** Två lag-id i grupp A (för deterministiska gruppmatch-konstruktioner). */
function groupATeams(store: ReturnType<typeof useResultsStore>): [string, string] {
  const a = store.groups.find((g) => g.id === 'A')!;
  return [a.teamIds[0], a.teamIds[1]];
}

describe('Simulering, toggle + idempotens', () => {
  it('startar AV; enterSimulation slår på, exitSimulation av', async () => {
    const { result } = renderHook(() => useResultsStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.simulating).toBe(false);

    act(() => result.current.enterSimulation());
    expect(result.current.simulating).toBe(true);

    // Idempotent: enter igen ändrar inget.
    act(() => result.current.enterSimulation());
    expect(result.current.simulating).toBe(true);

    act(() => result.current.exitSimulation());
    expect(result.current.simulating).toBe(false);

    // Idempotent: exit igen ändrar inget.
    act(() => result.current.exitSimulation());
    expect(result.current.simulating).toBe(false);
  });

  it('enterSimulation lägger ett TOMT overlay (effektiva = riktiga matcher)', async () => {
    const { result } = renderHook(() => useResultsStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const realBefore = result.current.matches;
    act(() => result.current.enterSimulation());

    // Inga hypotetiska resultat än => effektiva matcher är värde-lika med riktiga.
    expect(result.current.matches).toEqual(realBefore);
  });

  // Copilot C2: enterSimulation är dokumenterat idempotent men tömde förr ALLTID
  // overlayn, så ett dubbel-enter raderade redan inmatade hypotetiska resultat.
  it('C2: dubbel-enter BEVARAR overlayn (raderar inte de hypotetiska resultaten)', async () => {
    const { result } = renderHook(() => useResultsStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const targetId = result.current.matches.find((m) => m.status === 'scheduled')!.id;

    act(() => result.current.enterSimulation());
    act(() => {
      const v = result.current.submitResult(targetId, finishedEntry(3, 1));
      expect(v.ok).toBe(true);
    });
    // Hypotetiskt resultat ligger i overlayn (effektivt finished 3-1).
    expect(result.current.matches.find((m) => m.id === targetId)!.result).toEqual({
      homeGoals: 3,
      awayGoals: 1,
    });

    // Andra enterSimulation (t.ex. dubbelklickad knapp): overlayn ska INTE tömmas.
    act(() => result.current.enterSimulation());
    expect(result.current.simulating).toBe(true);
    expect(result.current.matches.find((m) => m.id === targetId)!.result).toEqual({
      homeGoals: 3,
      awayGoals: 1,
    });
  });

  // Copilot C3: exitSimulation skapade förr ALLTID en ny Map + state-set, så ett
  // dubbel-exit (redan av + tom overlay) tvingade en onödig re-render. Guarden
  // gör det till en no-op => store-referensen är stabil (ingen re-render).
  it('C3: dubbel-exit är en no-op (ingen onödig re-render, stabil store-referens)', async () => {
    let renderCount = 0;
    const { result } = renderHook(
      () => {
        renderCount += 1;
        return useResultsStore();
      },
      { wrapper }
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // Första exit (redan av + tom overlay från start): ska INTE byta state.
    const storeBefore = result.current;
    const rendersBefore = renderCount;
    act(() => result.current.exitSimulation());

    // Ingen state-ändring => samma store-objekt (memo räknas inte om) och ingen
    // ny render triggad av exit-anropet.
    expect(result.current).toBe(storeBefore);
    expect(result.current.simulating).toBe(false);
    expect(renderCount).toBe(rendersBefore);
  });
});

describe('Simulering, ISOLERING (riktig data orörd)', () => {
  it('ett hypotetiskt resultat ändrar inte den riktiga matchen', async () => {
    const { result } = renderHook(() => useResultsStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const targetId = result.current.matches.find((m) => m.status === 'scheduled')!.id;
    const realTargetBefore = result.current.matches.find((m) => m.id === targetId)!;
    expect(realTargetBefore.status).toBe('scheduled');

    act(() => result.current.enterSimulation());
    act(() => {
      const v = result.current.submitResult(targetId, finishedEntry(4, 1));
      expect(v.ok).toBe(true);
    });

    // Effektivt (sim): matchen är nu hypotetiskt finished 4-1.
    const effTarget = result.current.matches.find((m) => m.id === targetId)!;
    expect(effTarget.status).toBe('finished');
    expect(effTarget.result).toEqual({ homeGoals: 4, awayGoals: 1 });

    // Avsluta sim => den RIKTIGA matchen är fortfarande scheduled utan resultat.
    act(() => result.current.exitSimulation());
    const realTargetAfter = result.current.matches.find((m) => m.id === targetId)!;
    expect(realTargetAfter.status).toBe('scheduled');
    expect(realTargetAfter.result).toBeNull();
  });

  it('resetSimulation tömmer overlayn men STANNAR i sim-läge', async () => {
    const { result } = renderHook(() => useResultsStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const targetId = result.current.matches.find((m) => m.status === 'scheduled')!.id;
    act(() => result.current.enterSimulation());
    act(() => result.current.submitResult(targetId, finishedEntry(2, 2)));
    expect(result.current.matches.find((m) => m.id === targetId)!.status).toBe('finished');

    act(() => result.current.resetSimulation());

    // Fortfarande i sim-läge, men overlayn är tom => matchen är scheduled igen.
    expect(result.current.simulating).toBe(true);
    expect(result.current.matches.find((m) => m.id === targetId)!.status).toBe('scheduled');
  });
});

describe('Simulering, BLANDA-fallet (riktig + hypotetisk samtidigt)', () => {
  it('en riktig match behåller sitt riktiga resultat medan en annan får hypotetiskt', async () => {
    const { result } = renderHook(() => useResultsStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const [t1, t2] = groupATeams(result.current);

    // 1) Skriv ett RIKTIGT resultat (sim AV) för en konstruerad grupp A-match m-real.
    act(() => {
      const others = result.current.matches.filter((m) => m.id !== 'm-real');
      result.current.setMatches([
        ...others,
        {
          id: 'm-real',
          stage: 'group',
          groupId: 'A',
          homeTeamId: t1,
          awayTeamId: t2,
          kickoff: '2026-06-12T19:00:00Z',
          venue: 'Testarena',
          status: 'finished',
          result: { homeGoals: 1, awayGoals: 0 },
        } satisfies Match,
      ]);
    });
    expect(result.current.simulating).toBe(false);
    const realMReal = result.current.matches.find((m) => m.id === 'm-real')!;
    expect(realMReal.result).toEqual({ homeGoals: 1, awayGoals: 0 });

    // 2) Gå in i sim-läge och mata in ett HYPOTETISKT resultat för en ANNAN match.
    const otherSched = result.current.matches.find(
      (m) => m.id !== 'm-real' && m.status === 'scheduled'
    )!;
    act(() => result.current.enterSimulation());
    act(() => result.current.submitResult(otherSched.id, finishedEntry(5, 0)));

    // Effektivt: m-real behåller riktigt 1-0, den andra är hypotetiskt 5-0.
    expect(result.current.matches.find((m) => m.id === 'm-real')!.result).toEqual({
      homeGoals: 1,
      awayGoals: 0,
    });
    expect(result.current.matches.find((m) => m.id === otherSched.id)!.result).toEqual({
      homeGoals: 5,
      awayGoals: 0,
    });

    // 3) Avsluta sim: m-real KVAR (riktig data), den andra tillbaka till scheduled.
    act(() => result.current.exitSimulation());
    expect(result.current.matches.find((m) => m.id === 'm-real')!.result).toEqual({
      homeGoals: 1,
      awayGoals: 0,
    });
    expect(result.current.matches.find((m) => m.id === otherSched.id)!.status).toBe('scheduled');
  });

  it('overlay har företräde för en match som ÄVEN har ett riktigt resultat (tills reset)', async () => {
    const { result } = renderHook(() => useResultsStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const [t1, t2] = groupATeams(result.current);

    // Riktigt resultat 1-0 på m-x (sim AV).
    act(() => {
      const others = result.current.matches.filter((m) => m.id !== 'm-x');
      result.current.setMatches([
        ...others,
        {
          id: 'm-x',
          stage: 'group',
          groupId: 'A',
          homeTeamId: t1,
          awayTeamId: t2,
          kickoff: '2026-06-12T19:00:00Z',
          venue: 'Testarena',
          status: 'finished',
          result: { homeGoals: 1, awayGoals: 0 },
        } satisfies Match,
      ]);
    });

    // Sim: skriv om SAMMA match hypotetiskt till 0-3.
    act(() => result.current.enterSimulation());
    act(() => result.current.submitResult('m-x', finishedEntry(0, 3)));
    expect(result.current.matches.find((m) => m.id === 'm-x')!.result).toEqual({
      homeGoals: 0,
      awayGoals: 3,
    });

    // Reset => overlay tom => det RIKTIGA 1-0 syns igen (riktig data var orörd).
    act(() => result.current.resetSimulation());
    expect(result.current.matches.find((m) => m.id === 'm-x')!.result).toEqual({
      homeGoals: 1,
      awayGoals: 0,
    });
  });
});

describe('Simulering, validering gäller hypotetiska resultat (T9-grind)', () => {
  it('ett ogiltigt hypotetiskt resultat avvisas och overlayn lämnas orörd', async () => {
    const { result } = renderHook(() => useResultsStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const targetId = result.current.matches.find((m) => m.status === 'scheduled')!.id;
    act(() => result.current.enterSimulation());

    let validation: ReturnType<typeof result.current.submitResult> = { ok: true };
    act(() => {
      validation = result.current.submitResult(targetId, {
        homeGoals: -1, // negativt = ogiltigt
        awayGoals: 0,
        status: 'finished',
      });
    });

    expect(validation.ok).toBe(false);
    // Overlayn fick ingen post => matchen är fortfarande scheduled effektivt.
    expect(result.current.matches.find((m) => m.id === targetId)!.status).toBe('scheduled');
  });

  it('en hypotetisk slutspelsmatch som slutar lika KRÄVER straffar (FIFA Art. 14)', async () => {
    const { result } = renderHook(() => useResultsStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const [t1, t2] = groupATeams(result.current);

    // Konstruera en HYPOTETISK slutspelsmatch (round-of-32) med kända lag, lägg in
    // den via det riktiga seamen FÖRST (sim av) så den finns att simulera mot.
    act(() => {
      const others = result.current.matches.filter((m) => m.id !== 'm-ko');
      result.current.setMatches([
        ...others,
        {
          id: 'm-ko',
          stage: 'round-of-32',
          groupId: null,
          homeTeamId: t1,
          awayTeamId: t2,
          kickoff: '2026-06-30T19:00:00Z',
          venue: 'Testarena',
          status: 'scheduled',
          result: null,
        } satisfies Match,
      ]);
    });

    act(() => result.current.enterSimulation());

    // Lika ordinarie ställning UTAN straffar => ogiltigt (samma validate-result, T9).
    let tie: ReturnType<typeof result.current.submitResult> | undefined;
    act(() => {
      tie = result.current.submitResult('m-ko', finishedEntry(1, 1));
    });
    expect(tie).toBeDefined();
    expect(tie!.ok).toBe(false);
    if (tie && !tie.ok) {
      expect(tie.errors.some((e) => e.code === 'knockout-tie-needs-penalties')).toBe(true);
    }

    // MED straffar => giltigt hypotetiskt slutspelsresultat.
    let withPk: ReturnType<typeof result.current.submitResult> | undefined;
    act(() => {
      withPk = result.current.submitResult('m-ko', {
        homeGoals: 1,
        awayGoals: 1,
        status: 'finished',
        penalties: { homeGoals: 4, awayGoals: 3 },
      });
    });
    expect(withPk).toBeDefined();
    expect(withPk!.ok).toBe(true);
    const eff = result.current.matches.find((m) => m.id === 'm-ko')!;
    expect(eff.result).toEqual({
      homeGoals: 1,
      awayGoals: 1,
      penalties: { homeGoals: 4, awayGoals: 3 },
    });
  });
});

// Den arkitektoniskt viktigaste delen: härledda vyer (tabell OCH slutspelsträd)
// reagerar på overlayn UTAN egen sim-kännedom, och faller tillbaka vid reset.
describe('Simulering, härledda vyer reagerar på overlayn (tabell + träd)', () => {
  function useStoreTableTree() {
    return { store: useResultsStore(), group: useGroupData(), bracket: useBracketData() };
  }

  it('en hypotetisk gruppmatch ändrar den härledda grupptabellen, reset återställer', async () => {
    const { result } = renderHook(() => useStoreTableTree(), { wrapper });
    await waitFor(() => expect(result.current.store.status).toBe('ready'));

    const playedBefore = result.current.group.tables
      .find((tt) => tt.groupId === 'A')!
      .standings.reduce((s, r) => s + r.played, 0);

    // Hitta en RIKTIG ospelad grupp A-match (overlayn överrider en EXISTERANDE
    // match, den uppfinner ingen ny fixtur, decisions.md T12 + fail-loud-vakten).
    const groupAMatch = result.current.store.matches.find(
      (m) => m.stage === 'group' && m.groupId === 'A' && m.status === 'scheduled'
    )!;
    expect(groupAMatch).toBeDefined();

    act(() => result.current.store.enterSimulation());
    // Hypotetiskt: spela den existerande A-matchen 2-0 via submitResult (sim på
    // => overlay). Riktig data orörd, tabellen härleds ur de effektiva matcherna.
    act(() => {
      const v = result.current.store.submitResult(groupAMatch.id, finishedEntry(2, 0));
      expect(v.ok).toBe(true);
    });

    const playedSim = result.current.group.tables
      .find((tt) => tt.groupId === 'A')!
      .standings.reduce((s, r) => s + r.played, 0);
    expect(playedSim).toBe(playedBefore + 2); // hemma + borta = 2 nya spelade

    // Reset => tabellen återgår (overlayn tömd, riktig data orörd).
    act(() => result.current.store.resetSimulation());
    const playedAfter = result.current.group.tables
      .find((tt) => tt.groupId === 'A')!
      .standings.reduce((s, r) => s + r.played, 0);
    expect(playedAfter).toBe(playedBefore);
  });

  it('ett hypotetiskt komplett gruppspel LÅSER slutspelsträdet (seedning), exit släpper låset', async () => {
    const { result } = renderHook(() => useStoreTableTree(), { wrapper });
    await waitFor(() => expect(result.current.store.status).toBe('ready'));

    // Trädet är inte låst innan något spelats (alla fixtures-matcher scheduled).
    expect(result.current.bracket.bracket?.locked).toBe(false);

    // Bygg ett HYPOTETISKT komplett gruppspel: varje gruppmatch finished 1-0.
    // (Slutspelsmatcherna lämnas orörda.) Detta sker via overlayn i sim-läge, så
    // den riktiga datan aldrig ändras.
    act(() => result.current.store.enterSimulation());
    act(() => {
      const next: Match[] = result.current.store.matches.map((m) =>
        m.stage === 'group' && m.homeTeamId && m.awayTeamId
          ? ({
              ...m,
              status: 'finished',
              result: { homeGoals: 1, awayGoals: 0 },
            } satisfies Match)
          : m
      );
      result.current.store.setMatches(next);
    });

    // Med ett komplett (hypotetiskt) gruppspel ska trädet låsas (FIFA-seedningen).
    expect(result.current.bracket.bracket?.locked).toBe(true);

    // Avsluta sim => den riktiga datan (allt scheduled) tillbaka => trädet olåst.
    act(() => result.current.store.exitSimulation());
    expect(result.current.bracket.bracket?.locked).toBe(false);
  });
});
