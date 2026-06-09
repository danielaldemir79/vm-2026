import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME, THEME_ATTRIBUTE, THEME_STORAGE_KEY, THEMES } from './theme-constants';
import { buildThemeInitScript, buildThemeInitTag } from './theme-init';
import { resolveInitialTheme } from './theme-core';

// Dessa tester är skyddsräcket för no-flash-knepet: de bevisar att det
// genererade inline-scriptet INTE driver isär från theme-constants.ts och att
// dess resolve-regel ger samma svar som den rena resolveInitialTheme. Spegling
// utan dublett-drift, exakt det playbooken kräver.

describe('buildThemeInitScript, synk mot konstanterna (ingen drift)', () => {
  const script = buildThemeInitScript();

  it('refererar storage-nyckeln från konstanterna, inte en hårdkodad sträng', () => {
    expect(script).toContain(JSON.stringify(THEME_STORAGE_KEY));
  });

  it('sätter exakt det attribut konstanterna definierar', () => {
    expect(script).toContain(JSON.stringify(THEME_ATTRIBUTE));
  });

  it('innehåller default-temat (fallback i catch-grenen)', () => {
    expect(script).toContain(JSON.stringify(DEFAULT_THEME));
  });

  it('känner till exakt de giltiga temana från THEMES', () => {
    expect(script).toContain(JSON.stringify([...THEMES]));
  });

  it('paketeras som ett <script>-element av buildThemeInitTag', () => {
    const tag = buildThemeInitTag();
    expect(tag.startsWith('<script>')).toBe(true);
    expect(tag.endsWith('</script>')).toBe(true);
    expect(tag).toContain(script);
  });
});

describe('inline-scriptets resolve-regel matchar resolveInitialTheme', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  });

  /**
   * Kör det genererade scriptet i en kontrollerad miljö med fejkad localStorage
   * + matchMedia, och returnera vilket tema det satte på <html>. Detta exekverar
   * SAMMA kod som hamnar i index.html, så testet fångar verklig drift.
   */
  function runInitScript(stored: string | null, systemPrefersDark: boolean): string | null {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(stored);
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: systemPrefersDark,
    } as MediaQueryList);

    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    // new Function exekverar genererad script-text isolerat. Medvetet i test:
    // det är samma kod som hamnar i index.html, så vi fångar verklig drift.
    new Function(buildThemeInitScript())();
    return document.documentElement.getAttribute(THEME_ATTRIBUTE);
  }

  const cases: ReadonlyArray<{ stored: string | null; dark: boolean }> = [
    { stored: 'light', dark: true }, // sparat vinner över system
    { stored: 'dark', dark: false }, // sparat vinner över system
    { stored: null, dark: true }, // system dark
    { stored: null, dark: false }, // system light
    { stored: 'ogiltigt', dark: true }, // korrupt -> system
    { stored: 'ogiltigt', dark: false }, // korrupt -> system
  ];

  it.each(cases)(
    'sparat=$stored, system-dark=$dark ger samma som resolveInitialTheme',
    ({ stored, dark }) => {
      const fromScript = runInitScript(stored, dark);
      const fromResolver = resolveInitialTheme(stored, dark);
      expect(fromScript).toBe(fromResolver);
    }
  );

  it('faller till DEFAULT_THEME om localStorage kastar (privat läge), matchar resolveInitialTheme(stored, null)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blockerad storage');
    });
    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    // Exekvera samma genererade script-text som i index.html, se runInitScript.
    new Function(buildThemeInitScript())();
    const fromScript = document.documentElement.getAttribute(THEME_ATTRIBUTE);
    expect(fromScript).toBe(DEFAULT_THEME);
    // Speglingen håller: scriptets catch-gren ger samma svar som resolvern när
    // system-preferensen inte kan läsas (null = "ej läsbart").
    expect(fromScript).toBe(resolveInitialTheme(null, null));
  });

  it('faller till DEFAULT_THEME om matchMedia saknas/kastar, matchar resolveInitialTheme(stored, null)', () => {
    // Inget sparat val, så scriptet hade gått vidare till matchMedia, men den
    // kastar (motsvarar miljö utan matchMedia). Scriptets catch ska då sätta
    // DEFAULT_THEME, exakt det resolvern returnerar för systemPrefersDark = null.
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    vi.spyOn(window, 'matchMedia').mockImplementation(() => {
      throw new Error('matchMedia saknas');
    });
    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    // Exekvera samma genererade script-text som i index.html, se runInitScript.
    new Function(buildThemeInitScript())();
    const fromScript = document.documentElement.getAttribute(THEME_ATTRIBUTE);
    expect(fromScript).toBe(DEFAULT_THEME);
    expect(fromScript).toBe(resolveInitialTheme(null, null));
  });
});
