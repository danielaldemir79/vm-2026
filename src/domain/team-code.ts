// EN sanning för lag-IDENTITETEN "FIFA-code" som ett TYPAT kontrakt (T16b/C1+C2).
//
// BAKGRUND (varför denna fil finns): domänen bär TVÅ stabila identiteter för samma
// lag, och de är LÄTTA att förväxla:
//   - Team.code = VERSAL FIFA-kod  ("BRA", DB-constraint ^[A-Z]{3}$). Detta är vad
//     pool-tipsen LAGRAS som (UI-option value=code -> API -> DB).
//   - Team.id   = GEMEN kod        ("bra", teamId(code)=code.toLowerCase()). Detta är
//     vad det HÄRLEDDA facit bär (computeStandings.teamId, deriveBracket.winnerTeamId).
//
// Tips-API:ts fält heter `winnerTeamId`/`runnerUpTeamId`/`advancingTeamId` (speglar
// DB-kolumnerna `*_team_id`), MEN de bär faktiskt Team.CODE, inte Team.id. Namnen
// LJUGER, och en framtida konsument (T16b/T17) som skickar ett rått Team.id i tron
// att fältet vill ha ett "team id" får TYST fel poäng (samma rot som F1, se
// docs/decisions.md T16). Eftersom DB-kolumnerna inte ska döpas om (ingen migration)
// låser vi i stället identiteten vid TYP-nivå: fälten typas som `TeamCode`, så att
// skicka en rå sträng (t.ex. ett gemen Team.id) blir ett KOMPILERINGSFEL, inte en
// tyst körnings-bugg.
//
// Detta KOMPLETTERAR (ersätter inte) F1:s runtime-normalisering i bonus-score:
// branded typ stoppar felet vid kompilering på write-/API-ytan, normaliseringen är
// defense-in-depth om en otypad sträng ändå slinker in via en seam (poäng-funktionerna
// behåller därför medvetet `string` + normalisering, se bonus-score.ts).

/**
 * En VALIDERAD VM-lag-code: VERSAL FIFA-trebokstavskod ("BRA", "SWE"). En s.k.
 * "branded type": i grunden en `string`, men märkt så att en VANLIG sträng (eller
 * ett gemen Team.id) INTE går att tilldela ett `TeamCode`-fält utan att passera
 * `teamCode()`/`asTeamCode()`. Märket finns bara i typsystemet (ingen runtime-kostnad,
 * `__brand` existerar aldrig som ett verkligt fält).
 */
export type TeamCode = string & { readonly __brand: 'TeamCode' };

/**
 * Formen en giltig FIFA-code måste ha. SPEGLAR DB-constrainten EXAKT
 * (`^[A-Z]{3}$` på group_predictions/bracket_predictions, se migrationerna +
 * docs/decisions.md T16). EN sanning för formen, så klient och DB inte driftar.
 */
export const TEAM_CODE_PATTERN = /^[A-Z]{3}$/;

/**
 * Branda en sträng till `TeamCode` med VALIDERING (fail loud, PRINCIPLES §8). Använd
 * vid varje UI-/extern gräns där en otrygg sträng ska bli en lag-code (t.ex. ett
 * formulärs valda lag). Kastar med begriplig svensk text om strängen inte är en
 * versal trebokstavskod, så ett felaktigt värde SYNS i stället för att tyst ge 0 poäng.
 *
 * @throws Error om `value` inte matchar `^[A-Z]{3}$` (gemen id, fel längd, icke-bokstav).
 */
export function teamCode(value: string): TeamCode {
  if (!TEAM_CODE_PATTERN.test(value)) {
    throw new Error(
      `[VM2026] Ogiltig lag-code "${value}": måste vara en versal FIFA-trebokstavskod (^[A-Z]{3}$, t.ex. "BRA").`
    );
  }
  return value as TeamCode;
}

/**
 * Branda en sträng till `TeamCode` UTAN runtime-validering (ren typ-cast). Bara för
 * BETRODDA gränser där formen redan garanteras av en annan invariant, framför allt
 * projektionen av en DB-rad (DB-constrainten `^[A-Z]{3}$` har redan validerat värdet
 * på write, så en re-validering på read vore redundant). Använd ALDRIG på otrygg
 * input, då gäller `teamCode()`.
 */
export function asTeamCode(value: string): TeamCode {
  return value as TeamCode;
}
