// Enhetstester för den RENA hash <-> flik-mappningen (T83, #175). Ingen DOM, ingen
// window: bara att tolkningen av en hash till en flik (och tillbaka) är korrekt och
// fail-safe. Den window/history-bundna delen testas i use-tab-routing.test.tsx.

import { describe, expect, it } from 'vitest';
import { tabFromHash, hashForTab } from './tab-routing';
import { DEFAULT_TAB, TABS } from './tab-config';

describe('tabFromHash, tolka URL-hash till aktiv flik', () => {
  it('mappar varje fliks kanoniska hash (#/slug) till rätt flik-id', () => {
    for (const tab of TABS) {
      expect(tabFromHash(`#/${tab.slug}`)).toBe(tab.id);
    }
  });

  it('är tolerant mot former utan prefix/slash (#slug, slug)', () => {
    expect(tabFromHash('#tips')).toBe('tips');
    expect(tabFromHash('tips')).toBe('tips');
    expect(tabFromHash('#/tips')).toBe('tips');
  });

  it('faller till DEFAULT_TAB för tom hash (kall-laddning utan rutt)', () => {
    expect(tabFromHash('')).toBe(DEFAULT_TAB);
    expect(tabFromHash('#')).toBe(DEFAULT_TAB);
    expect(tabFromHash('#/')).toBe(DEFAULT_TAB);
  });

  it('faller till DEFAULT_TAB för en okänd/gammal/trasig slug (fail-safe, aldrig tom vy)', () => {
    expect(tabFromHash('#/finns-inte')).toBe(DEFAULT_TAB);
    expect(tabFromHash('#/gammal-lank')).toBe(DEFAULT_TAB);
  });
});

describe('hashForTab, bygg den delbara kanoniska hashen', () => {
  it('ger #/slug för varje flik', () => {
    for (const tab of TABS) {
      expect(hashForTab(tab.id)).toBe(`#/${tab.slug}`);
    }
  });

  it('round-trip: hashForTab -> tabFromHash ger tillbaka samma flik', () => {
    for (const tab of TABS) {
      expect(tabFromHash(hashForTab(tab.id))).toBe(tab.id);
    }
  });
});
