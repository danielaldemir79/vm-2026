// Hook för att konsumera tema-kontexten.

import { useContext } from 'react';
import { ThemeContext, type ThemeContextValue } from './theme-context';

/**
 * Läs aktivt tema + ändrings-funktioner.
 *
 * Fail loud: anropas hooken utanför <ThemeProvider> kastar den ett tydligt fel
 * i stället för att tyst returnera ett påhittat default. Det är ett uppställnings-
 * fel som ska upptäckas direkt under utveckling, inte gömmas.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme måste användas inuti en <ThemeProvider>.');
  }
  return context;
}
