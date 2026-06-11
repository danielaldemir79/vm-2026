import { describe, expect, it } from 'vitest';
import { resolveBuildInfo, resolveCommitSha, SHORT_SHA_LENGTH, UNKNOWN_SHA } from './build-info';

const FULL_SHA = '40bdf8e11381a0058e0ce3c9edd98bf2e2697640';

describe('resolveCommitSha, prioritetsordning + fallback', () => {
  it('föredrar Cloudflare-SHA (CF_PAGES_COMMIT_SHA) över git-SHA', () => {
    const sha = resolveCommitSha({ cloudflareSha: FULL_SHA, gitSha: 'aaaaaaa0000000' });
    expect(sha).toBe(FULL_SHA.slice(0, SHORT_SHA_LENGTH));
  });

  it('faller till git-SHA när Cloudflare-variabeln saknas', () => {
    const sha = resolveCommitSha({ cloudflareSha: undefined, gitSha: FULL_SHA });
    expect(sha).toBe('40bdf8e');
  });

  it('klipper full SHA till git short-hash-längd (7)', () => {
    const sha = resolveCommitSha({ cloudflareSha: FULL_SHA, gitSha: null });
    expect(sha).toHaveLength(SHORT_SHA_LENGTH);
  });

  it('returnerar "unknown" när varken Cloudflare- eller git-SHA finns (gissar aldrig)', () => {
    expect(resolveCommitSha({ cloudflareSha: undefined, gitSha: null })).toBe(UNKNOWN_SHA);
  });

  it('behandlar TOM/whitespace-sträng som frånvaro, inte som en giltig SHA', () => {
    // Fel-väg: en satt-men-tom env-variabel ska inte ge en tom version-rad.
    expect(resolveCommitSha({ cloudflareSha: '   ', gitSha: '' })).toBe(UNKNOWN_SHA);
  });

  it('hoppar över en tom Cloudflare-SHA och använder git-SHA i stället', () => {
    expect(resolveCommitSha({ cloudflareSha: '', gitSha: FULL_SHA })).toBe('40bdf8e');
  });
});

describe('resolveBuildInfo, sätter ihop stämpeln ur redan-lästa värden', () => {
  it('använder env-SHA + injicerad byggtid (deterministiskt)', () => {
    const info = resolveBuildInfo(FULL_SHA, null, '2026-06-11T08:30:00.000Z');
    expect(info.sha).toBe('40bdf8e');
    expect(info.builtAt).toBe('2026-06-11T08:30:00.000Z');
  });

  it('faller till git-SHA när env-SHA saknas', () => {
    const info = resolveBuildInfo(undefined, FULL_SHA, '2026-01-02T03:04:05.000Z');
    expect(info.sha).toBe('40bdf8e');
    expect(info.builtAt).toBe('2026-01-02T03:04:05.000Z');
    expect(Number.isNaN(new Date(info.builtAt).getTime())).toBe(false);
  });

  it('ger "unknown"-SHA när varken env eller git ger något (fail-soft, ingen krasch)', () => {
    const info = resolveBuildInfo(undefined, null, '2026-06-11T00:00:00.000Z');
    expect(info.sha).toBe(UNKNOWN_SHA);
  });
});
