// Tema-toggle (UI). Motorn (useTheme + toggleTheme) levererades av senior-dev,
// medvetet utan knapp , den är designens (T2).
//
// A11y-design:
//  - En riktig <button> (tangentbord + skärmläsare gratis).
//  - aria-pressed speglar "ljust läge på/av" så hjälpmedel läser av tillståndet.
//  - aria-label är explicit och beskriver vad ett klick GÖR (byter TILL motsatt
//    tema), inte bara nuläget , tydligare för skärmläsar-användare.
//  - title ger samma text som tooltip för seende mus-användare.
//  - Fokus-ringen ärvs från :focus-visible i index.css (accent-token, WCAG 2.4.7).
//  - Ikonerna är aria-hidden, etiketten bär hela betydelsen.

import { useTheme } from '../theme';

/** Sol-ikon (ljust läge). Dekorativ, döljs för skärmläsare. */
function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

/** Mån-ikon (mörkt läge). Dekorativ, döljs för skärmläsare. */
function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';
  const nextLabel = isLight ? 'Byt till mörkt läge' : 'Byt till ljust läge';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isLight}
      aria-label={nextLabel}
      title={nextLabel}
      className="group relative inline-flex h-10 w-[4.25rem] items-center rounded-pill border border-border bg-surface-raised p-1 shadow-sm transition-colors duration-200 hover:border-accent/60"
    >
      {/* Glidande knopp: skjuts till höger i ljust läge. Transformen är ren
          dekoration; reduced-motion-användare får en omedelbar position via
          CSS-media-frågan i index.css (ingen JS-styrd rörelse här). */}
      <span
        aria-hidden="true"
        data-light={isLight}
        className="absolute left-1 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-fg shadow-md transition-transform duration-300 ease-out data-[light=true]:translate-x-[2.5rem]"
      >
        {isLight ? <SunIcon /> : <MoonIcon />}
      </span>
      {/* Bakgrunds-ikoner (det läge man byter TILL) tonas svagt fram bakom knoppen. */}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-between px-2.5 text-fg-muted">
        <MoonIcon />
        <SunIcon />
      </span>
    </button>
  );
}
