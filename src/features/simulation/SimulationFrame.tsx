// What-if-simulatorns APP-GLOBALA visuella ram (T12, issue #12).
//
// Ansvar (design-frontends visuella lager): göra så att HELA den simulerade
// zonen tydligt KÄNNS hypotetisk när what-if-läget är PÅ, så ingen förväxlar en
// simulering med de riktiga resultaten. Komponenten är en TUNN wrapper som läser
// sim-läget ur den delade storen och speglar det till `data-simulation-active`,
// som CSS-lagret (tokens.css §8) hänger ringen + tinten på. Den ritar dessutom
// en STICKY, FÄRG-OBEROENDE badge ("SIMULERINGSLÄGE" + kolv-ikon) som följer med
// vid bläddring, så markeringen aldrig hamnar utom synhåll.
//
// VARFÖR en wrapper (inte styling i banner:n): markeringen ska omsluta ALLA
// simulerade vyer (banner + tabell + träd + "Vad krävs" + inmatning), inte bara
// banner-kortet. Banner:n äger kontrollen (Starta/Återställ/Avsluta); denna ram
// äger den app-globala KÄNSLAN. Båda läser samma sim-seam i storen (en sanning).
//
// FÄRG-OBEROENDE (taskens punkt 1): den violetta tonen ENSAM räcker aldrig som
// markering (färgblind/färg-okänslig användare). Badge:ns text + ikon bär
// signalen visuellt; tonen och ringen förstärker den bara.
//
// EN live region (C4): badge:n är en VISUELL förstärkning, det informativa
// announcement-meddelandet ("Simulering pågår...") äger SimulationBanner med
// role="status". Hade badge:n OCKSÅ haft role="status" skulle två live regions
// dyka upp samtidigt när läget slås på = skärmläsaren läser dubbelt. Därför är
// badge:n aria-hidden: ögat ser den, skärmläsaren hör bannerns enda announcement.

import type { ReactNode } from 'react';
import { useResultsStore } from '../results/results-context';

/** En liten kolv-/laboratorie-ikon (rent dekorativ, aria-hidden). Förstärker
 *  "labbet/hypotetiskt"-läsningen vid sidan av texten, men texten bär betydelsen. */
function FlaskIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M9 3h6" />
      <path d="M10 3v6.5L5.2 17.3A2 2 0 0 0 6.9 20.4h10.2a2 2 0 0 0 1.7-3.1L14 9.5V3" />
      <path d="M7.5 14h9" />
    </svg>
  );
}

/**
 * App-global ram runt de simulerade vyerna. Renderar barnen oförändrat och, när
 * sim-läget är PÅ, lägger till ringen/tinten (via data-attributet) + en sticky
 * markeringsbadge överst i zonen.
 */
export function SimulationFrame({ children }: { children: ReactNode }) {
  const { simulating } = useResultsStore();

  return (
    // data-simulation-frame + data-simulation-active speglar storens sim-läge så
    // CSS-lagret (tokens.css §8) kan hänga ringen + tinten på zonen, och tester
    // har en stabil hake. p-3..p-5 ger ringen luft mot innehållet; rounded-card
    // matchar ringens radie i CSS.
    <div
      data-simulation-frame=""
      data-simulation-active={simulating ? 'true' : 'false'}
      className={
        simulating
          ? 'flex flex-col gap-6 rounded-card p-3 sm:gap-12 sm:p-5'
          : 'flex flex-col gap-6 sm:gap-12'
      }
    >
      {simulating && (
        // STICKY badge: pinnad nära toppen så den följer med vid bläddring i de
        // simulerade vyerna. VISUELL förstärkning, aria-hidden => INTE en live
        // region (bannern äger den enda announcement-statusen, se C4-noten ovan).
        // top-16 lämnar plats för app-headern (sticky, z-10); badge:n ligger
        // ovanför innehållet men under headern (z-[5]).
        <div
          className="pointer-events-none sticky top-16 z-[5] flex justify-center sm:top-20"
          aria-hidden="true"
        >
          <p className="vm-sim-badge pointer-events-auto inline-flex items-center gap-2 rounded-pill px-3.5 py-1.5 font-display text-xs font-bold uppercase tracking-[0.12em] sm:text-sm">
            <span
              className="vm-sim-dot inline-block h-2 w-2 shrink-0 rounded-pill"
              aria-hidden="true"
            />
            <FlaskIcon />
            Simuleringsläge
          </p>
        </div>
      )}

      {children}
    </div>
  );
}
