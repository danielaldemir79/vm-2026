// What-if-simulatorns KONTROLL + MARKERING (T12, issue #12).
//
// Ansvar (senior-devs lager): den FUNKTIONELLA + tillgängliga strukturen för
// att (a) slå PÅ/AV what-if-läget, (b) tydligt MARKERA att appen är i simulering
// (så ingen tror att de riktiga resultaten ändras), och (c) ÅTERSTÄLLA allt
// hypotetiskt med en knapp. All state bor i den delade storen (ResultsProvider),
// denna komponent är en tunn kontroll ovanpå seamen, exakt som inmatnings-vyn.
//
// MARKERING: i sim-läge får komponenten role="status" + ett synligt "Simulering
// pågår"-meddelande, OCH den sätter ett data-attribut (data-simulation-active)
// som design-frontend hänger en premium-banner/badge på (banner uppe, dämpad
// bakgrundston etc.). Funktionellt fungerar markeringen utan styling.
//
// VARFÖR i en EGEN komponent (inte i någon vy): what-if-läget påverkar ALLA
// vyer (tabell, träd, "Vad krävs"), så kontrollen hör hemma som ett app-globalt
// band, inte i en enskild vy. Den läser/skriver bara storens sim-seam.

import { useResultsStore } from '../results/results-context';

export function SimulationBanner() {
  const { simulating, enterSimulation, exitSimulation, resetSimulation } = useResultsStore();

  return (
    // data-simulation-active speglar läget för design-frontends styling OCH för
    // tester (stabil hake). aria-live via role="status" på meddelandet nedan, så
    // en skärmläsare hör när läget slås på/av utan att flytta fokus.
    <section
      aria-labelledby="simulering-rubrik"
      data-simulation-banner=""
      data-simulation-active={simulating ? 'true' : 'false'}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="simulering-rubrik" className="font-display text-base font-bold sm:text-lg">
          Vad-händer-om
        </h2>
        {simulating ? (
          // MARKERINGEN: ett tydligt, uppläst statusmeddelande i sim-läge.
          // role="status" => artigt aria-live, läses upp när det dyker upp.
          <p role="status" data-simulation-status="" className="text-sm text-fg-muted">
            Simulering pågår. Du spelar ut hypotetiska resultat, de riktiga resultaten påverkas
            inte.
          </p>
        ) : (
          <p className="text-sm text-fg-muted">
            Lek med tänkta resultat och se tabellen och slutspelsträdet ändras, utan att röra de
            riktiga resultaten.
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {simulating ? (
          <>
            {/* ÅTERSTÄLL: töm overlayn men stanna i sim-läge (börja om från de
                riktiga resultaten utan att lämna sandlådan). */}
            <button
              type="button"
              data-simulation-reset=""
              onClick={resetSimulation}
              className="rounded-pill border border-border bg-surface px-4 py-2 font-display text-sm font-semibold text-fg outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--color-fg)_8%,var(--color-surface))] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
            >
              Återställ allt
            </button>
            {/* AVSLUTA: slå av sim-läget OCH töm overlayn (tillbaka till riktig data). */}
            <button
              type="button"
              data-simulation-exit=""
              onClick={exitSimulation}
              className="rounded-pill bg-accent px-4 py-2 font-display text-sm font-semibold text-accent-fg shadow-md outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--color-accent)_88%,black)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
            >
              Avsluta simulering
            </button>
          </>
        ) : (
          // STARTA: slå på what-if-läget (tomt overlay, riktig data orörd).
          <button
            type="button"
            data-simulation-enter=""
            onClick={enterSimulation}
            className="rounded-pill bg-accent px-4 py-2 font-display text-sm font-semibold text-accent-fg shadow-md outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--color-accent)_88%,black)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          >
            Starta simulering
          </button>
        )}
      </div>
    </section>
  );
}
