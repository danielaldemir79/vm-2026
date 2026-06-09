// Provider för den delade results-storen.
//
// Ansvar (tunt, en sak): SEEDA matcher/lag/grupper EN gång via datakällan
// (getDataSource, fixtures-först-seamen), hålla dem i React-state, och exponera
// den enda sanningen + mutatorer till hela trädet via ResultsStoreContext.
// Detta är staten som FÖRR låg lokalt i useGroupData, nu LYFT så att både
// gruppspelsvyn och resultatinmatnings-UI:t läser/skriver samma matcher.
//
// Seedning + fel-väg är medvetet identisk med T5:s tidigare hook-logik (fail
// loud vid fel, cancelled-flagga mot state-set efter unmount), bara flyttad upp
// en nivå. T14 (persistens) byter ut mutatorernas implementation (skriv till
// Supabase) och T18 (realtid) prenumererar och anropar setMatches, allt på
// detta seam, utan att röra konsumenterna.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getDataSource, getDataSourceMode } from '../../data';
import type { Group, Match, Team } from '../../domain/types';
import { applyMatchResult } from './apply-match-result';
import { ResultsStoreContext, type ResultsLoadStatus, type ResultsStore } from './results-context';
import { validateResultEntry, type ResultEntry, type ResultValidation } from './validate-result';

export interface ResultsProviderProps {
  children: ReactNode;
  /**
   * Injicerbar miljö (testbarhet), default = den riktiga via import.meta.env.
   * Samma mönster som getDataSource/useGroupData: gör datakälle-läget testbart
   * utan att mocka import.meta globalt.
   */
  env?: ImportMetaEnv;
}

export function ResultsProvider({ children, env = import.meta.env }: ResultsProviderProps) {
  const [status, setStatus] = useState<ResultsLoadStatus>('loading');
  const [groups, setGroups] = useState<Group[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  // Råa state-settern hålls intern (setMatchesState). Den EXPONERADE settern
  // (setMatches nedan) wrappar den så reffen aldrig blir stale, se där.
  const [matches, setMatchesState] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Läget (fixtures/live) beror bara på env, härled en gång.
  const mode = useMemo(() => getDataSourceMode(env), [env]);

  // En ref med den senaste matchlistan, så submitResult kan validera mot
  // matchens NUVARANDE status utan att (a) binda mot en stale closure och (b)
  // göra validering till en sido-effekt INNE i en state-uppdaterare (det är
  // inte garanterat synkront och ett anti-mönster). INVARIANT: matchesRef.current
  // ska aldrig vara stale efter ett skriv-anrop, därför uppdaterar VARJE väg som
  // ändrar matchlistan (setMatches nedan + submitResult) reffen SYNKRONT, inte
  // via en eftersläpande effekt.
  const matchesRef = useRef(matches);

  // Den EXPONERADE matchlist-settern (T18:s realtid och tester använder den som
  // lågnivå-seam). Den wrappar den råa state-settern och uppdaterar matchesRef
  // SYNKRONT, så ett setMatches(next) följt direkt av submitResult(...) i samma
  // tick (innan re-render/effekt hunnit synka reffen) opererar mot `next`, inte
  // mot den gamla listan. Utan den synkrona ref-uppdateringen vore detta en
  // latent race i det seam T14 (persistens) och T18 (realtid) bygger på.
  // setMatchesState är fortfarande den enda källan till React-state-ändringen,
  // så den reaktiva härledningen (useMemo över `matches`) triggar som vanligt.
  const setMatches = useCallback((next: Match[]) => {
    matchesRef.current = next;
    setMatchesState(next);
  }, []);

  useEffect(() => {
    // Avbryt-flagga: om providern unmountas (eller env byter) innan hämtningen
    // är klar sätter vi inte state på en avmonterad komponent.
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
        // Seedning går via den wrappade settern så reffen är i synk direkt
        // efter seed (samma invariant som alla andra skrivvägar).
        setMatches(loadedMatches);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        // Fail loud (PRINCIPLES §8): visa felet, maskera det inte som tom vy.
        // Vanligast i live-läge innan T14 (stubben kastar med avsikt).
        setError(err instanceof Error ? err.message : 'Kunde inte ladda matchdata.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [env]);

  // Mata in/redigera ETT resultat: validera, och vid ok uppdatera matchlistan
  // optimistiskt (direkt i minnet, vyerna räknar om reaktivt). Vid fel ändras
  // inget och felen returneras så formuläret kan visa dem (fail loud, men UX).
  const submitResult = useCallback(
    (matchId: string, entry: ResultEntry): ResultValidation => {
      const current = matchesRef.current;
      const target = current.find((m) => m.id === matchId);
      if (!target) {
        // Okänd match = programmeringsfel, inte en inmatnings-validering. Egen kod
        // 'unknown-match' UTAN field: semantiskt är det varken en status-övergång
        // eller bundet till ett enskilt fält, så ingen input markeras felaktigt
        // ogiltig. Fail loud, uppdatera inget (PRINCIPLES §8).
        return {
          ok: false,
          errors: [
            {
              code: 'unknown-match',
              message: `Matchen "${matchId}" finns inte i listan.`,
            },
          ],
        };
      }
      const validation = validateResultEntry(target.status, entry);
      if (!validation.ok) {
        return validation; // ogiltig inmatning: lämna listan orörd
      }
      // applyMatchResult validerar igen (skyddsnät) och ger en NY array. Skrivningen
      // går via den wrappade setMatches, som uppdaterar matchesRef SYNKRONT + sätter
      // state, så två snabba submit i följd (eller setMatches följt av submitResult)
      // båda ser den senaste listan utan att vänta på re-render. EN väg för
      // invarianten "reffen är aldrig stale efter en skrivning".
      const next = applyMatchResult(current, matchId, entry);
      setMatches(next);
      return validation;
    },
    [setMatches]
  );

  const store: ResultsStore = useMemo(
    () => ({ status, matches, teams, groups, mode, error, setMatches, submitResult }),
    [status, matches, teams, groups, mode, error, submitResult]
  );

  return <ResultsStoreContext.Provider value={store}>{children}</ResultsStoreContext.Provider>;
}
