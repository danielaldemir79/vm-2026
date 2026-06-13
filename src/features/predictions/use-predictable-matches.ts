// React-hook som laddar matchplanen + lagen för tipsvyn (T15, #15), med det GLOBALA
// officiella facit invävt (T76, #158).
//
// Ansvar (tunt, en sak): hämta den STATISKA matchplanen + lagen via datakällan
// (getDataSource, fixtures-först-seamen), VÄVA in det globala officiella facit ovanpå
// matcherna, och exponera dem + laddningsstatus. Tipsen själva (mina gissningar) lever
// i PredictionsProvider/-storen; denna hook ger bara underlaget (vilka matcher finns,
// deras facit, vilka lag). Matcherna är samma för alla (turneringsdata + globalt facit),
// tipsen är personliga (per rum, via Supabase).
//
// VARFÖR FACIT VÄVS IN HÄR (T76, #158, Daniel-rapporterad bugg): tips-INMATNINGSkortet
// (PredictionForm) visar poäng (T58) och facit (T73) FÖRST när match.status === 'finished'
// (isFinished-grinden). Den statiska matchplanen är ALLTID 'scheduled' (result null), så
// utan en facit-vävning blev en match ALDRIG 'finished' i tips-vyn och varken poäng eller
// facit renderades i verkligheten, trots gröna isolerade tester (de matar in en finished-
// FIXTUR direkt). Vi väver därför in de officiella resultaten på SAMMA seam som topplistan
// (useLeaderboardData) och live-trackern (ResultsProvider) redan gör: useOfficialResultsSync
// (det GLOBALA facit-lagret, T42) + den rena applyRoomResults (EN sanning, en vävning).
//
// REALTID (gratis via T42): OfficialResultsProvider prenumererar på official_match_results
// och kör en refresh när admin matar in ett resultat, så `officialResults` får en ny
// referens -> useMemo nedan väver om -> kortet uppdateras utan omladdning, exakt samma
// realtids-väg som topplistans poäng. Ingen egen prenumeration här.
//
// VARFÖR egen laddning (inte results-storen): tips-sektionen ligger UTANFÖR
// ResultsProvider i appen (den hör till det sociala rums-lagret). Matchplanen är
// statisk och identisk oavsett källa, så vi läser den direkt via datakällan i
// stället för att tvinga in tips-sektionen under results-storen (lägre koppling).
// Facit-lagret (OfficialResultsProvider) OMSLUTER hela appen, så det når oss här,
// och useOfficialResultsSync är TOLERANT mot en saknad provider (tomt facit) så
// isolerade tester utan provider fungerar (additivt lager, samma som topplistan).

import { useEffect, useMemo, useState } from 'react';
import { getDataSource } from '../../data';
import type { Match, Team } from '../../domain/types';
import { useOfficialResultsSync } from '../official-results';
import { applyRoomResults } from '../results';

/** Laddningstillstånd, explicit (inte bara "data | null"). */
export type PredictableLoadStatus = 'loading' | 'ready' | 'error';

/** Det hooken exponerar: matcher + lag + status. */
export interface PredictableData {
  status: PredictableLoadStatus;
  matches: Match[];
  teams: Team[];
  error: string | null;
}

/**
 * Ladda matchplanen + lagen (en gång). Injicerbar env (default import.meta.env)
 * samma som datalagrets övriga seamar, så datakälle-läget kan testas utan att mocka
 * import.meta globalt. Fel FAIL-LOUD:ar (status 'error' + meddelande), inte tyst tom.
 */
export function usePredictableData(env: ImportMetaEnv = import.meta.env): PredictableData {
  // Det GLOBALA officiella facit (T42), läst TOLERANT (tomt utan provider). DETTA är
  // facit-källan, samma som topplistan (useLeaderboardData) och live-trackern, så
  // poängen + facit på tips-kortet räknas mot EN sanning (#158).
  const { officialResults } = useOfficialResultsSync();

  const [status, setStatus] = useState<PredictableLoadStatus>('loading');
  // Den STATISKA basen (matchplanen från datakällan), bevarad separat: facit vävs in
  // ovanpå basen (idempotent), så ett ändrat/borttaget officiellt resultat backar
  // korrekt i stället för att kompoundas (samma motiv som ResultsProvider/leaderboard).
  const [baseMatches, setBaseMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    const ds = getDataSource(env);
    Promise.all([ds.getMatches(), ds.getTeams()])
      .then(([m, t]) => {
        if (cancelled) {
          return;
        }
        setBaseMatches(m);
        setTeams(t);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Kunde inte ladda matcherna.');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [env]);

  // Väv in det GLOBALA officiella facit ovanpå den statiska planen (samma rena funktion
  // ResultsProvider + topplistan använder). En match med inmatat officiellt resultat blir
  // status 'finished' + result, så isFinished-grinden i PredictionForm öppnas och facit
  // (T73) + poäng (T58) renderas i tips-vyn. Tom facit-lista -> matcherna oförändrade
  // (lokalt läge / inget resultat inmatat), beteendet är då exakt som förr. En ändring i
  // officialResults (admin matade in / realtids-push) ger en ny vävd lista utan en andra
  // hämtning -> kortet uppdateras live (T42-realtidsvägen, ingen ny prenumeration).
  const matches = useMemo(
    () => applyRoomResults(baseMatches, officialResults),
    [baseMatches, officialResults]
  );

  return { status, matches, teams, error };
}
