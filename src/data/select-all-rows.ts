// selectAllRows , KLIENT/RPC-vägens tunna IO-wrapper runt selectAllPages (F1-fix 2026-06-24).
//
// VARFÖR: Supabase/PostgREST cap:ar tyst en .select() (och en RPC-SETOF) till ~1000 rader.
// Rummets topplista och admin-vyn läste tipsen RAKT (utan paginering), så ett rum med fler
// än 1000 tips poängsattes mot en AVKAPAD delmängd -> understrukna poäng OCH fel ordning
// (Daniels 24/6-rapport: samma person olika poäng i rum/admin/global). Den server-side globala
// topplistan paginerade redan (edge-funktionens selectAll). Den här wrappern ger klient-läsarna
// SAMMA skydd via SAMMA rena loop (selectAllPages), så det finns EN sanning för cap-skyddet.
//
// ANSVAR (tunt): ta en `fetchRange(from, to)` som anroparen bygger med en STABIL total ORDER BY
// (tabellens/RPC:ns PK) + `{ count: 'exact' }`, mappa Supabase-svaret ({ data, error, count })
// till selectAllPages-formen ({ rows, total }), och fail-loud:a ett Supabase-fel med begriplig
// svensk text. Completeness-/sid-gräns-logiken (och dess fail-loud) ÄRVS från selectAllPages.

import { selectAllPages } from './select-all-pages';

/**
 * Ett Supabase range-svar (det en `.range()`-query eller en RPC med `{ count: 'exact' }`
 * resolvar till). Strukturellt en delmängd av PostgrestResponse, så både en
 * PostgrestFilterBuilder (tabell) och en rpc()-builder är tilldelningsbara.
 */
export interface RangeResponse<Row> {
  data: Row[] | null;
  error: { message: string } | null;
  count: number | null;
}

/**
 * Läs ALLA rader ur en Supabase-källa, sidindelat, förbi den tysta ~1000-rad-cap:en.
 *
 * Anroparen MÅSTE i `fetchRange` applicera en STABIL, totalordnande ORDER BY (PK) och be om
 * `{ count: 'exact' }`, annars är completeness-vakten blind och sid-gränsen odefinierad (se
 * selectAllPages-headern). Wrappern äger BARA fel-mappningen + count/data-vidarekopplingen.
 *
 * @param label       Operation-etikett för fel-/completeness-meddelanden (t.ex. 'tips').
 * @param fetchRange  Hämtar rad-intervallet [from, to] (inklusivt) med stabil order + exact count.
 * @returns           Alla rader i källans (totalordnade) ordning.
 * @throws            Ett begripligt svenskt fel vid Supabase-fel, eller selectAllPages
 *                    completeness-fel om hämtat antal != rapporterat count.
 */
export async function selectAllRows<Row>(
  label: string,
  fetchRange: (from: number, to: number) => PromiseLike<RangeResponse<Row>>
): Promise<Row[]> {
  return selectAllPages<Row>(async ({ from, to }) => {
    const { data, error, count } = await fetchRange(from, to);
    if (error) {
      throw new Error(`[VM2026] Hämta ${label} misslyckades: ${error.message}`);
    }
    return { rows: data ?? [], total: count ?? 0 };
  }, label);
}
