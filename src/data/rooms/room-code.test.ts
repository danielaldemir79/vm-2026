import { describe, expect, it } from 'vitest';
import {
  generateRoomCode,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from './room-code';

// DB:ns check-constraint på rooms.code (rooms_code_format). Testet vaktar att den
// klient-genererade koden ALLTID matchar databasen, så de aldrig driver isär.
const DB_CODE_PATTERN = /^[a-z2-9]{4,12}$/;

describe('room-code: teckenförråd (otvetydigt, matchar DB-constraint)', () => {
  it('innehåller inga tvetydiga tecken (0, 1, l, o)', () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01lo]/);
  });

  it('består bara av tecken DB:ns mönster tillåter (a-z2-9)', () => {
    for (const ch of ROOM_CODE_ALPHABET) {
      expect(ch).toMatch(/[a-z2-9]/);
    }
  });
});

describe('generateRoomCode', () => {
  it('genererar en kod av standardlängd som matchar DB:ns constraint', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    expect(code).toMatch(DB_CODE_PATTERN);
  });

  it('är deterministisk med en injicerad slumpkälla (testbarhet)', () => {
    // En konstant slumpkälla -> alltid index 0 -> alla tecken = alfabetets första.
    const code = generateRoomCode(6, () => 0);
    expect(code).toBe(ROOM_CODE_ALPHABET[0].repeat(6));
  });

  it('täcker hela teckenförrådet (sista index nås, ingen off-by-one)', () => {
    // random() nära 1 -> sista index. Math.floor(0.999... * len) = len - 1.
    const code = generateRoomCode(4, () => 0.999999);
    expect(code).toBe(ROOM_CODE_ALPHABET[ROOM_CODE_ALPHABET.length - 1].repeat(4));
  });

  it('alla genererade koder över många dragningar matchar DB-mönstret (egenskaps-test)', () => {
    for (let i = 0; i < 500; i++) {
      expect(generateRoomCode()).toMatch(DB_CODE_PATTERN);
    }
  });

  it('respekterar en giltig anpassad längd inom DB:ns 4-12-intervall', () => {
    expect(generateRoomCode(4)).toHaveLength(4);
    expect(generateRoomCode(12)).toHaveLength(12);
  });

  it('fail loud:ar (kastar) för en längd UNDER DB:ns minimum (3)', () => {
    // Randfall n-1 (under min): ska kasta, inte tyst ge en kod DB:n avvisar.
    expect(() => generateRoomCode(3)).toThrow(/utanför tillåtet intervall/);
  });

  it('fail loud:ar (kastar) för en längd ÖVER DB:ns maximum (13)', () => {
    // Randfall n+1 (över max).
    expect(() => generateRoomCode(13)).toThrow(/utanför tillåtet intervall/);
  });
});

describe('normalizeRoomCode (speglar DB-RPC:ns lower(btrim(...)))', () => {
  it('trimmar och gör gemener', () => {
    expect(normalizeRoomCode('  ABc23  ')).toBe('abc23');
  });

  it('lämnar en redan normaliserad kod oförändrad', () => {
    expect(normalizeRoomCode('xy7k9p')).toBe('xy7k9p');
  });
});
