// AKTIV UPPDATERINGS-KOLL för service-workern (T102, #210).
//
// PROBLEMET (Daniels rapport: en testare startade om appen 10 ggr utan att få nya
// versionen): appen kör registerType 'autoUpdate' (skipWaiting + clientsClaim +
// controllerchange -> auto-reload, se register-sw.ts). DEN kedjan tar i bruk en ny SW
// AUTOMATISKT , MEN bara EFTER att webbläsaren UPPTÄCKT en ny sw.js. Webbläsaren
// hämtar sw.js vid navigering (sid-laddning) + ~var 24:e timme. En INSTALLERAD PWA som
// "öppnas igen" från hemskärmen återupptas ofta FRUSEN (iOS i synnerhet) UTAN en färsk
// navigering, så uppdaterings-kollen körs aldrig och användaren sitter kvar på gammal
// version hur många gånger hen än öppnar appen.
//
// LÖSNINGEN (central, ingen användare ska behöva "leka"): kolla AKTIVT efter en ny SW
// genom att anropa registration.update() (a) direkt, (b) på ett intervall medan appen är
// öppen, och (c) när appen blir SYNLIG/fokuserad igen (det är just då en återupptagen PWA
// behöver kollas). Hittar update() en ny sw.js installeras den -> skipWaiting -> claim ->
// controllerchange -> auto-reload (befintlig kedja). Så en ny version tas i bruk inom ~en
// minut efter att man öppnar appen, helt utan handgrepp.
//
// REN + TESTBAR: tar en update-bärande registrering + injicerbara doc/win/intervalMs, så
// hela schemaläggnings-logiken körs i Vitest med fake-timers + en fake-registrering (till
// skillnad från register-sw.ts som bara wirar in detta i den otestbara virtual:-modulen).

/** Den enda biten av en ServiceWorkerRegistration vi behöver: update(). */
export interface UpdatableRegistration {
  update: () => Promise<unknown>;
}

/** Hur ofta (ms) vi pollar efter en ny SW medan appen är öppen. */
export const SW_UPDATE_INTERVAL_MS = 60_000;

export interface ScheduleSwUpdateOptions {
  /** Poll-intervall i ms (default SW_UPDATE_INTERVAL_MS). */
  intervalMs?: number;
  /** Dokumentet att lyssna på visibilitychange (default globalt document om det finns). */
  doc?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
  /** Fönstret att lyssna på focus (default globalt window om det finns). */
  win?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

/**
 * Starta aktiva uppdaterings-kollar mot `registration`. Anropar update() direkt, på ett
 * intervall, och när appen blir synlig/fokuserad. update()-fel SVÄLJS (en nät-glapp ska
 * aldrig kasta) , kollen är best-effort och försöker igen vid nästa tick/fokus.
 *
 * @returns en avregistrerare (rensar interval + lyssnare). Anropas vid teardown.
 */
export function scheduleSwUpdateChecks(
  registration: UpdatableRegistration,
  options: ScheduleSwUpdateOptions = {}
): () => void {
  const intervalMs = options.intervalMs ?? SW_UPDATE_INTERVAL_MS;
  const doc = options.doc ?? (typeof document !== 'undefined' ? (document as Document) : undefined);
  const win = options.win ?? (typeof window !== 'undefined' ? (window as Window) : undefined);

  // En koll: be SW:n leta efter en ny sw.js. update() anropas DIREKT (synkront), så en
  // koll sker omedelbart vid tick/fokus; bara dess ev. avvisning/throw sväljs (offline/
  // nätglapp ska aldrig kasta eller bullra , nästa intervall/fokus försöker igen).
  const check = (): void => {
    try {
      const result = registration.update();
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        void (result as Promise<unknown>).catch(() => {});
      }
    } catch {
      // synkront kast (oväntat) sväljs likadant.
    }
  };

  // Bara kolla när appen FAKTISKT är synlig (en bakgrunds-flik behöver inte pollas, och
  // en återupptagen PWA fyrar visibilitychange -> 'visible' precis när vi vill kolla).
  const onVisibility = (): void => {
    if (!doc || doc.visibilityState === 'visible') {
      check();
    }
  };

  const id = setInterval(check, intervalMs);
  doc?.addEventListener('visibilitychange', onVisibility);
  win?.addEventListener('focus', check);

  // Kolla EN gång direkt: en ny version kan ha deployats medan appen var stängd/borta,
  // så vi väntar inte ett helt intervall på första kollen.
  check();

  return () => {
    clearInterval(id);
    doc?.removeEventListener('visibilitychange', onVisibility);
    win?.removeEventListener('focus', check);
  };
}
