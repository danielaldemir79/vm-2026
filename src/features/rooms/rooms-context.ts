// Rums-storens kontrakt + context + konsument-hook (T14, #14).
//
// Bär bara TYP-KONTRAKTET + context + hooken (ingen komponent), så
// react-refresh-regeln hålls ren och provider-komponenten bor i RoomsProvider.tsx
// (samma uppdelning som ResultsProvider / results-context).
//
// ANSVAR: hålla "vilket rum är aktivt + dess medlemmar + delade resultat + auth-
// identitet" och exponera handlingarna (skapa, gå med, lämna, ladda om, spara
// resultat). UI:t (RoomPanel) är en tunn konsument. Inget av detta rör tracker-
// basen (lag/grupper/matcher), den är statisk; rummen är ett ADDITIVT socialt lager.

import { createContext, useContext } from 'react';
import type { RoomMatchResult, RoomMember, RoomResultInput, RoomSummary } from '../../data/rooms';
import type { CopyReport } from '../../data/predictions';

/** Laddningstillstånd för rums-lagret (samma vokabulär som results-storen). */
export type RoomsStatus = 'loading' | 'ready' | 'error';

/** Vad rums-storen exponerar till UI:t. */
export interface RoomsStore {
  /** Är live-läget aktivt (Supabase konfigurerat)? Annars är rummen inaktiva. */
  enabled: boolean;
  status: RoomsStatus;
  /** Felmeddelande vid status === 'error' (fail loud, inte tyst tom). */
  error: string | null;
  /** Den anonyma användarens id (null tills auth-sessionen är klar). */
  userId: string | null;
  /** Rum användaren är medlem i. */
  myRooms: RoomSummary[];
  /** Det aktiva rummet (null = inget valt, då är resultatinmatning lokal). */
  activeRoom: RoomSummary | null;
  /** Medlemmar i det aktiva rummet. */
  members: RoomMember[];
  /** Delade resultat i det aktiva rummet. */
  results: RoomMatchResult[];
  /**
   * INVALIDERINGS-RÄKNARE för tips-vyerna (T61, #110). Bumpas av copyMyTips efter en
   * LYCKAD kopiering (minst ett tips kopierat) IN i det aktiva rummet. Tips-vyernas
   * providers (match-/grupp-/bracket-tips + topplistan) har detta tal i sina
   * fetch-deps och hämtar då om sina rader, så kopierade tips syns DIREKT utan rum-byte.
   * Samma seam-anda som T55:s `lockedMatchCount`: ett monotont tal i fetch-deps som
   * triggar en (1) tyst re-fetch när det ändras. INGEN polling, talet är stabilt i vila.
   */
  tipsRefreshNonce: number;

  /** Skapa ett nytt rum och gör det aktivt. Kastar vid fel (UI fångar). */
  createRoom: (name: string, displayName: string) => Promise<void>;
  /**
   * Gå med via kod och gör rummet aktivt. Returnerar false om koden inte fanns
   * (UI visar "rummet finns inte"), kastar vid andra fel.
   */
  joinRoom: (code: string, displayName: string) => Promise<boolean>;
  /** Välj ett rum man redan är med i som aktivt. */
  selectRoom: (roomId: string) => Promise<void>;
  /** Lämna det aktiva rummet (eller ett givet rum). */
  leaveRoom: (roomId: string) => Promise<void>;
  /** Ladda om medlemmar + resultat för det aktiva rummet (fokus/online-event). */
  refresh: () => Promise<void>;
  /** Spara ett delat matchresultat i det aktiva rummet. */
  saveResult: (input: RoomResultInput) => Promise<void>;
  /**
   * Kopiera MINA tips (match + grupp + bracket) FRÅN ett annat rum jag är med i TILL
   * det AKTIVA rummet (T52, #91). Fyller bara tomma tips i målet (skriver aldrig över),
   * hoppar låsta, och returnerar en ärlig rapport (X kopierade, Y låsta, Z redan tippade,
   * ev. fel). Kastar vid en LÄSmiss (kan inte kopiera blint); enskilda skrivfel fångas
   * per item och stoppar inte resten.
   */
  copyMyTips: (sourceRoomId: string) => Promise<CopyReport>;
}

/**
 * Context med medvetet `null`-default: en konsument MÅSTE ligga under en
 * RoomsProvider. Saknas providern fail-loud:ar useRoomsStore (nedan).
 */
export const RoomsStoreContext = createContext<RoomsStore | null>(null);

/**
 * Läs rums-storen. KASTAR utan provider (fail loud, PRINCIPLES §8): en konsument
 * utan provider är ett wiring-fel, inte ett tillstånd att maskera med tom data.
 */
export function useRoomsStore(): RoomsStore {
  const store = useContext(RoomsStoreContext);
  if (store === null) {
    throw new Error('useRoomsStore måste användas inuti en <RoomsProvider>.');
  }
  return store;
}

/**
 * Den DELMÄNGD av rums-storen som results-lagret behöver för att väva in delade
 * resultat (T14, KA-F3). Skild från RoomsStore så ResultsProvider bara kopplas
 * mot exakt det den behöver (lägsta koppling): vilket rum är aktivt, vilka delade
 * resultat finns, och hur man sparar ett resultat till rummet.
 */
export interface RoomsSync {
  /** Det aktiva rummets id, eller null (lokalt läge, inget delat). */
  activeRoomId: string | null;
  /** De delade resultaten i det aktiva rummet (tomt i lokalt läge). */
  sharedResults: RoomMatchResult[];
  /** Spara ett resultat till det aktiva rummet (no-op utan aktivt rum). */
  saveResult: (input: RoomResultInput) => Promise<void>;
  /**
   * Invaliderings-räknare för tips-vyerna (T61, #110): bumpas efter en lyckad
   * tips-kopiering, så tips-providers kan re-fetcha via sina deps. 0 utan provider.
   * Bärs på synk-seamen så tips-providers (som redan läser activeRoomId härifrån)
   * inte behöver en NY koppling till hela rums-storen.
   */
  tipsRefreshNonce: number;
  /**
   * Den inloggade (anonyma) användarens id, eller null (utloggad / lokalt läge).
   * Bärs på synk-seamen (T66, #121) så kommentar-lagret kan veta vilka kommentar-
   * rader som är "mina" (visa radera-knapp) UTAN en ny koppling till hela rums-storen.
   */
  userId: string | null;
}

/** Inert rums-synk: inget aktivt rum, inga delade resultat, spar är en no-op. */
const INERT_ROOMS_SYNC: RoomsSync = {
  activeRoomId: null,
  sharedResults: [],
  saveResult: async () => {},
  tipsRefreshNonce: 0,
  userId: null,
};

/**
 * Läs rums-synk-delen TOLERANT mot en saknad provider (T14, KA-F3).
 *
 * VARFÖR tolerant (till skillnad från useRoomsStore som kastar): results-lagret
 * (ResultsProvider) ligger NÄSTLAT inuti RoomsProvider i appen, men renderas i
 * MÅNGA tester (och kan i princip återanvändas) UTAN en RoomsProvider. Det delade
 * rums-lagret är ett ADDITIVT socialt lager: utan ett rum ska resultatinmatningen
 * fungera precis som förr (lokalt). Därför faller hooken till en INERT synk utan
 * provider, i stället för att tvinga varje results-konsument under en RoomsProvider
 * (samma tolerans-mönster som useFeedbackSettings i app-settings). Det är just
 * "lokal-läge utan rum = som idag"-kravet i KA-F3 punkt (c), uttryckt i typen.
 */
export function useRoomsSync(): RoomsSync {
  const store = useContext(RoomsStoreContext);
  if (store === null) {
    return INERT_ROOMS_SYNC;
  }
  return {
    activeRoomId: store.activeRoom?.id ?? null,
    sharedResults: store.results,
    saveResult: store.saveResult,
    tipsRefreshNonce: store.tipsRefreshNonce,
    userId: store.userId,
  };
}
