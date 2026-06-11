// Härled LÅS-mängderna för en tips-kopiering (T52, #91): vilka av MINA käll-tips är
// LÅSTA just nu och ska därför hoppas över utan skrivförsök (copy-predictions regel 2).
//
// Ren funktion, ingen React, inget I/O: tar de tre kategoriernas käll-tips + en
// match_id -> avspark-karta (ur matchplanen) och returnerar en CopyLockSets.
//
// EN SANNING FÖR DEADLINE-ANKARET (gissas inte, källåkrat mot RLS-migrationerna):
//   * MATCH-tips    -> matchens egen avspark (match_id).
//   * GRUPP-tips     -> gruppens FÖRSTA match (g-X-1), via groupFirstMatchId, samma
//                       ankare som RLS-helpern group_deadline_kickoff.
//   * BRACKET-tips   -> slottens egen avspark (M73..M104), och 'champion' -> g-A-1,
//                       via bracketDeadlineMatchId, samma ankare som RLS-helpern
//                       bracket_deadline_kickoff.
// LÅST = avsparken passerad (now >= kickoff), exakt isMatchLocked (klient-sidans
// visnings-lås som hela tips-UI:t redan använder). Servern (RLS) är det riktiga
// låset; detta pre-klassificerar bara så kopieringen kan rapportera ärligt VARFÖR ett
// item hoppades, i stället för att tolka ett tvetydigt RLS-fel (42501-feltexten är
// densamma för lås som för andra avslag). Källåkring: docs/decisions.md T52.
//
// FAIL-SAFE: en nyckel vars ankar-match saknas i kartan (oväntat, matchplanen är
// källåkrad) behandlas som LÅST, samma håll som vyernas och RLS:ens NULL-deadline-
// fail-safe (vi erbjuder aldrig en kopiering vi inte kan deadline-bevaka).

import { isMatchLocked, bracketDeadlineMatchId } from '../../data/predictions';
import { groupFirstMatchId } from '../group-predictions/group-predictable-data';
import type { CopyLockSets } from '../../data/predictions/copy-predictions';
import type { GroupId } from '../../domain/types';

/** Minimal vy av ett källtips per kategori (bara nyckeln behövs för lås-koll). */
export interface CopyLockSource {
  matchKeys: readonly string[];
  groupKeys: readonly string[];
  bracketKeys: readonly string[];
}

/** Är ankar-matchen `anchorId` låst (avspark passerad) givet kickoff-kartan + now? */
function anchorLocked(
  anchorId: string,
  kickoffByMatchId: ReadonlyMap<string, string>,
  now: Date
): boolean {
  const kickoff = kickoffByMatchId.get(anchorId);
  // Saknad avspark -> behandla som LÅST (fail-safe, samma riktning som vyerna/RLS).
  if (kickoff === undefined) {
    return true;
  }
  return isMatchLocked(kickoff, now);
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
  const matchKeys = new Set(
    source.matchKeys.filter((matchId) => anchorLocked(matchId, kickoffByMatchId, now))
  );
  const groupKeys = new Set(
    source.groupKeys.filter((groupId) =>
      anchorLocked(groupFirstMatchId(groupId as GroupId), kickoffByMatchId, now)
    )
  );
  const bracketKeys = new Set(
    source.bracketKeys.filter((slotId) =>
      anchorLocked(bracketDeadlineMatchId(slotId), kickoffByMatchId, now)
    )
  );
  return { matchKeys, groupKeys, bracketKeys };
}
