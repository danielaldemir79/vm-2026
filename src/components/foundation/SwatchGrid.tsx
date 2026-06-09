// Palett-demonstration för foundation-showcasen (T2).
// Visar de semantiska färg-rollerna live så Daniel KÄNNER paletten i båda
// teman på PR-förhandsvisningen. Varje swatch namnger sin token.

import { Spring } from '../../motion';

interface Swatch {
  /** Tailwind-bakgrunds-utility kopplad till en token. */
  bg: string;
  /** Läsbart namn på rollen. */
  label: string;
  /** Text-utility som ger AA-kontrast mot swatchen. */
  text: string;
}

// Roller i visuell ordning. Färgerna kommer ur tokens.css via Tailwind-utilities,
// så de följer aktivt tema automatiskt (en sanning).
const SWATCHES: readonly Swatch[] = [
  { bg: 'bg-accent', label: 'Accent', text: 'text-accent-fg' },
  { bg: 'bg-success', label: 'Success', text: 'text-bg' },
  { bg: 'bg-warning', label: 'Guld', text: 'text-bg' },
  { bg: 'bg-danger', label: 'Danger', text: 'text-bg' },
  { bg: 'bg-surface-raised', label: 'Yta', text: 'text-fg' },
  { bg: 'bg-bg', label: 'Fond', text: 'text-fg' },
];

export function SwatchGrid() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {SWATCHES.map((s, i) => (
        <li key={s.label}>
          <Spring transition={{ type: 'spring', stiffness: 320, damping: 24, delay: i * 0.04 }}>
            <div
              className={`flex h-20 flex-col justify-end rounded-lg border border-border p-3 ${s.bg} ${s.text}`}
            >
              <span className="text-sm font-medium">{s.label}</span>
            </div>
          </Spring>
        </li>
      ))}
    </ul>
  );
}
