// React-hook ovanpå subscribeToTableChanges (T18, #18).
//
// ANSVAR: koppla upp en realtidskanal medan komponenten är monterad OCH live-läget
// är aktivt, och RIVA den vid unmount / när nyckeln (rum, enabled) ändras. Tunt lim:
// allt kanal-arbete bor i realtime-subscriptions.ts; den här hooken styr bara
// LIVSCYKELN (effekt + cleanup) och håller onChange-callbacken stabil så vi inte
// av- och påkopplar kanalen vid varje render.
//
// VARFÖR en stabil callback-ref: onChange (t.ex. () => { refresh(); bump(); }) skapas
// oftast on-the-fly i provider:n och byter identitet varje render. Låg vi den i
// effekt-deps skulle kanalen rivas + återskapas konstant. I stället håller vi senaste
// callbacken i en ref och låter effekten bero bara på de NYCKLAR som faktiskt ska ge en
// ny prenumeration (klient, kanalnamn, tabellsetup). Samma mönster som providers
// använder för sina fokus/online-lyssnare (refreshRef).

import { useEffect, useRef } from 'react';
import type { VmSupabaseClient } from '../supabase-browser';
import { subscribeToTableChanges, type TableSubscription } from './realtime-subscriptions';

export interface UseRealtimeSubscriptionOptions {
  /**
   * Är prenumerationen aktiv? (live-läget på + ev. ett aktivt rum). Falskt -> ingen
   * kanal öppnas (vilande läge, t.ex. fixtures/lokalt). Mappar mot providerns `enabled`.
   */
  enabled: boolean;
  /** Klienten, eller null i vilande läge (då öppnas ingen kanal). */
  client: VmSupabaseClient | null;
  /**
   * Kanalnamns-PREFIX (läsbar namnrymd). Behöver INTE vara globalt unikt: seamen
   * (subscribeToTableChanges) lägger på ett unikt suffix per prenumeration, så två
   * konsumenter som råkar ange samma prefix ändå får skilda kanal-instanser (white-
   * screen-fixen, se realtime-subscriptions.ts).
   */
  channelName: string;
  /** Tabeller (+ ev. filter) att lyssna på. */
  tables: TableSubscription[];
  /** Körs vid varje relevant händelse (providerns tysta re-fetch-väg). */
  onChange: () => void;
  /**
   * NYCKEL som styr åter-prenumeration: byts denna river vi kanalen och öppnar en ny.
   * T.ex. det aktiva rummets id (byt rum -> ny filtrerad kanal). Ändras inte tables i
   * sig (den kan vara en ny array varje render), så vi använder en explicit nyckel i
   * stället för att jämföra arrayer. null = ingen extra nyckel (statisk prenumeration).
   */
  subscriptionKey?: string | null;
}

/**
 * Prenumerera på tabell-ändringar medan komponenten är monterad och `enabled`.
 * River kanalen vid unmount och när `subscriptionKey`/`enabled`/`client`/`channelName`
 * ändras (rum-byte = ren av- och påkoppling). onChange hålls stabil via en ref.
 */
export function useRealtimeSubscription(options: UseRealtimeSubscriptionOptions): void {
  const { enabled, client, channelName, tables, onChange, subscriptionKey = null } = options;

  // Stabil ref till senaste onChange (se fil-doc): byter inte effekt-deps per render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Stabil ref till tables: vi vill INTE re-prenumerera bara för att arrayen är ny
  // varje render. Åter-prenumeration styrs av subscriptionKey (explicit nyckel), så
  // den som ändrar tabellerna måste också ändra nyckeln (i praktiken: rum-id i filtret).
  const tablesRef = useRef(tables);
  tablesRef.current = tables;

  useEffect(() => {
    if (!enabled || !client) {
      return; // vilande läge: ingen kanal
    }
    const unsubscribe = subscribeToTableChanges({
      client,
      channelName,
      tables: tablesRef.current,
      // Indirektion via ref så en ny onChange-identitet inte river kanalen.
      onChange: () => onChangeRef.current(),
    });
    return unsubscribe;
    // subscriptionKey: byt rum -> riv + öppna ny (filtret ändras). channelName/client/
    // enabled: byt klient eller tänd/släck live -> samma. onChange/tables läses via ref.
  }, [enabled, client, channelName, subscriptionKey]);
}
