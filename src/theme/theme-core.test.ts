import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME, THEME_ATTRIBUTE, THEME_STORAGE_KEY } from './theme-constants';
import {
  applyThemeToDocument,
  nextTheme,
  persistTheme,
  readStoredTheme,
  readThemeFromDocument,
  resolveInitialTheme,
} from './theme-core';

describe('resolveInitialTheme, tema-prioritet', () => {
  it('använder sparat val NÄR det finns (vinner över system-preferens)', () => {
    // Sparat 'light' ska vinna även om systemet föredrar mörkt.
    expect(resolveInitialTheme('light', true)).toBe('light');
    expect(resolveInitialTheme('dark', false)).toBe('dark');
  });

  it('faller till system-preferensen NÄR inget är sparat', () => {
    expect(resolveInitialTheme(null, true)).toBe('dark');
    expect(resolveInitialTheme(null, false)).toBe('light');
  });

  it('faller till system-preferensen NÄR sparat värde är ogiltigt (korrupt data)', () => {
    // Ett korrupt/föråldrat värde behandlas som "inget val", inte som ett fel,
    // och maskeras inte tyst till DEFAULT, det faller till systemvalet.
    expect(resolveInitialTheme('blå', true)).toBe('dark');
    expect(resolveInitialTheme('blå', false)).toBe('light');
    expect(resolveInitialTheme('', false)).toBe('light');
  });

  it('default-temat är mörkt (SPEC §7) när inget sparat och systemet ej föredrar mörkt saknas-läge', () => {
    // Sanity: DEFAULT_THEME är dark, och resolve med null + system-dark ger dark.
    expect(DEFAULT_THEME).toBe('dark');
    expect(resolveInitialTheme(null, true)).toBe('dark');
  });

  it('faller till DEFAULT_THEME NÄR system-preferensen ej kan läsas (matchMedia saknas/kastar)', () => {
    // systemPrefersDark === null => sista utvägen. Detta gör DEFAULT_THEME-grenen
    // nåbar och matchar inline-scriptets catch-gren (theme-init.ts).
    expect(resolveInitialTheme(null, null)).toBe(DEFAULT_THEME);
  });

  it('sparat val vinner ÄVEN när system-preferensen ej kan läsas (null)', () => {
    // Explicit sparat val ska aldrig tappas bara för att matchMedia inte går att läsa.
    expect(resolveInitialTheme('light', null)).toBe('light');
    expect(resolveInitialTheme('dark', null)).toBe('dark');
  });
});

describe('applyThemeToDocument / readThemeFromDocument', () => {
  afterEach(() => {
    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  });

  it('skriver tema som data-theme på <html>', () => {
    applyThemeToDocument(document, 'light');
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light');
  });

  it('är idempotent (samma värde flera gånger ger samma resultat)', () => {
    applyThemeToDocument(document, 'dark');
    applyThemeToDocument(document, 'dark');
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark');
  });

  it('läser tillbaka det tema som satts på <html>', () => {
    applyThemeToDocument(document, 'light');
    expect(readThemeFromDocument(document)).toBe('light');
  });

  it('faller till DEFAULT_THEME när attributet saknas (t.ex. testmiljö utan inline-script)', () => {
    expect(readThemeFromDocument(document)).toBe(DEFAULT_THEME);
  });

  it('faller till DEFAULT_THEME när attributet är ogiltigt', () => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, 'sepia');
    expect(readThemeFromDocument(document)).toBe(DEFAULT_THEME);
  });
});

describe('persistTheme, fel-vägar (fail loud, inte tyst)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skriver tema till storage och returnerar true vid lyckad skrivning', () => {
    const store = new Map<string, string>();
    const storage = {
      setItem: (k: string, v: string) => store.set(k, v),
    } as unknown as Storage;

    expect(persistTheme(storage, 'light')).toBe(true);
    expect(store.get(THEME_STORAGE_KEY)).toBe('light');
  });

  it('returnerar false OCH varnar (inte tyst) när storage kastar (privat läge / kvot)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = {
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
    } as unknown as Storage;

    // Felet sväljs inte tyst: returvärdet signalerar misslyckandet och en
    // varning loggas, så buggen syns i stället för att maskeras.
    expect(persistTheme(storage, 'dark')).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('readStoredTheme, fel-vägar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returnerar råvärdet ur storage', () => {
    const storage = {
      getItem: () => 'light',
    } as unknown as Storage;
    expect(readStoredTheme(storage)).toBe('light');
  });

  it('returnerar null OCH varnar när storage-läsning kastar (blockerad storage)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    } as unknown as Storage;

    // null = "inget val", vilket resolve tolkar korrekt som frånvaro av data.
    expect(readStoredTheme(storage)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('nextTheme', () => {
  it('växlar mellan mörkt och ljust', () => {
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
  });
});
