// Installations-prompt: REN logik (ingen React, inga sido-effekter) för att avgöra
// VAD som ska visas, så regeln kan enhetstestas utan webbläsare. Hooken
// (use-install-prompt.ts) kopplar denna logik till de faktiska browser-event:en.
//
// PWA-installation skiljer sig mellan plattformar:
//   - Chrome/Edge/Android: webbläsaren fyrar `beforeinstallprompt`. Vi fångar
//     event:et, hindrar standard-mini-infobaren, och visar en EGEN diskret knapp
//     som anropar event.prompt() när användaren vill installera.
//   - iOS Safari: stödjer INTE beforeinstallprompt. Installation sker manuellt via
//     Dela-menyn ("Lägg till på hemskärm"). Vi kan bara visa en INSTRUKTION.
//   - Redan installerad (display-mode: standalone): visa ingenting.
//
// Källa för plattformsbeteendet: MDN "BeforeInstallPromptEvent" + web.dev
// "Patterns for promoting PWA installation" (egen diskret knapp i stället för
// webbläsarens default). Källhänvisat i decisions.md (T13).

/**
 * Kort, ärlig info-rad om Play Protect-varningen vid Android-installation (T30/#50).
 *
 * BAKGRUND: På vissa Android-telefoner (särskilt Samsung, vars webbläsare har en
 * egen WebAPK-pipeline) visar Google Play Protect "En osäker app har blockerats ...
 * byggd för en äldre version av Android". Den varningen styrs av WebAPK:ns
 * targetSdkVersion, som sätts av webbläsarens MINTNINGSSERVER (Chrome/Google eller
 * Samsung Internet), INTE av vårt manifest. Vi kan alltså inte eliminera den från
 * vår sida. Googles egen utvecklar-vägledning säger att i det läget är det enda
 * man kan göra att INFORMERA användaren att appen är säker att installera.
 *
 * Därför en kort, lugnande mening (visas i prompt-läget). Källor i decisions.md (T30):
 * Google "Developer Guidance for Play Protect Warnings" + Modern Web Weekly #69
 * (Samsung-WebAPK + reputation, utanför utvecklarens kontroll).
 */
export const ANDROID_PLAY_PROTECT_NOTE =
  'Visar telefonen en varning från Play Protect? Appen är säker, det är en känd Android-varning för webb-appar. Välj installera ändå.';

/** Vad installations-ytan ska visa, härlett ur plattform + event + avfärdande. */
export type InstallUiMode =
  | 'hidden' // redan installerad, avfärdad, eller ingen väg att installera än
  | 'prompt' // Chrome/Android: vi har ett beforeinstallprompt-event redo
  | 'ios-instructions'; // iOS Safari: visa "Dela -> Lägg till på hemskärm"

/** Indata till mode-beslutet (rena värden, lätt att testa varje kombination). */
export interface InstallContext {
  /** true om appen körs i installerat/standalone-läge (då finns inget att visa). */
  isStandalone: boolean;
  /** true om plattformen är iOS (iPhone/iPad), som saknar beforeinstallprompt. */
  isIos: boolean;
  /** true om ett beforeinstallprompt-event fångats och ännu kan visas. */
  hasPromptEvent: boolean;
  /** true om användaren tidigare avfärdat bannern (persistent). */
  dismissed: boolean;
}

/**
 * Avgör vad installations-ytan ska visa.
 *
 * Prioritetsordning (medvetet):
 *   1. Redan installerad -> dölj (inget att göra).
 *   2. Avfärdad av användaren -> dölj (respektera valet, visa inte igen).
 *   3. Chrome/Android med ett event redo -> egen install-knapp.
 *   4. iOS Safari (ej installerad, ej avfärdad) -> instruktion (enda vägen där).
 *   5. Annars dölj: en icke-iOS-webbläsare UTAN event har (ännu) ingen
 *      installerbar väg vi kan agera på, så vi visar inget hellre än en knapp
 *      som inte gör något (ärlig affordans, gissar inte).
 */
export function resolveInstallMode(ctx: InstallContext): InstallUiMode {
  if (ctx.isStandalone) {
    return 'hidden';
  }
  if (ctx.dismissed) {
    return 'hidden';
  }
  if (ctx.hasPromptEvent) {
    return 'prompt';
  }
  if (ctx.isIos) {
    return 'ios-instructions';
  }
  return 'hidden';
}

/**
 * Är appen redan installerad/körs i standalone-läge?
 *
 * Två signaler kombineras: display-mode: standalone (Chrome/Android/desktop) och
 * navigator.standalone (iOS Safaris egen, icke-standardiserade flagga). Båda
 * läses defensivt (matchMedia kan saknas i testmiljö).
 */
export function detectStandalone(win: Window): boolean {
  try {
    if (
      typeof win.matchMedia === 'function' &&
      win.matchMedia('(display-mode: standalone)').matches
    ) {
      return true;
    }
  } catch {
    // matchMedia saknas/kastar (testmiljö): faller vidare till iOS-flaggan.
  }
  // iOS Safari: navigator.standalone === true i installerat läge. Egenskapen är
  // icke-standard, så vi når den via en smal typ-vidgning i stället för `any`.
  const nav = win.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

/**
 * Är plattformen iOS (iPhone/iPad)? Avgör om instruktions-fallbacken ska visas.
 *
 * Vi sniffar user agent (det finns ingen feature-detektion för "saknar
 * beforeinstallprompt"). iPadOS 13+ rapporterar sig som "Macintosh" men har
 * touch, så vi täcker det fallet via maxTouchPoints. Källa: MDN
 * "Navigator.userAgent" + den kända iPadOS-desktop-UA-fällan.
 */
export function detectIos(nav: Navigator): boolean {
  const ua = nav.userAgent || '';
  if (/iphone|ipad|ipod/i.test(ua)) {
    return true;
  }
  // iPadOS 13+ maskerar sig som macOS men exponerar touch-punkter.
  return /macintosh/i.test(ua) && nav.maxTouchPoints > 1;
}
