// Lag-emblem (PRESENTATIONS-komponent, ren): en liten rund "flagg-disc" med
// lagets FIFA-landskod, för visuell igenkänning i matchkortet.
//
// DESIGN (design-frontend, T7): ett matchkort utan lag-identitet blir en rad
// text. Riktiga flaggbilder för 48 nationer vore ett nät-/asset-beroende som
// hotar LCP/CLS (en sanning: SPEC §7 + PRINCIPLES §12, Core Web Vitals), och
// emoji-flaggor renderas inte på Windows. I stället genererar vi en stabil,
// deterministisk tvåtons-disc ur landskoden: noll nätverk, ingen layout-
// förskjutning, men varje lag får ändå sin egen lilla färg-signatur som ögat
// känner igen mellan matcherna. När riktig flagg-data finns (lag-profil-tasken)
// kan denna disc bytas mot en flaggbild utan att röra matchkortet.
//
// A11y: discen är REN DEKORATION (aria-hidden). Lagnamnet står som riktig text
// bredvid och matchkortets aria-label bär hela sammanfattningen, så en
// skärmläsare hör lagen utan att discen läses upp som en kryptisk kod.

import type { CSSProperties } from 'react';
// Hue-härledningen (FNV-1a-hash ur landskoden -> hue-grader) bor i team-hue.ts,
// delad med dags-temat (T8) så ett lags signaturfärg är EN sanning, inte två
// kopior som kan glida isär (PRINCIPLES §4).
import { huesFor } from './team-hue';

export interface TeamFlagProps {
  /** FIFA:s trebokstavs-landskod, t.ex. "BRA". Driver färg + text. */
  code: string;
  /** Diameter via Tailwind-storleksklasser. Default = kort-storlek. */
  size?: 'sm' | 'md';
}

/**
 * Lag-emblemet: en rund disc med en deterministisk tvåtons-lutning + landskoden.
 * Färgerna är medvetet halv-mättade och dämpade (HSL med måttlig mättnad/ljushet)
 * så de aldrig krockar med turneringens grön/guld-accenter eller drar blicken
 * från innehållet. Koden står i vitt med en mjuk skugga så den läses på vilken
 * av de genererade tonerna som helst.
 */
export function TeamFlag({ code, size = 'sm' }: TeamFlagProps) {
  const { from, to } = huesFor(code);
  const dimension = size === 'md' ? 'h-9 w-9 text-[0.625rem]' : 'h-7 w-7 text-[0.5625rem]';
  const style: CSSProperties = {
    backgroundImage: `linear-gradient(135deg, hsl(${from} 52% 42%), hsl(${to} 48% 34%))`,
  };

  return (
    <span
      aria-hidden="true"
      data-team-flag=""
      className={`inline-flex shrink-0 items-center justify-center rounded-pill font-display font-bold uppercase tracking-tight text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18),0_1px_2px_rgb(0_0_0/0.25)] ${dimension}`}
      style={style}
    >
      {code}
    </span>
  );
}
