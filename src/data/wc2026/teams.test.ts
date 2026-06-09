import { describe, expect, it } from 'vitest';
import { WC2026_GROUPS, WC2026_TEAMS } from './teams';
import { GROUP_IDS } from '../../domain/types';
import { computeStandings } from '../../domain/standings/compute-standings';

// Integritetstest för den VERIFIERADE lag-/gruppdatan (slutspelslottningen
// 2025-12-05). Fångar inmatningsfel (dubbel kod, fel antal, trasig referens)
// vid bygget, så den riktiga datan är en korrekt grund för motorn.

describe('VM 2026 lag-/gruppdata: struktur och antal', () => {
  it('har exakt 48 lag', () => {
    expect(WC2026_TEAMS).toHaveLength(48);
  });

  it('har exakt 12 grupper (A-L), 4 lag i varje', () => {
    expect(WC2026_GROUPS).toHaveLength(12);
    expect(WC2026_GROUPS.map((g) => g.id).sort()).toEqual([...GROUP_IDS].sort());
    for (const g of WC2026_GROUPS) {
      expect(g.teamIds, `grupp ${g.id}`).toHaveLength(4);
    }
  });

  it('grupperna kommer i EXPLICIT A-L-ordning (härledd ur GROUP_IDS, inte objekt-nyckelordning)', () => {
    // C7: ordningen ska vara den kanoniska GROUP_IDS-ordningen (A,B,...,L), inte
    // ett implicit beroende på hur TEAMS_BY_GROUP-objektet råkar ligga. Detta är
    // en ORDNINGS-känslig assertion (ingen sort), så drift mot nyckelordning fångas.
    expect(WC2026_GROUPS.map((g) => g.id)).toEqual([...GROUP_IDS]);
  });

  it('lag-listan följer samma A-L-gruppordning (grupp A:s 4 lag först, grupp L:s sist)', () => {
    // Lagens grupp-fält ska komma i icke-avtagande A-L-ordning: alla A före alla
    // B osv. Bevisar att WC2026_TEAMS härleds ur GROUP_IDS, inte nyckelordning.
    const groupSequence = WC2026_TEAMS.map((t) => t.group);
    const indexOfGroup = (g: (typeof GROUP_IDS)[number]) => GROUP_IDS.indexOf(g);
    for (let i = 1; i < groupSequence.length; i += 1) {
      expect(indexOfGroup(groupSequence[i])).toBeGreaterThanOrEqual(
        indexOfGroup(groupSequence[i - 1])
      );
    }
    // Första laget hör till grupp A, sista till grupp L.
    expect(groupSequence[0]).toBe('A');
    expect(groupSequence[groupSequence.length - 1]).toBe('L');
  });

  it('lag-id och landskoder är unika', () => {
    const ids = WC2026_TEAMS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const codes = WC2026_TEAMS.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('varje landskod är en giltig FIFA-trebokstavskod (3 versaler)', () => {
    for (const t of WC2026_TEAMS) {
      expect(t.code, t.name).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('varje lags group är ett giltigt grupp-id', () => {
    for (const t of WC2026_TEAMS) {
      expect(GROUP_IDS).toContain(t.group);
    }
  });
});

describe('VM 2026 lag-/gruppdata: referentiell integritet', () => {
  const byId = new Map(WC2026_TEAMS.map((t) => [t.id, t]));

  it('varje grupps teamIds pekar på lag som finns och tillhör gruppen', () => {
    for (const g of WC2026_GROUPS) {
      for (const id of g.teamIds) {
        const team = byId.get(id);
        expect(team, `lag ${id} i grupp ${g.id}`).toBeDefined();
        expect(team!.group).toBe(g.id);
      }
    }
  });

  it('varje lag förekommer i exakt en grupp', () => {
    const placements = WC2026_GROUPS.flatMap((g) => g.teamIds);
    expect(placements).toHaveLength(48);
    expect(new Set(placements).size).toBe(48);
  });

  it('spot-check mot verifierad lottning (Sverige i grupp F, Mexiko A1)', () => {
    const sweden = WC2026_TEAMS.find((t) => t.code === 'SWE');
    expect(sweden?.group).toBe('F');
    // Värdnation Mexiko på A1: först i grupp A:s positionsordning.
    expect(WC2026_GROUPS.find((g) => g.id === 'A')!.teamIds[0]).toBe('mex');
  });
});

describe('VM 2026 lag-/gruppdata: fungerar mot härledd-state-motorn', () => {
  it('en grupps lag går att beräkna till en (tom) tabell utan fel', () => {
    const groupF = WC2026_GROUPS.find((g) => g.id === 'F')!;
    const table = computeStandings(groupF.teamIds, []);
    expect(table).toHaveLength(4);
    // Inga matcher inmatade än -> alla noll, en rad per lag.
    for (const r of table) {
      expect(r.played).toBe(0);
    }
  });
});
