// Provider för det GLOBALA facit-lagret (T42, #72).
//
// ANSVAR: ladda de GLOBALA officiella matchresultaten (facit) + admin-status, hålla
// dem i React-state, och exponera admin-skriv-seamen. Tunt: all DB-logik bor i
// official-results-api / app-admin-api (data/official), provider:n är limmet mot
// React + UI:t (samma form som RoomsProvider).
//
// ENABLED-GRIND: facit-lagret kräver en konfigurerad Supabase (live-läge). Är env
// inte satt (fixtures/lokal utveckling) är `enabled` false och lagret är vilande
// (results tomt, isAdmin false), appen fungerar då lokalt precis som förr.
//
// FACIT ÄR GLOBALT (inte per-rum): därför laddas det EN gång (oberoende av aktivt
// rum), och om-hämtas vid fokus/online (ingen polling, samma val som RoomsProvider;
// T18 kan byta mot Realtime på samma seam). EPOCH-vakt behövs inte här (ingen
// rums-nyckel som byter), men en cancelled-flagga skyddar mot state efter unmount.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  isAppAdmin,
  listOfficialResults,
  upsertOfficialResult,
  type OfficialMatchResult,
  type OfficialResultInput,
} from '../../data/official';
import { getSupabaseClient, type VmSupabaseClient } from '../../data/supabase-browser';
import { isSupabaseConfigured, LIVE_READY } from '../../data';
import {
  OfficialResultsStoreContext,
  type OfficialResultsStatus,
  type OfficialResultsStore,
} from './official-results-context';

export interface OfficialResultsProviderProps {
  children: ReactNode;
  /** Injicerbar env (testbarhet), default = import.meta.env. */
  env?: ImportMetaEnv;
  /** Injicerbar live-flagga (testbarhet), default = LIVE_READY. */
  liveReady?: boolean;
  /** Injicerbar klient (testbarhet), default = den riktiga singletonen ur env. */
  client?: VmSupabaseClient;
}

export function OfficialResultsProvider({
  children,
  env = import.meta.env,
  liveReady = LIVE_READY,
  client,
}: OfficialResultsProviderProps) {
  const enabled = isSupabaseConfigured(env) && liveReady;

  const [status, setStatus] = useState<OfficialResultsStatus>(enabled ? 'loading' : 'ready');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<OfficialMatchResult[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(enabled ? null : false);

  const supabase = useMemo<VmSupabaseClient | null>(() => {
    if (client) {
      return client;
    }
    if (!enabled) {
      return null;
    }
    return getSupabaseClient(env);
  }, [client, enabled, env]);

  /** Ladda facit (de globala officiella resultaten). Fail loud. */
  const loadResults = useCallback(async (): Promise<OfficialMatchResult[]> => {
    if (!supabase) {
      return [];
    }
    return listOfficialResults(supabase);
  }, [supabase]);

  // Initiering: ladda facit + admin-status en gång (när aktiva).
  useEffect(() => {
    if (!enabled || !supabase) {
      // Vilande läge ska vara FAIL-SAFE enligt fil-kontraktet (tomt facit, isAdmin
      // false, inget fel). Rensa ALLT (Copilot R3): annars kan ett tidigare laddat
      // facit/fel ligga kvar om live-läget slås av (injicerad liveReady i test eller
      // en framtida feature-flagga), och UI:t skulle visa ett gammalt facit fast
      // lagret ska vara vilande.
      setStatus('ready');
      setIsAdmin(false);
      setResults([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setError(null);
    (async () => {
      // Facit (publikt) + admin-status (för att visa/dölja admin-inmatningen).
      const [loaded, admin] = await Promise.all([loadResults(), isAppAdmin(supabase)]);
      if (cancelled) {
        return;
      }
      setResults(loaded);
      setIsAdmin(admin);
      setStatus('ready');
    })().catch((err: unknown) => {
      if (cancelled) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Kunde inte ladda de officiella resultaten.');
      setStatus('error');
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, supabase, loadResults]);

  // OM-HÄMTNING vid fokus/online (ingen polling, samma som RoomsProvider) OCH efter
  // en admin-inloggning. Laddar om BÅDE facit OCH admin-status: efter att Daniel
  // uppgraderat sin session (AdminLogin) blir is_app_admin() plötsligt true, så
  // vyn ska växla till inmatningen utan en sidladdning.
  const refresh = useCallback(async () => {
    if (!supabase) {
      return;
    }
    const [loaded, admin] = await Promise.all([loadResults(), isAppAdmin(supabase)]);
    setResults(loaded);
    setIsAdmin(admin);
    // En LYCKAD refresh ska återhämta en tidigare felad init-load (Copilot R3):
    // rensa felet och markera ready, annars fastnar UI:t i 'error' fast data nu är
    // fräsch. Vi sätter INTE 'loading' i början (ingen flicker vid bakgrunds-refetch
    // vid fokus/online). Vid FEL kastar Promise.all vidare och anroparen väljer att
    // svälja (fokus/online-refetchen sväljer och behåller befintligt facit, så ett
    // flyktigt nätfel inte klottrar över ett giltigt facit).
    setError(null);
    setStatus('ready');
  }, [supabase, loadResults]);

  // Stabil ref till refresh så fokus/online-lyssnaren inte avregistreras per render.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled || !supabase) {
      return;
    }
    const refetch = () => {
      refreshRef.current().catch(() => {
        // En refetch-miss (flyktigt nätfel) ska inte krascha appen; nästa
        // fokus/online-event försöker igen (vi har redan facit). Sväljs medvetet.
      });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refetch();
      }
    };
    window.addEventListener('online', refetch);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', refetch);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, supabase]);

  const saveOfficialResult = useCallback(
    async (input: OfficialResultInput) => {
      if (!supabase) {
        return;
      }
      // RLS (is_app_admin) är det RIKTIGA skyddet; en icke-admin fail-loud:ar här.
      const saved = await upsertOfficialResult(supabase, input);
      // Optimistiskt: ersätt/lägg till i den lokala facit-listan direkt.
      setResults((prev) => {
        const next = prev.filter((r) => r.matchId !== saved.matchId);
        next.push(saved);
        return next;
      });
    },
    [supabase]
  );

  const store: OfficialResultsStore = useMemo(
    () => ({
      enabled,
      status,
      error,
      results,
      isAdmin,
      client: supabase,
      saveOfficialResult,
      refresh,
    }),
    [enabled, status, error, results, isAdmin, supabase, saveOfficialResult, refresh]
  );

  return (
    <OfficialResultsStoreContext.Provider value={store}>
      {children}
    </OfficialResultsStoreContext.Provider>
  );
}
