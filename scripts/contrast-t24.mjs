// Kontrast-mätning för T24-reaktionsraden (emoji-reaktioner på matchkorten),
// canvas-komposit VÄRSTA fall. Engångs-verktyg (körs av design-frontend vid handoff,
// inte i CI): beräknar WCAG-kontrastförhållanden med KORREKT alfa-komposit (en token
// vid given alfa blandad över sin BASYTA), så ton-på-text-fällan fångas i siffran,
// inte gissas. Samma metod som T15/T16/T17/T38/T58-visuellt (decisions.md). Token-
// värdena nedan är KLISTRADE ur tokens.css (en manuell spegel; om en token ändras
// måste den uppdateras här innan ny mätning).
//
// PANEL-KONTEXT (varför mätningen behövs): reaktions-raden bor på matchkortets surface-
// yta. Brickorna är pillar med en LÅG-alfa ton-tint i fonden (vilo-bricka: en hårfin
// guld-värme; MIN bricka: en accent-tint + accent-kant). EMOJIN i sig är färg-oberoende
// (en bild-glyf), men ANTALET (count) är TEXT, så det måste hålla AA mot sin tintade
// fond i BÅDA teman (lessons aa-kontrast: mät VARJE tema separat, attribuera rätt,
// mät VÄRSTA fallet, inte ett typfall). Vi mäter därför count-texten på varje brick-
// fond samt "Reagera"-etiketten på add-knappens fond.
//
// Kör: node scripts/contrast-t24.mjs

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
    accent: '#1fe082',
  },
  light: {
    surface: '#ffffff',
    border: '#cdd8ce',
    fg: '#0c1a13',
    fgMuted: '#4f6258',
    gold: '#b07d10',
    accent: '#0e7a44',
  },
};

/** mix(token alpha%, base) -> opak komposit-färg (color-mix mot en OPAK base över base). */
function mixOpaque(tokenHex, alphaPct, baseHex) {
  return composite(hexToRgb(tokenHex), alphaPct / 100, hexToRgb(baseHex));
}

const cases = [];
function add(label, fgRgb, bgRgb, threshold) {
  const dark = contrast(fgRgb.dark, bgRgb.dark);
  const light = contrast(fgRgb.light, bgRgb.light);
  cases.push({ label, dark, light, threshold });
}

const tok = (name) => ({ dark: hexToRgb(T.dark[name]), light: hexToRgb(T.light[name]) });

// VILO-BRICKANS fond: surface med en hårfin guld-värme (4% guld över surface), samma
// kvällsljus-detalj som .vm-comment-input. Count-texten (fg-muted) står på denna.
const restPillBg = {
  dark: mixOpaque(T.dark.gold, 4, T.dark.surface),
  light: mixOpaque(T.light.gold, 4, T.light.surface),
};

// MIN BRICKAS fond: surface med en accent-tint (10% accent över surface). Count-texten
// lyfts här till FULL fg (font-semibold) så "min" läses starkt; vi mäter ändå BÅDA
// (fg OCH fg-muted) på denna fond för marginal-koll.
const minePillBg = {
  dark: mixOpaque(T.dark.accent, 10, T.dark.surface),
  light: mixOpaque(T.light.accent, 10, T.light.surface),
};

// ADD-KNAPPENS fond: ren surface (den diskreta dashed-pillen ligger på matchkortet).
const addBg = { dark: tok('surface').dark, light: tok('surface').light };

// PICKERNS fond: surface-raised (den lugna popover-ytan). Mätt för option-fokus-text
// om någon (här bär options bara emoji, men vi loggar surface-raised för fullständighet).
const pickerBg = {
  dark: hexToRgb('#19302a'),
  light: hexToRgb('#ffffff'),
};

// 1) VILO-BRICKANS antal (fg-muted) på guld-4%-pill. VÄRSTA text-fallet på en vilo-bricka.
add('Vilo-brickans antal (fg-muted) på guld-4%-pill', tok('fgMuted'), restPillBg, 4.5);

// 2) MIN BRICKAS antal (fg, lyft) på accent-10%-pill. Den faktiska tonen för "min" count.
add('Min brickas antal (fg) på accent-10%-pill', tok('fg'), minePillBg, 4.5);

// 3) MIN BRICKAS antal OM den vore fg-muted (marginal-koll, vi använder fg i praktiken).
add('Min brickas antal OM fg-muted på accent-10%-pill', tok('fgMuted'), minePillBg, 4.5);

// 4) "Reagera"-etiketten (fg-muted) på add-knappens surface-fond (tom-läget).
add('"Reagera"-etikett (fg-muted) på add-knapp/surface', tok('fgMuted'), addBg, 4.5);

// 5) MIN BRICKAS accent-KANT (dekor, bär ingen text): accent mot surface (UI-komponent >=3).
add(
  'Min brickas accent-kant (UI-dekor) mot surface',
  tok('accent'),
  { dark: tok('surface').dark, light: tok('surface').light },
  3.0
);

// 6) PICKER-OPTIONENS emoji bär ingen text-kontrast (bild-glyf), men aria-pressed-tinten
//    (accent 18%) är ren dekor. Vi loggar att vald-option-tinten syns mot picker-fonden.
const optActiveBg = {
  dark: mixOpaque(T.dark.accent, 18, '#19302a'),
  light: mixOpaque(T.light.accent, 18, '#ffffff'),
};
add('Vald options accent-18%-tint (UI-dekor) mot picker-fond', optActiveBg, pickerBg, 1.0);

// --- Rapport ------------------------------------------------------------------
let minDark = Infinity;
let minLight = Infinity;
let fails = 0;
console.log('\nT24 reaktionsrad-kontrast (canvas-komposit, VÄRSTA fall, BÅDA teman)\n');
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
