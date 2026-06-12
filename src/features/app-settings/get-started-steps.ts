// "Kom igång"-ytan: REN logik + data (ingen React, inga sido-effekter), så hela
// regeln, VILKEN plattform användaren har och VILKA steg som visas, kan enhets-
// testas utan webbläsare. Dialogen (GetStartedDialog.tsx) renderar bara denna data.
//
// VARFÖR denna task finns (T54, #93, Daniels live-feedback 2026-06-11): "många
// lyckas inte förstå hur de ska installera det som en app eller att de kan använda
// sidan direkt". Den befintliga InstallBannern (T13/T39) är diskret och kan döljas;
// onboardingens install-steg (T39) är ren info utan väg. Det fattades en GLASKLAR,
// alltid-nåbar yta som säger BÅDA vägarna (använd direkt i webbläsaren ELLER lägg på
// hemskärmen) med rätt steg för rätt enhet. Den ytan bor här.
//
// PLATTFORMS-DETEKTERINGEN ÅTERANVÄNDS, den uppfinns inte på nytt: detectStandalone/
// detectIos/detectAndroid är samma källhänvisade detektorer som install-knappen (T39)
// använder (install-prompt.ts). EN sanning för "är appen redan installerad / vilken
// plattform" => kom-igång-ytan och install-knappen kan aldrig drifta isär.

import {
  ANDROID_PLAY_PROTECT_NOTE,
  detectAndroid,
  detectIos,
  detectStandalone,
} from './install-prompt';

/**
 * Vilken kom-igång-väg vi visar som FÖRVALD. De tre vägarna skiljer sig på exakt
 * det sätt PWA-installation skiljer sig per plattform (se install-prompt.ts):
 *   - 'android': Chrome/Android, install-knappen finns (beforeinstallprompt) + en
 *     lugnande Play Skydd-rad.
 *   - 'ios':     iPhone/iPad, ingen install-knapp finns, manuell väg via Dela-menyn.
 *     Safari REKOMMENDERAS (enklast), men sedan iOS 16.4 funkar Dela-menyn även i
 *     Chrome m.fl. (se IOS_SAFARI_REQUIREMENT, review-F1-rättad).
 *   - 'desktop': dator, install-ikon i adressfältet.
 * Övriga vägar är alltid nåbara bakom flikar i dialogen (en vän kan ha fel gissad
 * plattform, eller vilja hjälpa någon med en annan enhet).
 */
export type GetStartedPlatform = 'android' | 'ios' | 'desktop';

/** Ett numrerat steg i en installations-instruktion (enkelt språk, inga termer). */
export interface GetStartedStep {
  /** Stabil nyckel (React-key + test). */
  id: string;
  /** Steg-texten i klartext. Numreringen görs av UI:t (ordnad lista). */
  text: string;
}

/** En plattforms-väg: rubrik, dess numrerade steg och ev. en lugnande/varnings-rad. */
export interface GetStartedPath {
  /** Vilken plattform vägen gäller (= flik-id + data-krok). */
  platform: GetStartedPlatform;
  /** Flik-/rubriktext för vägen ("På Android", "På iPhone", "På datorn"). */
  label: string;
  /** De numrerade stegen, i ordning. */
  steps: readonly GetStartedStep[];
  /**
   * En extra, dämpad rad under stegen: på Android den lugnande Play Skydd-noten,
   * på iOS Safari-rekommendationen (bra-att-veta, inget exklusivt krav, review-F1).
   * null när vägen inte behöver någon. Skild från stegen så UI:t kan rendera den
   * med egen (dämpad) ton.
   */
  note: string | null;
}

// Play Skydd-noten ÅTERANVÄNDS ordagrant från install-prompt.ts (ANDROID_PLAY_PROTECT_NOTE,
// importerad ovan), så samma sanning visas i install-bannern OCH här (ingen drift).

/**
 * iOS-rekommendationen (review-F1-rättad, verifierad 2026-06-12): Safari är den
 * ENKLASTE och mest välbekanta vägen, men sedan iOS 16.4 (mars 2023) kan även
 * tredjeparts-webbläsare på iOS (Chrome/Edge/Firefox) lägga till på hemskärmen via
 * sin Dela-meny (alla kör WebKit i Sverige, EU-undantaget med alternativ motor är
 * irrelevant för målgruppen). Texten får därför INTE påstå Safari-exklusivitet,
 * det vore att leda en Chrome-på-iPhone-vän fel åt andra hållet. Källor: Apple
 * "Add a website to your Home Screen" (beskriver Safari-vägen, fastställer ingen
 * exklusivitet) + Progressier "PWA installation" (tredjepartsstödet sedan 16.4).
 * Källhänvisat i docs/decisions.md (T54).
 */
export const IOS_SAFARI_REQUIREMENT =
  'Enklast i Safari: tryck på Dela-knappen och välj "Lägg till på hemskärmen". Använder du Chrome eller en annan webbläsare på iPhone finns samma val i dess Dela-meny.';

/**
 * Plattforms-vägarnas steg är EXTERNA fakta (var "lägg till på hemskärmen" sitter på
 * varje enhet), inte gissningar, källhänvisade per väg:
 *
 *  - iOS Safari: Dela-knappen -> "Lägg till på hemskärmen". Källa: Apple "Add a
 *    website to your Home Screen" (iPhone-användarguide).
 *  - Android/Chrome: install-knappen vi visar (beforeinstallprompt) ELLER webbläsar-
 *    menyn -> "Installera app"/"Lägg till på startskärmen". Källa: web.dev "Customize
 *    the install experience" + Chrome-menyns "Install app" (samma WebAPK-väg T39 byggde).
 *  - Desktop (Chrome/Edge): install-ikonen i adressfältets högerkant. Källa: web.dev
 *    "Customize the install experience" (desktop install-ikonen i omnibox).
 *
 * Stegen hålls i ETT enkelt språk (inga tekniska termer), numreras av UI:t.
 */
export const GET_STARTED_PATHS: readonly GetStartedPath[] = [
  {
    platform: 'ios',
    label: 'På iPhone',
    steps: [
      {
        id: 'ios-share',
        text: 'Tryck på Dela-knappen längst ner i Safari (en fyrkant med en pil uppåt).',
      },
      { id: 'ios-add', text: 'Bläddra och välj "Lägg till på hemskärmen".' },
      {
        id: 'ios-confirm',
        text: 'Tryck på "Lägg till" uppe i högra hörnet. Nu finns appen på din hemskärm.',
      },
    ],
    note: IOS_SAFARI_REQUIREMENT,
  },
  {
    platform: 'android',
    label: 'På Android',
    steps: [
      // Knapp-citatet matchar InstallBannerns FAKTISKA knapptext "Installera"
      // (copilot R4: ett felciterat knappnamn gör att användaren inte hittar den).
      { id: 'android-button', text: 'Tryck på knappen "Installera" här på sidan.' },
      {
        id: 'android-menu',
        text: 'Ser du ingen knapp? Tryck på de tre prickarna uppe i hörnet och välj "Installera app".',
      },
      { id: 'android-confirm', text: 'Bekräfta, så lägger sig appen på din startskärm.' },
    ],
    note: ANDROID_PLAY_PROTECT_NOTE,
  },
  {
    platform: 'desktop',
    label: 'På datorn',
    steps: [
      {
        id: 'desktop-icon',
        text: 'Titta längst till höger i adressfältet, där finns en liten installations-ikon.',
      },
      { id: 'desktop-click', text: 'Klicka på den och välj "Installera".' },
      {
        id: 'desktop-confirm',
        text: 'Appen öppnas i ett eget fönster och går att starta som ett vanligt program.',
      },
    ],
    note: null,
  },
] as const;

/**
 * Ärlig info om WEBB-läget (när man kör direkt i webbläsaren i stället för att
 * installera). Daniels feedback: vänner förstår inte att de KAN använda sidan direkt,
 * men webb-läget har ärliga fallgropar som måste sägas rakt men vänligt:
 *
 *  - Privat läge / inkognito sparar inget när fliken stängs => tipsen/identiteten
 *    (som bor i localStorage) försvinner. (web.dev/MDN: private mode rensar storage.)
 *  - "Rensa webbläsardata" tömmer localStorage => samma sak, tipsen är borta.
 *  - iOS-webb (Safari) kan SJÄLV rensa webbplatsdata efter ~7 dagar UTAN besök. Det
 *    är Apples "7-day cap on script-writable storage" (WebKit ITP, intelligent
 *    tracking prevention). Hemskärms-appen (standalone) omfattas INTE av samma
 *    7-dagars-rensning, därför rekommenderas hemskärmen. Källa: WebKit-bloggen
 *    "Full Third-Party Cookie Blocking and More" (7-day cap on all script-writable
 *    storage). Källhänvisat i docs/decisions.md (T54).
 *
 * Detta är ren copy-data (UI:t renderar den som en lista) så den har EN sanning och
 * kan stavkollas/justeras utan att röra komponent-koden.
 */
export interface WebModeFacts {
  /** Kort, vänlig rubrik för webb-läges-rutan. */
  heading: string;
  /** En vänlig mening om att man får använda appen direkt, utan att installera. */
  intro: string;
  /** Punkterna att vara ärlig om (privat läge, rensa data, iOS-självrensning). */
  cautions: readonly string[];
  /** Den avslutande rekommendationen (hemskärm = tryggast). */
  recommendation: string;
}

export const WEB_MODE_FACTS: WebModeFacts = {
  heading: 'Använd direkt i webbläsaren',
  intro:
    'Du kan börja på en gång, här i webbläsaren, utan att installera något. Allt fungerar direkt.',
  cautions: [
    'Surfa inte i privat läge (inkognito), då sparas inte dina tips när du stänger fliken.',
    'Rensa inte "webbläsardata" för sidan, dina tips och ditt namn bor där.',
    'På iPhone i webbläsaren kan tipsen försvinna efter ungefär en vecka om du inte öppnat sidan, då är hemskärmen tryggare.',
  ],
  recommendation:
    'Vill du vara på den säkra sidan, lägg appen på hemskärmen, då sparas allt stabilt och du startar den med ett tryck.',
} as const;

/** Indata till plattformsbeslutet (rena flaggor, lätt att testa varje kombination). */
export interface GetStartedContext {
  /** true om appen redan körs installerat (standalone) => visa "allt klart". */
  isStandalone: boolean;
  /** true om plattformen är iOS (iPhone/iPad). */
  isIos: boolean;
  /** true om plattformen är Android. */
  isAndroid: boolean;
}

/**
 * Vilken väg som ska vara FÖRVALD utifrån plattformen. Ren funktion (testas direkt
 * på varje kombination). Standalone hanteras INTE här (det är ett eget UI-läge,
 * "allt klart", inte en väg); anroparen läser isStandalone separat.
 *
 * Prioritet: iOS före Android (en enhet är inte båda), Android, annars desktop som
 * ärlig fallback (en okänd/desktop-webbläsare visar adressfälts-vägen, som är den
 * minst plattformsspecifika; övriga vägar är ändå nåbara bakom flikarna).
 */
export function resolveDefaultPlatform(ctx: GetStartedContext): GetStartedPlatform {
  if (ctx.isIos) {
    return 'ios';
  }
  if (ctx.isAndroid) {
    return 'android';
  }
  return 'desktop';
}

/** Hela kom-igång-läget, härlett ur webbläsaren EN gång (rena detektor-anrop). */
export interface GetStartedState {
  /** true => appen körs redan installerad, visa "du kör appen, allt klart". */
  isStandalone: boolean;
  /** Den förvalda vägen (flik som öppnas först). */
  defaultPlatform: GetStartedPlatform;
}

/**
 * Härled hela kom-igång-läget ur ett Window. Samlar de tre BEFINTLIGA detektorerna
 * (T39) till ETT beslut, så komponenten slipper känna till detektor-detaljerna.
 * Defensivt: detektorerna läser matchMedia/navigator defensivt (testmiljö-säkert).
 */
export function resolveGetStartedState(win: Window): GetStartedState {
  const isStandalone = detectStandalone(win);
  const isIos = detectIos(win.navigator);
  const isAndroid = detectAndroid(win.navigator);
  return {
    isStandalone,
    defaultPlatform: resolveDefaultPlatform({ isStandalone, isIos, isAndroid }),
  };
}

/** Slå upp en plattforms-väg (för UI:t). Returnerar undefined för okänd plattform. */
export function getPathFor(platform: GetStartedPlatform): GetStartedPath | undefined {
  return GET_STARTED_PATHS.find((path) => path.platform === platform);
}
