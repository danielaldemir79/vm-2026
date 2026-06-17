// Enhetstester för flik-katalogen (T83, #175): låser ordningen (U4) + ikon-fältet (D1).
//
// Katalogen är EN sanning för appens fem flikar. Dessa tester vaktar de
// invarianter som flik-raden, routningen och App.tsx alla litar på: rätt antal
// flikar, rätt ORDNING (Daniels beslut U4), unika slugs/ordningstal, och att VARJE
// flik bär ett ikon-namn (D1) som tab-icon.tsx kan rita. Driftar någon av dessa
// går testet sönder innan en trasig flik-rad når en användare.

import { describe, expect, it } from 'vitest';
import { TABS, DEFAULT_TAB, tabById, tabBySlug, type TabIconName } from './tab-config';

const ICON_NAMES: readonly TabIconName[] = ['today', 'coupon', 'leaderboard', 'tournament', 'more'];

describe('flik-katalogen (tab-config)', () => {
  it('har exakt de fem flikarna i Daniels ordning (U4): Idag, Tips, Topplista, Turnering, Mer', () => {
    expect(TABS.map((t) => t.id)).toEqual(['idag', 'tips', 'topplista', 'turnering', 'mer']);
    expect(TABS.map((t) => t.label)).toEqual(['Idag', 'Tips', 'Topplista', 'Turnering', 'Mer']);
  });

  it('default-fliken är Idag (hemmet)', () => {
    expect(DEFAULT_TAB).toBe('idag');
  });

  it('varje flik bär ett ikon-namn (D1) ur den kända ikon-uppsättningen', () => {
    for (const tab of TABS) {
      expect(ICON_NAMES).toContain(tab.icon);
    }
  });

  it('ikon-namnen är UNIKA per flik (ingen flik delar glyf)', () => {
    const icons = TABS.map((t) => t.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('slugs + ordningstal är unika (ingen kollision i routning/rad-ordning)', () => {
    const slugs = TABS.map((t) => t.slug);
    const orders = TABS.map((t) => t.order);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(orders).size).toBe(orders.length);
    // Ordningstalen är stigande i katalog-ordning (raden ritas i den ordningen).
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('uppslag på id + slug hittar rätt flik (och faller till undefined för okänt)', () => {
    expect(tabById('topplista')?.label).toBe('Topplista');
    expect(tabBySlug('turnering')?.id).toBe('turnering');
    expect(tabById('finns-ej')).toBeUndefined();
    expect(tabBySlug('finns-ej')).toBeUndefined();
  });
});
