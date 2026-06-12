// Kontrast-mätning för T54 kom-igång-dialogen (design-polering), canvas-komposit
// VÄRSTA fall. Engångs-verktyg (körs av design-frontend vid handoff, inte i CI):
// beräknar WCAG-kontrastförhållanden med KORREKT alfa-komposit (en token vid given
// alfa blandad över sin BASYTA), så token-på-tint-fällan fångas i siffran, inte gissas.
// Samma metod som T15/T16/T17/T38/T58-visuellt (decisions.md). Token-värdena nedan är
// KLISTRADE ur tokens.css (en manuell spegel; om en token ändras måste den uppdateras
// här innan ny mätning).
//
// VAD MÄTS (de NYA text-bärande ytorna i den polerade dialogen):
//  - Väg-taggarna ("Snabbast att börja"/"Tryggast"): TEXT-rollen per färg (warning för
//    guld, accent för grön, ALDRIG rå --vm-gold) på sin egen svaga token-tint-fond.
//  - Noterna (Play Skydd / iOS Safari): note-TEXTEN (fg-muted) på sin svaga token-tint.
//  - Steg-medaljen: accent-fg-ink på en SOLID accent-yta (färg-oberoende solid-bricka).
//  - Done-kortets text (fg / fg-muted) på success-tinten, + bocken (on-success på solid
//    success).
//  - Emblemet: coupon-ink på SOLID guld (delad form, redan AA-proven, mäts för spårbarhet).
//
// All ÖVRIG dialog-text (rubriker, intro, steg-text) står på OPAKA surface/surface-raised
// (fg/fg-muted, redan AA-mätt i tokens.css sektion 0), så den mäts inte om här.
//
// Kör: node scripts/contrast-t54.mjs

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
    surface: '#10201a',
    border: '#2c4034',
    fg: '#eef5f0',
    fgMuted: '#9cb2a6',
    gold: '#f3c14e',
    warning: '#f3c14e', // guld-TEXT-roll (AA-säker tonen)
    couponInk: '#1c1403', // mörk ink PÅ solid guld
    accent: '#1fe082',
    accentFg: '#04140b', // ink PÅ solid accent
    success: '#5ad1a0',
    onSuccess: '#04140b', // ink PÅ solid success
  },
  light: {
    surface: '#ffffff',
    border: '#cdd8ce',
    fg: '#0c1a13',
    fgMuted: '#4f6258',
    gold: '#b07d10',
    warning: '#8a5a05', // guld-TEXT-roll (AA-säker tonen)
    couponInk: '#1c1403',
    accent: '#0e7a44',
    accentFg: '#ffffff', // ink PÅ solid accent
    success: '#0f766e',
    onSuccess: '#ffffff', // ink PÅ solid success
  },
};

/** mix(token alpha%, base) -> opak komposit-färg (color-mix mot transparent över base). */
function tint(tokenHex, alphaPct, baseHex) {
  return composite(hexToRgb(tokenHex), alphaPct / 100, hexToRgb(baseHex));
}

const cases = [];
function add(label, fg, bg, threshold) {
  const dark = contrast(fg.dark, bg.dark);
  const light = contrast(fg.light, bg.light);
  cases.push({ label, dark, light, threshold });
}

const tok = (name) => ({ dark: hexToRgb(T.dark[name]), light: hexToRgb(T.light[name]) });

// Tint-fonder (samma alfor som tokens.css T54-blocket).
const tagGoldBg = {
  dark: tint(T.dark.gold, 14, T.dark.surface),
  light: tint(T.light.gold, 14, T.light.surface),
};
const tagAccentBg = {
  dark: tint(T.dark.accent, 12, T.dark.surface),
  light: tint(T.light.accent, 12, T.light.surface),
};
const noteInfoBg = {
  dark: tint(T.dark.accent, 7, T.dark.surface),
  light: tint(T.light.accent, 7, T.light.surface),
};
const noteWarnBg = {
  dark: tint(T.dark.warning, 9, T.dark.surface),
  light: tint(T.light.warning, 9, T.light.surface),
};
const doneBg = {
  dark: tint(T.dark.success, 8, T.dark.surface),
  light: tint(T.light.success, 8, T.light.surface),
};

// 1) Guld-taggens TEXT (warning-roll) på guld-14%-tint. Liten bold (>=4.5 som normal text).
add('Tagg "Snabbast" (warning-text) på guld-14%-tint', tok('warning'), tagGoldBg, 4.5);
// 2) Accent-taggens TEXT (accent-roll) på accent-12%-tint.
add('Tagg "Tryggast" (accent-text) på accent-12%-tint', tok('accent'), tagAccentBg, 4.5);
// 3) Info-notens TEXT (fg-muted) på accent-7%-tint (Play Skydd-lugnandet).
add('Info-not (fg-muted) på accent-7%-tint', tok('fgMuted'), noteInfoBg, 4.5);
// 4) Warning-notens TEXT (fg-muted) på warning-9%-tint (iOS Safari-kravet).
add('Warning-not (fg-muted) på warning-9%-tint', tok('fgMuted'), noteWarnBg, 4.5);
// 5) Steg-medaljens SIFFRA: accent-fg-ink på SOLID accent (färg-oberoende solid-bricka).
add('Steg-medalj (accent-fg på SOLID accent)', tok('accentFg'), tok('accent'), 4.5);
// 6) Done-kortets RUBRIK + brödtext (fg) på success-8%-tint.
add('Done-kort rubrik/brödtext (fg) på success-8%-tint', tok('fg'), doneBg, 4.5);
// 7) Done-kortets undertext (fg-muted) på success-8%-tint.
add('Done-kort undertext (fg-muted) på success-8%-tint', tok('fgMuted'), doneBg, 4.5);
// 8) Done-bocken: on-success-ink på SOLID success (färg-oberoende solid-bricka, T11).
add('Done-bock (on-success på SOLID success)', tok('onSuccess'), tok('success'), 4.5);
// 9) Emblemet: coupon-ink på SOLID guld (delad form, redan AA-proven, för spårbarhet).
add('Hero-emblem (coupon-ink på SOLID guld)', tok('couponInk'), tok('gold'), 4.5);

// Väg-glyf-ringarna + kort-topplisten bär ALDRIG text (ren dekor), så de mäts inte som
// text-kontrast. Glyfen ritas i fg-muted (currentColor) men är aria-hidden dekoration.

// --- Rapport ------------------------------------------------------------------
let minDark = Infinity;
let minLight = Infinity;
let fails = 0;
console.log('\nT54 kom-igång-dialog-kontrast (canvas-komposit, VÄRSTA fall, BÅDA teman)\n');
console.log(
  'Yta'.padEnd(52),
  'Mörkt'.padStart(8),
  'Ljust'.padStart(8),
  'Tröskel'.padStart(9),
  'Status'.padStart(8)
);
for (const c of cases) {
  const ok = c.dark >= c.threshold && c.light >= c.threshold;
  if (!ok) fails++;
  minDark = Math.min(minDark, c.dark);
  minLight = Math.min(minLight, c.light);
  console.log(
    c.label.padEnd(52),
    c.dark.toFixed(2).padStart(8),
    c.light.toFixed(2).padStart(8),
    String(c.threshold).padStart(9),
    (ok ? 'OK' : 'FAIL').padStart(8)
  );
}
console.log(
  `\nMIN över alla text-ytor (>=4.5): mörkt ${minDark.toFixed(2)}:1 / ljust ${minLight.toFixed(2)}:1`
);
console.log(fails === 0 ? 'ALLA >= sin tröskel.\n' : `\n${fails} yta(or) UNDER tröskel.\n`);
process.exit(fails === 0 ? 0 : 1);
