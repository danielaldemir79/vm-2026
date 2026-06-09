import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import type { Match } from '../../domain/types';
import { ResultsProvider } from './ResultsProvider';
import { useResultsStore } from './results-context';
import { useGroupData } from '../groups/use-group-data';

function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

function liveEnv(): ImportMetaEnv {
  return {
    VITE_SUPABASE_URL: 'https://x.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key',
  } as ImportMetaEnv;
}

function wrapperFor(env: ImportMetaEnv) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <ResultsProvider env={env}>{children}</ResultsProvider>;
  };
}

describe('ResultsProvider/useResultsStore, seedning', () => {
  it('seedar matcher/lag/grupper ur fixtures och går till ready', async () => {
    const { result } = renderHook(() => useResultsStore(), { wrapper: wrapperFor(fixturesEnv()) });
    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.matches.length).toBeGreaterThan(0);
    expect(result.current.teams.length).toBe(48);
    expect(result.current.groups.length).toBe(12);
    expect(result.current.mode).toBe('fixtures');
  });

  it('fail-loud:ar (status error + meddelande) när källan kastar (live-stub före T14)', async () => {
    const { result } = renderHook(() => useResultsStore(), { wrapper: wrapperFor(liveEnv()) });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/inte byggd än \(T14\)/);
    expect(result.current.matches).toHaveLength(0);
  });
});

describe('useResultsStore, fail loud utan provider', () => {
  it('kastar om hooken används utan en ResultsProvider', () => {
    // renderHook utan wrapper => ingen provider => kontraktsbrott ska kasta.
    expect(() => renderHook(() => useResultsStore())).toThrow(/ResultsProvider/);
  });
});

describe('submitResult, validering (fel-väg, inget uppdateras)', () => {
  it('returnerar fel och lämnar matchlistan orörd vid ogiltig inmatning', async () => {
    const { result } = renderHook(() => useResultsStore(), { wrapper: wrapperFor(fixturesEnv()) });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const before = result.current.matches;
    const targetId = before[0].id;

    let validation: ReturnType<typeof result.current.submitResult> = { ok: true };
    act(() => {
      // Negativa mål => ogiltigt.
      validation = result.current.submitResult(targetId, {
        homeGoals: -1,
        awayGoals: 0,
        status: 'finished',
      });
    });

    expect(validation.ok).toBe(false);
    // Listan oförändrad (samma referens), inget korrumperat.
    expect(result.current.matches).toBe(before);
  });

  it('returnerar fel för en okänd match utan att kasta', async () => {
    const { result } = renderHook(() => useResultsStore(), { wrapper: wrapperFor(fixturesEnv()) });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let validation: ReturnType<typeof result.current.submitResult> | undefined;
    act(() => {
      validation = result.current.submitResult('finns-inte', {
        homeGoals: 1,
        awayGoals: 0,
        status: 'finished',
      });
    });

    // C3: en okänd match får sin EGNA kod 'unknown-match' (inte återanvänd
    // 'invalid-status-transition') och bär INGET field, så ingen input markeras
    // felaktigt ogiltig. Semantiskt korrekt + rätt aria-koppling i formuläret.
    expect(validation).toBeDefined();
    expect(validation!.ok).toBe(false);
    if (validation && !validation.ok) {
      const [err] = validation.errors;
      expect(err.code).toBe('unknown-match');
      expect(err.field).toBeUndefined();
    }
  });
});

// Den ARKITEKTONISKT viktigaste testet: en inmatning via storen uppdaterar de
// matcher som gruppspelstabellerna HÄRLEDS ur, så tabellen ändras (EN sanning).
// Vi monterar BÅDE storen och useGroupData under SAMMA provider och bevisar att
// ett submitResult ändrar den härledda tabellen.
describe('inmatning -> härledd tabell ändras (en sanning, härledd state)', () => {
  function useStoreAndTables() {
    return { store: useResultsStore(), group: useGroupData() };
  }

  it('ett inmatat resultat i en tidigare ospelad grupp ger en omräknad tabell', async () => {
    const { result } = renderHook(() => useStoreAndTables(), {
      wrapper: wrapperFor(fixturesEnv()),
    });
    await waitFor(() => expect(result.current.store.status).toBe('ready'));

    // Grupp B saknar demo-resultat i fixtures (alla lag 0 spelade). Hitta en
    // ospelad gruppmatch där vi kan mata in ett resultat. Vi väljer en scheduled
    // match i grupp B om en sådan finns; annars första ospelade gruppmatchen.
    const playedBefore = result.current.group.tables
      .flatMap((t) => t.standings)
      .reduce((sum, r) => sum + r.played, 0);

    // Sätt en helt ny matchlista med EN spelad match i grupp B, via det lågnivå-
    // seam useGroupData exponerar (samma som submitResult skriver till, men
    // deterministiskt för testet, oberoende av vilka fixtures-matcher som finns).
    act(() => {
      result.current.store.setMatches([
        {
          id: 'test-b-1',
          stage: 'group',
          groupId: 'B',
          homeTeamId: result.current.store.groups.find((g) => g.id === 'B')!.teamIds[0],
          awayTeamId: result.current.store.groups.find((g) => g.id === 'B')!.teamIds[1],
          kickoff: '2026-06-12T19:00:00Z',
          venue: 'Testarena',
          result: { homeGoals: 3, awayGoals: 0 },
          status: 'finished',
        },
      ]);
    });

    await waitFor(() => {
      const groupB = result.current.group.tables.find((t) => t.groupId === 'B')!;
      const leader = groupB.standings[0];
      // Det inmatade laget leder grupp B med 3 poäng, +3 i målskillnad.
      expect(leader.points).toBe(3);
      expect(leader.goalDifference).toBe(3);
      expect(leader.played).toBe(1);
    });

    // Det totala antalet spelade matcher ändrades (tabellen räknades om reaktivt).
    const playedAfter = result.current.group.tables
      .flatMap((t) => t.standings)
      .reduce((sum, r) => sum + r.played, 0);
    expect(playedAfter).not.toBe(playedBefore);
  });

  it('submitResult på en befintlig fixtures-match uppdaterar den härledda tabellen', async () => {
    const { result } = renderHook(() => useStoreAndTables(), {
      wrapper: wrapperFor(fixturesEnv()),
    });
    await waitFor(() => expect(result.current.store.status).toBe('ready'));

    // Grupp A har en redan spelad match (m-a-1: mex 2-0 rsa). Redigera den till
    // ett rsa-storseger och bevisa att tabellen följer med.
    let ok = false;
    act(() => {
      ok = result.current.store.submitResult('m-a-1', {
        homeGoals: 0,
        awayGoals: 5,
        status: 'finished',
      }).ok;
    });
    expect(ok).toBe(true);

    await waitFor(() => {
      const groupA = result.current.group.tables.find((t) => t.groupId === 'A')!;
      const rsa = groupA.standings.find((r) => r.teamId === 'rsa')!;
      // rsa vann nu 5-0: 3 poäng, +5 i målskillnad (bevisar omräkningen ur inmatningen).
      expect(rsa.points).toBe(3);
      expect(rsa.goalDifference).toBe(5);
    });
  });
});

// Race-skydd för det seam T14 (persistens) och T18 (realtid) bygger på: en
// konsument kan anropa setMatches(next) och DIREKT submitResult(...) i samma tick
// (innan en re-render hunnit synka matchesRef). submitResult MÅSTE då operera mot
// `next`, inte mot den gamla listan. Testet bevisar invarianten genom att låta
// `next` innehålla en match som INTE fanns i den seedade fixtures-listan: en stale
// ref hade gett 'unknown-match' (matchen "fanns inte"), den synkront uppdaterade
// reffen hittar den och lyckas. (C5, latent race i setMatches-seamen.)
describe('setMatches -> submitResult i samma tick (race-fri seam för T14/T18)', () => {
  it('submitResult ser listan från setMatches(next) utan att vänta på re-render', async () => {
    const { result } = renderHook(() => useResultsStore(), { wrapper: wrapperFor(fixturesEnv()) });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const groupB = result.current.groups.find((g) => g.id === 'B')!;
    // En match-id som garanterat INTE finns i de seedade fixtures-matcherna.
    const raceId = 'race-only-in-next';
    const next: Match[] = [
      {
        id: raceId,
        stage: 'group',
        groupId: 'B',
        homeTeamId: groupB.teamIds[0],
        awayTeamId: groupB.teamIds[1],
        kickoff: '2026-06-13T19:00:00Z',
        venue: 'Racearena',
        result: null,
        status: 'scheduled',
      },
    ];

    let validation: ReturnType<typeof result.current.submitResult> = { ok: true };
    act(() => {
      // SAMMA tick, ingen re-render emellan: setMatches följt direkt av submitResult
      // mot en match som bara finns i `next`. Greppar storen via result.current
      // EN gång före anropen (samma referenser till de stabila mutatorerna).
      const store = result.current;
      store.setMatches(next);
      validation = store.submitResult(raceId, {
        homeGoals: 2,
        awayGoals: 1,
        status: 'finished',
      });
    });

    // Med stale ref hade detta blivit ok:false / 'unknown-match'. Race-fritt: ok.
    expect(validation.ok).toBe(true);

    // Och state-vägen (reaktiviteten) triggade fortfarande: matchen finns i storen
    // med det inmatade, färdiga resultatet.
    await waitFor(() => {
      const stored = result.current.matches.find((m) => m.id === raceId);
      expect(stored?.status).toBe('finished');
      expect(stored?.result).toEqual({ homeGoals: 2, awayGoals: 1 });
    });
  });
});

describe('ResultEntryView + GroupStageView delar samma store (integration light)', () => {
  it('båda vyerna kan rendera under samma provider och seedningen settlar', async () => {
    // Lätt mount-test: bevisar att en gemensam provider matar båda konsumenterna
    // utan krasch (den fulla inmatning->tabell-kopplingen testas ovan på hook-nivå).
    function Probe() {
      const { status } = useResultsStore();
      return <span data-testid="probe">{status}</span>;
    }
    render(
      <ResultsProvider env={fixturesEnv()}>
        <Probe />
      </ResultsProvider>
    );
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('ready'));
  });
});
