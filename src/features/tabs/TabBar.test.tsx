// Enhetstester för flik-radens TILLGÄNGLIGHET + tangentbord (T83, #175).
//
// Vaktar WAI-ARIA Tabs-mönstret som acceptanskriteriet kräver: tablist/tab-roller,
// aria-selected + aria-current på aktiv, aria-controls -> panel, roving tabindex, och
// piltangents-/Home/End-navigering som flyttar + aktiverar fliken. jsdom kör DOM +
// fokus, så detta är fullt testbart utan browser.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, within } from '@testing-library/react';
import { TabBar } from './TabBar';
import { TABS, tabButtonId, tabPanelId } from './tab-config';

const PANEL_BASE = 'panel';

describe('TabBar, tillgänglig tablist-semantik', () => {
  it('renderar en tablist med en tab per flik (rätt roller + etiketter)', () => {
    const { getByRole } = render(
      <TabBar activeTab="idag" onSelect={() => {}} panelIdBase={PANEL_BASE} />
    );
    const tablist = getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(TABS.length);
    for (const tab of TABS) {
      expect(within(tablist).getByRole('tab', { name: tab.label })).toBeTruthy();
    }
  });

  it('markerar den aktiva fliken med aria-selected + aria-current + data-active', () => {
    const { getByRole } = render(
      <TabBar activeTab="topplista" onSelect={() => {}} panelIdBase={PANEL_BASE} />
    );
    const active = getByRole('tab', { name: 'Topplista' });
    expect(active.getAttribute('aria-selected')).toBe('true');
    expect(active.getAttribute('aria-current')).toBe('page');
    expect(active.getAttribute('data-active')).toBe('true');

    const inactive = getByRole('tab', { name: 'Idag' });
    expect(inactive.getAttribute('aria-selected')).toBe('false');
    expect(inactive.getAttribute('aria-current')).toBeNull();
  });

  it('kopplar varje flik till sin panel via aria-controls + stabila id:n', () => {
    const { getByRole } = render(
      <TabBar activeTab="idag" onSelect={() => {}} panelIdBase={PANEL_BASE} />
    );
    for (const tab of TABS) {
      const button = getByRole('tab', { name: tab.label });
      expect(button.id).toBe(tabButtonId(tab.id));
      expect(button.getAttribute('aria-controls')).toBe(tabPanelId(PANEL_BASE, tab.id));
    }
  });

  it('ROVING TABINDEX: bara den aktiva fliken är i tab-ordningen (0), övriga -1', () => {
    const { getByRole } = render(
      <TabBar activeTab="tips" onSelect={() => {}} panelIdBase={PANEL_BASE} />
    );
    expect(getByRole('tab', { name: 'Tips' }).getAttribute('tabindex')).toBe('0');
    expect(getByRole('tab', { name: 'Idag' }).getAttribute('tabindex')).toBe('-1');
    expect(getByRole('tab', { name: 'Mer' }).getAttribute('tabindex')).toBe('-1');
  });
});

describe('TabBar, klick + tangentbords-navigering', () => {
  it('klick på en flik anropar onSelect med dess id', () => {
    const onSelect = vi.fn();
    const { getByRole } = render(
      <TabBar activeTab="idag" onSelect={onSelect} panelIdBase={PANEL_BASE} />
    );
    fireEvent.click(getByRole('tab', { name: 'Turnering' }));
    expect(onSelect).toHaveBeenCalledWith('turnering');
  });

  it('ArrowRight flyttar till nästa flik (aktiverar + flyttar fokus)', () => {
    const onSelect = vi.fn();
    const { getByRole } = render(
      <TabBar activeTab="idag" onSelect={onSelect} panelIdBase={PANEL_BASE} />
    );
    const first = getByRole('tab', { name: 'Idag' });
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenCalledWith('tips');
  });

  it('ArrowLeft från första fliken wrappar till sista (Mer)', () => {
    const onSelect = vi.fn();
    const { getByRole } = render(
      <TabBar activeTab="idag" onSelect={onSelect} panelIdBase={PANEL_BASE} />
    );
    fireEvent.keyDown(getByRole('tab', { name: 'Idag' }), { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenCalledWith('mer');
  });

  it('Home/End hoppar till första/sista fliken', () => {
    const onSelect = vi.fn();
    const { getByRole } = render(
      <TabBar activeTab="topplista" onSelect={onSelect} panelIdBase={PANEL_BASE} />
    );
    fireEvent.keyDown(getByRole('tab', { name: 'Topplista' }), { key: 'Home' });
    expect(onSelect).toHaveBeenLastCalledWith('idag');
    fireEvent.keyDown(getByRole('tab', { name: 'Topplista' }), { key: 'End' });
    expect(onSelect).toHaveBeenLastCalledWith('mer');
  });

  it('ArrowDown/ArrowUp navigerar likadant som höger/vänster (funkar oavsett rad-orientering)', () => {
    const onSelect = vi.fn();
    const { getByRole } = render(
      <TabBar activeTab="tips" onSelect={onSelect} panelIdBase={PANEL_BASE} />
    );
    fireEvent.keyDown(getByRole('tab', { name: 'Tips' }), { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenLastCalledWith('topplista');
    fireEvent.keyDown(getByRole('tab', { name: 'Tips' }), { key: 'ArrowUp' });
    expect(onSelect).toHaveBeenLastCalledWith('idag');
  });
});
