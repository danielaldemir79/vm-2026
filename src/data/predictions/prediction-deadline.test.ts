import { describe, expect, it } from 'vitest';
import { POOL_EXTENDED_DEADLINE_ISO, applyExtendedDeadline } from './prediction-deadline';

describe('POOL_EXTENDED_DEADLINE_ISO', () => {
  it('är 2026-06-17 20:00:00Z = g-L-1 (sista gruppens första match, Daniels beslut #151)', () => {
    // Avsparket för den sista gruppens första match = när omgång 1 är spelad. Mirror av
    // DB:ns pool_extended_deadline(). T72 gjorde tiden PLATT (ersatte 21/6 från T67).
    expect(POOL_EXTENDED_DEADLINE_ISO).toBe('2026-06-17T20:00:00.000Z');
    const d = new Date(POOL_EXTENDED_DEADLINE_ISO);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(5); // juni (0-indexerat)
    expect(d.getUTCDate()).toBe(17);
    expect(d.getUTCHours()).toBe(20);
    expect(d.getUTCMinutes()).toBe(0);
  });
});

describe('applyExtendedDeadline (PLATT: en gemensam låspunkt, omgång 1 spelad)', () => {
  it('ger den PLATTA deadlinen för ett TIDIGT ankare (före omgång-1-tiden)', () => {
    // g-A-1 (11/6) ligger före -> deadline blir den platta omgång-1-tiden.
    expect(applyExtendedDeadline('2026-06-11T19:00:00.000Z')).toBe(POOL_EXTENDED_DEADLINE_ISO);
  });

  it('ger den PLATTA deadlinen oavsett ankarets egen avspark (alla grupper samma instant)', () => {
    // Daniels intent (T72): ALLA grupp-/champion-tips låses vid samma instant. Ett ankare
    // EXAKT på tiden, ett FÖRE, och t.o.m. ett (hypotetiskt) EFTER ger alla samma platta
    // deadline , det finns ingen per-grupp-GREATEST längre. Ett riktigt gruppankare ligger
    // alltid PÅ eller FÖRE g-L-1 (g-L-1 ÄR maxet), men vi vaktar att funktionen är platt
    // oavsett indata så en framtida call-site inte tyst återinför per-grupp-fönster.
    expect(applyExtendedDeadline(POOL_EXTENDED_DEADLINE_ISO)).toBe(POOL_EXTENDED_DEADLINE_ISO);
    expect(applyExtendedDeadline('2026-06-11T00:00:00.000Z')).toBe(POOL_EXTENDED_DEADLINE_ISO);
    expect(applyExtendedDeadline('2026-07-19T19:00:00.000Z')).toBe(POOL_EXTENDED_DEADLINE_ISO);
  });

  it('FAIL-SAFE: null-ankare förblir null (gissar ALDRIG fram en tid ur ett saknat ankare)', () => {
    // Samma riktning som RLS:ens NULL-fail-safe: en okänd grupp/slot ska INTE få ett
    // öppet fönster ur tomma luften. null in -> null ut.
    expect(applyExtendedDeadline(null)).toBeNull();
  });
});
