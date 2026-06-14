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
// GISSA ALDRIG en mappning (PRINCIPLES + Daniels "gissa-aldrig"). Varje rad är
// VERIFIERAD mot riktig API-Football-data, inte mot minne eller dokumentation.
//
// KÄLLA (gissas ALDRIG, full 48/48-brygga, byggd för go-live, 2026-06-15):
//   API-Footballs national-team-id, framtagna via `teams?search=<lag>&national=true`
//   och matchade på FIFA-trebokstavskoden (appens lag-id = gemen FIFA-kod). 46 av 48
//   är CODE-matchade mot riktig API-data; cuw (Curaçao) + cod (DR Kongo) har en
//   API-kod-avvikelse men är ENTYDIGA (enda national-laget med det namnet, verifierat).
//   Se docs/decisions.md 2026-06-15.
//
// SYNK-ANSVAR: denna tabell speglas i `supabase/functions/_shared/livescore-core.ts`
// (API_TEAM_BRIDGE) för edge-pollaren (Deno kan inte importera src/). Ändras den ena
// MÅSTE den andra uppdateras likadant , de är medvetna kopior, inte två sanningar.

/**
 * Appens lag-id (gemen FIFA-kod) -> API-Football numeriskt team-id. Definieras
 * i denna riktning (app -> API) eftersom det är så källan togs fram (per appens
 * 48 lag), och så en oavsiktlig dubblett av samma app-id blir ett kompilerings-
 * /lint-fel i objekt-litteralen. Den omvända uppslagningen (API -> app) byggs en
 * gång nedan (API_ID_TO_APP_ID).
 */
const APP_ID_TO_API_ID: Readonly<Record<string, number>> = Object.freeze({
  mex: 16,
  rsa: 1531,
  kor: 17,
  cze: 770,
  can: 5529,
  bih: 1113,
  qat: 1569,
  sui: 15,
  bra: 6,
  mar: 31,
  hai: 2386,
  sco: 1108,
  usa: 2384,
  par: 2380,
  aus: 20,
  tur: 777,
  ger: 25,
  cuw: 5530, // API-kod-avvikelse men entydig: enda national-laget "Curaçao" (verifierat)
  civ: 1501,
  ecu: 2382,
  ned: 1118,
  jpn: 12,
  swe: 5,
  tun: 28,
  bel: 1,
  egy: 32,
  irn: 22,
  nzl: 4673,
  esp: 9,
  cpv: 1533,
  ksa: 23,
  uru: 7,
  fra: 2,
  sen: 13,
  irq: 1567,
  nor: 1090,
  arg: 26,
  alg: 1532,
  aut: 775,
  jor: 1548,
  por: 27,
  cod: 1508, // API-kod-avvikelse men entydig: enda national-laget "DR Kongo" (verifierat)
  uzb: 1568,
  col: 8,
  eng: 10,
  cro: 3,
  gha: 1504,
  pan: 11,
});

/**
 * API-Football numeriskt team-id -> appens lag-id (gemen FIFA-kod, Team.id). Härledd
 * EN gång ur APP_ID_TO_API_ID (en sanning, ingen handskriven dubblett som kan drifta).
 * Frozen: en källhänvisad tabell ska aldrig muteras efter konstruktion.
 */
export const WC2026_API_TEAM_BRIDGE: Readonly<Record<number, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(APP_ID_TO_API_ID).map(([appId, apiId]) => [apiId, appId])
  ) as Record<number, string>
);

/**
 * Slå upp ett appens lag-id ur ett API-Football team-id. Returnerar null när
 * bryggan inte känner laget (gissa ALDRIG en koppling). Med full 48/48-brygga
 * inträffar det bara för ett lag som inte är med i VM 2026 (t.ex. en testfixtur).
 * Anroparen (resolveAppMatch) tolkar null som "kan inte lösas".
 */
export function resolveAppTeamId(apiTeamId: number): string | null {
  return WC2026_API_TEAM_BRIDGE[apiTeamId] ?? null;
}

/**
 * Slå upp ett API-Football team-id ur appens lag-id (omvänd riktning). Returnerar
 * null för ett okänt app-lag-id. Används av auto-mappningen (fixture-map-resolver)
 * för att översätta appmatchens lag till API-id och matcha mot en live-fixture.
 */
export function resolveApiTeamId(appTeamId: string): number | null {
  return APP_ID_TO_API_ID[appTeamId] ?? null;
}
