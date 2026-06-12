// Den KOMPAKTA install-knappen (T63, #113): ytan överst som en diskret, klickbar
// "Installera som app"-pill, INGEN informationsruta. Daniels krav (issue #113 +
// förtydliganden): install-INFON ska bara visas NÄR man klickar, aldrig ligga framme
// och ta fokus från sidan, och HELT döljas i app-läge (standalone).
//
// TRE klick-grenar, härledda av den rena regeln (resolveInstallButtonAction via
// useInstallPrompt), så de aldrig kan drifta isär:
//   - 'native-prompt': ett beforeinstallprompt-event finns (Chrome/Android/desktop) ->
//     ETT klick öppnar webbläsarens ÄKTA install-prompt direkt (T39:s mekanik). En ren
//     <button> som anropar promptInstall, den ska INTE öppna guiden.
//   - 'guide-ios': iOS saknar programmatiskt install-API, så knappen öppnar kom-igång-
//     guiden (T54) PÅ iPhone-fliken (initialPlatform='ios'), steg för steg.
//   - 'guide': icke-iOS UTAN event (kriterier ej uppfyllda / nyligen avvisad) -> öppna
//     guiden ändå. ALDRIG en död knapp (#113-AC).
//   - 'hidden': bara i standalone => rendera INGENTING (inget surr i app-läge).
//
// ÅTERANVÄNDNING (ingen dubblett): native-vägens prompt-mekanik kommer från useInstallPrompt/
// install-prompt-capture (T39); guide-vägen återanvänder GetStartedControl/GetStartedDialog
// (T54) via dess nya 'install'-variant, som äger HELA dialog-a11y:n (fokus-fälla, Escape,
// fokus-återställning, portal). Denna komponent VÄLJER bara väg, den bygger ingen ny dialog.

import { useInstallPrompt } from './use-install-prompt';
import { GetStartedControl } from './GetStartedControl';

/**
 * Install-ytan överst. Renderar inget i standalone (buttonAction === 'hidden') eller om
 * inget event finns OCH guide-grenarna inte gäller (det inträffar aldrig: regeln faller
 * alltid till 'guide' för icke-iOS utan event, så icke-standalone ger alltid en knapp).
 */
export function InstallButton() {
  const { buttonAction, promptInstall } = useInstallPrompt();

  if (buttonAction === 'hidden') {
    // App-läge (standalone): Daniels skarpa krav, ingen install-yta alls.
    return null;
  }

  if (buttonAction === 'native-prompt') {
    // En riktig prompt finns: ETT klick = webbläsarens äkta install-dialog. Ingen guide,
    // ingen informationsruta, telefonen sköter resten.
    return (
      <button
        type="button"
        data-install-button="native"
        onClick={promptInstall}
        // KOMPAKT, diskret pill, samma lågmälda surface-ton som guide-varianten
        // (GetStartedControl variant="install") så ytan ser likadan ut oavsett gren.
        className="inline-flex items-center gap-2 rounded-pill border border-border bg-surface px-4 py-2 font-display text-sm font-semibold text-fg outline-none transition-colors hover:border-accent/60 hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
      >
        {/* Liten "lägg till"-ikon (pil ner mot bas), dekorativ; texten bär namnet. */}
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-accent"
        >
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
        Installera som app
      </button>
    );
  }

  // Guide-grenarna: ingen native-prompt finns. Öppna kom-igång-guiden via den delade
  // kontrollen (äger dialog-a11y:n). iOS-grenen tvingar iPhone-fliken; fallback-grenen
  // låter dialogen härleda den förvalda fliken själv.
  const initialPlatform = buttonAction === 'guide-ios' ? 'ios' : undefined;
  return <GetStartedControl variant="install" initialPlatform={initialPlatform} />;
}
