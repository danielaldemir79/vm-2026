import { describe, expect, it } from 'vitest';
import { summarizeCopyReport } from './copy-report-summary';
import type { CopyReport, CopyCategorySummary } from '../../data/predictions';

/** Bygg en CopyReport med givna totaler (byCategory/items behövs inte för texten). */
function report(total: CopyCategorySummary): CopyReport {
  const empty: CopyCategorySummary = {
    copied: 0,
    skippedLocked: 0,
    skippedExisting: 0,
    failed: 0,
  };
  return {
    items: [],
    total,
    byCategory: { match: empty, group: empty, bracket: empty },
  };
}

describe('summarizeCopyReport, huvudsatsen (vad som kopierades)', () => {
  it('inget alls att kopiera -> säger det ärligt (lovar inte "klart")', () => {
    const text = summarizeCopyReport(
      report({ copied: 0, skippedLocked: 0, skippedExisting: 0, failed: 0 }),
      'Kompisgänget'
    );
    expect(text).toBe('Du hade inga tips att kopiera från Kompisgänget.');
  });

  it('flera kopierade -> plural ("kopierade")', () => {
    const text = summarizeCopyReport(
      report({ copied: 3, skippedLocked: 0, skippedExisting: 0, failed: 0 }),
      'Familjen'
    );
    expect(text).toBe('3 tips kopierade från Familjen.');
  });

  it('exakt ett kopierat -> singular ("kopierat")', () => {
    const text = summarizeCopyReport(
      report({ copied: 1, skippedLocked: 0, skippedExisting: 0, failed: 0 }),
      'Familjen'
    );
    expect(text).toBe('1 tips kopierat från Familjen.');
  });

  it('inget kopierades men det FANNS items (alla hoppades) -> ärlig "inga kopierades"', () => {
    const text = summarizeCopyReport(
      report({ copied: 0, skippedLocked: 0, skippedExisting: 2, failed: 0 }),
      'Jobbet'
    );
    expect(text).toBe(
      'Inga tips kopierades från Jobbet den här gången. 2 hoppades över (redan tippade här).'
    );
  });
});

describe('summarizeCopyReport, tilläggen speglar EXAKT de utfall som förekom', () => {
  it('rent läge (bara kopierade) -> ingen tilläggs-mening', () => {
    const text = summarizeCopyReport(
      report({ copied: 5, skippedLocked: 0, skippedExisting: 0, failed: 0 }),
      'A'
    );
    expect(text).toBe('5 tips kopierade från A.');
    expect(text).not.toMatch(/hoppades|kunde inte/);
  });

  it('redan tippade tas med när de finns', () => {
    const text = summarizeCopyReport(
      report({ copied: 2, skippedLocked: 0, skippedExisting: 3, failed: 0 }),
      'A'
    );
    expect(text).toContain('3 hoppades över (redan tippade här)');
  });

  it('låsta tas med när de finns', () => {
    const text = summarizeCopyReport(
      report({ copied: 2, skippedLocked: 4, skippedExisting: 0, failed: 0 }),
      'A'
    );
    expect(text).toContain('4 hoppades över (låsta)');
  });

  it('felade tas med när de finns', () => {
    const text = summarizeCopyReport(
      report({ copied: 2, skippedLocked: 0, skippedExisting: 0, failed: 1 }),
      'A'
    );
    expect(text).toContain('1 kunde inte kopieras');
  });

  it('alla fyra utfall samtidigt -> alla med, i fast ordning (redan, låsta, fel)', () => {
    const text = summarizeCopyReport(
      report({ copied: 2, skippedLocked: 4, skippedExisting: 3, failed: 1 }),
      'A'
    );
    expect(text).toBe(
      '2 tips kopierade från A. 3 hoppades över (redan tippade här), 4 hoppades över (låsta), 1 kunde inte kopieras.'
    );
  });

  it('nämner ALDRIG ett utfall som inte förekom (noll låsta -> inget om låsta)', () => {
    const text = summarizeCopyReport(
      report({ copied: 1, skippedLocked: 0, skippedExisting: 1, failed: 0 }),
      'A'
    );
    expect(text).not.toMatch(/låsta/);
    expect(text).not.toMatch(/kunde inte/);
  });
});
