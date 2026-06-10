import { describe, expect, it } from 'vitest';
import { avatarHueFromId, initialsFromName } from './member-avatar';

describe('initialsFromName', () => {
  it('tar första bokstaven i de två yttre orden, versaliserat', () => {
    expect(initialsFromName('Daniel Aldemir')).toBe('DA');
    // Mer än två ord: första + SISTA (mellannamn hoppas över).
    expect(initialsFromName('Anna Karin Svensson')).toBe('AS');
  });

  it('ger en enda initial för ett enda namn', () => {
    expect(initialsFromName('Bob')).toBe('B');
    expect(initialsFromName('elin')).toBe('E');
  });

  it('faller till "?" för tomt eller bara whitespace (aldrig en tom bricka)', () => {
    expect(initialsFromName('')).toBe('?');
    expect(initialsFromName('   ')).toBe('?');
  });

  it('hanterar extra mellanslag utan tomma "ord"', () => {
    expect(initialsFromName('  Daniel   Aldemir  ')).toBe('DA');
  });
});

describe('avatarHueFromId', () => {
  it('är deterministisk: samma id ger alltid samma hue', () => {
    expect(avatarHueFromId('user-abc')).toBe(avatarHueFromId('user-abc'));
  });

  it('ger ett tal i intervallet 0-359', () => {
    for (const id of ['a', 'user-1', 'a3f9-uuid-zz', 'me']) {
      const hue = avatarHueFromId(id);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it('skiljer (typiskt) olika identiteter åt på färgen', () => {
    // Inte en hård garanti (hash-krockar finns), men två vanliga id:n ska skilja sig.
    expect(avatarHueFromId('user-alice')).not.toBe(avatarHueFromId('user-bob'));
  });
});
