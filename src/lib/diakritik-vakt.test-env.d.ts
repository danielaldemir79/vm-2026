// SMAL ambient-deklaration för diakritik-vakt-testets bygg-tids-Node-ytor.
//
// VARFÖR inte @types/node: hela paketet läcker Node-globaler (bl.a. NodeJS.Timeout)
// in i APP-grafen via vitest-typerna och bryter browser-typningen av
// window.setTimeout (number vs Timeout) på orelaterade ställen. Samma motiv och
// teknik som build-env.d.ts (för vite.config). Vi deklarerar därför BARA exakt de
// Node-ytor regressions-testet rör: process.cwd(), fs.readFileSync, child_process.
// execSync, path.join , samt vakt-modulens .mjs-export (TS hittar ingen .d.ts för
// en .mjs utan @types/node, så vi typar dess publika yta här).

declare const process: {
  cwd(): string;
};

declare module 'node:fs' {
  /** Läs en fil som UTF-8 -> string. */
  export function readFileSync(path: string, encoding: 'utf8'): string;
}

declare module 'node:child_process' {
  /** Kör ett kommando synkront, returnerar stdout (utf8 -> string). */
  export function execSync(command: string, options: { cwd: string; encoding: 'utf8' }): string;
}

declare module 'node:path' {
  /** Foga samman sökvägs-segment med plattformens separator. */
  export function join(...segments: string[]): string;
}

declare module '*/diakritik-vakt.mjs' {
  /** En träff: vilket ord och var (1-baserat radnummer). */
  export interface Traff {
    ord: string;
    rad: number;
  }
  /** Scanna en text efter ASCII-substitut ur denylistan. */
  export function scanText(text: string): Traff[];
  /** Ska en fil scannas (rätt filtyp + ej self-exemptad)? */
  export function skaScannas(sokvag: string): boolean;
  /** Inline-markören som undantar en rad (avsiktligt exempel). */
  export const EXEMPEL_MARKOR: string;
  /** Den kompilerade denylist-regexen (för introspektion). */
  export const DENYLIST_REGEX: RegExp;
}
