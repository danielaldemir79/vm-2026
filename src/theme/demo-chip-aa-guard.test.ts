// DEMO-CHIP AA-VAKT, KÄLL-SCAN + KONTRAST-BEVIS (T29, issue #48 + T56-review F4).
//
// Det "Demo-data"-märke som tre vyer (Gruppspelet, Slutspelsträdet, Dagens matcher)
// bär i fixtures-läge bar FÖRR rå --vm-gold som TEXT på en --vm-gold-12%-tint.
// I LJUST tema (där --vm-gold är mörk amber #b07d10 men ytan nästan vit) föll guld-texten
// under WCAG AA (uppmätt 3.17:1, contrast-t29.mjs), den kända gold-on-tint-fällan
// (lessons: aa-kontrast-pastad-...-text-på-tint). T29 byter chippet till den färg-
// OBEROENDE solid-bricka-formen: en SOLID --vm-gold-yta med mörk ink (--vm-coupon-ink),
// single-sourcad i .vm-demo-chip (tokens.css).
//
// Den här vakten har TVÅ ben, så fällan inte kan smyga tillbaka:
//  1) KÄLL-SCAN: de fyra vyerna måste rendera chippet via den delade klassen
//     `vm-demo-chip`, och INGEN av dem får bära det gamla gold-on-tint-receptet inline
//     (--vm-gold som color på en --vm-gold ...%-tint).
//  2) KONTRAST-BEVIS: .vm-demo-chip ska vara solid-formen (--vm-gold bakgrund +
//     --vm-coupon-ink text), och de FAKTISKA token-värdena per tema måste ge >= 4.5:1.
//     Vi NÅR medvetet det LJUSA temat (där den gamla formen bröts) och assertar AA där,
//     inte bara i mörkt tema (lessons: testa den gren där invarianten faktiskt bryts).
//
// KÄLLÄSNING: via Vites `import.meta.glob({ query: '?raw', eager: true })` (samma
// bundler-läge som day-theme-contrast-guard.test.ts, inga Node-typer / nytt beroende).

import { describe, it, expect } from 'vitest';

// --- 1) KÄLL-SCAN -------------------------------------------------------------

/** De tre vy-källfilerna som renderar demo-chippet, som rå text. */
const VIEW_SOURCES = import.meta.glob(
  '../features/{groups/GroupStageView,bracket/BracketView,daily/DailyMatchesView}.tsx',
  { query: '?raw', import: 'default', eager: true }
) as Record<string, string>;

/**
 * Det gamla gold-on-tint-receptet (rå --vm-gold som TEXT-färg). Vi flaggar varje vy som
 * sätter `color: 'var(--vm-gold)'` (eller motsv. utan citationstecken) i en inline-style,
 * den enda platsen demo-chippet använde rå guld som textfärg. Solid-formen sätter ALDRIG
 * --vm-gold som color (den sätter --vm-coupon-ink), så ett träff = fällan är tillbaka.
 *
 * `(?<![\w-])` före `color` så vi INTE råkar matcha `background-color: var(--vm-gold)`
 * (den legitima solid-fyllningen, som innehåller delsträngen "color: var(--vm-gold)").
 */
const GOLD_AS_TEXT = /(?<![\w-])color:\s*['"]?var\(--vm-gold\)/;

describe('demo-chip AA-vakt: käll-scan (de tre vyerna)', () => {
  it('käll-scannen hittar faktiskt alla tre vy-filer (annars vaktar den tomma luften)', () => {
    // Förutsättning: glob:en plockade upp filerna. Skulle en sökväg glida (fil-flytt/
    // omdöpning) vill vi FAILA, inte tyst passera med färre filer att vakta.
    expect(Object.keys(VIEW_SOURCES).length).toBe(3);
  });

  it('varje vy renderar Demo-data-chippet via den delade klassen vm-demo-chip', () => {
    for (const [key, source] of Object.entries(VIEW_SOURCES)) {
      // Vyn bär texten "Demo-data" OCH den delade klassen. (Att texten finns testas
      // även per-vy i respektive *.test.tsx; här binder vi den till KLASSEN.)
      expect(source, `${key} saknar "Demo-data"-märket`).toContain('Demo-data');
      expect(
        source.includes('vm-demo-chip'),
        `${key} renderar inte demo-chippet via den delade klassen vm-demo-chip ` +
          `(single-sourcing, lessons: spridda inline-recept driftar isär).`
      ).toBe(true);
    }
  });

  it('ingen vy bär det gamla gold-on-tint-receptet (rå --vm-gold som textfärg)', () => {
    const offenders: string[] = [];
    for (const [key, source] of Object.entries(VIEW_SOURCES)) {
      if (GOLD_AS_TEXT.test(source)) offenders.push(key);
    }
    expect(
      offenders,
      `Demo-chippet använder rå --vm-gold som textfärg i: ${offenders.join(', ')}. ` +
        `Det är gold-on-tint-fällan (faller under AA i ljust tema, 3.17:1). Använd den ` +
        `solida .vm-demo-chip-formen (--vm-coupon-ink på --vm-gold).`
    ).toEqual([]);
  });
});

// --- 2) KONTRAST-BEVIS --------------------------------------------------------

/** tokens.css som rå text, för att läsa .vm-demo-chip-regeln + token-värden per tema. */
const TOKENS_CSS = import.meta.glob('./tokens.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const tokensCss = Object.values(TOKENS_CSS)[0] ?? '';

/** Plocka body:n för en CSS-regel `selector { ... }` (första förekomsten). */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) return '';
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return open === -1 || close === -1 ? '' : css.slice(open + 1, close);
}

/**
 * Läs ett tema-block (`:root` eller `[data-theme='dark']`) och hämta ett tokens hex-värde.
 * Token-värdena ligger som `--namn: #hex;` i respektive tema-block. Vi läser dem ur den
 * RIKTIGA tokens.css (inte en handskriven spegel), så ett token-byte fångas av vakten.
 */
function tokenHex(css: string, themeSelector: string, token: string): string {
  const block = ruleBody(css, themeSelector);
  const m = new RegExp(`${token}:\\s*(#[0-9a-fA-F]{3,8})`).exec(block);
  return m ? m[1] : '';
}

/** Hex -> [r,g,b] 0..255. */
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** sRGB relativ luminans (WCAG 2.x). */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG-kontrastförhållande mellan två OPAKA färger. */
function contrast(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe('demo-chip AA-vakt: kontrast-bevis (.vm-demo-chip, BÅDA teman)', () => {
  it('.vm-demo-chip är solid-formen (--vm-gold bakgrund + --vm-coupon-ink text)', () => {
    const body = ruleBody(tokensCss, '.vm-demo-chip {');
    expect(body, '.vm-demo-chip saknas i tokens.css').not.toBe('');
    // Solid-formen: ytan är --vm-gold, texten är --vm-coupon-ink. Aldrig --vm-gold som
    // color (det vore gold-on-tint-fällan igen). `(?<![\w-])` så vi inte matchar
    // delsträngen "color: var(--vm-gold)" inuti `background-color: var(--vm-gold)`.
    expect(body).toMatch(/background-color:\s*var\(--vm-gold\)/);
    expect(body).toMatch(/(?<![\w-])color:\s*var\(--vm-coupon-ink\)/);
    expect(body).not.toMatch(/(?<![\w-])color:\s*var\(--vm-gold\)/);
  });

  // Tema-blocken i tokens.css (sektion 2): :root = MÖRKT (DEFAULT_THEME), och
  // :root[data-theme='light'] överskriver för LJUST tema. Vi läser de FAKTISKA värdena
  // ur källan (inte en handskriven spegel), så ett token-byte fångas av vakten.
  const ink = '--vm-coupon-ink';
  const gold = '--vm-gold';

  it('LJUST tema (där gamla formen bröts): coupon-ink på solid --vm-gold >= 4.5:1', () => {
    // Ljust tema är den gren där den GAMLA formen föll under AA (3.17:1). Vi NÅR den
    // grenen medvetet och bevisar att den NYA formen håller AA här.
    const inkHex = tokenHex(tokensCss, ":root[data-theme='light']", ink);
    const goldHex = tokenHex(tokensCss, ":root[data-theme='light']", gold);
    expect(inkHex, "kunde inte läsa --vm-coupon-ink i :root[data-theme='light']").not.toBe('');
    expect(goldHex, "kunde inte läsa --vm-gold i :root[data-theme='light']").not.toBe('');
    const ratio = contrast(hexToRgb(inkHex), hexToRgb(goldHex));
    // Uppmätt 5.03:1 (contrast-t29.mjs). Tröskel AA normal-text 4.5:1.
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('MÖRKT tema (:root, default): coupon-ink på solid --vm-gold >= 4.5:1', () => {
    const inkHex = tokenHex(tokensCss, ":root[data-theme='dark']", ink);
    const goldHex = tokenHex(tokensCss, ":root[data-theme='dark']", gold);
    expect(inkHex, "kunde inte läsa --vm-coupon-ink i :root[data-theme='dark']").not.toBe('');
    expect(goldHex, "kunde inte läsa --vm-gold i :root[data-theme='dark']").not.toBe('');
    const ratio = contrast(hexToRgb(inkHex), hexToRgb(goldHex));
    // Uppmätt 10.90:1 (contrast-t29.mjs).
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
