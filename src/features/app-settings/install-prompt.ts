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

/**
 * Vad den KOMPAKTA install-knappen (T63, #113) ska göra när den klickas. Fyra grenar:
 *
 *   - 'hidden':       BARA i standalone. Daniels skarpa krav (#113): i app-läge ska
 *                     INGEN install-yta synas ("onödigt surr där då den redan är
 *                     installerad"). Detta är den ENDA grenen som döljer knappen.
 *   - 'native-prompt': ett beforeinstallprompt-event finns (Chrome/Android/desktop) ->
 *                     ETT klick öppnar webbläsarens ÄKTA install-prompt direkt (T39:s
 *                     mekanik). Så autonomt som plattformen tillåter.
 *   - 'guide-ios':    iOS (iPhone/iPad) saknar programmatiskt install-API (Apple
 *                     exponerar inget), så knappen öppnar kom-igång-guiden (T54) på
 *                     iPhone-fliken med steg för steg. Ingen falsk autonomi-illusion.
 *   - 'guide':        icke-iOS UTAN event (redan-installerad-i-annan-mening, kriterier
 *                     ej uppfyllda, eller prompten nyligen avvisad) -> öppna guiden ändå.
 *                     ALDRIG en död knapp (#113-AC): finns ingen native-väg just nu
 *                     visar vi vägen i stället för att göra ingenting.
 *
 * VIKTIGT: ett avfärdande av native-prompten döljer INTE knappen. Den kompakta knappen
 * är ingen avfärdbar banner, den är en alltid-nåbar liten CTA; en avvisad native-prompt
 * faller bara till guiden ('guide'), knappen försvinner inte. (Den gamla, avfärdbara
 * InstallBannern och dess mode-/dismiss-maskineri togs bort i T70/#136, dött sedan
 * InstallButton ersatte bannern i T63.)
 */
export type InstallButtonAction = 'hidden' | 'native-prompt' | 'guide-ios' | 'guide';

/** Indata till knapp-beslutet (rena flaggor, varje gren enhetstestas). */
export interface InstallButtonContext {
  /** true om appen körs installerat/standalone (då döljs knappen helt, #113). */
  isStandalone: boolean;
  /** true om plattformen är iOS (iPhone/iPad), guiden öppnas då på iPhone-fliken. */
  isIos: boolean;
  /** true om ett beforeinstallprompt-event fångats och kan visas (native-vägen). */
  hasPromptEvent: boolean;
}

/**
 * Avgör vad den kompakta install-knappen gör. Ren funktion (testas direkt på varje
 * kombination), så regeln kan verifieras utan webbläsare. Se InstallButtonAction för
 * varje grens motivering.
 */
export function resolveInstallButtonAction(ctx: InstallButtonContext): InstallButtonAction {
  if (ctx.isStandalone) {
    return 'hidden';
  }
  if (ctx.hasPromptEvent) {
    return 'native-prompt';
  }
  if (ctx.isIos) {
    return 'guide-ios';
  }
  return 'guide';
}

/**
 * Är appen redan installerad/körs i standalone-läge?
 *
 * TRE signaler kombineras (de tre standard-sätten att upptäcka installerat läge,
 * web.dev "Detect if your app is installed"):
 *   1. display-mode: standalone (Chrome/Android/desktop installerad PWA).
 *   2. navigator.standalone === true (iOS Safaris egen, icke-standard flagga).
 *   3. document.referrer börjar med "android-app://" (appen startad som en
 *      Trusted Web Activity / via en Android-app-wrapper, där display-mode kan
 *      rapporteras annorlunda men referrern avslöjar app-ursprunget).
 * Alla läses defensivt (matchMedia/referrer kan saknas/kasta i testmiljö).
 *
 * Källa: web.dev "Detect if your app is installed"
 * (https://web.dev/learn/pwa/detection) som listar just dessa tre signaler.
 * Källhänvisat i docs/decisions.md (T39).
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
    // matchMedia saknas/kastar (testmiljö): faller vidare till nästa signal.
  }
  // iOS Safari: navigator.standalone === true i installerat läge. Egenskapen är
  // icke-standard, så vi når den via en smal typ-vidgning i stället för `any`.
  const nav = win.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) {
    return true;
  }
  // TWA/Android-app-wrapper: referrern börjar med "android-app://". document
  // kan saknas i en ren Window-stub (testmiljö), så läs defensivt.
  const referrer = win.document?.referrer ?? '';
  return referrer.startsWith('android-app://');
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

/**
 * Är plattformen Android? Avgör om Play Protect-noten ska visas (T30/#50).
 *
 * Play Protect-varningen är Android-SPECIFIK (den kommer från Androids WebAPK-
 * mintning, se ANDROID_PLAY_PROTECT_NOTE). Desktop-Chrome fyrar samma
 * `beforeinstallprompt`-event som Android, så install-läget 'prompt' ensamt
 * skiljer inte Android från desktop, noten måste gate:as på plattformen.
 *
 * ÄRLIGHET om skörheten: detta är UA-sniff, inte feature-detektion. Det finns
 * ingen tillförlitlig feature-flagga för "den här installationen mintas som en
 * Android-WebAPK". UA-strängar kan förfalskas/ändras av webbläsare, så detta är
 * en bäst-möjlig-gissning: false-negativ (Android som inte matchar) tappar bara
 * en lugnande info-rad, false-positiv (icke-Android som matchar 'android') är
 * osannolik då tokenet är Android-unikt. Källa: MDN "Navigator.userAgent"
 * (https://developer.mozilla.org/en-US/docs/Web/API/Navigator/userAgent) som
 * uttryckligen varnar att UA-sniff är opålitlig. Vi accepterar det medvetet här
 * eftersom konsekvensen av fel är kosmetisk (en extra/saknad info-rad), inte
 * funktionell, install-knappen styrs av beforeinstallprompt-event:et, inte av denna.
 */
export function detectAndroid(nav: Navigator): boolean {
  return /android/i.test(nav.userAgent || '');
}
