import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useGroupData } from './use-group-data';
import type { Match } from '../../domain/types';

function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

function liveEnv(): ImportMetaEnv {
  return {
    VITE_SUPABASE_URL: 'https://x.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key',
  } as ImportMetaEnv;
}

// En färdigspelad gruppmatch (kort, typkorrekt).
function fin(
  id: string,
  groupId: Match['groupId'],
  home: string,
  away: string,
  hg: number,
  ag: number
): Match {
  return {
    id,
    stage: 'group',
    groupId,
    homeTeamId: home,
    awayTeamId: away,
    kickoff: '2026-06-12T19:00:00Z',
    venue: 'Testarena',
    result: { homeGoals: hg, awayGoals: ag },
    status: 'finished',
  };
}

describe('useGroupData, laddning och härledning', () => {
  it('går från loading till ready och härleder 12 tabeller ur fixtures', async () => {
    // En STABIL env-referens per test: useGroupData har useEffect(..., [env]),
    // så ett inline-objekt i renderHook-callbacken skulle ge en ny referens vid
    // varje render och kunna trigga om effekten/laddningen (flaky). Skapa en gång.
    const env = fixturesEnv();
    const { result } = renderHook(() => useGroupData(env));

    // Initialt laddande, och kontraktet: tables är tomt tills status === 'ready'.
    expect(result.current.status).toBe('loading');
    expect(result.current.tables).toHaveLength(0);

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(result.current.tables).toHaveLength(12);
    expect(result.current.teams.length).toBe(48);
    expect(result.current.mode).toBe('fixtures');
    expect(result.current.error).toBeNull();
  });
});

describe('useGroupData, LIVE: tabellen räknas om reaktivt när matcherna i state ändras', () => {
  it('en ny matchlista via setMatches ger en omräknad tabell (härledd state)', async () => {
    const env = fixturesEnv(); // stabil referens (se kommentar i första testet)
    const { result } = renderHook(() => useGroupData(env));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // Innan: läs grupp A-tabellen och ettans poäng ur fixtures-resultaten.
    const groupABefore = result.current.tables.find((t) => t.groupId === 'A');
    expect(groupABefore).toBeDefined();
    const leaderBefore = groupABefore!.standings[0];

    // "Live"-händelse (det T6:s inmatning kommer trigga): sätt ett nytt resultat
    // i grupp A där ett av lagen vinner stort. Tabellen ska räknas om automatiskt.
    act(() => {
      result.current.setMatches([fin('m-new', 'A', 'kor', 'cze', 5, 0)]);
    });

    await waitFor(() => {
      const groupAAfter = result.current.tables.find((t) => t.groupId === 'A');
      expect(groupAAfter).toBeDefined();
      const leaderAfter = groupAAfter!.standings[0];

      // Nu leder kor (5-0) grupp A med 3 poäng och +5 i målskillnad, en annan
      // tabell än innan: härledningen reagerade på state-ändringen (inte cachad).
      expect(leaderAfter.teamId).toBe('kor');
      expect(leaderAfter.points).toBe(3);
      expect(leaderAfter.goalDifference).toBe(5);
      // Det är faktiskt en annan ledare/ställning än före (bevisar omräkningen).
      expect(leaderAfter).not.toEqual(leaderBefore);
    });
  });

  it('tömd matchlista ger nollställda tabeller (alla lag 0 spelade)', async () => {
    const env = fixturesEnv(); // stabil referens (se kommentar i första testet)
    const { result } = renderHook(() => useGroupData(env));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.setMatches([]);
    });

    await waitFor(() => {
      // Fortfarande 12 grupper, men nu utan spelade matcher.
      expect(result.current.tables).toHaveLength(12);
      const allPlayed = result.current.tables.flatMap((t) => t.standings).map((r) => r.played);
      expect(allPlayed.every((p) => p === 0)).toBe(true);
    });
  });
});

describe('useGroupData, fel-väg (fail loud)', () => {
  it('hamnar i error med ett meddelande när datakällan kastar (live-stub före T14)', async () => {
    const env = liveEnv(); // stabil referens (se kommentar i första testet)
    const { result } = renderHook(() => useGroupData(env));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.error).toMatch(/inte byggd än \(T14\)/);
    // Kontraktet: tables är tomt när status === 'error', ingen stale data läcker.
    expect(result.current.tables).toHaveLength(0);
  });
});

describe('useGroupData, kontrakt: tables är tomt utom vid ready (ingen stale data)', () => {
  it('vid env-byte från ready till en felande källa läcker INTE de gamla tabellerna', async () => {
    // Ladda fixtures till ready: nu finns 12 fyllda tabeller i state.
    const fixtures = fixturesEnv();
    const live = liveEnv();
    const { result, rerender } = renderHook(({ env }) => useGroupData(env), {
      initialProps: { env: fixtures },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.tables).toHaveLength(12); // gammal data ligger nu i state

    // Byt env -> ny laddning startar (live-stubben kastar före T14). Kontraktet
    // säger att tables ska vara [] så fort status !== 'ready', annars skulle de
    // gamla fixtures-tabellerna läcka in i loading/error-läget (C8, kontraktsbrott).
    rerender({ env: live });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.tables).toHaveLength(0);
    expect(result.current.tables).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ groupId: 'A' })])
    );
  });
});
