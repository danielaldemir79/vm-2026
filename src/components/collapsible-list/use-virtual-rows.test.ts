// Tester för virtualiserings-spannet (delad husprimitiv, #173). Den RENA spann-matematiken
// (computeRange) testas utan DOM: givet antal rader + radhöjd + viewport + scroll, vilka
// index renderas? Vi bevisar att bara en DELMÄNGD (synligt + overscan) väljs, inte hela
// listan , det är hela poängen med virtualiseringen (ingen 240-DOM-vägg). Flyttad med hooken
// från total-leaderboard till den delade collapsible-list-byggstenen (T82 del 4).

import { describe, expect, it } from 'vitest';
import { computeRange, OVERSCAN } from './use-virtual-rows';

const ROW_H = 64;

describe('computeRange, virtualiserings-spann', () => {
  it('väljer bara ett FÖNSTER, inte hela den långa listan (240 rader)', () => {
    // Viewport 520px / 64px ~ 8 synliga rader. Vid scrollTop 0: start 0, slut ~ 8 + overscan.
    const { startIndex, endIndex } = computeRange(240, ROW_H, 520, 0);
    expect(startIndex).toBe(0);
    // Spannet ska vara LÅNGT mindre än 240 (annars är det ingen virtualisering).
    expect(endIndex).toBeLessThan(40);
    expect(endIndex).toBeGreaterThan(8); // minst de synliga + overscan
  });

  it('flyttar fönstret nedåt när man skrollar (mitt i listan renderas bara mitten)', () => {
    // Skrolla till rad ~100 (scrollTop 100*64). Fönstret ska börja runt 100, inte 0.
    const { startIndex, endIndex } = computeRange(240, ROW_H, 520, 100 * ROW_H);
    expect(startIndex).toBe(100 - OVERSCAN);
    expect(endIndex).toBeLessThan(240); // inte hela listan
    expect(startIndex).toBeGreaterThan(0); // toppen är INTE i fönstret längre
  });

  it('klampar fönstrets slut vid listans slut (skrollad till botten)', () => {
    const count = 240;
    const { startIndex, endIndex } = computeRange(count, ROW_H, 520, count * ROW_H);
    expect(endIndex).toBe(count); // aldrig över listans längd
    expect(startIndex).toBeLessThan(count);
  });

  it('klampar starten vid 0 (overscan får inte ge negativt index)', () => {
    const { startIndex } = computeRange(240, ROW_H, 520, 0);
    expect(startIndex).toBe(0); // 0 - overscan klampas till 0, inte -6
  });

  it('tom lista ger ett tomt spann (inga rader att rendera)', () => {
    expect(computeRange(0, ROW_H, 520, 0)).toEqual({ startIndex: 0, endIndex: 0 });
  });

  it('en lista kortare än viewporten renderar ALLA rader (inget att virtualisera bort)', () => {
    const { startIndex, endIndex } = computeRange(3, ROW_H, 520, 0);
    expect(startIndex).toBe(0);
    expect(endIndex).toBe(3);
  });

  it('rowHeight 0 ger tomt spann (skydd mot division med noll)', () => {
    expect(computeRange(240, 0, 520, 0)).toEqual({ startIndex: 0, endIndex: 0 });
  });
});
