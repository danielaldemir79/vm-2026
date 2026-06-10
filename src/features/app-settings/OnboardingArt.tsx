// Onboarding-stegens DEKORATIVA illustrationer (T13 visuellt lager).
//
// Fyra stiliserade CSS/SVG-scener, en per tur-steg, som ger touren ett "wow"-
// första intryck utan en enda tung bild-asset (allt är inline SVG + token-färger,
// noll extra nätladdning, snäll mot LCP). Varje scen lever i hero-strippen ÖVANFÖR
// textblocket, så den aldrig konkurrerar med läsbarheten: illustrationen är
// markerad aria-hidden (skärmläsaren får stegets rubrik + text, inte konst-
// detaljerna), och all rörelse bärs av .vm-* CSS-klasser som reduced-motion-
// grinden i index.css redan nollar (WCAG 2.3.3).
//
// Färgerna kommer ur tema-tokens (accent/guld/sim/fg) så scenerna följer båda
// teman automatiskt. Formerna är medvetet enkla och "sportiga" (plan, mål,
// resultattavla, telefon) så en vän direkt förstår vad steget handlar om.

import type { OnboardingArt as OnboardingArtKind } from './onboarding';

/** Gemensam viewBox-yta för alla scener, så de byter plats utan att hoppa. */
const ART_VIEWBOX = '0 0 200 96';

/**
 * Steg 1, "Allt lever": en stiliserad planhalva med mittlinje + mittcirkel och
 * en pulsande boll, så scenen bokstavligen KÄNNS levande (pulsen stannar vid
 * reducerad rörelse via .vm-live-dot). Plan-linjerna i accent-grön, lugnt.
 */
function LiveArt() {
  return (
    <svg viewBox={ART_VIEWBOX} className="h-full w-full" role="presentation">
      {/* Planlinjer: yttre ram + mittlinje + mittcirkel, tunna, dämpade. */}
      <g
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeOpacity="0.55"
        strokeLinejoin="round"
      >
        <rect x="20" y="18" width="160" height="60" rx="4" />
        <line x1="100" y1="18" x2="100" y2="78" />
        <circle cx="100" cy="48" r="13" />
        {/* Straffområden vänster + höger. */}
        <rect x="20" y="33" width="16" height="30" />
        <rect x="164" y="33" width="16" height="30" />
      </g>
      {/* Den levande bollen: pulsar lugnt (vm-live-dot), i mittcirkeln. */}
      <circle cx="100" cy="48" r="5" fill="var(--color-accent)" className="vm-live-dot" />
    </svg>
  );
}

/**
 * Steg 2, "Mata in resultat": en resultattavla, två lag-rutor och en mål-siffra
 * mellan dem ("2 - 1"), så det direkt läser som ett inmatat resultat. Den vinnande
 * siffran tonas i accent, så ögat dras dit.
 */
function ResultsArt() {
  return (
    <svg viewBox={ART_VIEWBOX} className="h-full w-full" role="presentation">
      {/* Tavlans ram. */}
      <rect
        x="28"
        y="26"
        width="144"
        height="44"
        rx="8"
        fill="color-mix(in srgb, var(--color-fg) 6%, transparent)"
        stroke="var(--color-border)"
        strokeWidth="1.5"
      />
      {/* Två lag-emblem (förenklade discar). */}
      <circle cx="52" cy="48" r="9" fill="var(--color-accent)" fillOpacity="0.9" />
      <circle cx="148" cy="48" r="9" fill="var(--vm-gold)" fillOpacity="0.9" />
      {/* Resultatsiffrorna. tabular-känsla via fast monospace-aktig grotesk. */}
      <text
        x="100"
        y="55"
        textAnchor="middle"
        fontSize="22"
        fontWeight="700"
        fontFamily="var(--font-display)"
        fill="var(--color-fg)"
      >
        <tspan fill="var(--color-accent)">2</tspan>
        <tspan dx="2" dy="-1" fontSize="14" fill="var(--color-fg-muted)">
          –
        </tspan>
        <tspan dx="2" dy="1">
          1
        </tspan>
      </text>
    </svg>
  );
}

/**
 * Steg 3, "Lek med vad-händer-om": en förgrening, en väg som delar sig i två
 * tänkta utfall, i sim-läges-tonen (violett, samma "labbet/hypotetiskt"-signal
 * som what-if-ramen) så scenen knyts visuellt till själva sim-läget.
 */
function WhatIfArt() {
  return (
    <svg viewBox={ART_VIEWBOX} className="h-full w-full" role="presentation">
      <g fill="none" stroke="var(--vm-sim)" strokeWidth="2" strokeLinecap="round">
        {/* Stammen in från vänster. */}
        <path d="M30 48 H86" strokeOpacity="0.85" />
        {/* Förgrening upp + ner (två hypotetiska utfall). */}
        <path d="M86 48 C110 48 110 28 134 28" strokeOpacity="0.85" />
        <path d="M86 48 C110 48 110 68 134 68" strokeOpacity="0.45" strokeDasharray="3 4" />
      </g>
      {/* Noden där vägen delar sig. */}
      <circle cx="86" cy="48" r="4.5" fill="var(--vm-sim)" />
      {/* Två utfalls-rutor (det ena fyllt = valt scenario, det andra streckat). */}
      <rect x="134" y="20" width="36" height="16" rx="4" fill="var(--vm-sim)" fillOpacity="0.85" />
      <rect
        x="134"
        y="60"
        width="36"
        height="16"
        rx="4"
        fill="none"
        stroke="var(--vm-sim)"
        strokeWidth="1.5"
        strokeDasharray="3 4"
        strokeOpacity="0.6"
      />
    </svg>
  );
}

/**
 * Steg 4, "Installera på hemskärmen": en telefon med en app-ikon-ruta (VM-grön
 * pokal-prick) på en hemskärm, plus en liten "lägg till"-plustecken, så det läser
 * som "den här appen bor på din hemskärm".
 */
function InstallArt() {
  return (
    <svg viewBox={ART_VIEWBOX} className="h-full w-full" role="presentation">
      {/* Telefon-ram. */}
      <rect
        x="78"
        y="14"
        width="44"
        height="68"
        rx="8"
        fill="var(--color-surface)"
        stroke="var(--color-border)"
        strokeWidth="1.5"
      />
      {/* App-ikon (markerad, VM-grön) + tre vilo-ikoner runtom = hemskärm. */}
      <rect x="86" y="26" width="12" height="12" rx="3" fill="var(--color-accent)" />
      <rect
        x="102"
        y="26"
        width="12"
        height="12"
        rx="3"
        fill="color-mix(in srgb, var(--color-fg) 14%, transparent)"
      />
      <rect
        x="86"
        y="42"
        width="12"
        height="12"
        rx="3"
        fill="color-mix(in srgb, var(--color-fg) 14%, transparent)"
      />
      <rect
        x="102"
        y="42"
        width="12"
        height="12"
        rx="3"
        fill="color-mix(in srgb, var(--color-fg) 14%, transparent)"
      />
      {/* "Lägg till"-bricka: en guld-cirkel med plustecken, lyfter ur telefonen. */}
      <circle
        cx="122"
        cy="22"
        r="9"
        fill="var(--vm-gold)"
        stroke="var(--color-surface)"
        strokeWidth="2"
      />
      <g stroke="var(--vm-accent-fg)" strokeWidth="2" strokeLinecap="round">
        <line x1="122" y1="18" x2="122" y2="26" />
        <line x1="118" y1="22" x2="126" y2="22" />
      </g>
    </svg>
  );
}

/**
 * Väljer rätt scen för stegets art-typ. Uttömmande switch (ingen default-gren),
 * så en ny art-variant i unionen blir ett TYPFEL här i stället för en tyst blank
 * yta (fail loud, PRINCIPLES §8).
 */
function ArtFor({ art }: { art: OnboardingArtKind }) {
  switch (art) {
    case 'live':
      return <LiveArt />;
    case 'results':
      return <ResultsArt />;
    case 'whatif':
      return <WhatIfArt />;
    case 'install':
      return <InstallArt />;
  }
}

/**
 * Hero-strippens dekorativa scen för ett onboarding-steg. HELA strippen är
 * aria-hidden (ren stämning, ingen läsbar information bor här, den bärs av stegets
 * rubrik + text på den opaka surface-ytan nedanför). "Arena i kvällsljus"-glow:en
 * + ljus-svepet bor i CSS (.vm-onboarding-hero, tokens.css §9).
 */
export function OnboardingArt({ art }: { art: OnboardingArtKind }) {
  return (
    <div
      aria-hidden="true"
      data-onboarding-art={art}
      className="vm-onboarding-hero relative isolate flex h-28 items-center justify-center overflow-hidden rounded-lg sm:h-32"
    >
      {/* Långsamt arena-ljus-svep (samma vm-hero-sheen som dagliga hero:n, stannar
          vid reducerad rörelse). Ren dekor, inget innehåll. */}
      <div className="vm-hero-sheen vm-onboarding-hero-sheen pointer-events-none absolute inset-0 -z-10 opacity-70" />
      {/* Själva scenen, begränsad i bredd så den andas i strippen. */}
      <div className="w-3/4 max-w-[15rem]">
        <ArtFor art={art} />
      </div>
    </div>
  );
}
