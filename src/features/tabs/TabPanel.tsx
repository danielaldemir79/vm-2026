// En tabpanel (T83, #175): innehållet för EN flik.
//
// KÄRN-BESLUT (logga i decisions.md): alla fem paneler hålls MONTERADE samtidigt;
// den inaktiva fliken döljs med `hidden` (display:none), den aktiva visas. VARFÖR
// inte rendera bara den aktiva:
//   1. STATE BEVARAS. Vyerna håller osparad inmatning + lokalt UI-state i useState
//      (tips-/resultat-formulär, sök-fält, utfällt läge, motion-layout-position). Att
//      avmontera en flik vid byte skulle TAPPA det , exakt den klass av bugg T82 del 4
//      undvek genom att dölja med `hidden` i stället för att avmontera (lessons:
//      "virtualisering som unmountar tappar osparad inmatning"). Flik-byte ska kännas
//      som att byta vy, inte starta om den.
//   2. PROVIDERS + DATA delas. Alla providers (Rooms/Results/Leaderboard/Predictions...)
//      omsluter hela skalet och seedar EN gång; en monterad-men-dold panel kostar nästan
//      inget extra (ingen ny hämtning), och en live-uppdatering (realtid) når alla flikar
//      direkt så topplistan inte är "kall" när man byter till den.
//   3. INGA REGRESSIONER. Befintliga smoke-/integrationstester (App.test.tsx: 12
//      grupptabeller, footer-signaturen) hittar allt innehåll i DOM:en oförändrat.
// `hidden` (display:none) tar bort den dolda panelen UR layouten OCH UR
// tillgänglighets-trädet, så en skärmläsare bara ser den aktiva flikens innehåll
// (ingen dold-men-läsbar dubbel-navigering), och varje flik scrollar rent för sig
// (ingen nästlad scroll-fälla , den dolda panelen tar ingen höjd).
//
// A11Y: role="tabpanel" + aria-labelledby -> flik-knappen (kopplar panel<->flik),
// och tabIndex=0 på den aktiva panelen så tangentbord kan flytta fokus in i
// panel-innehållet efter fliken (WAI-ARIA Tabs-mönstret). En dold panel är `hidden`,
// så den exponerar inget i a11y-trädet.

import type { ReactNode } from 'react';
import { tabButtonId, tabPanelId, type TabId } from './tab-config';

export interface TabPanelProps {
  /** Vilken flik denna panel hör till. */
  tabId: TabId;
  /** Den för tillfället aktiva fliken (denna panel visas bara när de matchar). */
  activeTab: TabId;
  /** Id-bas (matchar TabBar:s panelIdBase), så aria-controls/-labelledby kopplar ihop. */
  panelIdBase: string;
  /** Flikens innehåll (de monterade vyerna). */
  children: ReactNode;
}

export function TabPanel({ tabId, activeTab, panelIdBase, children }: TabPanelProps) {
  const active = tabId === activeTab;
  return (
    <div
      role="tabpanel"
      id={tabPanelId(panelIdBase, tabId)}
      aria-labelledby={tabButtonId(tabId)}
      data-tab-panel={tabId}
      data-active={active ? 'true' : undefined}
      // Dold panel: `hidden` (display:none) => ur layout + ur a11y-trädet. Aktiv
      // panel är fokuserbar (tabIndex 0) så fokus kan flyttas in efter flik-raden.
      hidden={!active}
      tabIndex={active ? 0 : undefined}
    >
      {children}
    </div>
  );
}
