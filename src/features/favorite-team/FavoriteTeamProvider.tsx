// Provider för det pinnade favoritlaget (T23, #23). Persistens i localStorage via
// den delade safe-storage-hjälparen (robust mot blockerad/privat storage). INGET är
// pinnat som standard (frånvaro av nyckeln = inget favoritlag), så en ny användare
// får aldrig oombedd ett gissat lag.
//
// Mönstret speglar SettingsProvider/ThemeProvider: lazy-init från storage, persistera
// vid varje uttryckligt val (det ENDA stället ett val skrivs).

import { useCallback, useState, type ReactNode } from 'react';
import {
  readFavoriteTeamId,
  writeFavoriteTeamId,
  clearFavoriteTeamId,
} from './favorite-team-storage';
import { FavoriteTeamContext, type FavoriteTeamStore } from './favorite-team-context';

interface FavoriteTeamProviderProps {
  children: ReactNode;
}

export function FavoriteTeamProvider({ children }: FavoriteTeamProviderProps) {
  // Lazy-init: läs en gång vid mount. Ingen nyckel -> null (inget pinnat).
  const [favoriteTeamId, setFavoriteTeamIdState] = useState<string | null>(() =>
    readFavoriteTeamId()
  );

  // Persistera vid uttryckligt val (utanför setState-updatern, så StrictMode:s
  // dubbel-körning inte skriver två gånger, samma kontrakt som SettingsProvider).
  const setFavoriteTeam = useCallback((teamId: string) => {
    writeFavoriteTeamId(teamId);
    setFavoriteTeamIdState(teamId);
  }, []);

  const clearFavoriteTeam = useCallback(() => {
    clearFavoriteTeamId();
    setFavoriteTeamIdState(null);
  }, []);

  const store: FavoriteTeamStore = { favoriteTeamId, setFavoriteTeam, clearFavoriteTeam };

  return <FavoriteTeamContext.Provider value={store}>{children}</FavoriteTeamContext.Provider>;
}
