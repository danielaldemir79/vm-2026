// Test-hjälpare (T14): en DataSource som REJECTAR, för fel-vägs-tester.
//
// VARFÖR: före T14 testade fel-vägarna att LIVE-stubben kastade (liveReady=true).
// Sedan T14 returnerar live-källan giltig data och kastar inte längre, så ett
// genuint datakälle-fel (t.ex. nätfel) injiceras i stället via ResultsProviders
// `dataSource`-prop. Denna delade fabrik ger en källa vars alla metoder rejectar
// med ett tydligt meddelande, så provider:ns fail-loud-kontrakt (status error,
// ingen tyst tom vy) bevisas utan att mocka import.meta eller en riktig klient.

import type { DataSource } from '../data';

/** Standard-felmeddelandet som de delade fel-vägs-testerna matchar mot. */
export const FAILING_SOURCE_MESSAGE = 'Simulerat datakälle-fel (test): kunde inte nå servern.';

/**
 * Skapa en DataSource vars getTeams/getGroups/getMatches alla rejectar.
 * @param message  felmeddelandet (default FAILING_SOURCE_MESSAGE).
 */
export function createFailingDataSource(message: string = FAILING_SOURCE_MESSAGE): DataSource {
  const reject = () => Promise.reject(new Error(message));
  return {
    getTeams: reject,
    getGroups: reject,
    getMatches: reject,
  };
}
