// Källåkring av den inbäddade matchplanen (auto-mappningens schema-källa).
//
// VARFÖR: edge-pollarens auto-mappning matchar live-fixtures mot match_id + kickoff +
// lag-par. De värdena MÅSTE vara EXAKT klient-bundlens (matches.ts), annars kan en
// fixture mappas mot fel match (eller missas). Detta test låser den committade
// inbäddade filen mot matches.ts: regenerera ur matches.ts och kräv VÄRDE-likhet med
// den committade _shared/embedded-match-plan.ts (fail loud). Mutationstestet bevisar
// att låset fångar en bytt tid/lag. Samma källåkrings-mönster som kickoff-seed.

import { describe, expect, it } from 'vitest';
// Den committade inbäddade planen läses som rå text via Vites `?raw`.
import committedPlan from '../../../supabase/functions/_shared/embedded-match-plan.ts?raw';
import { buildMatchPlan, emitEmbeddedMatchPlan, EXPECTED_MATCH_PLAN_ROWS } from './match-plan';
import { WC2026_MATCHES } from '../wc2026/matches';

/** Radslut-normalisering: jämför INNEHÅLL, inte CRLF vs LF (känd fallgrop). */
function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

describe('Inbäddad matchplan: låst mot matches.ts (regenerera och diffa)', () => {
  it('regenererad plan ur matches.ts är värde-identisk med den committade inbäddade filen', () => {
    // Låset. Skiljer en enda kickoff/lag sig (drift generator<->fil, hand-edit, tappad
    // match) failar testet med en exakt diff (fail loud).
    const regenerated = emitEmbeddedMatchPlan(WC2026_MATCHES);
    expect(normalizeEol(regenerated)).toBe(normalizeEol(committedPlan));
  });

  it('planen har exakt 104 matcher (72 grupp + 32 slutspel), inga dubbletter', () => {
    const plan = buildMatchPlan(WC2026_MATCHES);
    expect(plan).toHaveLength(EXPECTED_MATCH_PLAN_ROWS);
    expect(new Set(plan.map((e) => e.matchId)).size).toBe(EXPECTED_MATCH_PLAN_ROWS);
  });

  it('gruppmatcher bär lag-par, slutspel (M73-M104) bär null lag', () => {
    const plan = buildMatchPlan(WC2026_MATCHES);
    const gF1 = plan.find((e) => e.matchId === 'g-F-1');
    expect(gF1?.homeAppId).toBe('ned');
    expect(gF1?.awayAppId).toBe('jpn');
    const m73 = plan.find((e) => e.matchId === 'M73');
    expect(m73?.homeAppId).toBeNull();
    expect(m73?.awayAppId).toBeNull();
  });

  it('varje kickoff är EXAKT samma instant som matchplanens kickoff (ingen drift)', () => {
    const plan = buildMatchPlan(WC2026_MATCHES);
    const byId = new Map(plan.map((e) => [e.matchId, e.kickoffUtc]));
    for (const match of WC2026_MATCHES) {
      const planned = byId.get(match.id);
      expect(planned, `saknar planrad för ${match.id}`).toBeDefined();
      expect(new Date(planned as string).getTime(), match.id).toBe(
        new Date(match.kickoff).getTime()
      );
    }
  });

  // MUTATIONSTEST: bevisa att källåkringen FAILAR om en tid/lag byts.
  it('MUTATION: en ändrad kickoff bryter värde-likheten (låset fångar drift)', () => {
    const mutated = WC2026_MATCHES.map((m, i) =>
      i === 0 ? { ...m, kickoff: '2099-01-01T00:00:00.000Z' } : m
    );
    expect(normalizeEol(emitEmbeddedMatchPlan(mutated))).not.toBe(normalizeEol(committedPlan));
  });

  // Fail-loud-grindarna i builder:n.
  it('fail loud: fel antal matcher kastar (hellre stopp än fel data)', () => {
    expect(() => buildMatchPlan(WC2026_MATCHES.slice(0, 10))).toThrow(/Förväntade 104/);
  });

  it('fail loud: en ogiltig kickoff kastar', () => {
    const broken = WC2026_MATCHES.map((m, i) => (i === 0 ? { ...m, kickoff: 'inte-en-tid' } : m));
    expect(() => buildMatchPlan(broken)).toThrow(/Ogiltig kickoff/);
  });
});
