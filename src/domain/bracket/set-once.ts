// Fail-loud Map-insättning för KRITISK strukturdata (PRINCIPLES §8).
//
// Slutspelsträdet och Annexe C-tabellen är källhänvisad FIFA-data där en
// dubblett-nyckel ALDRIG är en giltig uppdatering, den betyder ett schemafel
// (t.ex. samma match-winner-källa refererad från fler än en slot, eller två
// Annexe C-rader som kollapsar till samma grupp-kombination). En tyst
// `Map.set(...)`-överskrivning skulle då ge ett "giltigt" men FELKOPPLAT träd /
// fel uppslag, just den fel-klass kritisk strukturdata aldrig får drabbas av.
// `setOnce` kastar i stället, så felet syns vid källan i bygget/testet.

/**
 * Sätter en nyckel i en Map och KASTAR om nyckeln redan finns, i stället för att
 * tyst skriva över. `label` beskriver vad nyckeln representerar så felmeddelandet
 * pekar tillbaka på källan (vilken struktur som har dubbletten).
 *
 * @throws  Error om `key` redan finns i `map`.
 */
export function setOnce<K, V>(map: Map<K, V>, key: K, value: V, label: string): void {
  if (map.has(key)) {
    throw new Error(
      `Dubblett-mappning för ${label} "${String(key)}": nyckeln finns redan. ` +
        `Detta tyder på ett schemafel i den källhänvisade strukturdatan ` +
        `(samma nyckel härleds från fler än en källa).`
    );
  }
  map.set(key, value);
}
