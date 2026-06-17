// Kontrast-mätning för T45 arrangörens kontrollpanel (admin-statistik-vyn),
// canvas-komposit VÄRSTA fall. Engångs-verktyg (körs av designen vid handoff,
// inte i CI): beräknar WCAG-kontrastförhållanden med KORREKT alfa-komposit (en token
// vid given alfa blandad över sin BASYTA), så glow-på-text-fällan fångas i siffran,
// inte gissas. Samma metod som T15/T16/T17/T54/T58-visuellt (decisions.md). Token-
// värdena nedan är KLISTRADE ur tokens.css (en manuell spegel; om en token ändras
// måste den uppdateras här innan ny mätning).
//
// PANEL-KONTEXT (varför mätningen behövs): admin-vyn har tre nya text-bärande ytor
// med en SVAG token-tint i fonden (kvällsljus-värmen, samma familj som resten av
// appen). Vi mäter VÄRSTA fallet: dämpad text (fg-muted) rakt på den tintade fonden
// (glow-toppen), så vi vet att även de lugnaste etiketterna håller AA som normal text.
//   1) STAT-KORTEN (Rum totalt / Tippare totalt): surface med en grön arena-glow i
//      fonden; etikett (fg-muted) + tal (SOLID guld-bricka med mörk ink) på den.
//   2) GLOBAL TOPPLISTA: ledar-raden (rank 1) ärver topplistans guld-7%-glow-recept
//      (.vm-board-row[data-leader], redan AA-mätt i T17), medaljerna är solid-bricka-
//      formen (T16/T17). Vi mäter ledar-radens text + medalj-ink här igen för admin-
//      ytans egna bas (samma tokens, samma recept).
//   3) RUM-KORTEN: surface med en hårfin guld-hörn-glow; rum-namn (fg), kod-chip +
//      engagemangs-pillar (fg-muted-text på en svag surface-raised/guld-tint), mini-
//      topplistans rader (fg/fg-muted på surface).
//
// Kör: node scripts/contrast-t45.mjs

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
    silver: '#c5cdd6',
    silverInk: '#15191e', // mörk ink PÅ solid silver
    bronze: '#cd8a52',
    bronzeInk: '#1a0f06', // mörk ink PÅ solid brons
    accent: '#1fe082',
    accentFg: '#04140b',
    glowAccentR: 31,
    glowAccentG: 224,
    glowAccentB: 130,
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
    silver: '#aab4bf',
    silverInk: '#15191e', // mörk ink PÅ solid silver
    bronze: '#b07444',
    bronzeInk: '#1a0f06', // mörk ink PÅ solid brons
    accent: '#0e7a44',
    accentFg: '#ffffff',
    glowAccentR: 14,
    glowAccentG: 122,
    glowAccentB: 68,
  },
};

/** mix(token alpha%, base) -> opak komposit-färg (color-mix mot transparent över base). */
function tint(tokenHex, alphaPct, baseHex) {
  return composite(hexToRgb(tokenHex), alphaPct / 100, hexToRgb(baseHex));
}

/** rgb(glow-accent / alpha) över base -> opak komposit (grön glow-tinten). */
function glowAccent(theme, alphaPct, baseHex) {
  const t = T[theme];
  return composite(
    [t.glowAccentR, t.glowAccentG, t.glowAccentB],
    alphaPct / 100,
    hexToRgb(baseHex)
  );
}

const cases = [];
function add(label, fgRgb, bgRgb, threshold) {
  const dark = contrast(fgRgb.dark, bgRgb.dark);
  const light = contrast(fgRgb.light, bgRgb.light);
  cases.push({ label, dark, light, threshold });
}

const tok = (name) => ({ dark: hexToRgb(T.dark[name]), light: hexToRgb(T.light[name]) });

// 1) STAT-KORTEN: surface med grön arena-glow i fonden (0.10 alfa, PEAK = värsta fall).
//    Etikett (fg-muted) + ev. fg-text rakt på glow-toppen.
const statGlowBg = {
  dark: glowAccent('dark', 10, T.dark.surface),
  light: glowAccent('light', 10, T.light.surface),
};
add('Stat-kort etikett (fg-muted) på grön-10%-glow', tok('fgMuted'), statGlowBg, 4.5);
add('Stat-kort tal-bricka (coupon-ink på SOLID guld)', tok('couponInk'), tok('gold'), 4.5);

// 2) GLOBAL TOPPLISTA, LEDAR-RADEN: ärver T17:s guld-7%-glow (.vm-board-row[data-leader]).
//    Text (namn/rum/poäng) rakt på guld-glow-toppen, samma recept som topplistan.
const leaderGlowBg = {
  dark: tint(T.dark.gold, 7, T.dark.surface),
  light: tint(T.light.gold, 7, T.light.surface),
};
add('Ledar-rad namn/rum (fg) på guld-7%-glow', tok('fg'), leaderGlowBg, 4.5);
add('Ledar-rad rum-etikett (fg-muted) på guld-7%-glow', tok('fgMuted'), leaderGlowBg, 4.5);
add('Ledar-rad poäng (warning guld-text) på guld-7%-glow', tok('warning'), leaderGlowBg, 4.5);

// 3) MEDALJ-SIFFRORNA (solid-bricka-form, ink på opak medalj-yta), DRY mot T16/T17.
add('Guld-medalj-siffra (coupon-ink på SOLID guld)', tok('couponInk'), tok('gold'), 4.5);
add('Silver-medalj-siffra (silver-ink på SOLID silver)', tok('silverInk'), tok('silver'), 4.5);
add('Brons-medalj-siffra (bronze-ink på SOLID brons)', tok('bronzeInk'), tok('bronze'), 4.5);

// 4) RUM-KORTET: surface med en hårfin guld-hörn-glow (0.06 alfa, samma som .vm-reveal-card).
const roomGlowBg = {
  dark: tint(T.dark.gold, 6, T.dark.surface),
  light: tint(T.light.gold, 6, T.light.surface),
};
add('Rum-namn (fg) på guld-6%-glow', tok('fg'), roomGlowBg, 4.5);
add('Rum-engagemang (fg-muted) på guld-6%-glow', tok('fgMuted'), roomGlowBg, 4.5);

// 5) KOD-CHIPPET + ENGAGEMANGS-PILLARNA: fg-muted-text på en svag surface-raised-yta
//    (chip-fonden). Mätt mot surface-raised direkt (opak yta, ingen tint i text-vägen).
add(
  'Kod-chip / engagemangs-pill (fg-muted) på surface-raised',
  tok('fgMuted'),
  tok('surfaceRaised'),
  4.5
);
add('Kod-chip kod-text (fg) på surface-raised', tok('fg'), tok('surfaceRaised'), 4.5);

// 6) MINI-TOPPLISTANS RADER (rum-kortets egen lista): namn (fg) + poäng (fg-muted) på
//    surface (opak). Mätt mot surface direkt.
add('Mini-topplista namn (fg) på surface', tok('fg'), tok('surface'), 4.5);
add('Mini-topplista poäng (fg-muted) på surface', tok('fgMuted'), tok('surface'), 4.5);

// 7) NEUTRALA RANK-PILLEN (plats 4+, .vm-board-rank-formen): fg-text på surface-raised.
add('Neutral rank-pill (fg) på surface-raised', tok('fg'), tok('surfaceRaised'), 4.5);

// --- Rapport ------------------------------------------------------------------
let minDark = Infinity;
let minLight = Infinity;
let fails = 0;
console.log(
  '\nT45 arrangörens kontrollpanel-kontrast (canvas-komposit, VÄRSTA fall, BÅDA teman)\n'
);
console.log(
  'Yta'.padEnd(54),
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
    c.label.padEnd(54),
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
