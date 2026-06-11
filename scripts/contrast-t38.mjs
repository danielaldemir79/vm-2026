// Kontrast-mätning för T38-signaturen (footer-upphovsraden), canvas-komposit VÄRSTA fall.
//
// Engångs-verktyg (körs av design-frontend vid handoff, inte i CI): beräknar WCAG-
// kontrastförhållanden med KORREKT alfa-komposit (en token vid given alfa blandad
// över sin BASYTA), så "dämpad-text-med-opacitet"-fällan fångas i siffran, inte gissas.
// Samma metod som T15/T16/T16b/T17-visuellt (decisions.md). Token-värdena nedan är
// KLISTRADE ur tokens.css (en manuell spegel; om en token ändras måste den uppdateras
// här innan ny mätning).
//
// SIGNATUR-KONTEXT (varför mätningen behövs): footern står på sidans FOND (--vm-bg),
// inte på en surface-yta (footern är direkt i <main>, inte i en Panel). Den dämpade
// texten (--vm-fg-muted) klarar AA som normal text mot ytorna, men signaturen ska
// dämpas YTTERLIGARE för att vara diskret. Att lägga opacitet (t.ex. /80) PÅ fg-muted
// kan tippa den UNDER AA. Den här mätningen avgör hur mycket dämpning som håller AA
// mot FONDEN (värsta basytan, mörkare/ljusare än surface) och vilken accent-token
// monogrammet kan bära.
//
// Kör: node scripts/contrast-t38.mjs

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
    border: '#2c4034',
    fg: '#eef5f0',
    fgMuted: '#9cb2a6',
    gold: '#f3c14e',
    warning: '#f3c14e', // guld-TEXT
    accent: '#1fe082',
  },
  light: {
    bg: '#f1f5f0',
    surface: '#ffffff',
    border: '#cdd8ce',
    fg: '#0c1a13',
    fgMuted: '#4f6258',
    gold: '#b07d10',
    warning: '#8a5a05', // guld-TEXT
    accent: '#0e7a44',
  },
};

/** mix(token alpha%, base) -> opak komposit-färg (color-mix mot transparent över base). */
function tint(tokenHex, alphaPct, baseHex) {
  return composite(hexToRgb(tokenHex), alphaPct / 100, hexToRgb(baseHex));
}

const cases = [];
function add(label, fgRgb, bgRgb, threshold, control = false) {
  const dark = contrast(fgRgb.dark, bgRgb.dark);
  const light = contrast(fgRgb.light, bgRgb.light);
  cases.push({ label, dark, light, threshold, control });
}

const tok = (name) => ({ dark: hexToRgb(T.dark[name]), light: hexToRgb(T.light[name]) });

// FOTERNS BASYTA = sidans FOND (--vm-bg), footern står direkt i <main>, inte i en Panel.
const bgBase = tok('bg');

// 1) "Made by"-prefixet: ren --vm-fg-muted (INGEN opacitet) på fonden. Detta är den
//    dämpade men ändå AA-säkra delen av raden. Bevisar att fg-muted på FOND (inte bara
//    surface) håller AA som normal text i båda teman.
add('Prefix "Made by" (fg-muted, full opacitet) på fond', tok('fgMuted'), bgBase, 4.5);

// 2) NAMNET "Daniel Aldemir": full --vm-fg (varm nära-vit / djup grön-svart). Namnet är
//    radens stolthet och bärs av full förgrundsfärg, inte dämpad. Tydligt över AA.
add('Namn "Daniel Aldemir" (fg, full opacitet) på fond', tok('fg'), bgBase, 4.5);

// 3) MONOGRAM-SIGILLET "DA": near-ink-glyf på en SOLID accent-bricka (färg-oberoende
//    solid-bricka-form, samma recept som DU-brickan T17/primärknappen). accent-fg är
//    egen token (#04140b mörkt / #ffffff ljust). Glyfen står på opak accent, inte på tint.
const ACCENT_FG = { dark: hexToRgb('#04140b'), light: hexToRgb('#ffffff') };
add('Monogram "DA" (accent-fg på SOLID accent)', ACCENT_FG, tok('accent'), 4.5);

// 4) ALTERNATIV monogram-form (om solid-bricka känns för tung): accent-glyf på fonden.
//    Mäts som STOR text / UI-glyf (>=3:1) eftersom monogrammet är litet-men-fet dekor
//    BREDVID den läsbara texten, inte brödtext. Men vi vill helst >=4.5 ändå.
add('Monogram "DA" (accent-glyf på fond)', tok('accent'), bgBase, 3.0);

// 5) HÅRFIN ACCENT-SEPARATOR (dekor, bär ingen text): accent-linje vid LÅG alfa på fond.
//    Mäts bara som synlighet/UI mot fond (>=3:1 ej krav för ren dekor, men vi loggar).
const sepBg = {
  dark: tint(T.dark.accent, 45, T.dark.bg),
  light: tint(T.light.accent, 45, T.light.bg),
};
add('Accent-separator 45% (UI-dekor) mot fond', sepBg, bgBase, 1.0);

// --- KONTROLL: vad den GAMLA stylingen (fg-muted/80) gav, för att visa varför vi byter.
const muted80 = {
  dark: tint(T.dark.fgMuted, 80, T.dark.bg),
  light: tint(T.light.fgMuted, 80, T.light.bg),
};
add('[GAMMAL] fg-muted vid 80% opacitet på fond', muted80, bgBase, 4.5, true);

// --- Rapport ------------------------------------------------------------------
let minDark = Infinity;
let minLight = Infinity;
let gammalDark = null;
let gammalLight = null;
let fails = 0;
console.log('\nT38 signatur-kontrast (canvas-komposit, VÄRSTA fall = sidans FOND, BÅDA teman)\n');
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
  // MIN-beräkningen mäter de FAKTISKA signatur-ytorna. GAMMAL-raden är den gamla
  // a11y-buggen vi demonstrerar (fg-muted/80), inte en yta vi levererar, så den
  // EXKLUDERAS här och rapporteras separat nedan.
  if (c.control) {
    gammalDark = c.dark;
    gammalLight = c.light;
  } else if (c.threshold >= 4.5) {
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
  `\nMIN över normal-text-ytor (>=4.5, exkl. GAMMAL-kontrollen): mörkt ${minDark.toFixed(2)}:1 / ljust ${minLight.toFixed(2)}:1`
);
console.log(
  `GAMMAL-kontrollen (fg-muted/80, visar varför /80 byts): mörkt ${gammalDark.toFixed(2)}:1 / ljust ${gammalLight.toFixed(2)}:1`
);
console.log(
  fails === 0
    ? 'ALLA >= sin tröskel (inkl. den gamla, oväntat).\n'
    : `\n${fails} yta(or) UNDER tröskel (förväntat: den GAMLA fg-muted/80-raden).\n`
);
// Exit 0: detta är ett mät-verktyg, inte en grind. FAIL på GAMMAL-raden är poängen.
process.exit(0);
