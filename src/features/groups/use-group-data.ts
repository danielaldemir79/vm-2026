// React-hook som matar gruppspelsvyn med data och gör tabellerna LIVE.
//
// Ansvar (tunt, en sak): ladda lag/grupper/matcher EN gång via datakällan
// (getDataSource, fixtures-först-seamen), hålla matcherna i React-state, och
// HÄRLEDA grupptabellerna (deriveGroupTables) reaktivt. "Live" = när matcherna i
// state ändras (en resultatinmatning i T6 anropar setMatches) räknas tabellerna
// om automatiskt via useMemo, ingen tabell lagras dubbelt. Själva inmatnings-
// UI:t är T6, hooken exponerar bara setMatches-seamen så T6 kan koppla in sig.
//
// VARFÖR matcher i state men tabeller härledda: matchresultaten är den enda
// sanningen (SPEC §6). Tabellen är en ren funktion av dem, så att lagra tabellen
// vore dubbellagring som kan driva isär. useMemo gör om-beräkningen reaktiv utan
// en extra state-kopia. teams/groups hålls också i state men ändras inte under
// turneringen, de laddas en gång.

import { useEffect, useMemo, useState } from 'react';
import type { DataSourceMode } from '../../data';
import { getDataSource, getDataSourceMode } from '../../data';
import type { Group, GroupTable, Match, Team } from '../../domain/types';
import { deriveGroupTables } from './derive-group-tables';

/** Laddningstillstånd för en async datahämtning, explicit (inte bara "data | null"). */
export type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * Det hooken exponerar till gruppspelsvyn. Vid 'ready' bär den härledda
 * tabeller + lagen (för namn/koder i UI:t); vid 'error' ett begripligt
 * felmeddelande (fail loud, inte en tyst tom vy).
 */
export interface GroupData {
  status: LoadStatus;
  /** Härledda grupptabeller (A-L), tomt tills status === 'ready'. */
  tables: GroupTable[];
  /** Lagen, för att slå upp namn/landskod per teamId i vyn. */
  teams: Team[];
  /** Vilken datakälla som är aktiv, så vyn kan visa ett "demo-data"-märke. */
  mode: DataSourceMode;
  /** Felmeddelande vid status === 'error', annars null. */
  error: string | null;
  /**
   * Ersätt matchlistan (T6:s resultatinmatning kopplar in sig här). Att sätta
   * nya matcher räknar om tabellerna reaktivt via useMemo. Exponeras redan nu så
   * "live"-seamen finns och är testbar innan inmatnings-UI:t byggs.
   */
  setMatches: (matches: Match[]) => void;
}

/**
 * Ladda gruppspelsdata och härled live-tabeller.
 *
 * @param env  import.meta.env injiceras för testbarhet (samma mönster som
 *             getDataSource), default = den riktiga miljön.
 */
export function useGroupData(env: ImportMetaEnv = import.meta.env): GroupData {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [groups, setGroups] = useState<Group[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Vilket läge (fixtures/live) som är aktivt beror bara på env, härled en gång.
  const mode = useMemo(() => getDataSourceMode(env), [env]);

  useEffect(() => {
    // En avbryt-flagga så att om komponenten unmountas (eller env byter) innan
    // hämtningen är klar, sätter vi inte state på en avmonterad komponent.
    let cancelled = false;
    const dataSource = getDataSource(env);

    setStatus('loading');
    setError(null);

    Promise.all([dataSource.getGroups(), dataSource.getTeams(), dataSource.getMatches()])
      .then(([loadedGroups, loadedTeams, loadedMatches]) => {
        if (cancelled) {
          return;
        }
        setGroups(loadedGroups);
        setTeams(loadedTeams);
        setMatches(loadedMatches);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        // Fail loud (PRINCIPLES §8): visa felet, maskera det inte som tom vy.
        // Vanligast i live-läge innan T14 (stubben kastar med avsikt).
        setError(err instanceof Error ? err.message : 'Kunde inte ladda gruppspelsdata.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [env]);

  // Härled tabellerna reaktivt: räknas om bara när grupper eller matcher ändras.
  // Det är "live"-mekaniken, en setMatches (T6) triggar en ny härledning.
  const tables = useMemo(() => deriveGroupTables(groups, matches), [groups, matches]);

  return { status, tables, teams, mode, error, setMatches };
}
