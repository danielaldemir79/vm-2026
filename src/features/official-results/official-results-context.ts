// Kontrakt + context + konsument-hookar för det GLOBALA facit-lagret (T42, #72).
//
// ANSVAR: hålla de GLOBALA officiella matchresultaten (facit) + admin-status, och
// exponera dem var som helst i appen (de är GLOBALA, inte per-rum, så de hör inte
// hemma i rooms-storen). Topplistan, resultat-feedback och admin-inmatningen läser
// härifrån. Bär bara TYP-KONTRAKTET + context + hookar (ingen komponent), så
// react-refresh-regeln hålls ren (provider-komponenten bor i .tsx, samma uppdelning
// som rooms-context / results-context).

import { createContext, useContext } from 'react';
import type { OfficialMatchResult, OfficialResultInput } from '../../data/official';

/** Laddningstillstånd för facit-lagret (samma vokabulär som övriga stores). */
export type OfficialResultsStatus = 'loading' | 'ready' | 'error';

/** Vad facit-storen exponerar. */
export interface OfficialResultsStore {
  /** Är live-läget aktivt (Supabase konfigurerat)? Annars är facit-lagret vilande. */
  enabled: boolean;
  status: OfficialResultsStatus;
  /** Felmeddelande vid status === 'error' (fail loud, inte tyst tom). */
  error: string | null;
  /** De GLOBALA officiella resultaten (facit). Tom i lokalt läge. */
  results: OfficialMatchResult[];
  /** Är den inloggade användaren app-admin (får mata in facit)? Null tills känt. */
  isAdmin: boolean | null;
  /** Admin sparar/ändrar ETT officiellt resultat. Kastar vid fel (UI fångar). */
  saveOfficialResult: (input: OfficialResultInput) => Promise<void>;
  /** Ladda om facit (fokus/online-event). */
  refresh: () => Promise<void>;
}

/**
 * Context med medvetet `null`-default. En konsument MÅSTE ligga under en
 * OfficialResultsProvider; annars fail-loud:ar useOfficialResultsStore.
 */
export const OfficialResultsStoreContext = createContext<OfficialResultsStore | null>(null);

/**
 * Läs facit-storen. KASTAR utan provider (fail loud, PRINCIPLES §8): en konsument
 * utan provider är ett wiring-fel, inte ett tillstånd att maskera med tom data.
 */
export function useOfficialResultsStore(): OfficialResultsStore {
  const store = useContext(OfficialResultsStoreContext);
  if (store === null) {
    throw new Error('useOfficialResultsStore måste användas inuti en <OfficialResultsProvider>.');
  }
  return store;
}

/**
 * Den DELMÄNGD facit-konsumenter (topplistan, resultat-feedback, tracker-vävning)
 * behöver: bara de GLOBALA resultaten. Skild från hela storen så en konsument bara
 * kopplas mot exakt det den behöver (lägsta koppling), och TOLERANT mot en saknad
 * provider (returnerar tomt) , samma mönster som useRoomsSync: facit-lagret är
 * ADDITIVT, en vy utan provider (t.ex. isolerade tester) ska fungera utan facit.
 */
export interface OfficialResultsSync {
  /** De GLOBALA officiella resultaten (facit), tomt utan provider/lokalt läge. */
  officialResults: OfficialMatchResult[];
}

const INERT_OFFICIAL_SYNC: OfficialResultsSync = { officialResults: [] };

/** Läs facit-synk-delen TOLERANT mot en saknad provider (additivt lager). */
export function useOfficialResultsSync(): OfficialResultsSync {
  const store = useContext(OfficialResultsStoreContext);
  if (store === null) {
    return INERT_OFFICIAL_SYNC;
  }
  return { officialResults: store.results };
}
