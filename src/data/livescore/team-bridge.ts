// Brygga mellan API-Footballs numeriska lag-id och appens egna lag-id (gemen
// FIFA-kod, t.ex. 'ned'/'jpn', se team-refs.ts). Match-identiteten (resolve-match.ts)
// behöver den för att veta att API-Footballs fixture verkligen är appens match.
//
// VARFÖR en explicit brygga och inte namn-matchning: lagnamn skiljer mellan källor
// ("Netherlands" vs "Nederländerna", "South Korea" vs "Sydkorea"), och en
// fuzzy namn-matchning är just den klass som tyst kan koppla fel lag. API-Footballs
// numeriska team-id är STABILA mellan säsonger (samma id i 2022- och 2026-svaren),
// så en id->kod-tabell är den säkra nyckeln.
//
// GISSA ALDRIG en mappning (PRINCIPLES + Daniels "gissa-aldrig"). Varje rad här är
// VERIFIERAD mot ett FÅNGAT API-svar (de committade __fixtures__/-filerna), inte
// mot minne eller dokumentation. Tabellen är därför MEDVETET OFULLSTÄNDIG i Bit 1:
// bara de lag vars API-id vi faktiskt sett seedas nu. Den fulla 48-lags-bryggan
// kompletteras före go-live (Bit 2 fyller på ur live=all-svaren under turneringen,
// där varje VM-lags API-id dyker upp verifierbart). resolveAppMatch är byggd för
// att INTE blockeras av en ofullständig brygga (returnerar 'unresolved' i stället).
//
// KÄLLOR (per rad, gissas ALDRIG):
//   - Nederländerna (1118) + Japan (12): __fixtures__/live-all.json, svar på
//     fixtures?league=1&live=all (VM 2026, Nederländerna-Japan), teams.home/away.id.
//   - England (10) + Iran (22): __fixtures__/events-rich.json + lineups-rich.json
//     + fixture-finished-ft.json (fixture 855735, England-Iran VM 2022), team.id.
//     Inkluderade eftersom appen har båda lagen (ENG grupp L, IRN grupp G) och
//     API-Footballs team-id är stabila mellan säsonger.

/**
 * API-Football numeriskt team-id -> appens lag-id (gemen FIFA-kod, Team.id).
 * Endast verifierade rader (se KÄLLOR ovan). Frozen: en statisk källhänvisad
 * tabell ska aldrig muteras efter konstruktion.
 */
export const WC2026_API_TEAM_BRIDGE: Readonly<Record<number, string>> = Object.freeze({
  1118: 'ned', // Nederländerna, ur live-all.json (fixtures?league=1&live=all)
  12: 'jpn', // Japan, ur live-all.json
  10: 'eng', // England, ur events-rich/lineups-rich/fixture-finished-ft (fixture 855735)
  22: 'irn', // Iran, ur events-rich/lineups-rich/fixture-finished-ft (fixture 855735)
});

/**
 * Slå upp ett appens lag-id ur ett API-Football team-id. Returnerar null när
 * bryggan inte (ännu) känner laget , medvetet INTE ett fel: en ofullständig
 * brygga ska inte blockera Bit 1 (se preambeln). Anroparen (resolveAppMatch)
 * tolkar null som "kan inte lösas än".
 */
export function resolveAppTeamId(apiTeamId: number): string | null {
  return WC2026_API_TEAM_BRIDGE[apiTeamId] ?? null;
}
