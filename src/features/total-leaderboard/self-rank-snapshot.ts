// EGEN RANK-FÖRÄNDRING ("din förändring") för den globala topplistan (T92 del C, Daniels
// feedback 2026-06-16: "TOPP 10 + DIN placering + DIN FÖRÄNDRING").
//
// ============================================================================
// DATA-BESLUT (dokumenterat i docs/decisions.md T92 del C)
// ============================================================================
// PROBLEM: appen har INGEN rank-historik (varken DB-snapshot eller en "senaste avgjorda
// omgång"-tabell). Att bygga server-side rank-historik för EN indikator vore för tungt
// (ny tabell + skrivväg + cron) , inte värt det (PRINCIPLES §0 lean, §11 minimera).
//
// VALD APPROACH (renaste pragmatiska, KISS): "SEDAN DITT SENASTE BESÖK", per device, via
// localStorage. Vi sparar den inloggades SENAST VISADE globala rank per device. Vid nästa
// besök jämför vi nuvarande rank mot den sparade => en delta (▲ klättrat / ▼ tappat / oförändrad),
// sen UPPDATERAR vi snapshoten till nuvarande rank.
//   - FÖRSTA besöket (ingen sparad rank): ingen förändring visas (vi har inget att jämföra
//     mot, och vi gissar ALDRIG en rörelse). 'new' signalerar "första gången".
//   - PER DEVICE, inte per konto: det är en localStorage-flagga, så den speglar "sedan DU
//     senast hade appen öppen HÄR". En ärlig avgränsning (samma device-scope som tema/
//     onboarding-flaggorna), dokumenterad, inte en låtsad cross-device-sanning.
//   - RANK (inte poäng): Daniel bad om "förändring" = rank-RÖRELSE (▲▼), så vi mäter rank.
//     Lägre rank-siffra = bättre, så delta = sparad - nuvarande (positivt = klättrat UPP).
//
// Snapshoten är keyad på userId, så två konton på samma device inte blandar ihop sina rörelser.

import { readStoredString, writeStoredString } from '../../lib/safe-storage';

/** localStorage-nyckel (samma `vm2026-`-prefix som övriga flaggor, EN sanning för stavningen). */
export const SELF_RANK_SNAPSHOT_KEY = 'vm2026-total-rank-snapshot';

/**
 * Förändrings-utfallet för den egna globala raden.
 *   - 'new'        : första besöket (ingen sparad rank att jämföra mot) , ingen pil visas.
 *   - 'up'/'down'  : rank rörde sig sedan senaste besök (delta = antal platser, positivt tal).
 *   - 'same'       : samma rank som senast.
 */
export type RankChangeDirection = 'new' | 'up' | 'down' | 'same';

export interface SelfRankChange {
  direction: RankChangeDirection;
  /** Antal platser rörelsen var (>= 1 för up/down, 0 för same/new). Alltid positivt. */
  delta: number;
}

/** Det sparade snapshotet (per userId), serialiserat i localStorage. */
interface RankSnapshot {
  userId: string;
  rank: number;
}

/**
 * Läs det sparade snapshotet. null om inget sparat, om JSON är korrupt, eller om det inte
 * gäller den AKTUELLA användaren (annan inloggning på samma device) , vi jämför aldrig mot
 * en annan persons rank (det vore en falsk rörelse). Korrupt/föråldrat värde tolkas som
 * "inget snapshot", aldrig som en krasch (fail-safe läsning).
 */
function readSnapshot(currentUserId: string): RankSnapshot | null {
  const raw = readStoredString(SELF_RANK_SNAPSHOT_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<RankSnapshot>;
    if (
      typeof parsed.userId !== 'string' ||
      typeof parsed.rank !== 'number' ||
      !Number.isFinite(parsed.rank) ||
      parsed.userId !== currentUserId
    ) {
      return null;
    }
    return { userId: parsed.userId, rank: parsed.rank };
  } catch {
    // Korrupt JSON => behandla som inget snapshot (gissa aldrig en rörelse på skräpdata).
    return null;
  }
}

/** Beräkna förändringen mellan en sparad rank och den nuvarande (ren, testbar). */
export function computeRankChange(
  previousRank: number | null,
  currentRank: number
): SelfRankChange {
  if (previousRank === null) {
    return { direction: 'new', delta: 0 };
  }
  // Lägre rank-siffra = bättre placering. Klättrat UPP = nuvarande < sparad.
  if (currentRank < previousRank) {
    return { direction: 'up', delta: previousRank - currentRank };
  }
  if (currentRank > previousRank) {
    return { direction: 'down', delta: currentRank - previousRank };
  }
  return { direction: 'same', delta: 0 };
}

/**
 * Skriv det nuvarande snapshotet (per userId), så NÄSTA besök jämför mot DETTA. Skriv-fel
 * (privat läge/full kvot) sväljs av safe-storage (loggas, ej fatalt); förändringen visas
 * bara inte nästa gång. Ren biverkning, separerad så anroparen kan styra NÄR den sker.
 */
export function writeSelfRankSnapshot(currentUserId: string, currentRank: number): void {
  const snapshot: RankSnapshot = { userId: currentUserId, rank: currentRank };
  writeStoredString(SELF_RANK_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

/**
 * Läs den sparade rank:en för den aktuella användaren (för att beräkna förändringen), eller
 * null (inget jämförbart snapshot). Exporterad så vyn kan läsa-DÅ-skriva i rätt ordning
 * (läs gammal -> beräkna delta -> skriv ny) utan att den interna formen läcker.
 */
export function readSelfRankSnapshot(currentUserId: string): number | null {
  return readSnapshot(currentUserId)?.rank ?? null;
}
