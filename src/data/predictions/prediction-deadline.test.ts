import { describe, expect, it } from 'vitest';
import { POOL_EXTENDED_DEADLINE_ISO, applyExtendedDeadline } from './prediction-deadline';

describe('POOL_EXTENDED_DEADLINE_ISO', () => {
  it('är SÖNDAG 2026-06-21 23:59 svensk sommartid = 21:59:00Z (Daniels beslut #123)', () => {
    // 23:59 lokal i juni (CEST, UTC+2) = 21:59 UTC. Mirror av DB:ns pool_extended_deadline().
    // T67 flyttade tiden från 14/6 till 21/6 (söndagen veckan efter).
    expect(POOL_EXTENDED_DEADLINE_ISO).toBe('2026-06-21T21:59:00.000Z');
    const d = new Date(POOL_EXTENDED_DEADLINE_ISO);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(5); // juni (0-indexerat)
    expect(d.getUTCDate()).toBe(21);
    expect(d.getUTCHours()).toBe(21);
    expect(d.getUTCMinutes()).toBe(59);
  });
});

describe('applyExtendedDeadline (GREATEST, FÖRLÄNG FÖRKORTA ALDRIG)', () => {
  it('FÖRLÄNGER ett ankare som ligger FÖRE fasta tiden -> fasta tiden', () => {
    // g-A-1 (11/6) ligger före -> deadline blir den fasta söndagstiden.
    expect(applyExtendedDeadline('2026-06-11T19:00:00.000Z')).toBe(POOL_EXTENDED_DEADLINE_ISO);
    // En sen grupp (g-L-1 = 17/6 20:00Z) ligger nu OCKSÅ före 21/6 -> förlängs också (T67).
    expect(applyExtendedDeadline('2026-06-17T20:00:00.000Z')).toBe(POOL_EXTENDED_DEADLINE_ISO);
    // En match sent på söndagen 21/6 (men före 21:59Z) förlängs också.
    expect(applyExtendedDeadline('2026-06-21T20:00:00.000Z')).toBe(POOL_EXTENDED_DEADLINE_ISO);
  });

  it('BEHÅLLER ett ankare som ligger EFTER fasta tiden (förkortar ALDRIG)', () => {
    // FÖRKORTA-ALDRIG-grenen: ett HYPOTETISKT ankare efter 21/6 behålls oförändrat.
    // (Inget riktigt gruppankare ligger efter 21/6 i T67, men regeln, inte datat, är
    // garantin , vi vaktar den oberoende av schemat så nästa schema-ändring inte
    // tyst bryter den, T9-lessons: nå den gren påståendet skyddar.)
    expect(applyExtendedDeadline('2026-06-22T19:00:00.000Z')).toBe('2026-06-22T19:00:00.000Z');
    // Långt senare slutspelsmatch (om någon förlängningsdrabbad gren skulle nå den).
    expect(applyExtendedDeadline('2026-07-19T19:00:00.000Z')).toBe('2026-07-19T19:00:00.000Z');
  });

  it('GRÄNS: exakt PÅ fasta tiden -> behåller (ankaret = fasta tiden, GREATEST oförändrad)', () => {
    // Likhet: GREATEST(t, t) = t. Ankaret förblir oförändrat.
    expect(applyExtendedDeadline(POOL_EXTENDED_DEADLINE_ISO)).toBe(POOL_EXTENDED_DEADLINE_ISO);
    // En millisekund EFTER -> behålls (senare). En millisekund FÖRE -> förlängs.
    expect(applyExtendedDeadline('2026-06-21T21:59:00.001Z')).toBe('2026-06-21T21:59:00.001Z');
    expect(applyExtendedDeadline('2026-06-21T21:58:59.999Z')).toBe(POOL_EXTENDED_DEADLINE_ISO);
  });

  it('FAIL-SAFE: null-ankare förblir null (gissar ALDRIG fram en tid ur ett saknat ankare)', () => {
    // Samma riktning som RLS:ens NULL-fail-safe: en okänd grupp/slot ska INTE få ett
    // öppet fönster ur tomma luften. null in -> null ut.
    expect(applyExtendedDeadline(null)).toBeNull();
  });
});
