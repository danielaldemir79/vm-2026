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
