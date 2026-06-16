// Push opt-in-hook (T85, #177): kopplar den RENA state-maskinen (push-support.ts) + den
// SIDO-EFFEKTANDE glue:n (push-client.ts) till React + de faktiska browser-API:erna.
//
// ANSVAR: läs den faktiska kontexten (stöd/iOS/standalone/behörighet/aktiv prenumeration),
// resolva opt-in-läget, och exponera de tre åtgärderna (aktivera / stäng av / skicka test)
// med ärlig feedback (busy/error/info). Beslutet OM vad ytan ska visa görs av
// resolvePushOptInState; hooken äger bara sido-effekterna och tillstånds-uppdateringen.
//
// Push KRÄVER en lagrings-backend (Supabase): utan live-konfiguration kan vi inte lagra
// prenumerationen, så hooken rapporterar 'unsupported' i fixtures-läge (ärligt, ingen död
// aktivera-knapp som ändå inte kan spara). Samma gate-mönster som use-live-data.

import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, LIVE_READY } from '../../data';
import { getSupabaseClient, type VmSupabaseClient } from '../../data/supabase-browser';
import { readPushOptInContext, resolvePushOptInState, type PushOptInState } from './push-support';
import {
  requestNotificationPermission,
  sendTestNotification,
  storeSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from './push-client';
import type { PushPreferences } from './push-preferences';
import {
  DEFAULT_PUSH_PREFERENCES,
  readPushPreferences,
  updatePushPreferences,
  type PreferenceUpdate,
} from './push-preferences-client';

export interface PushApi {
  /** Det aktuella opt-in-läget (avgör vad PushOptInSection renderar). */
  state: PushOptInState;
  /** true medan en åtgärd (aktivera/av/test) pågår, så knappar kan disablas. */
  busy: boolean;
  /** Senaste fel (svensk text) eller null. Visas ärligt i UI:t. */
  error: string | null;
  /** Senaste icke-fel-info (t.ex. "test-notis skickad") eller null. */
  info: string | null;
  /** Aktivera notiser: begär behörighet, prenumerera, lagra. Måste anropas på en gest. */
  activate: () => Promise<void>;
  /** Stäng av: avregistrera + radera raden. */
  deactivate: () => Promise<void>;
  /** Skicka en test-notis till mina egna enheter (end-to-end-beviset). */
  sendTest: () => Promise<void>;
  /** Användarens notis-preferenser (master/natt/scope), default tills laddade. */
  preferences: PushPreferences;
  /** Uppdatera en eller flera preferenser (optimistiskt + persistat). */
  setPreference: (update: PreferenceUpdate) => Promise<void>;
}

/**
 * Hämta den aktiva service-worker-registreringen (workbox registrerar SW:n separat).
 * Vi väntar in `navigator.serviceWorker.ready`, så vi inte försöker prenumerera mot en
 * SW som inte aktiverats än. Null om serviceWorker saknas (unsupported, hanteras av state).
 */
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }
  return navigator.serviceWorker.ready;
}

export function usePush(env: ImportMetaEnv = import.meta.env): PushApi {
  const liveConfigured = isSupabaseConfigured(env) && LIVE_READY;

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<PushPreferences>(DEFAULT_PUSH_PREFERENCES);

  // Läs om enheten redan har en aktiv prenumeration (vid mount). Påverkar bara läget,
  // inga skrivningar. Avbrytbar (cancelled) så en sen upplösning inte rör en avmonterad
  // komponent.
  useEffect(() => {
    let cancelled = false;
    if (!liveConfigured) {
      return;
    }
    void getRegistration().then(async (reg) => {
      if (!reg || cancelled) {
        return;
      }
      const existing = await reg.pushManager.getSubscription();
      if (!cancelled) {
        setIsSubscribed(existing !== null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [liveConfigured]);

  // Klienten hämtas lat per åtgärd (singleton via getSupabaseClient). useCallback ger en
  // stabil referens så de tre åtgärds-callbacksen kan ha den i sina deps utan att
  // återskapas varje render (annars react-hooks/exhaustive-deps-varning).
  const client = useCallback((): VmSupabaseClient => getSupabaseClient(env), [env]);

  // Läs användarens preferenser NÄR enheten är prenumererad (raden finns då). Avbrytbar.
  // Innan dess visar UI:t default (master på, natt av, scope alla) , men preferens-kontrollerna
  // renderas ändå bara i 'subscribed'-läget, så defaulten syns inte felaktigt.
  useEffect(() => {
    let cancelled = false;
    if (!liveConfigured || !isSubscribed) {
      return;
    }
    void readPushPreferences(client())
      .then((prefs) => {
        if (!cancelled) {
          setPreferences(prefs);
        }
      })
      .catch(() => {
        // En läs-miss ska inte krascha sektionen; behåll default (UI:t fungerar ändå).
      });
    return () => {
      cancelled = true;
    };
  }, [liveConfigured, isSubscribed, client]);

  // Opt-in-läget. Utan live-konfiguration kan vi inte lagra -> 'unsupported' (ärligt).
  // isSupported i kontexten gatas DESSUTOM av browser-API:erna; vi AND:ar in
  // liveConfigured så fixtures-läge aldrig visar en aktivera-knapp som inte kan spara.
  const ctx = readPushOptInContext(window, isSubscribed);
  const state: PushOptInState = liveConfigured ? resolvePushOptInState(ctx) : 'unsupported';

  /** Kör en åtgärd med busy-/fel-/info-hantering (DRY för de tre handlarna). */
  const run = useCallback(async (action: () => Promise<string | null>): Promise<void> => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const message = await action();
      setInfo(message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel med notiserna.');
    } finally {
      setBusy(false);
    }
  }, []);

  const activate = useCallback(async (): Promise<void> => {
    await run(async () => {
      const reg = await getRegistration();
      if (!reg) {
        throw new Error('[VM2026] Notiser stöds inte i den här webbläsaren.');
      }
      const permission = await requestNotificationPermission(window);
      if (permission !== 'granted') {
        // Inte ett tekniskt fel, men en spärr: visa ärligt, lämna inte ett tyst no-op.
        // Behörigheten styr state-maskinen (denied/default) vid nästa render ändå.
        throw new Error(
          'Notiser blev inte påslagna. Tillåt notiser för appen så får du en pling vid mål.'
        );
      }
      const subscription = await subscribeToPush(reg);
      await storeSubscription(client(), subscription, window.navigator.userAgent || null);
      setIsSubscribed(true);
      return 'Notiser påslagna! Du får en pling när det blir mål.';
    });
  }, [run, client]);

  const deactivate = useCallback(async (): Promise<void> => {
    await run(async () => {
      const reg = await getRegistration();
      if (reg) {
        await unsubscribeFromPush(client(), reg);
      }
      setIsSubscribed(false);
      return 'Notiser avstängda.';
    });
  }, [run, client]);

  const sendTest = useCallback(async (): Promise<void> => {
    await run(async () => {
      await sendTestNotification(client());
      return 'Test-notis skickad. Den dyker upp om en liten stund.';
    });
  }, [run, client]);

  // Uppdatera en preferens OPTIMISTISKT (UI svarar direkt) + persistera. Vid fel: visa felet
  // OCH läs tillbaka det faktiska värdet, så UI:t aldrig ljuger om vad som sparades.
  const setPreference = useCallback(
    async (update: PreferenceUpdate): Promise<void> => {
      const previous = preferences;
      setPreferences((prev) => ({
        notifyEnabled: update.notifyEnabled ?? prev.notifyEnabled,
        quietHoursEnabled: update.quietHoursEnabled ?? prev.quietHoursEnabled,
        scope: update.scope ?? prev.scope,
        favoriteTeamId:
          update.favoriteTeamId !== undefined ? update.favoriteTeamId : prev.favoriteTeamId,
      }));
      setError(null);
      try {
        await updatePushPreferences(client(), update);
      } catch (err: unknown) {
        // Rulla tillbaka det optimistiska värdet och visa felet ärligt.
        setPreferences(previous);
        setError(err instanceof Error ? err.message : 'Kunde inte spara notis-inställningen.');
      }
    },
    [client, preferences]
  );

  return {
    state,
    busy,
    error,
    info,
    activate,
    deactivate,
    sendTest,
    preferences,
    setPreference,
  };
}
