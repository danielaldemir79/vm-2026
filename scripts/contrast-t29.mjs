// Kontrast-mätning för T29 demo-data-chippet (issue #48 + T56-review F4). Engångs-
// verktyg (körs vid handoff, inte i CI): beräknar WCAG-kontrastförhållanden med KORREKT
// alfa-komposit (en token vid given alfa blandad över sin BASYTA), så gold-on-tint-fällan
// fångas i siffran, inte gissas. Samma metod som scripts/contrast-t17/t38/t45/t54/t58.mjs
// (decisions.md). Token-värdena nedan är KLISTRADE ur src/theme/tokens.css (en manuell
// spegel; om en token ändras måste den uppdateras här innan ny mätning).
//
// CHIP-KONTEXT (varför mätningen behövs): "Demo-data"-märket i fyra vyers rubriker
// (Gruppspelet, Slutspelsträdet, Dagens matcher, Vad krävs) bar FÖRR rå --vm-gold som
// TEXT på en --vm-gold-12%-tint. I MÖRKT tema är gulden ljus (#f3c14e) -> höll AA, men i
// LJUST tema byter --vm-gold till mörk amber (#b07d10) medan ytan är nästan vit, så
// guld-texten faller under AA. T29 byter chippet till den färg-OBEROENDE solid-bricka-
// formen: SOLID --vm-gold-yta med mörk ink (--vm-coupon-ink), samma form som
// .vm-coupon-mine/.vm-reveal-actual/.vm-tips-sim-badge. Vi mäter BÅDA formerna i BÅDA
// teman så fällan (gammalt) och fixet (nytt) syns sida vid sida i siffrorna.
//
// Kör: node scripts/contrast-t29.mjs

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

// --- TOKEN-VÄRDEN, klistrade ur src/theme/tokens.css (manuell spegel) ---------
const T = {
  dark: {
    surface: '#10201a', // chippet sitter i rubrik-raden på sektions-ytan (surface)
    gold: '#f3c14e', // --vm-gold (mörkt tema): ljust guld
    couponInk: '#1c1403', // --vm-coupon-ink: mörk ink PÅ solid guld (tema-oberoende)
  },
  light: {
    surface: '#ffffff', // ljust tema: surface är vit
    gold: '#b07d10', // --vm-gold (ljust tema): mörk amber
    couponInk: '#1c1403', // --vm-coupon-ink: mörk ink PÅ solid guld (tema-oberoende)
  },
};

/** mix(token alpha%, base) -> opak komposit-färg (color-mix mot transparent över base). */
function tint(tokenHex, alphaPct, baseHex) {
  return composite(hexToRgb(tokenHex), alphaPct / 100, hexToRgb(baseHex));
}

const cases = [];
function add(label, fg, bg, threshold) {
  cases.push({
    label,
    dark: contrast(fg.dark, bg.dark),
    light: contrast(fg.light, bg.light),
    threshold,
  });
}

const tok = (name) => ({ dark: hexToRgb(T.dark[name]), light: hexToRgb(T.light[name]) });

// GAMLA FORMEN (fällan, NU BORTTAGEN): rå --vm-gold som TEXT på --vm-gold-12%-tint över
// surface. Ljust tema bottnar under AA. Mäts som bevis på varför bytet behövdes.
const goldTint12 = {
  dark: tint(T.dark.gold, 12, T.dark.surface),
  light: tint(T.light.gold, 12, T.light.surface),
};
add('GAMMALT: --vm-gold text på gold-12%-tint', tok('gold'), goldTint12, 4.5);

// NYA FORMEN (T29-fixet): SOLID --vm-gold-yta med mörk ink (--vm-coupon-ink). Den
// färg-oberoende solid-bricka-formen, AA-säker i BÅDA teman.
add('NYTT: coupon-ink på SOLID --vm-gold', tok('couponInk'), tok('gold'), 4.5);

// --- Rapport ------------------------------------------------------------------
let fails = 0;
console.log('\nT29 demo-data-chip-kontrast (canvas-komposit, BÅDA teman)\n');
console.log(
  'Form'.padEnd(44),
  'Mörkt'.padStart(8),
  'Ljust'.padStart(8),
  'Tröskel'.padStart(9),
  'Status'.padStart(8)
);
for (const c of cases) {
  const ok = c.dark >= c.threshold && c.light >= c.threshold;
  if (!ok) fails++;
  console.log(
    c.label.padEnd(44),
    c.dark.toFixed(2).padStart(8),
    c.light.toFixed(2).padStart(8),
    String(c.threshold).padStart(9),
    (ok ? 'OK' : 'FAIL').padStart(8)
  );
}
console.log(
  fails === 0
    ? '\nDen NYA formen håller AA i båda teman.\n'
    : `\n${fails} form(er) under tröskel (den gamla formen är fällan, NU borttagen).\n`
);
process.exit(0);
