import { describe, expect, it } from 'vitest';
import { POOL_EXTENDED_DEADLINE_ISO, applyExtendedDeadline } from './prediction-deadline';

describe('POOL_EXTENDED_DEADLINE_ISO', () => {
  it('är SÖNDAG 2026-06-14 23:59 svensk sommartid = 21:59:00Z (Daniels beslut #95)', () => {
    // 23:59 lokal i juni (CEST, UTC+2) = 21:59 UTC. Mirror av DB:ns pool_extended_deadline().
    expect(POOL_EXTENDED_DEADLINE_ISO).toBe('2026-06-14T21:59:00.000Z');
    const d = new Date(POOL_EXTENDED_DEADLINE_ISO);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(5); // juni (0-indexerat)
    expect(d.getUTCDate()).toBe(14);
    expect(d.getUTCHours()).toBe(21);
    expect(d.getUTCMinutes()).toBe(59);
  });
});

describe('applyExtendedDeadline (GREATEST, FÖRLÄNG FÖRKORTA ALDRIG)', () => {
  it('FÖRLÄNGER ett ankare som ligger FÖRE fasta tiden -> fasta tiden', () => {
    // g-A-1 (11/6) ligger före -> deadline blir den fasta söndagstiden.
    expect(applyExtendedDeadline('2026-06-11T19:00:00.000Z')).toBe(POOL_EXTENDED_DEADLINE_ISO);
    // En grupp vars första match är sent på lördagen 14/6 (men före 21:59Z) förlängs också.
    expect(applyExtendedDeadline('2026-06-14T20:00:00.000Z')).toBe(POOL_EXTENDED_DEADLINE_ISO);
  });

  it('BEHÅLLER ett ankare som ligger EFTER fasta tiden (förkortar ALDRIG)', () => {
    // En sen grupp (g-G-1 = 15/6) behåller sitt SENARE ankare , annars låser vi ute folk.
    expect(applyExtendedDeadline('2026-06-15T19:00:00.000Z')).toBe('2026-06-15T19:00:00.000Z');
    // Långt senare slutspelsmatch (om någon förlängningsdrabbad gren skulle nå den).
    expect(applyExtendedDeadline('2026-07-19T19:00:00.000Z')).toBe('2026-07-19T19:00:00.000Z');
  });

  it('GRÄNS: exakt PÅ fasta tiden -> behåller (ankaret = fasta tiden, GREATEST oförändrad)', () => {
    // Likhet: GREATEST(t, t) = t. Ankaret förblir oförändrat.
    expect(applyExtendedDeadline(POOL_EXTENDED_DEADLINE_ISO)).toBe(POOL_EXTENDED_DEADLINE_ISO);
    // En millisekund EFTER -> behålls (senare). En millisekund FÖRE -> förlängs.
    expect(applyExtendedDeadline('2026-06-14T21:59:00.001Z')).toBe('2026-06-14T21:59:00.001Z');
    expect(applyExtendedDeadline('2026-06-14T21:58:59.999Z')).toBe(POOL_EXTENDED_DEADLINE_ISO);
  });

  it('FAIL-SAFE: null-ankare förblir null (gissar ALDRIG fram en tid ur ett saknat ankare)', () => {
    // Samma riktning som RLS:ens NULL-fail-safe: en okänd grupp/slot ska INTE få ett
    // öppet fönster ur tomma luften. null in -> null ut.
    expect(applyExtendedDeadline(null)).toBeNull();
  });
});
