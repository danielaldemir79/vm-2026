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
import { getDataSource, getDataSourceMode, LIVE_READY, type DataSource } from '../../data';
import type { Group, Match, Team } from '../../domain/types';
import { useRoomsSync } from '../rooms';
import type { RoomMatchResult, RoomResultInput } from '../../data/rooms';
import { useOfficialResultsSync } from '../official-results';
import { applySimulationOverlay, type SimulationOverlay } from '../simulation/apply-simulation';
import { applyMatchResult } from './apply-match-result';
import { applyRoomResults } from './apply-room-results';
import { ResultsStoreContext, type ResultsLoadStatus, type ResultsStore } from './results-context';
import { validateResultEntry, type ResultEntry, type ResultValidation } from './validate-result';

/**
 * Mappa en (validerad, applicerad) Match till en RoomResultInput för delning till
 * rummet (T14, KA-F3). Härleder formen ur Match-unionen så den aldrig kan drifta:
 * en FINISHED-match bär mål (+ ev. straffar i avgjort slutspel), en scheduled/live-
 * match har inget resultat. DB-kolumnerna home_goals/away_goals är NOT NULL, så en
 * ej spelad match delas med 0-0 + sin status (status är sanningen, inte målen då);
 * vävningen tillbaka (apply-room-results.toEntry) nollar målen igen för icke-finished,
 * så kontraktet hålls i båda riktningar.
 */
function toRoomResultInput(matchId: string, match: Match): RoomResultInput {
  if (match.status === 'finished') {
    return {
      matchId,
      homeGoals: match.result.homeGoals,
      awayGoals: match.result.awayGoals,
      status: 'finished',
      penalties: match.result.penalties
        ? {
            homeGoals: match.result.penalties.homeGoals,
            awayGoals: match.result.penalties.awayGoals,
          }
        : null,
    };
  }
  return { matchId, homeGoals: 0, awayGoals: 0, status: match.status, penalties: null };
}

export interface ResultsProviderProps {
  children: ReactNode;
  /**
   * Injicerbar miljö (testbarhet), default = den riktiga via import.meta.env.
   * Samma mönster som getDataSource/useGroupData: gör datakälle-läget testbart
   * utan att mocka import.meta globalt.
   */
  env?: ImportMetaEnv;
  /**
   * Injicerbar live-flagga (testbarhet), default = LIVE_READY (true sedan T14,
   * se data-source.ts). Produktion använder defaulten; tester kan injicera false
   * för att driva fixtures-grenen även med env satt (tvåstegs-gaten).
   */
  liveReady?: boolean;
  /**
   * Injicerbar datakälla (testbarhet), default = den env-gatade getDataSource.
   * SAMMA seam-princip som env/liveReady: låter fel-vägs-tester injicera en
   * datakälla som REJECTAR (utan att mocka import.meta), så provider:ns fail-loud-
   * kontrakt (status error + meddelande, ingen tyst tom vy) kan bevisas. Sedan
   * T14 returnerar live-källan giltig data (kastar inte längre), så ett genuint
   * datakälle-fel (t.ex. nätfel) testas via denna injektion i stället.
   */
  dataSource?: DataSource;
}

export function ResultsProvider({
  children,
  env = import.meta.env,
  liveReady = LIVE_READY,
  dataSource: injectedDataSource,
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

  // Läget (fixtures/live) beror på env OCH live-flaggan, härled tidigt: BÅDE
  // facit-källans val (rum vs globalt facit) nedan OCH store-märkningen längre ner
  // läser detta. EN sanning, så de aldrig kan säga emot varandra.
  const mode = useMemo(() => getDataSourceMode(env, liveReady), [env, liveReady]);
  const live = mode === 'live';

  // DELAT RUMS-LAGER (T14, KA-F3): det aktiva rummet + dess delade resultat +
  // spar-funktionen, läst TOLERANT (inert utan RoomsProvider, se useRoomsSync).
  // Wiringen gör att (a) en inmatning i rum-läge även sparas till rummet, och
  // (b) rummets delade resultat vävs in i matchlistan så ALLA medlemmar ser
  // samma tabell/träd. Utan aktivt rum är detta inert -> lokalt läge precis som förr.
  const { activeRoomId, sharedResults, saveResult: saveRoomResult } = useRoomsSync();

  // GLOBALT FACIT (T42/T48, #81): de officiella matchresultaten admin matar in,
  // lästa TOLERANT (inert utan OfficialResultsProvider). I LIVE-läge är DETTA
  // facit-källan för hela live-trackern (tabell/träd/"Vad krävs"), inte längre
  // rummets delade resultat.
  const { officialResults } = useOfficialResultsSync();

  // FACIT-KÄLLAN FÖR TRACKERN (T48, #81, TÄVLINGSINTEGRITET):
  //   - LIVE-läge: de GLOBALA officiella resultaten (official_match_results, BARA
  //     admin kan skriva, RLS-bevisat T42), så ALLA ser samma riktiga ställning
  //     som arrangören matar in. Tidigare vävdes RUMMETS delade resultat in, vilket
  //     lät vem som helst i rummet styra tabellerna (pre-share-blockeraren).
  //   - FIXTURES/lokalt läge: rummets delade resultat (oförändrat), så lokal
  //     utveckling + simulering + befintliga tester driver tabellerna som förr.
  // VÄVNINGEN är OFÖRÄNDRAD (samma rena applyRoomResults): OfficialMatchResult är
  // strukturellt identisk med RoomMatchResult, så bara KÄLLAN byts, inte logiken (DRY).
  const facitResults: RoomMatchResult[] = live ? officialResults : sharedResults;

  // Den SEEDADE BASEN (den statiska, källåkrade matchplanen från senaste seed),
  // bevarad SEPARAT från realMatches. VARFÖR: rummets delade resultat vävs in OVANPÅ
  // basen (applyRoomResults). Om vi i stället folda:de på den redan rum-vävda listan
  // skulle ett borttaget/ändrat delat resultat aldrig kunna "backa" och gamla resultat
  // skulle kompoundas. Genom att alltid väva från den rena basen är vävningen idempotent
  // och speglar EXAKT rummets nuvarande delade tillstånd (sista-skrivet-vinner från servern).
  const seededBaseRef = useRef<Match[]>([]);

  // Ref till FACIT-källan så SEED-effekten kan väva in den UTAN att lista den i
  // sin dep-array (en ändring i facit ska inte seeda om hela datakällan, bara väva
  // om; det gör den separata effekten nedan). Synkas varje render. Källan är
  // officiella resultat i live-läge, rummets i fixtures (se facitResults ovan).
  const facitResultsRef = useRef(facitResults);
  facitResultsRef.current = facitResults;

  // Reffar till rum-id + spar-funktionen så den STABILA submitResult-callbacken
  // (tom dep-array nedan) alltid läser det NUVARANDE aktiva rummet och senaste
  // spar-funktionen, utan att binda mot en stale closure (samma ref-mönster som
  // matchesRef). Så en inmatning persistas till det rum som är aktivt JUST DÅ.
  const activeRoomIdRef = useRef(activeRoomId);
  activeRoomIdRef.current = activeRoomId;
  const saveRoomResultRef = useRef(saveRoomResult);
  saveRoomResultRef.current = saveRoomResult;

  // Ref till live-läget så den STABILA submitResult-callbacken (tom dep-array) kan
  // gata rums-skrivningen utan att binda mot en stale closure. T48 (#81): i LIVE-läge
  // drivs trackern av det GLOBALA facit (admin-only), så en lokal inmatning ska INTE
  // längre skrivas till rummets resultat (room_match_results fasas ut för facit, T42).
  // Rums-skrivningen sker därför bara i fixtures-läge, där rummet fortfarande driver.
  const liveRef = useRef(live);
  liveRef.current = live;

  // SIMULERINGS-STATE (T12): är what-if-läget på, och det hypotetiska overlayt
  // (Map<matchId, Match>). När simulating=false ELLER overlayn är tom är de
  // effektiva matcherna identiska med de riktiga. Overlayn är referens-stabil i
  // state så React ser en ändring bara när vi faktiskt byter ut den.
  const [simulating, setSimulating] = useState(false);
  const [overlay, setOverlay] = useState<SimulationOverlay>(() => new Map());

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
    // Injicerad datakälla (test) eller den env-gatade (produktion). Injektionen
    // låter fel-vägs-tester ge en källa som rejectar utan att mocka import.meta.
    const dataSource = injectedDataSource ?? getDataSource(env, liveReady);

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
        //
        // T14 (KA-F3) / T48 (#81): bevara den rena seedade BASEN och väv in
        // FACIT-källan ovanpå (idempotent, från basen). Facit = officiella resultat
        // i live-läge, rummets i fixtures (se facitResults). I lokalt läge utan
        // resultat är facit tomt -> woven === basen, beteendet oförändrat mot förr.
        seededBaseRef.current = loadedMatches;
        const woven = applyRoomResults(loadedMatches, facitResultsRef.current);
        matchesRef.current = woven;
        setRealMatchesState(woven);
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
        // Inträffar vid ett genuint datakälle-fel (t.ex. nätfel), eller i test via
        // en injicerad datakälla som rejectar.
        setError(err instanceof Error ? err.message : 'Kunde inte ladda matchdata.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
    // setMatches är en stabil useCallback (tom dep-array), så den ändrar aldrig
    // identitet och triggar inte om-körning, den listas för exhaustive-deps-
    // korrekthet (effekten anropar den vid seed). liveReady + injectedDataSource
    // ingår: ändras gaten eller den injicerade källan ska seedningen köras om.
  }, [env, liveReady, injectedDataSource, setMatches]);

  // VÄV OM vid ändrad FACIT (T14, KA-F3 / T48, #81): när facit-källan ändras (i
  // live-läge: admin matade in ett officiellt resultat, eller en fokus/online-
  // refetch hämtade ett en annan enhet skrev; i fixtures: man väljer/byter rum,
  // eller en rums-refetch gav nya delade resultat), väv om från den rena seedade
  // BASEN så ALLA ser samma tabell/träd. Vi väver från basen (inte den nuvarande
  // listan) så vävningen är idempotent och ett ändrat/borttaget facit-resultat
  // backar korrekt.
  //
  // KÖR BARA VID EN FAKTISK FACIT-ÄNDRING: vi jämför mot förra rendrets facit-referens
  // (+ rum-id) och hoppar om inget facit-relevant ändrats. VARFÖR (kritiskt): seed-
  // effekten gör redan den FÖRSTA vävningen, och setMatches-seamen (T18 realtid +
  // test-harness) skriver den riktiga datan direkt. Skulle denna effekt köra på BLOTTA
  // seed/mount (utan en verklig ändring) skulle den väva om från basen och STOMPA en
  // setMatches som just körts (t.ex. en realtids-push eller ett test som setMatches:ar
  // en färdig matchlista). Genom att bara reagera på en ÄKTA facit-ändring rör vi aldrig
  // den lokala/setMatches-drivna vägen, bara när facit-källan faktiskt ger ny data.
  //
  // RUM-BYTE PÅVERKAR FACIT BARA I FIXTURES-LÄGE (Copilot R2): facit-källan är
  // `live ? officialResults : sharedResults` (se facitResults ovan). Rummets resultat
  // är alltså bara facit i FIXTURES-läge; i LIVE-läge är facit de globala officiella
  // resultaten, OBEROENDE av vilket rum som är aktivt. Ett rent rums-byte i live byter
  // därför inte facit och ska INTE väva om (officialResults-referensen är oförändrad,
  // så resultsChanged är redan false; vi gatar dessutom roomChanged på !live så ett
  // rums-byte i live aldrig kan trigga en omväving i onödan). I FIXTURES räknas rums-
  // bytet som förr: byter man rum byter facit-källan och vi väver om.
  const prevFacitRef = useRef<{ roomId: string | null; results: RoomMatchResult[] }>({
    roomId: activeRoomId,
    results: facitResults,
  });
  useEffect(() => {
    const prev = prevFacitRef.current;
    // Rum-bytet är facit-relevant BARA i fixtures-läge (rummet driver facit då). I
    // live-läge driver de globala officiella resultaten facit, så ett rums-byte är
    // inte en facit-ändring och ska inte väva om.
    const roomChanged = !live && prev.roomId !== activeRoomId;
    const resultsChanged = prev.results !== facitResults;
    prevFacitRef.current = { roomId: activeRoomId, results: facitResults };
    if (!roomChanged && !resultsChanged) {
      return; // inget facit-relevant ändrades: rör inte den lokala/setMatches-vägen
    }
    if (status !== 'ready') {
      return; // basen är inte seedad än; seed-effekten väver med facitResultsRef
    }
    const woven = applyRoomResults(seededBaseRef.current, facitResults);
    matchesRef.current = woven;
    setRealMatchesState(woven);
  }, [status, facitResults, activeRoomId, live]);

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

      // DELA TILL RUMMET (T14, KA-F3 (a)) , BARA i FIXTURES-läge (T48, #81): finns
      // ett aktivt rum persistas resultatet även dit, så alla medlemmar ser samma
      // tabell/träd. Optimistiskt: den lokala matchlistan är redan uppdaterad ovan
      // (UI reagerar direkt), spar-anropet sker i bakgrunden.
      // I LIVE-läge drivs trackern numera av det GLOBALA officiella facit (admin-only),
      // så en lokal inmatning ska INTE skrivas till rummets resultat (room_match_results
      // fasas ut för facit, decisions.md T42). Admin matar in det officiella facit via
      // AdminResultEntry (saveOfficialResult), inte via denna väg. Gaten på !liveRef
      // gör att den enda kvarvarande rums-skrivningen är fixtures-/utvecklings-vägen.
      if (!liveRef.current && activeRoomIdRef.current) {
        const persisted = next.find((m) => m.id === matchId);
        if (persisted) {
          // Spara FAIL-LOUD men ICKE-BLOCKERANDE: ett spar-fel (nätfel/RLS) får inte
          // riva den redan gjorda lokala inmatningen (UX), men ska inte heller sväljas
          // tyst. Vi loggar det; nästa fokus/online-refetch i RoomsProvider återhämtar
          // den delade sanningen (sista-skrivet-vinner). Ett blockerande/återställande
          // flöde vore mer påträngande än värdet för en vänkrets-app (KISS).
          void saveRoomResultRef.current(toRoomResultInput(matchId, persisted)).catch((err) => {
            console.error('[VM2026] Kunde inte dela resultatet till rummet:', err);
          });
        }
      }
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
