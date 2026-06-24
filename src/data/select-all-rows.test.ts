// Tester för selectAllRows (klient/RPC paginerad full-läsning, F1-fix 2026-06-24).
// FOKUS: just det selectAllRows LÄGGER OVANPÅ den rena selectAllPages-loopen, dvs
// (1) fel-mappning till ett begripligt fail-loud-svenskt meddelande, (2) count -> total
// och data -> rows-vidarekopplingen, (3) att 1000-cap:en FAKTISKT korsas (range-anropen).
// Själva loop-/completeness-logiken är redan testad i select-all-pages.test.ts.

import { describe, expect, it, vi } from 'vitest';
import { selectAllRows } from './select-all-rows';

describe('selectAllRows, korsar PostgREST 1000-cap (range-paginering)', () => {
  it('läser HELA mängden förbi cap:en (2500 rader = 3 sidor) och bevarar ordningen', async () => {
    const all = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
    const fetchRange = vi.fn((from: number, to: number) =>
      Promise.resolve({ data: all.slice(from, to + 1), error: null, count: all.length })
    );
    const rows = await selectAllRows<{ id: number }>('tips', fetchRange);
    expect(rows).toEqual(all); // alla 2500, i ordning, exakt en gång var (inte kapad till 1000)
    // Bevisa att cap:en korsades: range 0-999, 1000-1999, 2000-2999 (sista kort -> stopp).
    expect(fetchRange).toHaveBeenCalledTimes(3);
    expect(fetchRange).toHaveBeenNthCalledWith(1, 0, 999);
    expect(fetchRange).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(fetchRange).toHaveBeenNthCalledWith(3, 2000, 2999);
  });

  it('null data med count 0 -> tom lista (ingen krasch)', async () => {
    const fetchRange = vi.fn(() => Promise.resolve({ data: null, error: null, count: 0 }));
    await expect(selectAllRows('tips', fetchRange)).resolves.toEqual([]);
    expect(fetchRange).toHaveBeenCalledTimes(1);
  });
});

describe('selectAllRows, fail-loud', () => {
  it('mappar ett Supabase-fel till ett begripligt svenskt meddelande med operation-etiketten', async () => {
    const fetchRange = () =>
      Promise.resolve({ data: null, error: { message: 'nope' }, count: null });
    await expect(selectAllRows('grupp-tips', fetchRange)).rejects.toThrow(
      /\[VM2026\] Hämta grupp-tips misslyckades: nope/
    );
  });

  it('completeness-vakten ärvs: ett count som inte matchar antalet rader KASTAR', async () => {
    // count=10 rapporteras men källan ger bara 9 rader -> tappad rad, måste fail-loud:a
    // (vakten bor i selectAllPages, vi bevisar bara att selectAllRows vidarekopplar count).
    const fetchRange = (from: number, to: number) =>
      Promise.resolve({
        data: Array.from({ length: 9 }, (_, i) => ({ id: i })).slice(from, to + 1),
        error: null,
        count: 10,
      });
    await expect(selectAllRows('tips', fetchRange)).rejects.toThrow(/ofullständig|dubblerad/i);
  });
});
