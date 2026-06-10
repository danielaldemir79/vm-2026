// Härledning av en MEDLEMS-avatar ur visningsnamn + stabil identitet (REN modul).
//
// ANSVAR (en sak): ge medlemslistans chips två deterministiska byggstenar,
//   - INITIALER ur visningsnamnet (max 2 tecken, versaler), för en igenkännbar
//     monogram-bricka när vi inte har en riktig profilbild (anonym auth, T14),
//   - en HUE (0-359) ur den STABILA user-id:n, så samma person får samma färg i
//     varje rendering och på varje skärm (inte ur namnet: två "Daniel" ska kunna
//     skiljas åt på färgen, och ett namnbyte ska inte byta personens färg).
//
// DRY (PRINCIPLES §4): hue härleds med SAMMA stabila hash som lag-färgerna
// (team-hue.ts, hashCode/hueFromCode), inte en ny parallell hash. Att kopiera en
// deterministisk hash vore en tyst drift-risk (två kopior kan glida isär). Här
// matar vi bara hashen med user-id i stället för en landskod.
//
// KONTRAST: modulen ger bara TALET (hue) + initialerna. Själva färg-valet (och
// dess AA-säkring) bor i CSS-lagret (rooms.css), som klampar lightness så vit/
// mörk ink på brickan håller WCAG AA i BÅDA teman, oavsett hue (lessons
// aa-kontrast-pastad-pa-genererad-farg: mät värsta fallet över hela hue-spannet).

import { hashCode } from '../daily/team-hue';

/**
 * Initialer ur ett visningsnamn: första bokstaven i de (upp till) två första
 * orden, versaliserade. "Daniel Aldemir" -> "DA", "Bob" -> "B", "  " -> "?".
 *
 * VARFÖR fail-safe till "?": ett tomt/whitespace-namn ska aldrig ge en tom
 * bricka (som ser trasig ut), utan en neutral platshållare. Namn valideras
 * `required` i formuläret, men chip:en ska ändå vara robust om datan är skev.
 */
export function initialsFromName(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  const first = words[0]?.[0] ?? '';
  const second = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  const initials = (first + second).toUpperCase();
  return initials || '?';
}

/**
 * En stabil avatar-hue (0-359) ur en medlems user-id. Samma id -> samma färg,
 * alltid och överallt. Vi nyckar på id (inte namn) så identiteten, inte etiketten,
 * bär färgen. Återanvänder lag-färgernas hash (en sanning för "sträng -> hue").
 */
export function avatarHueFromId(userId: string): number {
  return hashCode(userId) % 360;
}
