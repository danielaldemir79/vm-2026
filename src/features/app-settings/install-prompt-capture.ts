// TIDIG fångst av beforeinstallprompt-event:et (rotorsaken till "install-knappen
// gör inget", T39/#68).
//
// PROBLEMET: webbläsaren fyrar `beforeinstallprompt` EN gång, "usually on page
// load" (MDN), utan garanterad tidpunkt. Registreras lyssnaren först i React-
// hookens useEffect (som kör EFTER mount) hinner event:et ofta fyra INNAN
// lyssnaren finns, och då är det borta för alltid: `deferredPrompt` förblir null,
// knappen dyker aldrig upp / klick gör inget. Enhetstesterna missade det för att
// de dispatchar event:et EFTER mount.
//
// LÖSNINGEN (MDN + web.dev "customize-install"): registrera lyssnaren SÅ TIDIGT
// som möjligt, före framework-mount. Detta modul-eval:ar i main.tsx (före
// createRoot), `preventDefault`:ar webbläsarens mini-infobar och STASHAR event:et
// i en modul-variabel. React läser sedan det redan-fångade event:et vid mount och
// prenumererar på framtida event, så inget event tappas pga mount-timing.
//
// Källor (källhänvisat, gissas inte):
//   - MDN "Window: beforeinstallprompt event": "There's no guaranteed time this
//     event is fired, but it usually happens on page load." + spara event:et,
//     preventDefault, anropa prompt() på det sparade event:et (engångs).
//     https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event
//   - web.dev "Customize the install experience": fånga event:et, spara
//     referensen, prompt() på det sparade event:et (kan bara användas en gång).
//     https://web.dev/articles/customize-install
//   - Beslut + rotorsak i docs/decisions.md (T39).

/**
 * Det icke-standardiserade beforeinstallprompt-event:et (saknas i lib.dom.d.ts).
 * Vi typar bara fälten vi använder. Delad typ (hook + capture läser samma form).
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Det senast fångade, ännu oanvända event:et (eller null). Modul-singel. */
let deferredPrompt: BeforeInstallPromptEvent | null = null;

/** Prenumeranter som vill veta när det fångade event:et ändras (React-hooken). */
const subscribers = new Set<() => void>();

function notify(): void {
  for (const listener of subscribers) {
    listener();
  }
}

function onBeforeInstallPrompt(event: Event): void {
  // Hindra webbläsarens default-mini-infobar; vi visar en EGEN diskret knapp.
  event.preventDefault();
  deferredPrompt = event as BeforeInstallPromptEvent;
  notify();
}

// När appen installeras (eller redan är det) är event:et förbrukat/irrelevant.
function onAppInstalled(): void {
  deferredPrompt = null;
  notify();
}

/**
 * Registrera den TIDIGA lyssnaren. Anropas EN gång från main.tsx före mount.
 * Idempotent: en upprepad registrering (t.ex. HMR) lägger inte dubbla lyssnare.
 * Lyssnarna är NAMNGIVNA (inte inline) så de kan tas bort igen (test-reset).
 */
let registered = false;
export function registerInstallPromptCapture(): void {
  if (registered || typeof window === 'undefined') {
    return;
  }
  registered = true;
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.addEventListener('appinstalled', onAppInstalled);
}

/** Det redan-fångade event:et (för hookens lazy-init, så ett tidigt event syns). */
export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

/**
 * Prenumerera på ändringar av det fångade event:et. Returnerar en avregistrerare.
 * Hooken använder denna i en useEffect så en omrendering sker när ett event
 * dyker upp efter mount (eller nollas vid förbrukning/installation).
 */
export function subscribeDeferredPrompt(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

/**
 * Förbruka event:et: anropa prompt() på det sparade event:et och nolla det.
 * Event:et kan bara användas EN gång (MDN/web.dev), så det nollas direkt så
 * knappen inte kan dubbel-trigga. Vi väntar inte in userChoice (appinstalled
 * städar upp om installationen lyckas). No-op om inget event finns.
 */
export function consumeDeferredPrompt(): void {
  if (deferredPrompt === null) {
    return;
  }
  void deferredPrompt.prompt();
  deferredPrompt = null;
  notify();
}

/**
 * Endast för test: nollställ modul-tillståndet OCH ta bort DOM-lyssnarna mellan
 * tester. Utan borttagningen läcker en registrerad window-lyssnare (med en gammal
 * closure) mellan testfall i samma modul-instans, så ett event fångas av flera
 * lyssnare och räkningar blir fel. removeEventListener är en no-op om lyssnaren
 * aldrig registrerades, så detta är säkert oavsett tillstånd.
 */
export function resetInstallPromptCaptureForTest(): void {
  if (typeof window !== 'undefined') {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.removeEventListener('appinstalled', onAppInstalled);
  }
  deferredPrompt = null;
  subscribers.clear();
  registered = false;
}
