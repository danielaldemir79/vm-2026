// Själva kontext-objektet, brutet ut från providern och hooken.
//
// Varför egen fil: ESLint-regeln react-refresh/only-export-components vill att
// en komponent-fil bara exporterar komponenter (annars går Fast Refresh sönder).
// Provider-komponenten och useTheme-hooken bor därför i egna filer och delar
// detta kontext-objekt här.

import { createContext } from 'react';
import type { Theme } from './theme-constants';

/** Det providern exponerar: aktivt tema + sätt att ändra det. */
export interface ThemeContextValue {
  /** Aktivt tema just nu. */
  theme: Theme;
  /** Växla mellan mörkt och ljust. */
  toggleTheme: () => void;
  /** Sätt ett specifikt tema (idempotent). */
  setTheme: (theme: Theme) => void;
}

/**
 * undefined som default avsiktligt: en konsument utanför <ThemeProvider> är ett
 * programmerings-fel som ska faila högt (se useTheme), inte tyst falla till ett
 * påhittat default-värde.
 */
export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
