// Hook som äger SW-uppdateringens RUNTIME-tillstånd: "finns en ny version?" +
// "appen är redo offline" + handlingen att ta i bruk den nya versionen.
//
// TESTBARHET (T43-kravet): vite-plugin-pwa:s register-modul (`virtual:pwa-register`)
// är otestbar i Vitest (det virtuella importet löses bara i ett Vite-bygge). All
// LOGIK bor därför HÄR och tar registreraren som ett INJICERBART argument
// (RegisterAppSw, default = den riktiga registerAppSw). I test skickar vi en fake
// register som vi själva kan fyra onNeedRefresh/onOfflineReady på, så hela hooken
// (prompt-tillstånd, uppdatera, avfärda) körs utan att röra den virtuella modulen.
//
// UPPDATERINGS-MODELL (verifierad mot vite-plugin-pwa-docs, se docs/decisions.md
// T43 + T102): appen kör registerType 'autoUpdate' (skipWaiting + clientsClaim). En ny
// SW tas i bruk AUTOMATISKT och register-sw.ts laddar om sidan EN gång (controllerchange),
// så ingen fastnar på en gammal cache utan handgrepp. För att en ny SW ska UPPTÄCKAS även
// på en frusen PWA-återöppning (iOS) pollar vi aktivt (sw-update-scheduler, T102). Denna
// hook behåller ändå onNeedRefresh/offlineReady + updateApp() som ett MANUELLT skyddsnät
// (om en miljö ändå skulle leverera en väntande SW via prompt-vägen).

import { useCallback, useEffect, useState } from 'react';
import { registerAppSw, type RegisterAppSw } from './register-sw';

export interface AppUpdateApi {
  /** true när en ny version väntar och prompten ska visas. */
  needRefresh: boolean;
  /** true en gång när appen blivit redo att fungera offline (diskret info). */
  offlineReady: boolean;
  /** Ta i bruk den nya versionen: aktiverar väntande SW + laddar om sidan. */
  updateApp: () => void;
  /** Stäng prompten/offline-beskedet utan att uppdatera (göms tills nästa gång). */
  dismiss: () => void;
}

/**
 * @param register Injicerbar SW-registrerare (default = riktiga registerAppSw).
 *                 Testet skickar en fake som exponerar callback-fyrningen.
 */
export function useAppUpdate(register: RegisterAppSw = registerAppSw): AppUpdateApi {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  // updateSW sätts vid registreringen (i effekten). Vi håller den i state så en
  // sen omrendering inte tappar referensen; default är en no-op tills registrerad.
  const [updateSW, setUpdateSW] = useState<(reloadPage?: boolean) => Promise<void>>(
    () => async () => {}
  );

  // Registrera SW:n EN gång vid mount. Effekten (inte modul-toppnivå) så att
  // registreringen är knuten till komponentens livscykel och testet kan styra
  // när callbacks fyras via sin fake-register.
  useEffect(() => {
    const update = register({
      onNeedRefresh: () => setNeedRefresh(true),
      onOfflineReady: () => setOfflineReady(true),
    });
    // Spara funktionen via uppdateringsform (annars tolkar useState den som en
    // lazy initializer och ANROPAR den i stället för att lagra den).
    setUpdateSW(() => update);
    // register är stabil (modul-funktion / fake pinnad i test); kör en gång.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateApp = useCallback(() => {
    // Dölj prompten direkt (knappen ska kännas responsiv) och be SW:n ta över +
    // ladda om. updateSW() sköter reload, men vi nollar tillståndet ändå ifall
    // omladdningen fördröjs/uteblir i en miljö utan riktig SW.
    //
    // Nolla BÅDA flaggorna (Copilot R5): kan offlineReady redan ha hunnit bli true
    // i SAMMA sid-laddning (förstagångs-install som står öppen tills en ny version
    // dyker upp), skulle enbart-nolla-needRefresh få prompten att växla över till
    // offline-redo-beskedet i stället för att försvinna. updateApp = "ta nya
    // versionen + ladda om", och då ska INGET av beskeden ligga kvar och ge fel signal.
    setNeedRefresh(false);
    setOfflineReady(false);
    void updateSW(true);
  }, [updateSW]);

  const dismiss = useCallback(() => {
    setNeedRefresh(false);
    setOfflineReady(false);
  }, []);

  return { needRefresh, offlineReady, updateApp, dismiss };
}
