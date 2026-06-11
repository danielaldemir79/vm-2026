// TUNN seam mot vite-plugin-pwa:s virtuella modul `virtual:pwa-register`.
//
// VARFÖR den är så liten: det virtuella importet finns BARA i ett riktigt Vite-
// bygge (det löses inte i Vitest/Node), så det är i praktiken otestbart. Vi
// kapslar därför ALL uppdaterings-LOGIK i use-app-update.ts (med ett injicerbart
// register-API, denna fils typ `RegisterAppSw`), och låter denna fil göra ENDA
// jobbet: importera den virtuella modulen och returnera dess registerSW som
// matchar vårt kontrakt. Inget annat bor här, så det otestade ytan är minimal.
//
// API-form verifierad mot vite-plugin-pwa-dokumentationen (registerSW med
// onNeedRefresh/onOfflineReady, returnerar updateSW(reloadPage?)). Se
// docs/decisions.md (T43).

/**
 * Callbacks vi bryr oss om från vite-plugin-pwa:s registerSW.
 * - onNeedRefresh: en ny SW väntar (registerType 'prompt') , dags att visa
 *   "ny version"-prompten.
 * - onOfflineReady: SW:n är installerad och appen fungerar offline (engångs-info).
 */
export interface AppSwCallbacks {
  onNeedRefresh: () => void;
  onOfflineReady: () => void;
}

/**
 * Register-API:t use-app-update beror på. `updateApp(true)` aktiverar den väntande
 * SW:n och laddar om sidan (vite-plugin-pwa updateSW(reloadPage)). Hela hooken
 * testas mot en FAKE av denna funktion, så ingen testkod rör den virtuella modulen.
 */
export type RegisterAppSw = (callbacks: AppSwCallbacks) => (reloadPage?: boolean) => Promise<void>;

/**
 * Riktig implementation: importerar den virtuella modulen lat (dynamiskt) så att
 * en miljö utan service worker-stöd / utan Vite-bygge (t.ex. en SSR-/testkörning
 * som råkar importera denna fil) inte tvingas lösa importet vid modul-laddning.
 *
 * Lat import via en funktion gör också att produktionskoden kan skicka in detta
 * som default medan tester skickar en fake , ingen statisk `virtual:`-referens
 * tvingas in i testgrafen.
 */
export const registerAppSw: RegisterAppSw = (callbacks) => {
  let updateSW: (reloadPage?: boolean) => Promise<void> = async () => {};
  // Dynamiskt import: modulen finns bara i ett Vite-bygge. I en miljö där den
  // saknas blir updateSW en no-op (appen fungerar, bara utan SW-uppdatering).
  void import('virtual:pwa-register')
    .then(({ registerSW }) => {
      updateSW = registerSW({
        immediate: true,
        onNeedRefresh: callbacks.onNeedRefresh,
        onOfflineReady: callbacks.onOfflineReady,
      });
    })
    .catch(() => {
      // Inget SW-stöd / ingen virtuell modul: lämna no-op. Fail-soft, appen
      // körs vidare utan auto-uppdatering (ingen krasch, ingen tyst lögn om SW).
    });
  // Returnera en wrapper som delegerar till det (asynkront satta) updateSW, så
  // anroparen får en stabil funktion direkt vid registreringen.
  return (reloadPage?: boolean) => updateSW(reloadPage);
};
