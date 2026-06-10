import { describe, expect, it } from 'vitest';
import { toMatchResult, validateResultEntry, type ResultEntry } from './validate-result';
import type { MatchStatus } from '../../domain/types';

// Hjälpare: bygg en inmatning kort.
function entry(
  homeGoals: number | null,
  awayGoals: number | null,
  status: MatchStatus
): ResultEntry {
  return { homeGoals, awayGoals, status };
}

/** Bygg en finished-inmatning med straffar (för slutspels-fall, FIFA Art. 14). */
function entryWithPens(
  homeGoals: number | null,
  awayGoals: number | null,
  pens: { homeGoals: number | null; awayGoals: number | null } | null
): ResultEntry {
  return { homeGoals, awayGoals, status: 'finished', penalties: pens };
}

/** Plocka ut fel-koderna ur ett (förväntat) ogiltigt resultat. */
function codesOf(result: ReturnType<typeof validateResultEntry>): string[] {
  return result.ok ? [] : result.errors.map((e) => e.code);
}

describe('validateResultEntry, happy path', () => {
  it('accepterar ett giltigt finished-resultat (icke-negativa heltal)', () => {
    expect(validateResultEntry('scheduled', entry(2, 1, 'finished')).ok).toBe(true);
    expect(validateResultEntry('live', entry(0, 0, 'finished')).ok).toBe(true);
  });

  it('accepterar att sätta en match till scheduled/live UTAN resultat', () => {
    expect(validateResultEntry('scheduled', entry(null, null, 'scheduled')).ok).toBe(true);
    expect(validateResultEntry('scheduled', entry(null, null, 'live')).ok).toBe(true);
  });

  it('accepterar att redigera ett redan finished-resultat (idempotent, stanna kvar)', () => {
    expect(validateResultEntry('finished', entry(3, 2, 'finished')).ok).toBe(true);
  });
});

describe('validateResultEntry, icke-negativa heltal (fel-vägar)', () => {
  it('avvisar negativa hemmamål', () => {
    const r = validateResultEntry('scheduled', entry(-1, 0, 'finished'));
    expect(codesOf(r)).toContain('home-negative');
  });

  it('avvisar negativa bortamål', () => {
    const r = validateResultEntry('scheduled', entry(0, -3, 'finished'));
    expect(codesOf(r)).toContain('away-negative');
  });

  it('avvisar decimaltal (icke-heltal)', () => {
    const r = validateResultEntry('scheduled', entry(1.5, 2, 'finished'));
    expect(codesOf(r)).toContain('home-not-integer');
  });

  it('avvisar NaN (t.ex. ett ogiltigt textfält som blev Number("x"))', () => {
    const r = validateResultEntry('scheduled', entry(Number('x'), 0, 'finished'));
    expect(codesOf(r)).toContain('home-not-integer');
  });

  it('avvisar Infinity', () => {
    const r = validateResultEntry('scheduled', entry(0, Infinity, 'finished'));
    expect(codesOf(r)).toContain('away-not-integer');
  });

  it('samlar FLERA fel samtidigt (båda mål ogiltiga), inte bara det första', () => {
    const r = validateResultEntry('scheduled', entry(-1, 2.5, 'finished'));
    const codes = codesOf(r);
    expect(codes).toContain('home-negative');
    expect(codes).toContain('away-not-integer');
  });
});

describe('validateResultEntry, status <-> resultat-kontraktet', () => {
  it('avvisar finished utan bägge mål (finished-without-result)', () => {
    expect(codesOf(validateResultEntry('live', entry(null, null, 'finished')))).toContain(
      'finished-without-result'
    );
    // Bara ETT mål ifyllt räcker inte heller.
    expect(codesOf(validateResultEntry('live', entry(2, null, 'finished')))).toContain(
      'finished-without-result'
    );
  });

  it('avvisar ett resultat på en icke-finished match (result-without-finished)', () => {
    expect(codesOf(validateResultEntry('scheduled', entry(1, 0, 'scheduled')))).toContain(
      'result-without-finished'
    );
    expect(codesOf(validateResultEntry('scheduled', entry(1, 0, 'live')))).toContain(
      'result-without-finished'
    );
  });
});

describe('validateResultEntry, status-övergångar', () => {
  // Alla par mellan de tre lägena är meningsfulla (framåt, stanna, backa ett
  // felinmatat resultat), så ingen av dessa ska flagga en ogiltig övergång.
  const statuses: MatchStatus[] = ['scheduled', 'live', 'finished'];
  for (const from of statuses) {
    for (const to of statuses) {
      it(`tillåter övergången ${from} -> ${to} (ingen invalid-status-transition)`, () => {
        // Mata in en form som annars är giltig för målfältet, så bara
        // övergångs-koden kan dyka upp om regeln vore för strikt.
        const e = to === 'finished' ? entry(1, 0, to) : entry(null, null, to);
        expect(codesOf(validateResultEntry(from, e))).not.toContain('invalid-status-transition');
      });
    }
  }

  it('backa ett felinmatat finished till live nollar resultatet (giltigt)', () => {
    expect(validateResultEntry('finished', entry(null, null, 'live')).ok).toBe(true);
  });
});

// ============================================================================
// Straffläggning i slutspel (F1/penalties-pinnen, FIFA Article 14). En
// slutspelsmatch kan INTE sluta oavgjort: lika ordinarie ställning kräver en
// avgörande straff-vinnare. Gruppspel påverkas inte (oavgjort står sig).
// ============================================================================
describe('validateResultEntry, slutspels-straffar (FIFA Art. 14)', () => {
  it('GRUPPSPEL: lika ställning är giltigt utan straffar (oavgjort står sig)', () => {
    // Default-stage är 'group', och explicit 'group'.
    expect(validateResultEntry('scheduled', entry(1, 1, 'finished')).ok).toBe(true);
    expect(validateResultEntry('scheduled', entry(1, 1, 'finished'), 'group').ok).toBe(true);
  });

  it('SLUTSPEL: lika ställning UTAN straffar kräver straff-vinnare (fail loud)', () => {
    const r = validateResultEntry('scheduled', entry(1, 1, 'finished'), 'round-of-32');
    expect(codesOf(r)).toContain('knockout-tie-needs-penalties');
  });

  it('SLUTSPEL: lika ställning MED giltig straff-vinnare är giltigt', () => {
    const r = validateResultEntry(
      'scheduled',
      entryWithPens(1, 1, { homeGoals: 4, awayGoals: 3 }),
      'final'
    );
    expect(r.ok).toBe(true);
  });

  it('SLUTSPEL: avgjord ordinarie ställning behöver INGA straffar', () => {
    expect(validateResultEntry('scheduled', entry(2, 1, 'finished'), 'semi-final').ok).toBe(true);
  });

  it('SLUTSPEL: straffar som OCKSÅ slutar lika avvisas (ingen vinnare)', () => {
    const r = validateResultEntry(
      'scheduled',
      entryWithPens(0, 0, { homeGoals: 3, awayGoals: 3 }),
      'quarter-final'
    );
    expect(codesOf(r)).toContain('knockout-tie-needs-penalties');
  });

  it('SLUTSPEL: ogiltiga straffmål (negativa/decimal) avvisas med egen kod', () => {
    expect(
      codesOf(
        validateResultEntry(
          'scheduled',
          entryWithPens(1, 1, { homeGoals: -1, awayGoals: 3 }),
          'final'
        )
      )
    ).toContain('penalties-home-not-integer');
    expect(
      codesOf(
        validateResultEntry(
          'scheduled',
          entryWithPens(1, 1, { homeGoals: 4, awayGoals: 2.5 }),
          'final'
        )
      )
    ).toContain('penalties-away-not-integer');
  });

  it('avvisar straffar på en match som inte behöver dem (penalties-not-applicable)', () => {
    // Slutspel men AVGJORD ordinarie tid: straffar ska inte bäras.
    expect(
      codesOf(
        validateResultEntry(
          'scheduled',
          entryWithPens(2, 1, { homeGoals: 4, awayGoals: 3 }),
          'final'
        )
      )
    ).toContain('penalties-not-applicable');
    // Gruppspel med lika ställning + straffar angivna: inte tillämpligt.
    expect(
      codesOf(
        validateResultEntry(
          'scheduled',
          entryWithPens(1, 1, { homeGoals: 4, awayGoals: 3 }),
          'group'
        )
      )
    ).toContain('penalties-not-applicable');
  });
});

describe('toMatchResult', () => {
  it('bygger ett MatchResult ur en validerad finished-inmatning', () => {
    expect(toMatchResult(entry(2, 1, 'finished'))).toEqual({ homeGoals: 2, awayGoals: 1 });
  });

  it('kastar (fail loud) om ett måltal saknas (anropad utan validering)', () => {
    expect(() => toMatchResult(entry(null, 1, 'finished'))).toThrow();
    expect(() => toMatchResult(entry(2, null, 'finished'))).toThrow();
  });

  it('BEVARAR straffar i resultatet (F1/penalties-pinnen)', () => {
    expect(toMatchResult(entryWithPens(1, 1, { homeGoals: 5, awayGoals: 4 }))).toEqual({
      homeGoals: 1,
      awayGoals: 1,
      penalties: { homeGoals: 5, awayGoals: 4 },
    });
  });

  it('utelämnar penalties-fältet när inga straffar matats in (ren ordinarie seger)', () => {
    const result = toMatchResult(entry(2, 1, 'finished'));
    expect(result.penalties).toBeUndefined();
  });
});
