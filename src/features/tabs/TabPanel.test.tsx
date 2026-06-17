// Enhetstester för tabpanelen (T83, #175): den aktiva panelen visas + är fokuserbar,
// de inaktiva är `hidden` (ur layout + a11y-träd) men MONTERADE (state bevaras).

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TabPanel } from './TabPanel';
import { tabButtonId, tabPanelId } from './tab-config';

const BASE = 'panel';

describe('TabPanel', () => {
  it('den AKTIVA panelen är synlig (inte hidden), fokuserbar, role=tabpanel + kopplad till fliken', () => {
    const { container } = render(
      <TabPanel tabId="idag" activeTab="idag" panelIdBase={BASE}>
        <p>Idag-innehåll</p>
      </TabPanel>
    );
    const panel = container.querySelector('[data-tab-panel="idag"]') as HTMLElement;
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(panel.hasAttribute('hidden')).toBe(false);
    expect(panel.getAttribute('tabindex')).toBe('0');
    expect(panel.id).toBe(tabPanelId(BASE, 'idag'));
    expect(panel.getAttribute('aria-labelledby')).toBe(tabButtonId('idag'));
    expect(panel.getAttribute('data-active')).toBe('true');
  });

  it('en INAKTIV panel är `hidden` (ur layout + a11y-träd) men dess innehåll är MONTERAT (state bevaras)', () => {
    const { container, getByText } = render(
      <TabPanel tabId="tips" activeTab="idag" panelIdBase={BASE}>
        <p>Tips-innehåll</p>
      </TabPanel>
    );
    const panel = container.querySelector('[data-tab-panel="tips"]') as HTMLElement;
    expect(panel.hasAttribute('hidden')).toBe(true);
    expect(panel.getAttribute('data-active')).toBeNull();
    // En `hidden` panel är inte fokuserbar (tabIndex ej satt).
    expect(panel.getAttribute('tabindex')).toBeNull();
    // KRITISKT: innehållet är fortfarande i DOM:en (monterat), bara dolt , så ett
    // formulär/scroll-läge i en inaktiv flik inte nollställs vid flik-byte.
    expect(getByText('Tips-innehåll')).toBeTruthy();
  });
});
