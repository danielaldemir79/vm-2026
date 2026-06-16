// Opt-in-tillståndsmaskinen för mål-notiser (T85, #177). REN logik: avgör VAD opt-in-ytan
// ska visa, så varje gren enhetstestas utan webbläsare. Hooken (use-push.ts) kopplar denna
// regel till de faktiska browser-API:erna (Notification.permission, pushManager).
//
// Web-push har flera ärliga icke-lyckliga lägen som ALLA måste hanteras synligt (aldrig en
// trasig/död knapp), och iOS har en SÄRSKILD begränsning som styr hela grenvalet:
//
//   iOS-NOTE (avgörande): web-push fungerar på iOS BARA från 16.4+ OCH BARA när appen är
//   INSTALLERAD till hemskärmen (körs i standalone). I Safari-fliken finns varken
//   serviceWorker-push eller Notification-API:t på ett användbart sätt. Apple kräver
//   hemskärms-installation. Källa: Apple "Web Push for Web Apps on iOS and iPadOS"
//   (WWDC23 / Safari 16.4 release notes) + web.dev. Källhänvisat i docs/decisions.md (T85).
//   Därför: på iOS som INTE är installerad visar vi en lugn hint ("lägg till på hemskärmen")
//   i stället för en knapp som ändå inte kan fungera, INNAN vi ens tittar på stöd/permission.

import { detectIos, detectStandalone } from '../app-settings/install-prompt';

/**
 * De möjliga lägena för opt-in-ytan. Ett av dessa avgör exakt vad UI:t renderar.
 *
 *   - 'ios-not-installed': iOS men inte installerad till hemskärmen. Visa hinten, ingen
 *     knapp (web-push kan inte fungera här, Apples krav). Gren-valet sker FÖRST (se modulen).
 *   - 'unsupported':       plattformen saknar serviceWorker/PushManager/Notification. Visa
 *     en lugn "stöds inte i den här webbläsaren"-rad, ingen knapp.
 *   - 'denied':            användaren har NEKAT notis-behörighet. Vi kan inte fråga igen
 *     programmatiskt (webbläsaren blockerar), så visa en rad om att slå på i webbläsarens
 *     inställningar. Ingen aktiv knapp.
 *   - 'subscribed':        redan prenumererad (har en aktiv push-subscription). Visa "på" +
 *     en "stäng av"-knapp (avregistrera + radera raden) OCH "skicka test-notis".
 *   - 'subscribable':      stöds, inte nekad, inte prenumererad än. Visa "aktivera"-knappen
 *     (begär behörighet + prenumerera på ett användar-klick). Täcker både 'default'- och
 *     'granted'-men-inte-prenumererad-läget , i båda visar vi aktivera-knappen.
 */
export type PushOptInState =
  | 'ios-not-installed'
  | 'unsupported'
  | 'denied'
  | 'subscribed'
  | 'subscribable';

/** Indata till grenvalet (rena flaggor + behörighetsläget, varje gren enhetstestas). */
export interface PushOptInContext {
  /** true om plattformen är iOS (iPhone/iPad). */
  isIos: boolean;
  /** true om appen körs installerad/standalone. */
  isStandalone: boolean;
  /** true om serviceWorker + PushManager + Notification ALLA finns. */
  isSupported: boolean;
  /** Notification.permission-läget (eller 'default' om vi inte hunnit läsa det). */
  permission: NotificationPermission;
  /** true om vi redan har en aktiv push-subscription (pushManager.getSubscription). */
  isSubscribed: boolean;
}

/**
 * Avgör opt-in-läget. Ren funktion , gren-ordningen ÄR regeln:
 *
 *   1. iOS-men-inte-installerad gatas FÖRST: där kan web-push aldrig fungera (Apples krav),
 *      så hinten ska vinna även om ett annat API råkar finnas. Att visa en aktivera-knapp
 *      vore en falsk autonomi-illusion (samma anda som install-knappens 'guide-ios').
 *   2. unsupported: saknas grund-API:erna kan inget göras (men iOS-installerad som ändå
 *      saknar stöd, < 16.4, faller hit och får "stöds inte", ärligt).
 *   3. denied: behörighet nekad , kan inte fråga igen, visa inställnings-vägen.
 *   4. subscribed: aktiv prenumeration finns , visa på-läget + test/av.
 *   5. subscribable: allt annat , visa aktivera-knappen.
 */
export function resolvePushOptInState(ctx: PushOptInContext): PushOptInState {
  if (ctx.isIos && !ctx.isStandalone) {
    return 'ios-not-installed';
  }
  if (!ctx.isSupported) {
    return 'unsupported';
  }
  if (ctx.permission === 'denied') {
    return 'denied';
  }
  if (ctx.isSubscribed) {
    return 'subscribed';
  }
  return 'subscribable';
}

/**
 * Finns grund-API:erna för web-push i denna miljö? De tre kraven (alla måste finnas):
 * serviceWorker (registrerar SW:n), PushManager (prenumerationen) och Notification
 * (visa + behörighet). Läses defensivt , i en gammal browser eller en node-/testmiljö
 * saknas de helt. Källa: web.dev "Push notifications" (feature-detektion).
 *
 * @param win  Window att kolla mot (injicerbar för test).
 */
export function isPushSupported(win: Window): boolean {
  return 'serviceWorker' in win.navigator && 'PushManager' in win && 'Notification' in win;
}

/**
 * Smal typ-vidgning för att läsa Notification-API:t på Window. `Notification` är en
 * global klass med en statisk `permission`/`requestPermission`, men `Window`-interfacet
 * i den installerade lib.dom-versionen exponerar den inte som en medlem, så vi når den
 * via en smal cast (samma grepp som detectStandalone gör för navigator.standalone), i
 * stället för `any`. Egenskapen kan saknas helt (unsupported), därför valfri.
 */
type WindowWithNotification = Window & {
  Notification?: {
    permission: NotificationPermission;
    requestPermission: () => Promise<NotificationPermission>;
  };
};

/** Läs Notification-API:t typat (eller undefined om det saknas). */
export function getNotificationApi(win: Window): WindowWithNotification['Notification'] {
  return (win as WindowWithNotification).Notification;
}

/**
 * Samla den FAKTISKA browser-kontexten för grenvalet (sido-effektsfri läsning av
 * navigator/window/Notification). Hålls här (inte i hooken) så att hela
 * läs-och-resolve-kedjan kan köras i ett test med en injicerad Window-stub.
 *
 * @param win           Window (injicerbar).
 * @param isSubscribed  Om en aktiv subscription redan finns (läses async i hooken,
 *                      injiceras hit så denna funktion förblir synkron + ren).
 */
export function readPushOptInContext(win: Window, isSubscribed: boolean): PushOptInContext {
  const supported = isPushSupported(win);
  return {
    isIos: detectIos(win.navigator),
    isStandalone: detectStandalone(win),
    isSupported: supported,
    // Notification kan saknas (unsupported); läs behörigheten defensivt, default annars.
    permission: getNotificationApi(win)?.permission ?? 'default',
    isSubscribed,
  };
}
