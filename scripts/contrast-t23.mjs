// Kontrast-mätning för T23 (favoritlag-chip + personlig statistik-panel),
// canvas-komposit VÄRSTA fall. Engångs-verktyg (körs av design-frontend vid handoff,
// inte i CI): beräknar WCAG-kontrastförhållanden med KORREKT alfa-komposit (en token
// vid given alfa blandad över sin BASYTA), så glow-/tint-på-text-fällan fångas i
// siffran, inte gissas. Samma metod som T15/T16/T17/T29/T45/T58-visuellt (decisions.md).
// Token-värdena nedan är KLISTRADE ur tokens.css (en manuell spegel; om en token ändras
// måste den uppdateras här innan ny mätning).
//
// YTORNA SOM MÄTS (de NYA färgkombinationerna detta task inför):
//   FAVORIT-CHIPPET (matchkortet, dagsvyn): en DISKRET utlinjerad guld-pill (SKILD från
//   hero-kortets SOLIDA guld-bricka), så favoriten inte tävlar med "Dagens match"-chippet.
//   Text = fg på en LÅG guld-tint över matchkortets surface-yta; stjärnan = den AA-säkra
//   guld-TEXT-tonen (--color-warning), ALDRIG rå --vm-gold som text på tint (lessons-fällan).
//
//   STATISTIK-PANELEN (.vm-personal-stats): ett SYSKON till poäng-summeringen, inte en
//   kopia. Surface med en SVAG guld-hörn-glow (samma kvällsljus-signatur). HERO-stat-
//   brickan (träffsäkerhet) är surface-raised med en låg guld-tint + guld-TEXT-eyebrow.
//   Övriga stat-brickor är neutrala surface-raised. Bästa call-kortet bär en låg guld-
//   glow. Joker-markören återbrukar den SOLIDA guld-bricka-formen (redan mätt 10.90/5.03).
//
// Kör: node scripts/contrast-t23.mjs

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
    surfaceRaised: '#19302a',
    fg: '#eef5f0',
    fgMuted: '#9cb2a6',
    gold: '#f3c14e',
    warning: '#f3c14e', // guld-TEXT (AA-säker tonen)
    couponInk: '#1c1403', // mörk ink PÅ solid guld
  },
  light: {
    surface: '#ffffff',
    surfaceRaised: '#ffffff',
    fg: '#0c1a13',
    fgMuted: '#4f6258',
    gold: '#b07d10',
    warning: '#8a5a05', // guld-TEXT (AA-säker tonen)
    couponInk: '#1c1403', // mörk ink PÅ solid guld
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

const tok = (name) => ({ dark: hexToRgb(T.dark[name]), light: hexToRgb(T.light[name]) });

// FAVORIT-CHIPPETS fond = matchkortets surface med en guld-tint (10% alfa). Den utlinjerade
// pillen tonar fonden lätt guld; texten + stjärnan står på den tinten i värsta fallet.
// (Hero-kortet [data-highlight] ligger på surface-raised med en guld-10%-gradient; vi mäter
// den något mörkare surface-fonden som det allmänna fallet, samma fond favorit-pillens text
// står på i den vanliga dagslistan.)
const favChipBg = {
  dark: tint(T.dark.gold, 10, T.dark.surface),
  light: tint(T.light.gold, 10, T.light.surface),
};

// 1) FAVORIT-CHIPPETS text ("Favorit"): full fg på den guld-tintade pill-fonden.
add('Favorit-chip text (fg) på guld-10%-tint', tok('fg'), favChipBg, 4.5);

// 2) FAVORIT-CHIPPETS stjärna (★): den AA-säkra guld-TEXT-tonen (--color-warning), ALDRIG rå
//    --vm-gold (faller under AA som text på ljus yta, lessons). Mätt över samma tint.
add('Favorit-chip stjärna (warning guld-text) på guld-10%-tint', tok('warning'), favChipBg, 4.5);

// STATISTIK-PANELENS fond = surface med en guld-hörn-glow vid 7% alfa (kvällsljus-värmen,
// något lägre än summeringens 8% så panelen är LUGNARE/mer underordnad). All text på panel-
// nivå (rubrik, etiketter) står på denna nästan-opaka yta i värsta fallet (glow-toppen).
const panelGlowBg = {
  dark: tint(T.dark.gold, 7, T.dark.surface),
  light: tint(T.light.gold, 7, T.light.surface),
};

// 3) PANELENS eyebrow ("Din statistik"): guld-TEXT-tonen (--color-warning) på glow-fonden.
add('Panel-eyebrow (warning guld-text) på guld-7%-glow', tok('warning'), panelGlowBg, 4.5);

// 4) PANELENS rubrik ("Hur du tippar") + tomt-läges-text: fg på glow-fonden.
add('Panel-rubrik (fg) på guld-7%-glow', tok('fg'), panelGlowBg, 4.5);

// HERO-STAT-BRICKAN (träffsäkerhet) = surface-raised med en låg guld-tint (8% alfa), så den
// EN nyckeltal-brickan känns varmast (det viktigaste talet) utan en solid guld-yta som skulle
// tävla med summeringens total ovanför. Talet + etiketten står på denna tint.
const heroStatBg = {
  dark: tint(T.dark.gold, 8, T.dark.surfaceRaised),
  light: tint(T.light.gold, 8, T.light.surfaceRaised),
};

// 5) HERO-STAT-TALET (träffsäkerhet "75 %"): full fg på den guld-tintade surface-raised-brickan.
add('Hero-stat-tal (fg) på guld-8%-tint (surface-raised)', tok('fg'), heroStatBg, 4.5);

// 6) HERO-STAT-ETIKETTEN ("Träffsäkerhet"): guld-TEXT-tonen (--color-warning) på samma tint
//    (den varma etiketten som signalerar "detta är nyckeltalet"). VÄRSTA dämpade fallet.
add('Hero-stat-etikett (warning guld-text) på guld-8%-tint', tok('warning'), heroStatBg, 4.5);

// ÖVRIGA STAT-BRICKOR (exakta/utfall/avgjorda) = neutral surface-raised (opak), ingen tint.
// Tal = fg, etikett = fg-muted. Mätt mot opak surface-raised (känd AA-yta, ingen ny tint).
add('Stat-tal (fg) på opak surface-raised', tok('fg'), tok('surfaceRaised'), 4.5);
add('Stat-etikett (fg-muted) på opak surface-raised', tok('fgMuted'), tok('surfaceRaised'), 4.5);

// BÄSTA CALL-KORTET = surface-raised med en låg guld-hörn-glow (6% alfa), "det stolta ögonblicket".
// Rubrik (matchup) = fg, kontext-raden (poäng-typ + poäng) = fg-muted, på glow-fonden.
const bestCallBg = {
  dark: tint(T.dark.gold, 6, T.dark.surfaceRaised),
  light: tint(T.light.gold, 6, T.light.surfaceRaised),
};
add('Bästa call rubrik (fg) på guld-6%-glow (surface-raised)', tok('fg'), bestCallBg, 4.5);
add('Bästa call kontext (fg-muted) på guld-6%-glow', tok('fgMuted'), bestCallBg, 4.5);

// JOKER-MARKÖREN på bästa call: återbrukar den SOLIDA guld-bricka-formen (--vm-coupon-ink på
// SOLID --vm-gold), den REDAN mätta färg-oberoende formen (DRY mot .vm-coupon-mine). Vi tar
// med den här bara för att bekräfta paret, ingen NY kombination.
add('Joker-markör (coupon-ink på SOLID guld, återbruk)', tok('couponInk'), tok('gold'), 4.5);

// --- Rapport ------------------------------------------------------------------
let minDark = Infinity;
let minLight = Infinity;
let fails = 0;
console.log('\nT23 favoritlag-chip + statistik-panel-kontrast (canvas-komposit, VÄRSTA fall)\n');
console.log(
  'Yta'.padEnd(56),
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
    c.label.padEnd(56),
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
process.exit(0);
