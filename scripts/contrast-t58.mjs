// Kontrast-mätning för T58-summeringspanelen (poäng-summeringen överst i tips-vyn),
// canvas-komposit VÄRSTA fall. Engångs-verktyg (körs av designen vid handoff,
// inte i CI): beräknar WCAG-kontrastförhållanden med KORREKT alfa-komposit (en token
// vid given alfa blandad över sin BASYTA), så glow-på-text-fällan fångas i siffran,
// inte gissas. Samma metod som T15/T16/T16b/T17/T38-visuellt (decisions.md). Token-
// värdena nedan är KLISTRADE ur tokens.css (en manuell spegel; om en token ändras
// måste den uppdateras här innan ny mätning).
//
// PANEL-KONTEXT (varför mätningen behövs): .vm-tips-score-summary är en "stolt hero-
// panel" på surface med en SVAG guld-hörn-glow i fonden (kvällsljus-värmen). All
// läsbar text (eyebrow, "Dina poäng", placeringen, käll-rad-etiketterna + poängen)
// står på den nästan-opaka panel-ytan; den enda tinten i text-vägen är guld-glow:en
// vid LÅG alfa. Vi mäter VÄRSTA fallet: dämpad text (fg-muted) rakt på den guld-
// tintade fonden (glow-toppen), så vi vet att även käll-radernas etiketter håller AA
// som normal text. Total-talet är en SOLID guld-bricka med mörk ink (färg-oberoende
// solid-bricka-form, samma som .vm-coupon-mine/.vm-reveal-actual), mätt mot opak guld.
//
// Kör: node scripts/contrast-t58.mjs

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
    gold: '#f3c14e',
    warning: '#f3c14e', // guld-TEXT (AA-säker tonen)
    couponInk: '#1c1403', // mörk ink PÅ solid guld
    accent: '#1fe082',
  },
  light: {
    bg: '#f1f5f0',
    surface: '#ffffff',
    surfaceRaised: '#ffffff',
    border: '#cdd8ce',
    fg: '#0c1a13',
    fgMuted: '#4f6258',
    gold: '#b07d10',
    warning: '#8a5a05', // guld-TEXT (AA-säker tonen)
    couponInk: '#1c1403', // mörk ink PÅ solid guld
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

const tok = (name) => ({ dark: hexToRgb(T.dark[name]), light: hexToRgb(T.light[name]) });

// PANEL-FONDEN = surface med en guld-hörn-glow vid 8% alfa (den valda glow-styrkan i
// .vm-tips-score-summary). Detta är den TINTADE basytan som text i text-vägen står på
// i värsta fallet (rakt på glow-toppen). All faktisk text ligger ändå på den nästan-
// opaka panel-ytan; 8% är glow-PEAKEN, en konservativ värsta-fall-basyta.
const panelGlowBg = {
  dark: tint(T.dark.gold, 8, T.dark.surface),
  light: tint(T.light.gold, 8, T.light.surface),
};

// 1) "Dina poäng" + placeringen ("Plats N av M"): full --vm-fg på den guld-tintade fonden.
add('Rubrik "Dina poäng" / placering (fg) på guld-8%-glow', tok('fg'), panelGlowBg, 4.5);

// 2) EYEBROW ("Din ställning"): guld-TEXT-tonen (--color-warning, AA-säker per tema, ALDRIG
//    rå --vm-gold) på den guld-tintade fonden. Den kända guld-på-ljus-fällan undviks genom
//    warning-tonen (mörk amber i ljust tema), mätt här över glow:en.
add('Eyebrow (warning guld-text) på guld-8%-glow', tok('warning'), panelGlowBg, 4.5);

// 3) KÄLL-RADENS ETIKETT (Matchtips/Grupptippning/...): dämpad text (fg-muted) på den
//    guld-tintade fonden. VÄRSTA text-fallet (dämpad ton + tintad bas). Måste >= 4.5 som
//    normal text, annars faller käll-detaljen under AA.
add('Käll-rad-etikett (fg-muted) på guld-8%-glow', tok('fgMuted'), panelGlowBg, 4.5);

// 4) KÄLL-RADENS POÄNG-TAL ("3 p"): full fg (tabular-nums, font-semibold) på glow-fonden.
add('Käll-rad-poäng (fg) på guld-8%-glow', tok('fg'), panelGlowBg, 4.5);

// 5) TOTAL-BRICKAN ("29 p"): SOLID guld-yta med mörk ink (--vm-coupon-ink på --vm-gold),
//    den färg-oberoende solid-bricka-formen (samma som kupongens/facitets tal). AA-mätt.
add('Total-bricka (coupon-ink på SOLID guld)', tok('couponInk'), tok('gold'), 4.5);

// 6) DIVIDER-LINJEN över käll-detaljen (dekor, bär ingen text): guld vid 22% mot panel-
//    fonden, mätt som icke-text-kontrast (>=3 ej krav för ren dekor, vi loggar synlighet).
const dividerBg = {
  dark: tint(T.dark.gold, 22, T.dark.surface),
  light: tint(T.light.gold, 22, T.light.surface),
};
add('Käll-divider 22% (UI-dekor) mot surface', dividerBg, tok('surface'), 1.0);

// --- Rapport ------------------------------------------------------------------
let minDark = Infinity;
let minLight = Infinity;
let fails = 0;
console.log('\nT58 summeringspanel-kontrast (canvas-komposit, VÄRSTA fall, BÅDA teman)\n');
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
  if (c.threshold >= 4.5) {
    minDark = Math.min(minDark, c.dark);
    minLight = Math.min(minLight, c.light);
  }
  console.log(
    c.label.padEnd(52),
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
process.exit(0);
