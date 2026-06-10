import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLocalStorage,
  readStoredFlag,
  readStoredString,
  writeStoredFlag,
  writeStoredString,
} from './safe-storage';

const KEY = 'vm2026-test-flag';

describe('safe-storage, säker localStorage-åtkomst', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  describe('getLocalStorage', () => {
    it('returnerar window.localStorage när den kan nås', () => {
      expect(getLocalStorage()).toBe(window.localStorage);
    });

    it('returnerar null (utan att kasta) när själva åtkomsten kastar (blockerad/sandbox)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Simulera Safari/privacy-läge: redan ÅTKOMSTEN kastar SecurityError.
      const spy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
      expect(getLocalStorage()).toBeNull();
      expect(warn).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('sträng-flaggor', () => {
    it('skriver och läser tillbaka ett värde', () => {
      expect(writeStoredString(KEY, 'hej')).toBe(true);
      expect(readStoredString(KEY)).toBe('hej');
    });

    it('läser null för en frånvarande nyckel (frånvaro, inte default)', () => {
      expect(readStoredString('finns-inte')).toBeNull();
    });

    it('returnerar false (fail loud) när skrivningen kastar (full kvot/privat läge)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Storage hämtas internt via getLocalStorage() -> window.localStorage, så vi
      // byter HELA storage-objektet (getter-spion) mot ett vars setItem kastar.
      vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
        setItem: () => {
          throw new DOMException('quota', 'QuotaExceededError');
        },
      } as unknown as Storage);
      expect(writeStoredString(KEY, 'x')).toBe(false);
      expect(warn).toHaveBeenCalled();
    });

    it('returnerar null (utan att kasta) när läsningen kastar', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
        getItem: () => {
          throw new DOMException('boom', 'SecurityError');
        },
      } as unknown as Storage);
      expect(readStoredString(KEY)).toBeNull();
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('boolean-flaggor', () => {
    it('skriver true -> läser true', () => {
      expect(writeStoredFlag(KEY, true)).toBe(true);
      expect(readStoredFlag(KEY)).toBe(true);
    });

    it('skriver false -> tar bort nyckeln, läser false (ingen "0"-rad lämnas kvar)', () => {
      writeStoredFlag(KEY, true);
      expect(writeStoredFlag(KEY, false)).toBe(true);
      expect(window.localStorage.getItem(KEY)).toBeNull();
      expect(readStoredFlag(KEY)).toBe(false);
    });

    it('en frånvarande flagga läses som false (gissar aldrig sant)', () => {
      expect(readStoredFlag('finns-inte')).toBe(false);
    });

    it('ett okänt/korrupt värde läses som false (bara exakt "1" är sant)', () => {
      window.localStorage.setItem(KEY, 'true'); // INTE "1"
      expect(readStoredFlag(KEY)).toBe(false);
      window.localStorage.setItem(KEY, 'yes');
      expect(readStoredFlag(KEY)).toBe(false);
    });
  });
});
