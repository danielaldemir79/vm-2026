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
import { getDataSource, getDataSourceMode, LIVE_READY } from '../../data';
import type { Group, Match, Team } from '../../domain/types';
import { applySimulationOverlay, type SimulationOverlay } from '../simulation/apply-simulation';
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
  /**
   * Injicerbar live-flagga (testbarhet), default = LIVE_READY (false tills T14,
   * se data-source.ts, #37). Tester som vill driva LIVE-grenen (stubben som
   * kastar) sätter liveReady=true; produktion använder defaulten, så env satt
   * utan byggd klient faller till fixtures i stället för fel-alerts.
   */
  liveReady?: boolean;
}

export function ResultsProvider({
  children,
  env = import.meta.env,
  liveReady = LIVE_READY,
}: ResultsProviderProps) {
  const [status, setStatus] = useState<ResultsLoadStatus>('loading');
  const [groups, setGroups] = useState<Group[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  // Den RIKTIGA matchlistan (den enda sanningen). I sim-läge (T12) rörs den
  // ALDRIG av en hypotetisk inmatning, overlayn nedan ligger i stället ovanpå.
  // Den råa state-settern hålls intern (setRealMatchesState); den EXPONERADE
  // settern (setMatches nedan) wrappar den så reffen aldrig blir stale, se där.
  const [realMatches, setRealMatchesState] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);

  // SIMULERINGS-STATE (T12): är what-if-läget på, och det hypotetiska overlayt
  // (Map<matchId, Match>). När simulating=false ELLER overlayn är tom är de
  // effektiva matcherna identiska med de riktiga. Overlayn är referens-stabil i
  // state så React ser en ändring bara när vi faktiskt byter ut den.
  const [simulating, setSimulating] = useState(false);
  const [overlay, setOverlay] = useState<SimulationOverlay>(() => new Map());

  // Läget (fixtures/live) beror på env OCH live-flaggan, härled en gång.
  const mode = useMemo(() => getDataSourceMode(env, liveReady), [env, liveReady]);

  // EFFEKTIVA matcher = riktiga + overlay (T12). När overlayn är tom är detta de
  // riktiga matcherna (ny array-referens, samma element). När den har poster är
  // de matcherna ersatta med sina hypotetiska varianter. ALLA härledda vyer
  // (tabell/träd/scenario) läser denna via storens `matches`, så de reagerar på
  // sim-läget utan att veta om det (en sanning, härledd state). applySimulationOverlay
  // muterar aldrig realMatches, så isoleringen är en invariant i koden.
  const effectiveMatches = useMemo(
    () => applySimulationOverlay(realMatches, overlay),
    [realMatches, overlay]
  );

  // En ref med den senaste matchlistan, så submitResult kan validera mot
  // matchens NUVARANDE status utan att (a) binda mot en stale closure och (b)
  // göra validering till en sido-effekt INNE i en state-uppdaterare (det är
  // inte garanterat synkront och ett anti-mönster). INVARIANT: matchesRef.current
  // ska aldrig vara stale efter ett skriv-anrop, därför uppdaterar VARJE väg som
  // ändrar matchlistan (setMatches nedan + submitResult) reffen SYNKRONT, inte
  // via en eftersläpande effekt. Den speglar den RIKTIGA datan (sim-skrivningar
  // går mot overlayRef nedan, inte denna).
  const matchesRef = useRef(realMatches);

  // Synkrona reffar för sim-läget OCH overlayn (samma skäl som matchesRef): en
  // sim-skrivning måste validera/applicera mot den AKTUELLA overlayn utan att
  // vänta på re-render. enterSimulation/submitResult/setMatches uppdaterar dem
  // synkront, så två snabba hypotetiska submit i följd båda ser den senaste
  // overlayn (samma race-frihet som den riktiga skriv-seamen).
  const simulatingRef = useRef(simulating);
  const overlayRef = useRef(overlay);

  // Den EXPONERADE matchlist-settern (T18:s realtid och tester använder den som
  // lågnivå-seam). I sim-läge skriver den till OVERLAYT (hypotetiskt, riktig
  // data orörd); annars till den riktiga datan. Den uppdaterar respektive ref
  // SYNKRONT, så ett setMatches(next) följt direkt av submitResult(...) i samma
  // tick (innan re-render/effekt hunnit synka reffen) opererar mot `next`, inte
  // mot den gamla listan. Utan den synkrona ref-uppdateringen vore detta en
  // latent race i det seam T14 (persistens) och T18 (realtid) bygger på.
  const setMatches = useCallback((next: Match[]) => {
    if (simulatingRef.current) {
      // Sim-läge: lägg HELA den nya listan som overlay (varje match blir
      // hypotetisk). Riktig data orörd. Vyer faller tillbaka när overlayn töms.
      const nextOverlay = new Map(next.map((m) => [m.id, m] as const));
      overlayRef.current = nextOverlay;
      setOverlay(nextOverlay);
      return;
    }
    matchesRef.current = next;
    setRealMatchesState(next);
  }, []);

  useEffect(() => {
    // Avbryt-flagga: om providern unmountas (eller env byter) innan hämtningen
    // är klar sätter vi inte state på en avmonterad komponent.
    let cancelled = false;
    const dataSource = getDataSource(env, liveReady);

    setStatus('loading');
    setError(null);

    Promise.all([dataSource.getGroups(), dataSource.getTeams(), dataSource.getMatches()])
      .then(([loadedGroups, loadedTeams, loadedMatches]) => {
        if (cancelled) {
          return;
        }
        setGroups(loadedGroups);
        setTeams(loadedTeams);
        // Seedning skriver ALLTID den RIKTIGA datan (aldrig overlayn), oavsett
        // läge: en (om)laddning är ny riktig data, inte en hypotetisk inmatning.
        // Vi går därför INTE via den läges-ruttande setMatches här. Reffen synkas
        // direkt (samma invariant som alla andra riktiga skrivvägar).
        matchesRef.current = loadedMatches;
        setRealMatchesState(loadedMatches);
        // En (om)laddning byter ut datan sandlådan byggdes på, så ett kvarvarande
        // overlay vore byggt på gammal data. Lämna sim-läget och töm overlayn vid
        // (om)seedning, så det hypotetiska aldrig vävs mot fel riktig data.
        simulatingRef.current = false;
        overlayRef.current = new Map();
        setSimulating(false);
        setOverlay(overlayRef.current);
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
    // setMatches är en stabil useCallback (tom dep-array), så den ändrar aldrig
    // identitet och triggar inte om-körning, den listas för exhaustive-deps-
    // korrekthet (effekten anropar den vid seed). liveReady ingår: ändras gaten
    // (t.ex. en test som driver live-grenen) ska källan väljas om.
  }, [env, liveReady, setMatches]);

  // Mata in/redigera ETT resultat: validera, och vid ok uppdatera matchlistan
  // optimistiskt (direkt i minnet, vyerna räknar om reaktivt). Vid fel ändras
  // inget och felen returneras så formuläret kan visa dem (fail loud, men UX).
  const submitResult = useCallback(
    (matchId: string, entry: ResultEntry): ResultValidation => {
      // KÄLLISTAN att validera/applicera mot är den EFFEKTIVA i sim-läge (riktig
      // + overlay), annars den riktiga. Så användaren matar mot exakt det hen
      // ser (en hypotetisk match kan redigeras vidare i sim-läge), och samma
      // validering (T9-straffar inkl. hypotetiska slutspel) gäller i båda lägen.
      const current = simulatingRef.current
        ? applySimulationOverlay(matchesRef.current, overlayRef.current)
        : matchesRef.current;
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
      // Stage med: slutspelsmatch med lika ordinarie ställning kräver straffar
      // (FIFA Article 14), valideringen behöver matchens stage för den regeln.
      // GÄLLER ÄVEN hypotetiska slutspelsresultat (samma validate-result, T9).
      const validation = validateResultEntry(target.status, entry, target.stage);
      if (!validation.ok) {
        return validation; // ogiltig inmatning: lämna listan orörd
      }
      // applyMatchResult validerar igen (skyddsnät) och ger en NY array.
      const next = applyMatchResult(current, matchId, entry);
      if (simulatingRef.current) {
        // Sim-läge: skriv BARA den ändrade matchen till overlayn (hypotetiskt),
        // riktig data orörd. Vi lägger den enskilda hypotetiska matchen (inte
        // hela listan) så overlayn bara bär de matcher användaren faktiskt rört,
        // och de oberörda matcherna faller tillbaka på riktig data i blanda-fallet.
        const updated = next.find((m) => m.id === matchId);
        // updated finns garanterat (applyMatchResult bytte ut just matchId), men
        // narrow defensivt så typen är Match (inte Match | undefined).
        if (updated) {
          const nextOverlay = new Map(overlayRef.current);
          nextOverlay.set(matchId, updated);
          overlayRef.current = nextOverlay;
          setOverlay(nextOverlay);
        }
        return validation;
      }
      // Icke-sim: skriv den riktiga datan via den wrappade setMatches (uppdaterar
      // matchesRef SYNKRONT + state), så snabba submit i följd ser senaste listan.
      setMatches(next);
      return validation;
    },
    [setMatches]
  );

  // --- Simulerings-kontroller (T12) ---

  // Slå PÅ what-if-läget med ett TOMT overlay (riktig data orörd, vyerna ser
  // exakt de riktiga matcherna tills man matar in ett hypotetiskt resultat).
  // Refen synkas direkt så en omedelbart följande sim-skrivning ser det nya
  // läget utan att vänta på re-render.
  // IDEMPOTENT (Copilot C2): no-op när läget redan är PÅ. Förr tömde anropet
  // ALLTID overlayn, så ett dubbel-enter (t.ex. en dubbelklickad knapp) raderade
  // tysta de hypotetiska resultat användaren redan matat in. Storens kontrakt
  // säger uttryckligen "Idempotent", så vi gatar på simulatingRef och bevarar
  // overlayn när vi redan är i sandlådan.
  const enterSimulation = useCallback(() => {
    if (simulatingRef.current) {
      return; // redan i sim-läge: bevara overlayn, ändra inget
    }
    simulatingRef.current = true;
    overlayRef.current = new Map();
    setSimulating(true);
    setOverlay(overlayRef.current);
  }, []);

  // Slå AV what-if-läget OCH töm overlayn ("Avsluta simulering"). Effektiva
  // matcher faller tillbaka till riktig data direkt.
  // IDEMPOTENT (Copilot C3): no-op när det inte finns NÅGOT att ändra, dvs läget
  // redan är AV och overlayn redan är tom. Förr skapade anropet ALLTID en ny Map
  // + två state-set (setSimulating/setOverlay), så ett dubbel-exit (eller ett
  // exit i redan-avstängt läge) tvingade en onödig re-render av hela trädet.
  // Vi byter bara state när minst ett av fälten faktiskt skiljer sig.
  const exitSimulation = useCallback(() => {
    if (!simulatingRef.current && overlayRef.current.size === 0) {
      return; // redan av + tom overlay: inget att ändra, ingen re-render
    }
    simulatingRef.current = false;
    overlayRef.current = new Map();
    setSimulating(false);
    setOverlay(overlayRef.current);
  }, []);

  // Töm overlayn men STANNA i sim-läge ("Återställ allt", börja om från riktiga
  // resultat utan att lämna sandlådan). Ofarlig även om overlayn redan är tom.
  const resetSimulation = useCallback(() => {
    overlayRef.current = new Map();
    setOverlay(overlayRef.current);
  }, []);

  const store: ResultsStore = useMemo(
    // setMatches/sim-kontrollerna är stabila useCallback, tas med för
    // exhaustive-deps-korrekthet (de ingår i store-objektet) utan att påverka
    // när memon räknas om. `matches` är de EFFEKTIVA matcherna (riktig + overlay).
    () => ({
      status,
      matches: effectiveMatches,
      teams,
      groups,
      mode,
      error,
      setMatches,
      submitResult,
      simulating,
      enterSimulation,
      exitSimulation,
      resetSimulation,
    }),
    [
      status,
      effectiveMatches,
      teams,
      groups,
      mode,
      error,
      setMatches,
      submitResult,
      simulating,
      enterSimulation,
      exitSimulation,
      resetSimulation,
    ]
  );

  return <ResultsStoreContext.Provider value={store}>{children}</ResultsStoreContext.Provider>;
}
