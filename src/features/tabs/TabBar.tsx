// Den tillgängliga flik-raden (T83, #175): en WAI-ARIA tablist.
//
// ANSVAR (funktionell + tillgänglig struktur; designen lägger premium-
// finishen ovanpå, samma arbetsdelning som tidigare tasks): rendera de fem flikarna
// som en riktig tablist med korrekt roll-semantik, tangentbords-navigering och
// fokus-hantering. Den VISUELLA placeringen (flik-rad längst ner på mobil, top-/
// sido-nav på desktop) bärs av CSS-klasser i tabs.css, så en ren CSS-växling utan
// JS-resize-gissning (samma princip som T79:s sm:-växling).
//
// A11Y (taskens hårda krav, WAI-ARIA Tabs-mönstret):
//   - role="tablist" på containern, role="tab" på varje knapp, aria-selected på den
//     aktiva, aria-controls -> tabpanelens id (kopplingen tab<->panel).
//   - ROVING TABINDEX: bara den aktiva fliken är tabbar (tabIndex 0), övriga -1, så
//     Tab hoppar IN i listan en gång och piltangenterna flyttar mellan flikarna
//     (WAI-ARIA-rekommendationen, inte fem separata tab-stopp).
//   - Piltangenter (vänster/höger + upp/ned, wrap-around) + Home/End flyttar OCH
//     aktiverar fliken (aktivering-vid-fokus, lämpligt här eftersom panelerna redan
//     är monterade , inget dyrt att visa). Fokus följer med till den nya fliken.
//   - aria-current="page" på den aktiva fliken: utöver tab-semantiken markerar den
//     "det här är den vy du är på" för AT som exponerar current, taskens uttryckliga krav.
//   - focus-visible-ring (synlig tangentbords-fokus) via .vm-tab:focus-visible i CSS.
//   - reduced-motion: alla flik-övergångar gatas på prefers-reduced-motion i CSS.

import { useRef } from 'react';
import { TABS, tabButtonId, tabPanelId, type TabId } from './tab-config';
import { TabIcon } from './tab-icon';
import './tabs.css';

export interface TabBarProps {
  /** Den aktiva fliken (driver aria-selected + roving tabindex + aria-current). */
  activeTab: TabId;
  /** Byt flik (skriver state + URL via useTabRouting). */
  onSelect: (id: TabId) => void;
  /** Id-bas för tabpanelerna, så aria-controls pekar på rätt panel (`${idBase}-${tabId}`). */
  panelIdBase: string;
}

export function TabBar({ activeTab, onSelect, panelIdBase }: TabBarProps) {
  // Refs till varje flik-knapp, så piltangents-navigering kan flytta DOM-fokus till
  // den nya fliken (WAI-ARIA: fokus ska följa med vid pil-navigering i en tablist).
  const buttonRefs = useRef<Map<TabId, HTMLButtonElement>>(new Map());

  function focusTab(id: TabId) {
    buttonRefs.current.get(id)?.focus();
  }

  // Piltangents-navigering: flytta till föregående/nästa flik (wrap-around) eller
  // först/sist (Home/End), aktivera den och flytta fokus dit. Vi stödjer både
  // horisontella (vänster/höger) och vertikala (upp/ned) pilar, så raden fungerar
  // likadant oavsett om den ligger som en horisontell rad (mobil-botten/desktop-top)
  // eller skulle renderas vertikalt (en framtida sido-nav).
  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const lastIndex = TABS.length - 1;
    let nextIndex: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = index === lastIndex ? 0 : index + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = index === 0 ? lastIndex : index - 1;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = lastIndex;
        break;
      default:
        return;
    }
    if (nextIndex !== null) {
      event.preventDefault();
      const nextTab = TABS[nextIndex];
      onSelect(nextTab.id);
      focusTab(nextTab.id);
    }
  }

  return (
    <nav
      // data-tab-bar = stabil krok för designens premium-styling (placering,
      // ikoner, indikator-linje) + tester. Den semantiska tablisten ligger inuti.
      data-tab-bar=""
      className="vm-tab-bar"
      aria-label="Appens flikar"
    >
      <div role="tablist" aria-label="Huvudnavigering" className="vm-tab-list">
        {TABS.map((tab, index) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) {
                  buttonRefs.current.set(tab.id, el);
                } else {
                  buttonRefs.current.delete(tab.id);
                }
              }}
              type="button"
              role="tab"
              id={tabButtonId(tab.id)}
              aria-selected={selected}
              aria-controls={tabPanelId(panelIdBase, tab.id)}
              // aria-current="page" på den aktiva fliken (taskens uttryckliga a11y-krav,
              // utöver aria-selected). Markerar "den vy du är på" för AT som läser current.
              aria-current={selected ? 'page' : undefined}
              // ROVING TABINDEX: bara aktiv flik är i tab-ordningen.
              tabIndex={selected ? 0 : -1}
              data-tab={tab.id}
              data-active={selected ? 'true' : undefined}
              className="vm-tab"
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {/* Ikon + etikett (D1): glyfen ankrar fliken visuellt (Sofascore-
                  mönstret), etiketten bär det tillgängliga namnet. På aktiv flik
                  fylls glyfen (D2, extra tyngd utöver färgen). */}
              <TabIcon name={tab.icon} active={selected} />
              <span className="vm-tab-label">{tab.label}</span>
              {/* Glidande aktiv-indikator (D2): en accent-stav som markerar aktiv
                  flik. Renderas bara på den aktiva fliken; CSS placerar den (topp-
                  stav på mobil, underlinje på desktop) och tonar in den mjukt
                  (gatat på reduced-motion). aria-hidden, ren dekor. */}
              {selected ? <span aria-hidden="true" className="vm-tab-indicator" /> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
