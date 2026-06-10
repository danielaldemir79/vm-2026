// Källåkring av deadline-låsets kickoff-seed (T15, #15).
//
// VARFÖR (anti-fusk, dataintegritet): RLS-deadline-låset på predictions slår upp
// avsparkstider i match_kickoffs. De tiderna MÅSTE vara EXAKT klient-bundlens
// (matches.ts) tider, annars kan en match vara "öppen" i DB men "stängd" i
// klienten (eller tvärtom). Detta test låser den committade seed-MIGRATIONEN mot
// matchplanen: regenerera ur matches.ts och kräv VÄRDE-likhet med den committade
// .sql-filen (fail loud). Mutationstestet bevisar att låset fångar en bytt tid.
// Samma källåkrings-mönster som matchplanen själv (match-schedule-source.test.ts).

import { describe, expect, it } from 'vitest';
// Den committade seed-migrationen läses som rå text via Vites `?raw`.
import committedSeed from '../../../supabase/migrations/20260611120300_t15_match_kickoffs_seed.sql?raw';
import { buildKickoffSeedSql, EXPECTED_KICKOFF_ROWS } from './kickoff-seed';
import { WC2026_MATCHES } from './matches';

/** Radslut-normalisering: jämför INNEHÅLL, inte CRLF vs LF (känd fallgrop). */
function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

describe('Kickoff-seed: låst mot matchplanen (regenerera och diffa)', () => {
  it('regenererad seed-SQL ur matches.ts är värde-identisk med den committade migrationen', () => {
    // Detta är låset. Skiljer en enda kickoff sig (fel tid, tappad match, hand-edit,
    // drift generator<->fil) failar testet med en exakt diff (fail loud).
    const regenerated = buildKickoffSeedSql(WC2026_MATCHES);
    expect(normalizeEol(regenerated)).toBe(normalizeEol(committedSeed));
  });

  it('seedar exakt alla 104 matcher (en rad per match, inga dubbletter)', () => {
    const sql = buildKickoffSeedSql(WC2026_MATCHES);
    const valueRows = [...sql.matchAll(/\('([^']+)', '([^']+)'\)/g)];
    expect(valueRows).toHaveLength(EXPECTED_KICKOFF_ROWS);
    const ids = valueRows.map((m) => m[1]);
    expect(new Set(ids).size).toBe(EXPECTED_KICKOFF_ROWS); // inga dubblett-id
  });

  it('varje seedad kickoff är EXAKT samma instant som matchplanens kickoff (ingen drift)', () => {
    // Den hårda anti-fusk-invarianten: DB-tiden == klient-tiden, instant för instant.
    const sql = buildKickoffSeedSql(WC2026_MATCHES);
    const byId = new Map([...sql.matchAll(/\('([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2]]));
    for (const match of WC2026_MATCHES) {
      const seeded = byId.get(match.id);
      expect(seeded, `saknar seed för ${match.id}`).toBeDefined();
      // Jämför som INSTANT (inte sträng) så olika men ekvivalenta ISO-skrivsätt
      // ändå bevisas lika; seeden normaliserar till toISOString så de bör matcha.
      expect(new Date(seeded as string).getTime(), match.id).toBe(
        new Date(match.kickoff).getTime()
      );
    }
  });

  // MUTATIONSTEST: bevisa att källåkringen FAILAR om en tid byts (annars vet vi
  // inte att låset faktiskt låser). Vi muterar EN matchs kickoff i en kopia av
  // listan och bevisar att den regenererade seeden då skiljer sig från den committade.
  it('MUTATION: en ändrad kickoff bryter värde-likheten (låset fångar drift)', () => {
    const mutated = WC2026_MATCHES.map((m, i) =>
      i === 0 ? { ...m, kickoff: '2099-01-01T00:00:00.000Z' } : m
    );
    const regenerated = buildKickoffSeedSql(mutated);
    expect(normalizeEol(regenerated)).not.toBe(normalizeEol(committedSeed));
  });

  // Fail-loud-grindarna i builder:n (rätt antal, inga dubbletter, giltig tid).
  it('fail loud: fel antal matcher kastar (hellre stopp än fel data)', () => {
    expect(() => buildKickoffSeedSql(WC2026_MATCHES.slice(0, 10))).toThrow(/Förväntade 104/);
  });

  it('fail loud: en ogiltig kickoff kastar', () => {
    const broken = WC2026_MATCHES.map((m, i) => (i === 0 ? { ...m, kickoff: 'inte-en-tid' } : m));
    expect(() => buildKickoffSeedSql(broken)).toThrow(/Ogiltig kickoff/);
  });
});
