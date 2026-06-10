// Kontrakt + context + konsument-hook för lag-profilen som öppnas från VAR SOM HELST.
//
// VARFÖR en context: profil-vyn (en modal/overlay) ska kunna öppnas både från ett
// matchkort (daily + resultat) och från en gruppspelstabell. I stället för att
// prop-drilla en "öppna profil"-callback genom alla vyer lyfter vi "vilket lag är
// öppet?" till en delad context (samma princip som results-storen, T6). En klickbar
// lag-knapp anropar openProfile(teamId); modalen läser openTeamId och visar laget.
//
// Denna fil bär bara TYP-KONTRAKTET + context + hooken (ingen komponent), så
// react-refresh-regeln hålls ren och provider-komponenten bor i TeamProfileProvider.tsx
// (samma uppdelning som results-context.ts / ResultsProvider.tsx).

import { createContext, useContext } from 'react';

/** Det den delade profil-storen exponerar. */
export interface TeamProfileStore {
  /** Lag-id för det lag vars profil är öppen, eller null när ingen profil visas. */
  openTeamId: string | null;
  /** Öppna profilen för ett lag (id). Anropas av klickbara lag-knappar i vyerna. */
  openProfile: (teamId: string) => void;
  /** Stäng profilen (Escape, stäng-knapp, klick på bakgrunden). */
  closeProfile: () => void;
}

/**
 * Context med ett medvetet `null`-default: en konsument MÅSTE ligga under en
 * TeamProfileProvider. Saknas providern fail-loud:ar useTeamProfile (se nedan) i
 * stället för att tyst no-op:a, så ett wiring-fel upptäcks direkt (PRINCIPLES §8).
 */
export const TeamProfileContext = createContext<TeamProfileStore | null>(null);

/**
 * Läs den delade profil-storen. KASTAR om ingen TeamProfileProvider finns ovanför
 * i trädet (fail loud): en klickbar lag-knapp utan provider är ett programmeringsfel,
 * inte ett tillstånd att maskera med en tyst no-op.
 */
export function useTeamProfile(): TeamProfileStore {
  const store = useContext(TeamProfileContext);
  if (store === null) {
    throw new Error(
      'useTeamProfile måste användas inuti en <TeamProfileProvider>. Wrappa vyerna i providern.'
    );
  }
  return store;
}
