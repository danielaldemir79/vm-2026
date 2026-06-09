// Publik yta för tema-systemet. Konsumenter importerar härifrån, inte från
// enskilda filer, så intern struktur kan ändras utan att bryta call-sites.

export { ThemeProvider } from './ThemeProvider';
export { useTheme } from './useTheme';
export type { ThemeContextValue } from './theme-context';
export type { Theme } from './theme-constants';
export {
  THEMES,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  THEME_ATTRIBUTE,
  isTheme,
} from './theme-constants';
