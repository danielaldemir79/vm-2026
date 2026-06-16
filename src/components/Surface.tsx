// Surface, appens ENA kort-/panel-primitiv (D3/D4, #175).
//
// VARFÖR (DRY-design, north-star §3): kort-idiomet
// `rounded-card border border-border bg-surface shadow-[var(--vm-shadow-card)]`
// var handkopierat på ~25 ställen. Spridda kopior driftar isär (en får p-5, en
// p-6, en glömmer skuggan) och det är just den inkonsekvensen som läser som
// "amatör" snarare än "proffsig". EN primitiv = EN sanning för vad ett kort ÄR,
// så hela appen får samma radie, kant, fond, skugga och inre luft. Ändra kort-
// känslan på ETT ställe och hela appen följer med.
//
// VARIANTER (avsiktligt FÅ, north-star §3 "EN kort-stil"):
//   - tone: 'surface' (default, det vanliga kortet) | 'raised' (en upphöjd yta
//     för sekundära paneler inuti ett kort) | 'plain' (ingen fond/kant, bara
//     radie + padding, för ytor som bär sin egen dekor, t.ex. hero-kort).
//   - padding: 'comfortable' (default, app-sektioner) | 'compact' (tätare,
//     list-rader/små paneler) | 'none' (full kontroll till anroparen).
//   - as: vilket element (section/div/article/li...). Default 'section'.
// Fler varianter ska INTE läggas till lättvindigt: poängen är konsekvens.
//
// Skuggan går ALLTID via --vm-shadow-* (aldrig Tailwinds default shadow-md/sm/lg,
// som är den generiska AI-tell:en D4 pekar ut). interaktiv=true lägger en mjuk
// hover-elevation (token-driven), för kort som är klickbara.

import type { ElementType, ReactNode } from 'react';

type SurfaceTone = 'surface' | 'raised' | 'plain';
type SurfacePadding = 'comfortable' | 'compact' | 'none';

export interface SurfaceProps {
  children: ReactNode;
  /** Yt-tonen. Default 'surface' (det vanliga kortet). */
  tone?: SurfaceTone;
  /** Inre luft. Default 'comfortable'. */
  padding?: SurfacePadding;
  /** Lägg en mjuk hover-elevation (för klickbara kort). Default false. */
  interactive?: boolean;
  /** Renderat element. Default 'section'. */
  as?: ElementType;
  /** Extra klasser (komponeras EFTER bas-klasserna, så anroparen kan finjustera). */
  className?: string;
  /** Övriga DOM-attribut (data-*, aria-*, style, onClick ...). */
  [key: string]: unknown;
}

const TONE_CLASS: Record<SurfaceTone, string> = {
  // Det vanliga kortet: surface-fond, kant, kort-skugga (token).
  surface: 'border border-border bg-surface shadow-[var(--vm-shadow-card)]',
  // En upphöjd yta (panel-i-panel): surface-raised, samma kant + skugga.
  raised: 'border border-border bg-surface-raised shadow-[var(--vm-shadow-card)]',
  // Ingen egen fond/kant (ytan bär sin egen dekor, t.ex. en hero-gradient).
  plain: '',
};

const PADDING_CLASS: Record<SurfacePadding, string> = {
  comfortable: 'p-5 sm:p-7',
  compact: 'p-4',
  none: '',
};

export function Surface({
  children,
  tone = 'surface',
  padding = 'comfortable',
  interactive = false,
  as,
  className = '',
  ...rest
}: SurfaceProps) {
  const Tag = (as ?? 'section') as ElementType;
  const interactiveClass = interactive
    ? 'transition-shadow duration-200 hover:shadow-[var(--vm-shadow-raised)]'
    : '';
  const classes = [
    'rounded-card',
    TONE_CLASS[tone],
    PADDING_CLASS[padding],
    interactiveClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
