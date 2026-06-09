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
   *
   * storage / matchMedia kan ställas in att KASTA (storageThrows / mediaThrows),
   * vilket speglar blockerad privat storage respektive en miljö där matchMedia
   * saknas. Så kan hela fel-kombinations-matrisen köras mot samma genererade
   * script, och bindas mot resolverns motsvarande argument.
   */
  function runInitScript(opts: {
    stored: string | null;
    systemPrefersDark: boolean;
    storageThrows?: boolean;
    mediaThrows?: boolean;
  }): string | null {
    if (opts.storageThrows) {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blockerad storage');
      });
    } else {
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(opts.stored);
    }

    if (opts.mediaThrows) {
      vi.spyOn(window, 'matchMedia').mockImplementation(() => {
        throw new Error('matchMedia saknas');
      });
    } else {
      vi.spyOn(window, 'matchMedia').mockReturnValue({
        matches: opts.systemPrefersDark,
      } as MediaQueryList);
    }

    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    // new Function exekverar genererad script-text isolerat. Medvetet i test:
    // det är samma kod som hamnar i index.html, så vi fångar verklig drift.
    new Function(buildThemeInitScript())();
    return document.documentElement.getAttribute(THEME_ATTRIBUTE);
  }

  // Varje fall binder det genererade scriptet mot resolveInitialTheme med de
  // argument scriptet faktiskt SER i det läget: när storage kastar är scriptets
  // upplevda "stored" = null; när matchMedia kastar är scriptets upplevda
  // systempreferens = null. Asserten jämför alltså mot resolverns sanning, inte
  // mot en handskriven förväntan, så en framtida divergens failar testet.
  const cases: ReadonlyArray<{
    name: string;
    stored: string | null;
    dark: boolean;
    storageThrows?: boolean;
    mediaThrows?: boolean;
    // Vad resolvern ser givet ovan (storage-fel -> null stored, media-fel -> null pref).
    resolverStored: string | null;
    resolverPref: boolean | null;
  }> = [
    // Happy path: sparat vinner över system.
    {
      name: 'sparat light vinner över system-dark',
      stored: 'light',
      dark: true,
      resolverStored: 'light',
      resolverPref: true,
    },
    {
      name: 'sparat dark vinner över system-light',
      stored: 'dark',
      dark: false,
      resolverStored: 'dark',
      resolverPref: false,
    },
    // Happy path: inget sparat -> system.
    {
      name: 'inget sparat -> system dark',
      stored: null,
      dark: true,
      resolverStored: null,
      resolverPref: true,
    },
    {
      name: 'inget sparat -> system light',
      stored: null,
      dark: false,
      resolverStored: null,
      resolverPref: false,
    },
    // Korrupt sparat -> system (behandlas som "inget val").
    {
      name: 'korrupt sparat -> system dark',
      stored: 'ogiltigt',
      dark: true,
      resolverStored: 'ogiltigt',
      resolverPref: true,
    },
    {
      name: 'korrupt sparat -> system light',
      stored: 'ogiltigt',
      dark: false,
      resolverStored: 'ogiltigt',
      resolverPref: false,
    },
    // Fel-väg: storage kastar men matchMedia funkar -> SYSTEM-preferensen, INTE default.
    {
      name: 'storage kastar + matchMedia dark -> system (dark), inte default',
      stored: null,
      dark: true,
      storageThrows: true,
      resolverStored: null,
      resolverPref: true,
    },
    {
      name: 'storage kastar + matchMedia light -> system (light), inte default',
      stored: null,
      dark: false,
      storageThrows: true,
      resolverStored: null,
      resolverPref: false,
    },
    // Fel-väg: både storage och matchMedia otillgängliga -> DEFAULT_THEME.
    {
      name: 'storage kastar + matchMedia kastar -> DEFAULT_THEME',
      stored: null,
      dark: true,
      storageThrows: true,
      mediaThrows: true,
      resolverStored: null,
      resolverPref: null,
    },
    // Fel-väg: bara matchMedia otillgänglig (inget sparat) -> DEFAULT_THEME.
    {
      name: 'inget sparat + matchMedia kastar -> DEFAULT_THEME',
      stored: null,
      dark: true,
      mediaThrows: true,
      resolverStored: null,
      resolverPref: null,
    },
    // Sparat-giltigt även när matchMedia kastar -> sparat (storage-grenen returnerar tidigt).
    {
      name: 'sparat giltigt + matchMedia kastar -> sparat',
      stored: 'light',
      dark: true,
      mediaThrows: true,
      resolverStored: 'light',
      resolverPref: null,
    },
  ];

  it.each(cases)('$name (script == resolveInitialTheme)', (c) => {
    const fromScript = runInitScript({
      stored: c.stored,
      systemPrefersDark: c.dark,
      storageThrows: c.storageThrows,
      mediaThrows: c.mediaThrows,
    });
    const fromResolver = resolveInitialTheme(c.resolverStored, c.resolverPref);
    expect(fromScript).toBe(fromResolver);
  });

  it('storage-fel + fungerande matchMedia ger system-preferensen (dark), aldrig default', () => {
    // Regressionsvakt mot ETT-try/catch-buggen: ett gemensamt try/catch hade
    // hoppat till default när storage kastar. Med oberoende guards ska
    // system-preferensen (dark) vinna, vilket är skilt från DEFAULT_THEME bara
    // om systemet säger ljust, så vi verifierar dark-fallet explicit.
    const fromScript = runInitScript({
      stored: null,
      systemPrefersDark: true,
      storageThrows: true,
    });
    expect(fromScript).toBe('dark');
    expect(fromScript).toBe(resolveInitialTheme(null, true));
  });

  it('storage-fel + fungerande matchMedia ger system-preferensen (light), aldrig default', () => {
    // Light är här SKILT från DEFAULT_THEME (dark), så detta fall faller bara om
    // scriptet felaktigt hoppar till default i stället för system-preferensen.
    const fromScript = runInitScript({
      stored: null,
      systemPrefersDark: false,
      storageThrows: true,
    });
    expect(fromScript).toBe('light');
    expect(fromScript).not.toBe(DEFAULT_THEME);
    expect(fromScript).toBe(resolveInitialTheme(null, false));
  });

  it('både storage och matchMedia otillgängliga ger DEFAULT_THEME, matchar resolveInitialTheme(null, null)', () => {
    const fromScript = runInitScript({
      stored: null,
      systemPrefersDark: true,
      storageThrows: true,
      mediaThrows: true,
    });
    expect(fromScript).toBe(DEFAULT_THEME);
    expect(fromScript).toBe(resolveInitialTheme(null, null));
  });
});
