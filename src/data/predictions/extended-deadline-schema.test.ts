import { describe, expect, it } from 'vitest';
import { POOL_EXTENDED_DEADLINE_ISO } from './prediction-deadline';
import { WC2026_MATCHES, WC2026_GROUPS } from '../wc2026';
import { groupFirstMatchId } from '../../features/group-predictions/group-predictable-data';

// T72 (#151): VAKTA att den platta pool-deadlinen faktiskt ÄR "omgång 1 spelad".
//
// Daniels regel (gissas inte, issue #151): grupp- + champion-tips låses när varje grupp
// har gått igenom sin första match. Den tidpunkten = MAX över de 12 gruppernas (A..L)
// första match-kickoff (g-X-1). Konstanten POOL_EXTENDED_DEADLINE_ISO är handskriven
// (2026-06-17T20:00:00Z), men den MÅSTE vara lika med den maxen, härledd ur den
// källåkrade matchplanen (WC2026_MATCHES). Det här testet HÄRLEDER maxen ur schemat och
// asserterar likhet, så en framtida schema-ändring (t.ex. om g-L-1 flyttas) fångas RÖTT
// i stället för att tyst drifta från den fasta konstanten. Samma anda som de andra
// källåkrings-låsen i repot (regenerera-och-diffa): bevisa att en gissningskänslig
// konstant matchar sin källa, inte bara att den ser rimlig ut.

describe('POOL_EXTENDED_DEADLINE_ISO härledd ur schemat (T72: omgång 1 spelad)', () => {
  it('== MAX(de 12 gruppernas första match-kickoff) ur WC2026_MATCHES', () => {
    const matchById = new Map(WC2026_MATCHES.map((m) => [m.id, m]));

    // Slå upp varje grupps FÖRSTA match (g-X-1) och fail-loud:a om en saknas, så testet
    // inte tyst räknar max över en ofullständig mängd (då skulle ett borttaget g-X-1
    // kunna sänka maxen utan att synas).
    const firstMatchKickoffs = WC2026_GROUPS.map((group) => {
      const firstMatch = matchById.get(groupFirstMatchId(group.id));
      if (!firstMatch) {
        throw new Error(`Saknar första match (g-${group.id}-1) i WC2026_MATCHES`);
      }
      return firstMatch.kickoff;
    });

    // Alla 12 grupper ska ha en första match (annars är schemat trasigt, inte testet).
    expect(firstMatchKickoffs).toHaveLength(12);

    // MAX (senaste) av de 12 första-match-kickofferna = när omgång 1 är i spel.
    const maxFirstMatchMs = Math.max(...firstMatchKickoffs.map((iso) => new Date(iso).getTime()));
    const maxFirstMatchIso = new Date(maxFirstMatchMs).toISOString();

    expect(maxFirstMatchIso).toBe(POOL_EXTENDED_DEADLINE_ISO);
  });
});
