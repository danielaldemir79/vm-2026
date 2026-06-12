// Provider för topplista + tips-avslöjande (T17, #17).
//
// Systerfil till tips-stores (T15/T16), men LÄS-ONLY: T17 skriver inga tips, den
// AGGREGERAR de befintliga. ANSVAR: ladda rummets RLS-synliga tips (alla tre typer,
// listRoom*-API:erna), läsa det delade facit (lag/grupper/matcher ur
// useLeaderboardData, som väver in rummets delade resultat) + medlemmarna, och bygga
// den rangordnade topplistan + avslöjande-vyn via de RENA modulerna
// (aggregate-scores / derive-facit / reveal).
//
// SÄKERHET ÄR SERVER-SIDE: sekretessen (andras tips dolda före deadline) bor i RLS
// (bevisat i T15/T16). listRoom*-API:erna returnerar BARA RLS-synliga rader (egna +
// redan avslöjade), så aggregeringen kan strukturellt bara se det som får ses. Den
// här provider:n förlitar sig aldrig på en klient-gate för sekretessen.
//
// EPOCH-vakt (samma mönster som tips-stores): ett snabbt rumsbyte får aldrig låta
// ett föråldrat svar visa fel rums topplista.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  listRoomPredictions,
  listRoomGroupPredictions,
  listRoomBracketPredictions,
  isMatchLocked,
  type Prediction,
  type GroupPrediction,
  type BracketPrediction,
} from '../../data/predictions';
import { getSupabaseClient, type VmSupabaseClient } from '../../data/supabase-browser';
import { isSupabaseConfigured, LIVE_READY } from '../../data';
import { useRoomsStore } from '../rooms';
import { useDeadlineTick } from '../predictions/use-deadline-tick';
import { useLeaderboardData } from './use-leaderboard-data';
import { derivePoolFacit } from './derive-facit';
import { buildLeaderboard, scoreMemberBreakdown, type MemberPredictions } from './aggregate-scores';
import { buildMatchReveal } from './reveal';
import {
  LeaderboardStoreContext,
  type LeaderboardStatus,
  type LeaderboardStore,
} from './leaderboard-context';

/** Rummets RLS-synliga tips (alla tre typer), råladdade per rum. */
interface RoomPredictions {
  match: Prediction[];
  group: GroupPrediction[];
  bracket: BracketPrediction[];
}

const EMPTY_PREDICTIONS: RoomPredictions = { match: [], group: [], bracket: [] };

/** Inre laddningstillstånd bara för tips-laddningen (vävs med data-statusen nedan). */
type PredictionsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface LeaderboardProviderProps {
  children: ReactNode;
  /** Injicerbar env (testbarhet), default = import.meta.env. */
  env?: ImportMetaEnv;
  /** Injicerbar live-flagga (testbarhet), default = LIVE_READY. */
  liveReady?: boolean;
  /** Injicerbar klient (testbarhet), default = den riktiga singletonen ur env. */
  client?: VmSupabaseClient;
  /** Injicerbart aktivt rum-id (testbarhet). Default = rooms-storen. */
  activeRoomId?: string | null;
  /**
   * Injicerbar tips-invaliderings-räknare (testbarhet, T61 #110). Default = rooms-storen
   * (rooms.tipsRefreshNonce). Bumpas efter en lyckad kopiering -> tyst re-fetch av
   * rummets aggregerade tips, så de nykopierade raderna syns i topplistan utan rum-byte.
   */
  tipsRefreshNonce?: number;
  /** Injicerbart "nu" (testbarhet) för avslöjande-gaten, default = nuet (minut-tick). */
  now?: Date;
}

export function LeaderboardProvider({
  children,
  env = import.meta.env,
  liveReady = LIVE_READY,
  client,
  activeRoomId: activeRoomIdProp,
  tipsRefreshNonce: tipsRefreshNonceProp,
  now,
}: LeaderboardProviderProps) {
  const rooms = useRoomsStore();
  const data = useLeaderboardData(env);
  const activeRoomId =
    activeRoomIdProp !== undefined ? activeRoomIdProp : (rooms.activeRoom?.id ?? null);
  // Tips-invaliderings-räknaren ur rooms-storen (T61 #110): bumpas efter en lyckad
  // kopiering IN i det aktiva rummet, ligger i fetch-effektens deps -> tyst re-fetch av
  // rummets aggregerade tips (samma TYSTA-mönster som T55:s avspark-re-fetch nedan).
  const tipsRefreshNonce =
    tipsRefreshNonceProp !== undefined ? tipsRefreshNonceProp : rooms.tipsRefreshNonce;

  const liveConfigured = isSupabaseConfigured(env) && liveReady;
  const enabled = liveConfigured && activeRoomId !== null;

  const [predictionsStatus, setPredictionsStatus] = useState<PredictionsStatus>('idle');
  const [predictionsError, setPredictionsError] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<RoomPredictions>(EMPTY_PREDICTIONS);

  const supabase = useMemo<VmSupabaseClient | null>(() => {
    if (client) {
      return client;
    }
    if (!liveConfigured) {
      return null;
    }
    return getSupabaseClient(env);
  }, [client, liveConfigured, env]);

  // Avslöjande-gaten räknas om varje minut (samma minut-tick som tipsvyerna), så en
  // match som låses (avspark passeras) dyker upp i avslöjandet utan omladdning.
  const evalNow = useDeadlineTick(now ?? new Date());

  // T55 (#96), rotorsak 2: re-fetcha andras tips NÄR en match passerar avspark. RLS
  // släpper andras tips-RADER först efter kickoff, så en app som stått öppen sedan FÖRE
  // avspark har ett svar UTAN dem; utan en ny hämtning ser man inget förrän en reload.
  // Vi pollar INTE och öppnar ingen realtime (det är T18/#18): vi härleder bara ANTALET
  // LÅSTA matcher ur den BEFINTLIGA minut-ticken (evalNow). Talet ökar när en match
  // passerar avspark, och eftersom det ligger i fetch-effektens deps triggar just den
  // övergången en (1) ny hämtning, så de nyligen avslöjade raderna kommer in.
  const lockedMatchCount = useMemo(
    () => data.matches.filter((m) => isMatchLocked(m.kickoff, evalNow)).length,
    [data.matches, evalNow]
  );

  // EPOCH-vakt: ett snabbt rumsbyte får aldrig låta ett föråldrat svar visa fel rum.
  const loadTokenRef = useRef(0);

  // Vilket rum den NU laddade datan tillhör (null = ingen data laddad än). Skiljer en
  // SYNLIG laddning (initial / rumsbyte: datan saknas eller hör till fel rum -> visa
  // 'loading') från en TYST re-fetch (avspark: samma rum, datan finns redan -> behåll
  // 'ready' + datan under hämtningen, byt bara ut den när svaret kommer). Vi läser inte
  // av predictionsStatus/predictions i effekten (det skulle kräva dem i deps och kunna
  // loopa); den här ref:en uttrycker invarianten "datan tillhör rätt rum" direkt.
  const loadedRoomIdRef = useRef<string | null>(null);

  useEffect(() => {
    const token = ++loadTokenRef.current;
    if (!supabase || activeRoomId === null) {
      setPredictions(EMPTY_PREDICTIONS);
      setPredictionsStatus('idle');
      setPredictionsError(null);
      loadedRoomIdRef.current = null;
      return;
    }
    // TYST RE-FETCH (T55 #96, rotorsak): en avspark-triggad omhämtning (lockedMatchCount
    // ändrades) i SAMMA rum vi redan har data för ska INTE flimra 'loading' och tömma
    // topplistan/avslöjandet, den ska bara KOMPLETTERA med de RLS-nyligen-släppta raderna.
    // 'loading' visas bara vid INITIAL hämtning (ingen data än) och vid RUMSBYTE (datan
    // hör till fel rum); då är det rätt att blanka och visa laddning.
    const isSilentRefetch = loadedRoomIdRef.current === activeRoomId;
    if (!isSilentRefetch) {
      setPredictionsStatus('loading');
      setPredictionsError(null);
    }
    // Ladda rummets RLS-synliga tips för ALLA tre typer parallellt. RLS gör att vi
    // bara får egna + redan-avslöjade rader (sekretessen är server-side).
    Promise.all([
      listRoomPredictions(supabase, activeRoomId),
      listRoomGroupPredictions(supabase, activeRoomId),
      listRoomBracketPredictions(supabase, activeRoomId),
    ])
      .then(([match, group, bracket]) => {
        if (token !== loadTokenRef.current) {
          return; // föråldrat svar (nyare rumsbyte hann starta), kasta tyst
        }
        setPredictions({ match, group, bracket });
        setPredictionsStatus('ready');
        loadedRoomIdRef.current = activeRoomId;
      })
      .catch((err: unknown) => {
        if (token !== loadTokenRef.current) {
          return;
        }
        // FELVÄG, TYST RE-FETCH: en avspark-triggad omhämtning som failar får ALDRIG
        // kasta bort den befintliga (giltiga, om än något inaktuella) topplistan. Vi
        // behåller datan + 'ready' och loggar felet (fail-loud i konsolen, samma
        // [VM2026]-warn-konvention som övriga icke-fatala fel), i stället för att sätta
        // 'error' som hade blankat hela vyn för en transient avspark-poll. Nästa avspark
        // (eller rumsbyte/reload) försöker igen. En INITIAL/rumsbyte-fetch som failar har
        // däremot ingen data att skydda, då är 'error' rätt (fail loud, PRINCIPLES §8).
        if (isSilentRefetch) {
          console.warn(
            '[VM2026] Tyst omhämtning av topplistan (avspark) misslyckades, behåller befintlig data:',
            err
          );
          return;
        }
        setPredictionsError(err instanceof Error ? err.message : 'Kunde inte ladda topplistan.');
        setPredictionsStatus('error');
      });
    // lockedMatchCount (T55 #96): re-fetcha när en match passerar avspark, så RLS-
    // nyligen-släppta tips kommer in utan reload. ENDAST när talet ÄNDRAS (en ny match
    // låstes) körs effekten om, inte varje minut-tick (talet är stabilt mellan avspark).
    // tipsRefreshNonce (T61 #110): re-fetcha rummets aggregerade tips när en kopiering IN
    // i det aktiva rummet lyckats, så de nykopierade raderna syns i topplistan/avslöjandet
    // utan rum-byte. loadedRoomIdRef gör den re-fetchen TYST (samma rum -> behåll datan).
  }, [supabase, activeRoomId, lockedMatchCount, tipsRefreshNonce]);

  // VÄVD status: topplistan är 'ready' först när BÅDE facit-datan OCH tipsen laddat.
  // Felet från endera lagret fail-loud:ar. Idle/loading speglas så vyn visar laddning.
  const status: LeaderboardStatus = useMemo(() => {
    if (data.status === 'error' || predictionsStatus === 'error') {
      return 'error';
    }
    if (!enabled) {
      return 'idle';
    }
    if (data.status === 'ready' && predictionsStatus === 'ready') {
      return 'ready';
    }
    return 'loading';
  }, [data.status, predictionsStatus, enabled]);

  const error = data.error ?? predictionsError;

  // Härled facit ur den DELADE matchlistan (rummets resultat redan invävda).
  const facit = useMemo(
    () => derivePoolFacit(data.teams, data.groups, data.matches),
    [data.teams, data.groups, data.matches]
  );

  // Gruppera tipsen per medlem (userId) för aggregeringen.
  const predictionsByUser = useMemo(() => {
    const byUser = new Map<string, MemberPredictions>();
    const ensure = (userId: string): MemberPredictions => {
      let entry = byUser.get(userId);
      if (!entry) {
        entry = { userId, matchPredictions: [], groupPredictions: [], bracketPredictions: [] };
        byUser.set(userId, entry);
      }
      return entry;
    };
    for (const p of predictions.match) {
      (ensure(p.userId).matchPredictions as Prediction[]).push(p);
    }
    for (const p of predictions.group) {
      (ensure(p.userId).groupPredictions as GroupPrediction[]).push(p);
    }
    for (const p of predictions.bracket) {
      (ensure(p.userId).bracketPredictions as BracketPrediction[]).push(p);
    }
    return byUser;
  }, [predictions]);

  // Bygg topplistan (alla medlemmar, även de utan tips -> 0p, med i listan).
  const leaderboard = useMemo(
    () => buildLeaderboard(rooms.members, predictionsByUser, facit),
    [rooms.members, predictionsByUser, facit]
  );

  // Bygg avslöjandet (per avgjord+låst match), med medlemmarnas namn.
  const reveal = useMemo(() => {
    const names = new Map(rooms.members.map((m) => [m.userId, m.displayName]));
    return buildMatchReveal(data.matches, facit.matches, predictions.match, names, evalNow);
  }, [rooms.members, data.matches, facit.matches, predictions.match, evalNow]);

  // AKTUELL användares poäng UPPDELAD per källa (T58, #99): härledd ur SAMMA
  // scoreMember-väg som topplistan (scoreMemberBreakdown), inte en omräkning. null tills
  // vi har en identitet OCH den användaren har tips i rummet (annars finns ingen egen
  // rad att bryta ner; tips-vyns summering gatar på detta, hellre tyst än en 0-detalj).
  const selfBreakdown = useMemo(() => {
    if (rooms.userId === null) {
      return null;
    }
    const mine = predictionsByUser.get(rooms.userId);
    if (mine === undefined) {
      return null;
    }
    return scoreMemberBreakdown(mine, facit);
  }, [rooms.userId, predictionsByUser, facit]);

  const store: LeaderboardStore = useMemo(
    () => ({
      enabled,
      status,
      error,
      activeRoomId,
      leaderboard,
      reveal,
      teams: data.teams,
      // "Du"-framhävningens seam: rummets auth-identitet (null tills sessionen klar).
      currentUserId: rooms.userId,
      // T58 (#99): aktuell användares käll-uppdelning, delad med tips-vyns summering.
      selfBreakdown,
    }),
    [
      enabled,
      status,
      error,
      activeRoomId,
      leaderboard,
      reveal,
      data.teams,
      rooms.userId,
      selfBreakdown,
    ]
  );

  return (
    <LeaderboardStoreContext.Provider value={store}>{children}</LeaderboardStoreContext.Provider>
  );
}
