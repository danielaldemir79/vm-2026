// Version-stämpeln SOM APPEN LÄSER: de bygg-injicerade konstanterna (__APP_SHA__,
// __APP_BUILT_AT__) exponeras härifrån med säkra fallbacks, så app-koden aldrig
// rör de globala __-namnen direkt och tester/dev (där define inte körts) inte
// kraschar.
//
// VARFÖR Vite `define` och inte import.meta.env: SHA + byggtid är BYGG-tids-
// konstanter (kända först vid bygget, via build-info.ts), inte miljö-variabler
// användaren sätter. define gör dem till literal-substitution i bundeln , noll
// runtime-kostnad, och de syns i bundeln för "är det live?"-verifiering. Källa:
// Vite "define" + vite-plugin-pwa-bygget. Se docs/decisions.md (T43).

// Globalerna __APP_SHA__/__APP_BUILT_AT__ deklareras i vite-env.d.ts (EN sanning).
// I bygget ersätter Vite dem med string-literaler (define); i test/dev (ingen
// define) är de odefinierade vid RUNTIME, därför läses de defensivt (typeof) nedan,
// trots att typen säger string, annars ger en referens ett ReferenceError.

/** Visas när bygg-stämpeln saknas (test/dev utan define). */
export const UNKNOWN_VERSION = 'dev';

/**
 * Normalisera ett define-injicerat värde: en icke-tom sträng är giltig, allt
 * annat (undefined eller tom sträng) är frånvaro -> null. Exporterad så den rena
 * fallback-regeln kan testas direkt (define ersätter globalerna även i Vitest, så
 * frånvaro-grenen nås annars aldrig från app-koden).
 */
export function readInjected(value: string | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Kort commit-SHA för det körande bygget, eller "dev" utanför ett bygge. */
export function appCommitSha(): string {
  return (
    readInjected(typeof __APP_SHA__ === 'undefined' ? undefined : __APP_SHA__) ?? UNKNOWN_VERSION
  );
}

/** Byggtid (ISO-sträng) för det körande bygget, eller null utanför ett bygge. */
export function appBuiltAt(): string | null {
  return readInjected(typeof __APP_BUILT_AT__ === 'undefined' ? undefined : __APP_BUILT_AT__);
}

/**
 * Kort, människovänlig byggtid (YYYY-MM-DD HH:mm UTC) för version-raden.
 * Returnerar null om byggtiden saknas eller inte går att tolka (fail-soft: då
 * visar version-raden bara SHA:n, ingen påhittad tid).
 */
export function formatBuiltAt(iso: string | null = appBuiltAt()): string | null {
  if (iso === null) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  // UTC medvetet: byggtiden stämplas i UTC (build-info.ts toISOString), och en
  // versions-rad ska vara entydig oavsett var den läses, inte tidszons-beroende.
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getUTCFullYear();
  const mo = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  return `${y}-${mo}-${d} ${h}:${mi} UTC`;
}
