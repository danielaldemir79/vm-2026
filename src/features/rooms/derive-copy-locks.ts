// Härled LÅS-mängderna för en tips-kopiering (T52, #91): vilka av MINA käll-tips är
// LÅSTA just nu och ska därför hoppas över utan skrivförsök (copy-predictions regel 2).
//
// Ren funktion, ingen React, inget I/O: tar de tre kategoriernas käll-tips + en
// match_id -> avspark-karta (ur matchplanen) och returnerar en CopyLockSets.
//
// EN SANNING FÖR DEADLINE-ANKARET (gissas inte, källåkrat mot RLS-migrationerna):
//   * MATCH-tips    -> matchens egen avspark (match_id). RAW (oförlängd).
//   * GRUPP-tips     -> GREATEST(gruppens FÖRSTA match g-X-1, fasta söndagstiden 14/6
//                       21:59Z), via groupFirstMatchId + applyExtendedDeadline, samma
//                       som RLS-helpern group_deadline_kickoff (T53-förlängningen).
//   * BRACKET-tips   -> slottens egen avspark (M73..M104) RAW, och 'champion' ->
//                       GREATEST(g-A-1, fasta söndagstiden), via bracketDeadlineMatchId
//                       + applyExtendedDeadline, samma som RLS bracket_deadline_kickoff.
// T53 (#95): grupp- + champion-deadlinen förlängdes till söndag 14/6 (FÖRLÄNG, FÖRKORTA
// ALDRIG: en sen grupp behåller sitt senare ankare). match-tips + bracket-SLOTS är
// OFÖRÄNDRADE (egna avsparks-lås). Lås-pre-klassificeringen MÅSTE följa samma förlängning
// som RLS, annars skulle copy hoppa över ett grupp/champion-item som servern faktiskt
// tillåter (falskt "låst") , därav applyExtendedDeadline på grupp/champion-grenen nedan.
// LÅST = den HÄRLEDDA deadlinen passerad (now >= deadline). Servern (RLS) är det riktiga
// låset; detta pre-klassificerar bara så kopieringen kan rapportera ärligt VARFÖR ett
// item hoppades, i stället för att tolka ett tvetydigt RLS-fel (42501-feltexten är
// densamma för lås som för andra avslag). Källåkring: docs/decisions.md T52 + T53.
//
// FAIL-SAFE: en nyckel vars ankar-match saknas i kartan (oväntat, matchplanen är
// källåkrad) behandlas som LÅST, samma håll som vyernas och RLS:ens NULL-deadline-
// fail-safe (vi erbjuder aldrig en kopiering vi inte kan deadline-bevaka).

import {
  isMatchLocked,
  bracketDeadlineMatchId,
  applyExtendedDeadline,
  CHAMPION_SLOT_ID,
} from '../../data/predictions';
import { groupFirstMatchId } from '../group-predictions/group-predictable-data';
import type { CopyLockSets } from '../../data/predictions/copy-predictions';
import type { GroupId } from '../../domain/types';

/** Minimal vy av ett källtips per kategori (bara nyckeln behövs för lås-koll). */
export interface CopyLockSource {
  matchKeys: readonly string[];
  groupKeys: readonly string[];
  bracketKeys: readonly string[];
}

/** Slå upp ankar-matchens RÅA avspark (ISO) ur kartan, eller null om den saknas. */
function rawKickoffOf(
  anchorId: string,
  kickoffByMatchId: ReadonlyMap<string, string>
): string | null {
  return kickoffByMatchId.get(anchorId) ?? null;
}

/**
 * Är en RESOLVED deadline (rå avspark ELLER T53-förlängd) passerad mot `now`?
 * null-deadline (saknad ankar-match) -> behandlas som LÅST (fail-safe, samma riktning
 * som vyerna/RLS: vi erbjuder aldrig en kopiering vi inte kan deadline-bevaka).
 */
function deadlineLocked(deadlineIso: string | null, now: Date): boolean {
  if (deadlineIso === null) {
    return true;
  }
  return isMatchLocked(deadlineIso, now);
}

/**
 * Bygg lås-mängderna för en kopiering ur källans tips-nycklar + matchplanens
 * avsparkstider. Bara LÅSTA nycklar hamnar i mängderna (olåsta utelämnas, de ska
 * kopieras). Återanvänder isMatchLocked / groupFirstMatchId / bracketDeadlineMatchId
 * så deadline-ankaret är EN sanning, delad med tips-vyerna och RLS-helpers.
 *
 * @param source           källans tips-nycklar per kategori.
 * @param kickoffByMatchId match_id -> avspark (ISO), ur matchplanen (WC2026_MATCHES).
 * @param now              nuet (default new Date()), injicerbart för test/determinism.
 */
export function deriveCopyLocks(
  source: CopyLockSource,
  kickoffByMatchId: ReadonlyMap<string, string>,
  now: Date = new Date()
): CopyLockSets {
  // MATCH-tips: RÅ avspark (oförlängd, T53 rör inte match-tips).
  const matchKeys = new Set(
    source.matchKeys.filter((matchId) =>
      deadlineLocked(rawKickoffOf(matchId, kickoffByMatchId), now)
    )
  );
  // GRUPP-tips: GREATEST(g-X-1, fasta söndagstiden), T53-förlängningen (en sanning med
  // RLS group_deadline_kickoff). applyExtendedDeadline bevarar null-fail-safen.
  const groupKeys = new Set(
    source.groupKeys.filter((groupId) =>
      deadlineLocked(
        applyExtendedDeadline(
          rawKickoffOf(groupFirstMatchId(groupId as GroupId), kickoffByMatchId)
        ),
        now
      )
    )
  );
  // BRACKET-tips: 'champion' -> GREATEST(g-A-1, fasta tiden) förlängt; SLOTS (M73..M104)
  // -> RÅ avspark (oförändrade). bracketDeadlineMatchId ger ankaret (champion -> g-A-1),
  // applyExtendedDeadline förlänger BARA om ankaret ligger före fasta tiden , en slot-
  // avspark (sen) påverkas inte (GREATEST behåller den), exakt som RLS-slot-grenen.
  const bracketKeys = new Set(
    source.bracketKeys.filter((slotId) => {
      const rawAnchor = rawKickoffOf(bracketDeadlineMatchId(slotId), kickoffByMatchId);
      // Bara champion-tipset förlängs; en match-slots egna (sena) avspark behålls av
      // GREATEST. Vi applicerar därför förlängningen BARA på champion, slot raw.
      const deadline = slotId === CHAMPION_SLOT_ID ? applyExtendedDeadline(rawAnchor) : rawAnchor;
      return deadlineLocked(deadline, now);
    })
  );
  return { matchKeys, groupKeys, bracketKeys };
}
