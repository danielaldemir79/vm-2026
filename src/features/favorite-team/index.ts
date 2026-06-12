// Publik yta för favoritlags-featuren (T23, #23). App och vyer importerar härifrån
// så intern filstruktur kan ändras utan att bryta call-sites.

export { FavoriteTeamProvider } from './FavoriteTeamProvider';
export { FavoriteTeamControl } from './FavoriteTeamControl';
export type { FavoriteTeamControlProps } from './FavoriteTeamControl';
export { FavoriteTeamPicker } from './FavoriteTeamPicker';
export type { FavoriteTeamPickerProps } from './FavoriteTeamPicker';
export { useFavoriteTeam } from './favorite-team-context';
export type { FavoriteTeamStore } from './favorite-team-context';

// Rena härledningar (testbara, återanvändbara av vyer): uppslag mot lag-listan +
// matchnings-predikatet för den diskreta lyftningen av favoritlagets matcher.
export { resolveFavoriteTeam, matchHasFavorite } from './resolve-favorite';

// Persistens-nyckeln (exporteras så App-/integrationstester kan sätta den för att
// försätta appen i ett känt läge, samma som ONBOARDING_DONE_KEY m.fl.).
export { FAVORITE_TEAM_KEY } from './favorite-team-storage';
