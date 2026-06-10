// Tillämpa ett simulerings-overlay på den riktiga matchlistan (REN funktion).
//
// KÄRN-IDÉN (T12, what-if-sandbox): what-if-läget skriver ALDRIG till den
// riktiga datan. I stället håller storen ett OVERLAY, en Map<matchId, Match>
// med hypotetiska matcher, och de härledda vyerna (tabell, slutspelsträd,
// "Vad krävs") läser EFFEKTIVA matcher = riktiga matcher MED overlay applicerat.
// Är overlayn tom är de effektiva matcherna identiska med de riktiga, så att
// stänga av/återställa simuleringen = tömma overlayn (SPEC §6, härledd state).
//
// VARFÖR en ren modul (inte logik inne i providern): state-transitionen
// (riktig lista + overlay -> effektiv lista) är en ren funktion, React-fri och
// fristående testbar, exakt som applyMatchResult är skrivlagret för den riktiga
// datan. Providern äger I/O + React-state; denna modul äger sammanvävningen.
//
// ISOLERINGS-GARANTIN bevisas av att funktionen tar `realMatches` som
// `readonly` och ALDRIG muterar den: den bygger en NY array. Den riktiga
// matchlistan i storen rörs alltså aldrig av ett simulerings-resultat.

import type { Match } from '../../domain/types';

/**
 * Overlay-formen: en hypotetisk Match per matchId. Vi lagrar HELA den
 * (hypotetiskt) uppdaterade matchen (inte bara resultatet), så samma
 * applyMatchResult-reducer som den riktiga datan kan producera overlay-värdet
 * med rätt diskriminerad form (en sanning för "hur ett inmatat resultat ser ut").
 */
export type SimulationOverlay = ReadonlyMap<string, Match>;

/** En tom, delad overlay-instans (referens-stabil), för "ingen simulering". */
export const EMPTY_OVERLAY: SimulationOverlay = new Map();

/**
 * Väv samman de riktiga matcherna med overlayn till EFFEKTIVA matcher.
 *
 * - Tom overlay -> en kopia av de riktiga matcherna (oförändrade värden), så
 *   konsumenterna alltid får en array av samma form oavsett läge.
 * - För varje match som finns i overlayn används den HYPOTETISKA matchen i
 *   stället (overlay har företräde i sim-läge, se blanda-fallet i decisions.md
 *   T12): ett riktigt resultat som råkar finnas på samma match göms tills
 *   overlayn töms (= simuleringen återställs).
 * - Ordningen bevaras (samma index som realMatches), så vyer som förlitar sig på
 *   matchordning (slutspelsträdets M73->M104-propagering) ser samma ordning.
 *
 * BLANDA-FALLET (riktiga + hypotetiska samtidigt): matcher UTAN overlay-post
 * behåller sina RIKTIGA värden, matcher MED overlay-post visar det hypotetiska.
 * Så en tabell härledd ur den effektiva listan blandar riktiga och hypotetiska
 * resultat korrekt, utan att den riktiga datan ändras.
 *
 * FAIL LOUD (PRINCIPLES §8): en overlay-nyckel som inte motsvarar någon riktig
 * match är ett programmeringsfel (overlayn ska bara bära id:n som finns i
 * matchlistan). Vi kastar i stället för att tyst tappa den hypotetiska matchen,
 * så ett trasigt skriv-flöde upptäcks direkt i stället för att ge en effektiv
 * lista som tyst saknar ett resultat användaren matat in.
 *
 * @param realMatches De riktiga matcherna (rörs ALDRIG, readonly).
 * @param overlay     De hypotetiska matcherna per id (tom = ingen simulering).
 * @returns           En NY array med effektiva matcher (riktig ELLER hypotetisk per id).
 */
export function applySimulationOverlay(
  realMatches: readonly Match[],
  overlay: SimulationOverlay
): Match[] {
  if (overlay.size === 0) {
    // Ingen simulering: returnera en grund-kopia (ny array, samma element-referenser).
    return realMatches.slice();
  }

  const realIds = new Set(realMatches.map((m) => m.id));
  for (const overlayId of overlay.keys()) {
    if (!realIds.has(overlayId)) {
      throw new Error(
        `applySimulationOverlay: overlay-nyckeln "${overlayId}" matchar ingen riktig match. ` +
          'Overlayn får bara bära id:n som finns i matchlistan (programmeringsfel).'
      );
    }
  }

  return realMatches.map((real) => overlay.get(real.id) ?? real);
}
