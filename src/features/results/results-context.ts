// Den DELADE results-storens kontrakt + context + konsument-hook.
//
// KÄRN-ARKITEKTUR (T6): före T6 ägde useGroupData matchlistan i lokal vy-state,
// så bara gruppspelsvyn kände till matcherna. T6 kräver att en RESULTATINMATNING
// (eget UI) uppdaterar SAMMA matcher som tabellerna härleds ur. Lösningen är att
// LYFTA matchlistan till EN delad källa (denna store, via React-context) som BÅDE
// inmatnings-UI:t och gruppspelsvyn läser. En inmatning -> store uppdaterar
// matcherna -> alla härledda vyer (tabeller, senare slutspelsträd) räknar om
// automatiskt. EN sanning, ingen dubbellagring (SPEC §6).
//
// Storen behåller fixtures-först: den SEEDAR matchlistan från getDataSource()
// (samma env-gate som tidigare) och håller den sedan i state, lokala ändringar
// lagras i minnet. T14 (persistens) och T18 (realtid) kopplas in på SAMMA seam:
// en server-skrivning bakom samma mutator-API, en realtids-prenumeration som
// anropar samma setMatches, utan att röra konsumenterna. Designat för att tändas
// live utan omskrivning.
//
// Denna fil bär bara TYP-KONTRAKTET + context + hooken (ingen komponent), så
// react-refresh-regeln hålls ren och provider-komponenten bor i ResultsProvider.tsx.

import { createContext, useContext } from 'react';
import type { DataSourceMode } from '../../data';
import type { Group, Match, Team } from '../../domain/types';
import type { ResultEntry } from './validate-result';

/** Laddningstillstånd för seedningen (samma vokabulär som T5:s LoadStatus). */
export type ResultsLoadStatus = 'loading' | 'ready' | 'error';

/**
 * Det den delade storen exponerar. Matcherna är den enda sanningen; teams/groups
 * följer med för uppslag i UI:t. Mutatorerna är T6:s skriv-seam (och T14/T18:s).
 *
 * SIMULERINGS-LAGER (T12, what-if-sandbox): `matches` är EFFEKTIVA matcher. När
 * `simulating` är false är de identiska med den riktiga datan. När `simulating`
 * är true är de riktiga matcherna MED ett hypotetiskt overlay applicerat, så att
 * ALLA härledda vyer (tabell, slutspelsträd, "Vad krävs") reagerar på de
 * hypotetiska resultaten UTAN att den riktiga datan ändras. Skriv-seamen
 * (`submitResult`/`setMatches`) ruttas av läget: i sim-läge går de till overlayn,
 * annars till den riktiga datan. Konsumenterna är oförändrade, de läser bara
 * `matches` som vanligt (SPEC §6, härledd state). Se decisions.md T12.
 */
export interface ResultsStore {
  status: ResultsLoadStatus;
  /**
   * Matchlistan, den enda sanningen som tabeller/träd härleds ur. I sim-läge är
   * detta de EFFEKTIVA matcherna (riktiga + overlay), annars den riktiga datan.
   */
  matches: Match[];
  /** Lagen (uppslag namn/landskod i UI:t). */
  teams: Team[];
  /** Grupperna (för härledning av grupptabeller). */
  groups: Group[];
  /** Vilken datakälla som seedade storen (för "demo-data"-märke i UI:t). */
  mode: DataSourceMode;
  /** Felmeddelande vid status === 'error', annars null (fail loud, inte tyst tom). */
  error: string | null;
  /**
   * Ersätt hela matchlistan. Det låg-nivå seamet (T18:s realtid och tester
   * använder det). Resultatinmatnings-UI:t använder hellre `submitResult` nedan,
   * som validerar och uppdaterar EN match.
   */
  setMatches: (matches: Match[]) => void;
  /**
   * Mata in/redigera resultatet för EN match (T6:s huvud-seam). Validerar mot
   * matchens nuvarande status; vid fel uppdateras INGET och felen returneras så
   * formuläret kan visa dem (fail loud, men användarvänligt). Vid framgång
   * uppdateras matchlistan optimistiskt (direkt i minnet) och vyerna räknar om.
   *
   * @returns `{ ok: true }` eller `{ ok: false, errors }` (samma form som
   *          validateResultEntry), så anroparen vet om något ändrades.
   */
  submitResult: (
    matchId: string,
    entry: ResultEntry
  ) => import('./validate-result').ResultValidation;

  /* --------------------------------------------------------------- *
   * Simulerings-seam (T12, what-if-sandbox)
   * --------------------------------------------------------------- */

  /**
   * Är what-if-läget PÅ? När true bär `matches` det hypotetiska overlayt och
   * skrivningar går till overlayn (inte den riktiga datan). UI:t använder detta
   * för en tydlig "simulering"-markering (banner/badge) och för att veta att
   * inmatning är hypotetisk.
   */
  simulating: boolean;

  /**
   * Slå PÅ what-if-läget. Den riktiga datan rörs inte, ett tomt overlay läggs
   * ovanpå, så vyerna ser exakt de riktiga matcherna tills man matar in ett
   * hypotetiskt resultat. Idempotent (att anropa i sim-läge gör inget).
   */
  enterSimulation: () => void;

  /**
   * Slå AV what-if-läget OCH töm overlayn (en knapp = "Avsluta simulering").
   * Effektiva matcher faller tillbaka till den riktiga datan direkt. Idempotent.
   */
  exitSimulation: () => void;

  /**
   * Töm overlayn men STANNA kvar i sim-läge ("Återställ allt", börja om från de
   * riktiga resultaten utan att lämna sandlådan). Ofarlig att anropa även när
   * overlayn redan är tom.
   */
  resetSimulation: () => void;
}

/**
 * Context med ett medvetet `null`-default: en konsument MÅSTE ligga under en
 * ResultsProvider. Saknas providern fail-loud:ar useResultsStore (se nedan) i
 * stället för att tyst ge tom data, så ett wiring-fel upptäcks direkt.
 */
export const ResultsStoreContext = createContext<ResultsStore | null>(null);

/**
 * Läs den delade results-storen. KASTAR om ingen ResultsProvider finns ovanför
 * i trädet (fail loud, PRINCIPLES §8): en konsument utan provider är ett
 * programmeringsfel, inte ett tillstånd att maskera med tom data.
 */
export function useResultsStore(): ResultsStore {
  const store = useContext(ResultsStoreContext);
  if (store === null) {
    throw new Error(
      'useResultsStore måste användas inuti en <ResultsProvider>. Wrappa appen (eller vyn) i providern.'
    );
  }
  return store;
}

/**
 * TOLERANT läsning av results-storen: returnerar null om ingen ResultsProvider finns
 * (i stället för att kasta som useResultsStore). Samma tolerans-mönster som rooms-
 * lagrets useRoomsSync, och bara för ADDITIVA konsumenter där storen är en bonus, inte
 * ett krav: t.ex. grupp-tips-resultatpanelen, som bara är en extra klarhet ovanpå tips-
 * vyn och ska degradera till "ingen panel" (aldrig krascha) om den någon gång renderas
 * utan provider. Krävande konsumenter ska fortsatt använda det fail-loud:ande
 * useResultsStore , den här är det MEDVETNA, dokumenterade undantaget.
 */
export function useOptionalResultsStore(): ResultsStore | null {
  return useContext(ResultsStoreContext);
}
