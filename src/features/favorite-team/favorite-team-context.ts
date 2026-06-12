// Context + konsument-hook för det pinnade favoritlaget (T23, #23). Skild fil från
// providern så fast-refresh inte varnar (samma mönster som theme-context/settings-
// context), och så konsumenter kan importera hooken utan providern.

import { createContext, useContext } from 'react';

/** Vad favoritlags-storen exponerar. */
export interface FavoriteTeamStore {
  /** Det pinnade favoritlagets id (Team.id), eller null när inget är pinnat. */
  favoriteTeamId: string | null;
  /** Pinna (eller byta) favoritlag. Persistas i localStorage. */
  setFavoriteTeam: (teamId: string) => void;
  /** Avpinna favoritlaget (rensa). Persistas (nyckeln tas bort). */
  clearFavoriteTeam: () => void;
}

/** Tolerant default: ingen provider -> inget favoritlag, setter:na är no-ops. */
const NO_FAVORITE: FavoriteTeamStore = {
  favoriteTeamId: null,
  setFavoriteTeam: () => {},
  clearFavoriteTeam: () => {},
};

// undefined-default skiljer "ingen provider" från "provider men inget pinnat lag".
export const FavoriteTeamContext = createContext<FavoriteTeamStore | undefined>(undefined);

/**
 * Läs favoritlags-storen, TOLERANT mot en saknad provider.
 *
 * VARFÖR tolerant (som useFeedbackSettings): favoritlaget är en ren VALBAR
 * personaliserings-yta. En kärn-vy (t.ex. matchkortet/dagsvyn) ska fungera fullt
 * ut utan att TVINGAS känna till providern; saknas den faller vi till "inget
 * favoritlag" (ingen markering) i stället för att krascha. Setter:na är no-ops då.
 */
export function useFavoriteTeam(): FavoriteTeamStore {
  return useContext(FavoriteTeamContext) ?? NO_FAVORITE;
}
