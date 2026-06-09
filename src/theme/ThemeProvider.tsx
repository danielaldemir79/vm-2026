// React-provider för tema-systemet.
//
// Designprincip (no-flash): inline-scriptet i index.html har REDAN satt rätt
// tema på <html> innan React monterades. Providern ska därför INTE räkna om
// initial-temat (det skulle riskera en flash om den landade annorlunda) utan
// LÄSA det inline-scriptet redan satte (readThemeFromDocument) och ta över
// därifrån. React äger temat efter mount, inline-scriptet äger det före.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ThemeContext } from './theme-context';
import type { Theme } from './theme-constants';
import { applyThemeToDocument, nextTheme, persistTheme, readThemeFromDocument } from './theme-core';

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Lazy initializer: läs en gång vid mount, från det attribut inline-scriptet
  // satte. I testmiljö (utan inline-script) faller readThemeFromDocument till
  // DEFAULT_THEME, vilket är rätt deterministiska startläge för tester.
  const [theme, setThemeState] = useState<Theme>(() => readThemeFromDocument(document));

  // Spegla state -> DOM + persistens. Körs vid varje temaändring. Vid första
  // körningen är DOM redan rätt (inline-scriptet), så detta är idempotent.
  useEffect(() => {
    applyThemeToDocument(document, theme);
    persistTheme(window.localStorage, theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => nextTheme(current));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
