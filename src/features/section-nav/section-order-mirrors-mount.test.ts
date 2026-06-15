// MEKANISK VAKT (#173 T82 del 4, F1): sektions-navets `order`-tal MÅSTE spegla den ordning
// sektionerna MONTERAS i App.tsx. Navet (SectionNav) sorterar chip-raden PURT på `order`
// (section-nav-context), medan sidan scrollar i DOM-/monterings-ordning. Om ett `order`-tal
// inte matchar monterings-ordningen blir chip-raden INVERTERAD mot sidan i live-läge: en länk
// listas före en sektion som fysiskt ligger efter, och scroll-spy:ns aktiva markering hoppar
// baklänges. EXAKT det hände när den globala topplistan fick order 75 men monteras EFTER
// per-rums-topplistan (order 80), och inget test fångade det (lessons design-frontend, F1).
//
// VAD TESTET GÖR: läser App.tsx, hittar var varje navigerbar sektion MONTERAS (dess Section-/
// View-komponent i JSX), sorterar sektionerna på den FAKTISKA käll-positionen, och kräver att
// deras `order`-tal då är STRIKT STIGANDE. Driftar ett order-tal isär från monterings-
// ordningen (eller flyttas en sektion i App.tsx utan att order följer med) blir testet RÖTT.

import { describe, expect, it } from 'vitest';
import { SECTIONS } from './section-labels';

// Monterings-MARKÖR per navigerbar sektion: den JSX-komponent som renderar sektionens vy i
// App.tsx (den bär useRegisterSection(SECTIONS.x)). Markören är komponent-namnet så det
// matchar exakt EN mount-punkt. Håll denna i synk om en sektion byter mount-komponent.
const MOUNT_MARKER: Record<keyof typeof SECTIONS, string> = {
  daily: '<DailyMatchesView',
  groups: '<GroupStageView',
  scenarios: '<ScenarioView',
  bracket: '<BracketView',
  predictions: '<PredictionSection',
  groupPredictions: '<GroupPredictionSection',
  bracketPredictions: '<BracketPredictionSection',
  leaderboard: '<LeaderboardSection',
  totalLeaderboard: '<TotalLeaderboardSection',
};

// Läs App.tsx som RÅ text via Vites import.meta.glob (repots konvention för käll-scans, samma
// bundler-läge som day-theme-contrast-guard, inga Node-typer / nytt beroende, PRINCIPLES §11).
const APP_SOURCES = import.meta.glob('../../App.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const appSource = Object.values(APP_SOURCES)[0] ?? '';

describe('sektions-order speglar App.tsx-monterings-ordningen', () => {
  it('varje navigerbar sektion har en (unik) mount-punkt i App.tsx', () => {
    for (const [key, marker] of Object.entries(MOUNT_MARKER)) {
      const first = appSource.indexOf(marker);
      const last = appSource.lastIndexOf(marker);
      expect(first, `mount-markör saknas i App.tsx för ${key}: ${marker}`).toBeGreaterThanOrEqual(
        0
      );
      // Unik markör => ingen tvetydig mount-ordning.
      expect(first, `mount-markör ${marker} förekommer flera gånger i App.tsx`).toBe(last);
    }
  });

  it('order-talen är STRIKT STIGANDE i samma ordning som sektionerna monteras', () => {
    // Sortera sektionerna på var de FAKTISKT monteras i App.tsx (käll-position).
    const inMountOrder = (Object.keys(MOUNT_MARKER) as (keyof typeof SECTIONS)[])
      .map((key) => ({
        key,
        pos: appSource.indexOf(MOUNT_MARKER[key]),
        order: SECTIONS[key].order,
      }))
      .sort((a, b) => a.pos - b.pos);

    // Längs monterings-ordningen måste order vara strikt stigande, annars är chip-raden
    // inverterad mot sidan (F1-buggen). Felmeddelandet pekar ut det driftande paret.
    for (let i = 1; i < inMountOrder.length; i++) {
      const prev = inMountOrder[i - 1];
      const curr = inMountOrder[i];
      expect(
        curr.order,
        `order-inversion: ${curr.key} (order ${curr.order}) monteras EFTER ${prev.key} ` +
          `(order ${prev.order}) i App.tsx, men har ett LÄGRE/lika order-tal. Chip-raden skulle ` +
          `då lista ${curr.key} före ${prev.key} fast sidan scrollar tvärtom. Sätt order så det ` +
          `speglar monterings-ordningen (lessons design-frontend, F1).`
      ).toBeGreaterThan(prev.order);
    }
  });

  it('alla navigerbara sektioner i katalogen har en mount-markör (ingen tappad sektion)', () => {
    // Skydd mot att en NY sektion läggs i SECTIONS men glöms i MOUNT_MARKER (då skulle den
    // smita förbi vakten ovan). Varje SECTIONS-nyckel måste ha en markör.
    const catalogKeys = Object.keys(SECTIONS).sort();
    const markerKeys = Object.keys(MOUNT_MARKER).sort();
    expect(markerKeys).toEqual(catalogKeys);
  });
});
