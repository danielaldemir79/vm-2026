// Kontrast-mätning för T17 (topplista + tips-avslöjande), canvas-komposit VÄRSTA fall.
//
// Engångs-verktyg (körs av design-frontend vid handoff, inte i CI): beräknar WCAG-
// kontrastförhållanden med KORREKT alfa-komposit (en token vid given alfa blandad
// över sin BASYTA), så "guld-text-på-tint"-fällan fångas i siffran, inte gissas.
// Samma metod som T15/T16/T16b-visuellt (decisions.md). Värdena kopieras till
// decisions.md T17-visuellt. Token-värdena nedan är KLISTRADE ur tokens.css (en
// manuell spegel; om en token ändras måste den uppdateras här innan ny mätning).
//
// Kör: node scripts/contrast-t17.mjs

/** Hex (#rgb/#rrggbb) -> [r,g,b] 0..255. */
function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Alfa-komposit: lägg `fg` (med alfa 0..1) över opak `bg`. Returnerar opak rgb. */
function composite(fg, alpha, bg) {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));
}

/** sRGB relativ luminans (WCAG 2.x). */
function luminance([r, g, b]) {
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG-kontrastförhållande mellan två OPAKA färger. */
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// --- TOKEN-VÄRDEN, klistrade ur tokens.css (manuell spegel) -------------------
const T = {
  dark: {
    bg: '#091310',
    surface: '#10201a',
    surfaceRaised: '#19302a',
    border: '#2c4034',
    fg: '#eef5f0',
    fgMuted: '#9cb2a6',
    warning: '#f3c14e', // guld-TEXT
    gold: '#f3c14e',
    couponInk: '#1c1403',
    silver: '#c5cdd6',
    silverInk: '#15191e',
    silverText: '#c5cdd6',
    bronze: '#cd8a52',
    bronzeInk: '#1a0f06',
    bronzeText: '#d99a64',
    success: '#5ad1a0',
    danger: '#fb7287',
    accent: '#1fe082',
  },
  light: {
    bg: '#f1f5f0',
    surface: '#ffffff',
    surfaceRaised: '#ffffff',
    border: '#cdd8ce',
    fg: '#0c1a13',
    fgMuted: '#4f6258',
    warning: '#8a5a05', // guld-TEXT
    gold: '#b07d10',
    couponInk: '#1c1403',
    silver: '#aab4bf',
    silverInk: '#15191e',
    silverText: '#52606e',
    bronze: '#b07444',
    bronzeInk: '#1a0f06',
    bronzeText: '#8a4f23',
    success: '#0f766e',
    danger: '#c4302c',
    accent: '#0e7a44',
  },
};

/** mix(token alpha%, base) -> opak komposit-färg (color-mix mot transparent över base). */
function tint(tokenHex, alphaPct, baseHex) {
  return composite(hexToRgb(tokenHex), alphaPct / 100, hexToRgb(baseHex));
}

const cases = [];
function add(label, fgRgb, bgRgb, threshold) {
  const dark = contrast(fgRgb.dark, bgRgb.dark);
  const light = contrast(fgRgb.light, bgRgb.light);
  cases.push({ label, dark, light, threshold });
}

// Hjälp: hämta token-rgb per tema.
const tok = (name) => ({ dark: hexToRgb(T.dark[name]), light: hexToRgb(T.light[name]) });

// 1) Medalj-ink på SOLID medalj-yta (1:a guld, 2:a silver, 3:a brons). Färg-oberoende
//    solid-bricka-form: siffran står på opak medalj, inte på tint.
add('Guld-medalj siffra (coupon-ink på solid gold)', tok('couponInk'), tok('gold'), 4.5);
add('Silver-medalj siffra (silver-ink på solid silver)', tok('silverInk'), tok('silver'), 4.5);
add('Brons-medalj siffra (bronze-ink på solid bronze)', tok('bronzeInk'), tok('bronze'), 4.5);

// 2) Egna radens "DU"-bricka: accent-fg på solid accent (samma som primärknapp).
//    accent-fg är en egen token (#04140b mörkt / #ffffff ljust), inte i tabellen ovan.
const ACCENT_FG = { dark: hexToRgb('#04140b'), light: hexToRgb('#ffffff') };
add('DU-bricka (accent-fg på solid accent)', ACCENT_FG, tok('accent'), 4.5);

// 3) Topplistans text på radens yta. Egen rad (DU) bär en svag accent-tint i fonden
//    (8% mörkt / 10% ljust över surface) PLUS en ring; text måste hålla AA på tinten.
const duRowBg = {
  dark: tint(T.dark.accent, 8, T.dark.surface),
  light: tint(T.light.accent, 10, T.light.surface),
};
add('Egen rad namn (fg) på DU-rad-tint', tok('fg'), duRowBg, 4.5);
add('Egen rad poäng (fg) på DU-rad-tint', tok('fg'), duRowBg, 4.5);

// Topp-1-radens guld-tonade fond (warm leader glow, guld 7% mörkt / 9% ljust över surface).
const leaderRowBg = {
  dark: tint(T.dark.gold, 7, T.dark.surface),
  light: tint(T.light.gold, 9, T.light.surface),
};
add('Ledar-rad namn (fg) på guld-glow-rad', tok('fg'), leaderRowBg, 4.5);
add('Ledar-rad poäng-tal (warning) på guld-glow-rad', tok('warning'), leaderRowBg, 4.5);

// Vanlig rad (bg-surface): namn (fg) + poäng (fg-muted för icke-topp).
add('Vanlig rad namn (fg) på surface', tok('fg'), tok('surface'), 4.5);
add('Vanlig rad rank-tal (fg) på surface-raised', tok('fg'), tok('surfaceRaised'), 4.5);

// Topplistans eyebrow ("VM-POOLEN", warning/guld) på panelens surface.
add('Eyebrow VM-POOLEN (warning) på surface', tok('warning'), tok('surface'), 4.5);

// 4) REVEAL: facit-talet (warning/guld, STORT) på reveal-kortets surface.
add('Reveal facit-tal (warning) på surface', tok('warning'), tok('surface'), 4.5);
// Reveal pick-rad: namn (fg) + tippad ställning (fg-muted) på surface.
add('Reveal pick namn (fg) på surface', tok('fg'), tok('surface'), 4.5);
add('Reveal pick tippning (fg-muted) på surface', tok('fgMuted'), tok('surface'), 4.5);

// 5) FACIT-UTFALL-markörer (färg-oberoende: ikon+form, men ringfärgen mäts ändå).
//    Exakt (3p) = success-ton, Utfall (1p) = warning-ton, Miss (0p) = fg-muted.
//    Markör-SIFFRAN/ikonen står som ink på en SOLID markör-yta (färg-oberoende form).
add(
  'Exakt-markör ink (on-success) på solid success',
  { dark: hexToRgb('#04140b'), light: hexToRgb('#ffffff') },
  tok('success'),
  4.5
);
add('Utfall-markör ink (coupon-ink) på solid gold', tok('couponInk'), tok('gold'), 4.5);
add('Miss-markör glyf (fg-muted) på surface-raised yta', tok('fgMuted'), tok('surfaceRaised'), 3.0);
// Poäng-etikett per pick (fg-muted för 0p, warning för 3p) på surface.
add('Pick poäng 3p (warning) på surface', tok('warning'), tok('surface'), 4.5);
add('Pick poäng 0p (fg-muted) på surface', tok('fgMuted'), tok('surface'), 4.5);

// --- Rapport ------------------------------------------------------------------
let minDark = Infinity;
let minLight = Infinity;
let fails = 0;
console.log('\nT17 kontrast (canvas-komposit, VÄRSTA fall, BÅDA teman)\n');
console.log(
  'Yta'.padEnd(50),
  'Mörkt'.padStart(8),
  'Ljust'.padStart(8),
  'Tröskel'.padStart(9),
  'Status'.padStart(8)
);
for (const c of cases) {
  const ok = c.dark >= c.threshold && c.light >= c.threshold;
  if (!ok) fails++;
  if (c.threshold >= 4.5) {
    minDark = Math.min(minDark, c.dark);
    minLight = Math.min(minLight, c.light);
  }
  console.log(
    c.label.padEnd(50),
    c.dark.toFixed(2).padStart(8),
    c.light.toFixed(2).padStart(8),
    String(c.threshold).padStart(9),
    (ok ? 'OK' : 'FAIL').padStart(8)
  );
}
console.log(
  `\nMIN över normal-text-ytor (>=4.5): mörkt ${minDark.toFixed(2)}:1 / ljust ${minLight.toFixed(2)}:1`
);
console.log(fails === 0 ? 'ALLA >= sin tröskel.\n' : `\n${fails} yta(or) UNDER tröskel.\n`);
process.exit(fails === 0 ? 0 : 1);
