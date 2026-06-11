import { describe, expect, it } from 'vitest';
import { formatDeadline } from './format-deadline';

// Deadline-budskapet (T35, #63 AC#3) MÅSTE bära den EXAKTA tiden ur samma ISO som
// driver låset, i svensk tid. Testerna låser: rätt absolut tid (svensk zon), rätt
// grov relativ etikett (idag/imorgon/om N dagar), och null-fail-safe.
//
// Alla tider tolkas i Europe/Stockholm. I juni är svensk tid UTC+2 (sommartid), så
// 19:00Z = 21:00 svensk. Det är just den off-by-one-/zon-fällan budskapet inte får
// råka visa fel (UTC-klockan), så vi pinnar tider där zonen FAKTISKT skiljer.

describe('formatDeadline', () => {
  it('null deadline -> null (anroparen faller på sitt fail-safe-budskap)', () => {
    expect(formatDeadline(null, new Date('2026-06-10T00:00:00Z'))).toBeNull();
  });

  it('formaterar avsparken i SVENSK tid (19:00Z = 21:00, sommartid UTC+2)', () => {
    const msg = formatDeadline('2026-06-11T19:00:00.000Z', new Date('2026-06-10T08:00:00Z'));
    expect(msg).not.toBeNull();
    // "torsdag 11 juni kl 21:00" , svensk dag + svensk klocka, inte UTC-19:00.
    expect(msg!.absolute).toMatch(/11 juni kl 21:00$/);
    expect(msg!.absolute).toContain('torsdag');
  });

  it('relativ: mer än en dag bort -> "om N dagar"', () => {
    // now 10 juni morgon, deadline 13 juni kväll (svensk) -> 3 dagar.
    const msg = formatDeadline('2026-06-13T19:00:00.000Z', new Date('2026-06-10T08:00:00Z'));
    expect(msg!.relative).toBe('om 3 dagar');
  });

  it('relativ: deadline imorgon -> "imorgon"', () => {
    const msg = formatDeadline('2026-06-11T19:00:00.000Z', new Date('2026-06-10T08:00:00Z'));
    expect(msg!.relative).toBe('imorgon');
  });

  it('relativ: deadline senare idag (svensk dag) -> "idag"', () => {
    // now 11 juni 08:00 svensk, deadline 11 juni 21:00 svensk -> samma dag.
    const msg = formatDeadline('2026-06-11T19:00:00.000Z', new Date('2026-06-11T06:00:00Z'));
    expect(msg!.relative).toBe('idag');
  });

  it('RANDFALL kring midnatt: deadline strax efter svensk midnatt räknas som "imorgon", inte "om 0/2 dagar"', () => {
    // Deadline 12 juni 01:00 svensk tid = 11 juni 23:00Z. Mätt mot now 11 juni 12:00
    // svensk (10:00Z) ska det bli "imorgon" (svensk kalenderdag +1), inte en rå
    // < 24h-uträkning som skulle ge "idag". Det är off-by-one-skyddet i praktiken.
    const msg = formatDeadline('2026-06-11T23:00:00.000Z', new Date('2026-06-11T10:00:00Z'));
    expect(msg!.relative).toBe('imorgon');
    // Och den absoluta tiden är den svenska: 12 juni 01:00.
    expect(msg!.absolute).toMatch(/12 juni kl 01:00$/);
  });

  it('RANDFALL: now EXAKT på deadline -> "idag" (kortet är dock låst då, men formatteringen ska inte spilla)', () => {
    const iso = '2026-06-11T19:00:00.000Z';
    const msg = formatDeadline(iso, new Date(iso));
    expect(msg!.relative).toBe('idag');
  });
});
