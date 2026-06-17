// React-SEAM för dags-temat (T8, issue #8): kopplar den rena härledningen
// (deriveDayTheme) till DOM:en utan att äga något visuellt.
//
// ANSVAR (tunt, funktionellt): ta dagens matcher + lag-uppslag + dag-nyckel,
// härled dags-temat (memoiserat), och returnera ett STABILT seam som vyn lägger
// på sin dekor-yta:
//   - en CSS-variabel `--vm-day-hue` (heltals-grad, eller utelämnad i default-
//     läget) som designen väver in i gradienter/glow ovanpå T2:s tokens,
//   - data-attribut (`data-day-theme`, `data-day-theme-source`) som STABIL hake
//     för premium-styling och för test/felsökning.
//
// VARFÖR en hook och inte styling här: senior-dev äger NÄR/HUR temat HÄRLEDS
// (deterministiskt, testbart, kontrast-säkert), designen äger HUR det SER
// UT. Hooken ger en ren seam mellan lagren (samma uppdelning som målfirande-
// kroken, patterns.md). Mjuka ÖVERGÅNGAR vid dag-byte sköts av en CSS-transition
// på dekor-ytan (sätts av designen i CSS), som den befintliga
// reduced-motion-grinden (index.css) nollar, så acceptanskriterium 3 (mjuka
// övergångar, respekterar reduced-motion) hålls utan en egen JS-grind.

import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { Match, Team } from '../../domain/types';
import { deriveDayTheme, type DayTheme } from './day-theme';

/** Vad seamen ger vyn: temat + de props som läggs på dekor-ytan. */
export interface DayThemeSeam {
  /** Den härledda temat (hue + source), för test/felsökning. */
  theme: DayTheme;
  /**
   * Props att SPREADA på den dekorativa hero-/sektions-ytan. `style` sätter
   * CSS-variabeln `--vm-day-hue` (utelämnad i default-läget så ytan faller
   * tillbaka på T2:s neutrala dekor). data-attributen är stabila styling-/test-
   * hakar. INNEHÅLLER ALDRIG text-/yt-färg, bara en dekorativ hue (kontrast-vakt).
   */
  dayThemeProps: {
    'data-day-theme': string;
    'data-day-theme-source': DayTheme['source'];
    style: CSSProperties;
  };
}

/**
 * Härled dags-temats seam för den valda dagen.
 *
 * @param matches    Den valda dagens matcher (selectedDay.matches), [] = vilodag.
 * @param teamsById  teamId -> Team (samma uppslag som matchkorten).
 * @param dateKey    Den valda dagens svenska kalenderdatum, för date-fallbacken
 *                   (slutspelsdag innan seedningen). Utelämnas vid ingen vald dag.
 */
export function useDayTheme(
  matches: readonly Match[],
  teamsById: ReadonlyMap<string, Team>,
  dateKey?: string
): DayThemeSeam {
  // Härled temat när indata ändras (dag-byte, inmatning som ändrar lagen, ny
  // lag-data). Ren funktion -> memo räcker, inga effekter/sido-effekter.
  const theme = useMemo(
    () => deriveDayTheme(matches, teamsById, dateKey),
    [matches, teamsById, dateKey]
  );

  const dayThemeProps = useMemo(() => {
    // I default-läget (vilodag) sätter vi INGEN --vm-day-hue, så dekor-ytan
    // behåller T2:s neutrala ton i stället för en gissad färg. data-attributet
    // 'default' låter design ändå styla vilodagen distinkt om den vill.
    const style: CSSProperties =
      theme.hue === null
        ? {}
        : // CSS-variabeln bär bara en hue-grad (ett tal). Färgen byggs av design
          // via hsl()/color-mix i CSS, så VÄRDET här kan aldrig själv bli en
          // text-/yt-färg som sänker kontrast (kontrast-vakt i kod).
          ({ '--vm-day-hue': String(theme.hue) } as CSSProperties);
    return {
      'data-day-theme': theme.hue === null ? 'default' : 'active',
      'data-day-theme-source': theme.source,
      style,
    };
  }, [theme]);

  return { theme, dayThemeProps };
}
