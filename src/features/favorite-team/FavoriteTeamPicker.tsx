// WIRAD favoritlags-väljare (T23, #23): kopplar den rena FavoriteTeamControl till
// favoritlags-storen (useFavoriteTeam). En tunn adapter, så call-sitet bara behöver
// skicka in lag-listan (som det redan har), och storen/persistensen sköts här.
//
// VARFÖR skild från FavoriteTeamControl: kontrollen är en ren, data-oberoende
// presentations-komponent (testbar utan provider). Denna wrapper är seamen mot storen,
// samma uppdelning som rena vyer vs providers i resten av appen.

import type { Team } from '../../domain/types';
import { FavoriteTeamControl } from './FavoriteTeamControl';
import { useFavoriteTeam } from './favorite-team-context';

export interface FavoriteTeamPickerProps {
  /** Lag-listan (de 48 lagen) att välja bland. */
  teams: readonly Team[];
}

export function FavoriteTeamPicker({ teams }: FavoriteTeamPickerProps) {
  const { favoriteTeamId, setFavoriteTeam, clearFavoriteTeam } = useFavoriteTeam();
  return (
    <FavoriteTeamControl
      teams={teams}
      favoriteTeamId={favoriteTeamId}
      onSelect={setFavoriteTeam}
      onClear={clearFavoriteTeam}
    />
  );
}
