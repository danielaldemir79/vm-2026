// Supabase Realtime-seam (T18, #18): EN inkapslad punkt för postgres_changes-
// prenumerationer, så resten av appen aldrig rör Supabase-kanal-API:t direkt.
//
// VARFÖR en egen modul (inte i providers): kanal-API:t (.channel().on(...).subscribe()
// + removeChannel) är det enda Supabase-specifika; att samla det här gör det (a)
// testbart med en mock-klient (providers slipper känna kanal-formen), (b) DRY, samma
// setup återanvänds av facit-lagret OCH rums-lagret, och (c) lätt att byta strategi
// senare (t.ex. Broadcast-from-DB vid skala) utan att röra providers.
//
// DESIGN (KISS, härledd state, se docs/decisions.md T18): vi gör INGEN rad-för-rad-
// merge i klienten. En postgres_changes-händelse är bara en SIGNAL "något ändrades i
// den här tabellen", och vi svarar genom att köra SAMMA tysta re-fetch-väg som
// fokus/online-lyssnaren redan kör (refresh() / tipsRefreshNonce). Re-fetchen går
// genom RLS som vanligt, så facit/medlemmar/resultat alltid blir korrekt filtrerade.
// Vi läser därför ALDRIG payloadens rad-data (inget `new`/`old`), bara att en
// händelse kom. Det är också sekretess-skyddet: även om en tabell vi prenumererar på
// skulle bära känsligt fält rör vi det aldrig (och tips-tabellerna prenumererar vi
// inte ens på, se migrationen 20260612072518_t18_realtime_publication.sql).
//
// RLS: postgres_changes respekterar RLS (Supabase "Realtime Authorization" ->
// "Interaction with Postgres Changes": rader skickas bara till klienter som får läsa
// dem). För att Realtime ska veta VEM klienten är måste den anonyma sessionens JWT
// vara satt på realtidskanalen; supabase-js gör det automatiskt från auth-sessionen
// (samma klient-singleton som äger sessionen), men vi anropar setAuth() defensivt så
// en redan etablerad session säkert är bunden innan vi subscribar (no-op om redan satt).

import type { VmSupabaseClient } from '../supabase-browser';

/** En postgres_changes-händelsetyp vi bryr oss om (vi reagerar på alla med '*'). */
export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

/** En tabell-prenumeration: tabellen + ev. ett rad-filter (t.ex. ett rum). */
export interface TableSubscription {
  /** Tabellnamn i public-schemat (måste ingå i supabase_realtime-publikationen). */
  table: string;
  /**
   * Valfritt rad-filter i Supabases postgres_changes-format, t.ex. `room_id=eq.<id>`.
   * Begränsar vilka rader som triggar (mindre brus), men är INTE ett säkerhetsskydd,
   * RLS är det riktiga skyddet. DELETE-händelser kan inte filtreras (Supabase-
   * begränsning), så ett filter gäller INSERT/UPDATE; vi reagerar likadant ändå
   * (signal -> re-fetch), så det spelar ingen roll för korrektheten.
   */
  filter?: string;
}

/** En unsubscribe-funktion som river kanalen (idempotent: säker att kalla flera gånger). */
export type Unsubscribe = () => void;

export interface RealtimeSubscriptionConfig {
  /** Den typade Supabase-klienten (samma singleton som äger auth-sessionen). */
  client: VmSupabaseClient;
  /** Unikt kanalnamn (Supabase tillåter alla strängar utom 'realtime'). */
  channelName: string;
  /** Tabeller (+ ev. filter) att lyssna på. Alla läggs på SAMMA kanal. */
  tables: TableSubscription[];
  /**
   * Anropas vid VARJE relevant postgres_changes-händelse. Tunn signal: ingen
   * payload skickas vidare med flit (vi refetchar i stället för att merge:a rad-data).
   * Anroparen kör sin egen tysta re-fetch-väg (refresh / bump nonce) här.
   */
  onChange: () => void;
}

/**
 * Öppna EN realtidskanal med postgres_changes-lyssnare för de givna tabellerna och
 * kör `onChange` vid varje händelse. Returnerar en unsubscribe som river kanalen.
 *
 * Fail-safe: kanal-fel kraschar aldrig appen, fokus/online-refetchen + minut-ticken
 * finns kvar som skyddsnät (de tas medvetet INTE bort, T18-direktivet). En kanal som
 * inte når 'SUBSCRIBED' loggas (fail-loud i konsolen) men appen fortsätter fungera
 * via skyddsnäten.
 */
export function subscribeToTableChanges(config: RealtimeSubscriptionConfig): Unsubscribe {
  const { client, channelName, tables, onChange } = config;

  // Bind den nuvarande sessionens JWT till realtidskanalen så RLS vet vem klienten är
  // (no-op om supabase-js redan satt den från auth-sessionen). Defensivt: en kanal som
  // subscribas innan token är bunden skulle inte få RLS-skyddade rader. setAuth är
  // async (hämtar ev. en färsk token); vi väntar inte (fire-and-forget) eftersom
  // subscribe ändå skickar token vid join och en miss faller till skyddsnäten.
  void client.realtime.setAuth();

  let channel = client.channel(channelName);
  for (const { table, filter } of tables) {
    channel = channel.on(
      'postgres_changes',
      filter !== undefined
        ? { event: '*', schema: 'public', table, filter }
        : { event: '*', schema: 'public', table },
      // Vi ignorerar payloaden MED FLIT (se modul-doc): händelsen är bara en signal.
      () => {
        onChange();
      }
    );
  }

  // Deklareras FÖRE subscribe så status-callbacken kan se rivnings-flaggan: ett
  // sent 'CLOSED'/'TIMED_OUT' som anländer EFTER att vi rivit kanalen (eller efter att
  // testmiljön tagit ner jsdom) ska tystas, inte loggas (se nedan).
  let removed = false;

  channel.subscribe((status) => {
    // 'SUBSCRIBED' = uppkopplad (Supabase "Realtime Authorization"-exemplet). Alla
    // andra status (fel/timeout/stängd) loggas fail-loud men appen lever vidare på
    // skyddsnäten (fokus/online-refetch + minut-tick). Vi gör ingen egen reconnect-
    // loop: supabase-js sköter åter-uppkoppling av WebSocket internt, och nästa
    // lyckade subscribe / fokus-refetch hämtar ändå färsk data.
    //
    // TYSTA STATUS EFTER RIVNING (T70): subscribe-callbacken är ASYNKRON och kan fyra
    // ett 'CLOSED'/'TIMED_OUT' EFTER att vi redan rivit kanalen (unsubscribe -> removed)
    // eller, i testmiljön, efter att jsdom tagits ner mellan testfiler (då finns inget
    // `window` och en logg/scheduler-touch ger "window is not defined"-brus i teardown).
    // En status som kommer efter att vi medvetet stängt kanalen är per definition inte
    // intressant (vi kopplar inte upp igen), så vi loggar den inte. Detta är även korrekt
    // i produktion: en CLOSED som är följden av VÅR egen removeChannel är väntad, inte ett
    // fel att larma om.
    if (removed || typeof window === 'undefined') {
      return;
    }
    if (status !== 'SUBSCRIBED') {
      console.warn(
        `[VM2026] Realtime-kanal "${channelName}" status: ${status}. ` +
          'Live-uppdateringar kan vara pausade; fokus/online-refetch + minut-tick är kvar som skyddsnät.'
      );
    }
  });

  return () => {
    if (removed) {
      return; // idempotent: dubbel-unsubscribe (t.ex. unmount + rum-byte) är säkert
    }
    removed = true;
    // removeChannel river prenumerationen OCH stänger kanalen (Supabase-docs React-
    // cleanup-mönstret: `supabase.removeChannel(channel)` i useEffect-cleanup).
    void client.removeChannel(channel);
  };
}
