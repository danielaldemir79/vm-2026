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

  // Spegla AKTIVT tema -> DOM vid varje ändring. DOM-spegling är idempotent och
  // ren synk (vid mount är DOM redan rätt via inline-scriptet), så den hör hemma
  // i effekten. Persistens gör vi MEDVETET inte här: en mount/sync ska INTE
  // skriva till localStorage. Annars sparas ett system-resolverat tema utan att
  // användaren valt något, och då tar inline-scriptet alltid sparat-grenen och
  // appen slutar följa OS-temat live. Persistens = bara explicit val, se nedan.
  useEffect(() => {
    applyThemeToDocument(document, theme);
  }, [theme]);

  // setTheme/toggleTheme är de ENDA vägarna ett uttryckligt val sker, så det är
  // här (och bara här) vi persisterar. Persistens sker EN gång, UTANFÖR
  // setState-updatern: under StrictMode körs updater-funktioner dubbelt och
  // persist får inte hänga i den vägen. setTheme får sitt nästa-värde explicit.
  // toggleTheme beror på `theme` så den ser aktivt värde (ingen stale closure)
  // och kan räkna ut + persistera nästa tema deterministiskt före setState.
  const setTheme = useCallback((next: Theme) => {
    persistTheme(window.localStorage, next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = nextTheme(theme);
    persistTheme(window.localStorage, next);
    setThemeState(next);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
