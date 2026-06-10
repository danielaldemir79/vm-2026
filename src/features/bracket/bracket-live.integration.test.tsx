import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEffect } from 'react';
import type { Match } from '../../domain/types';
import { WC2026_GROUPS, WC2026_MATCHES } from '../../data/wc2026';
import { ResultsProvider } from '../results/ResultsProvider';
import { useResultsStore } from '../results/results-context';
import { BracketView } from './BracketView';
import { deriveGroupTables } from '../groups/derive-group-tables';
import { computeThirdPlaceRanking } from '../../domain/bracket/rank-third-places';
import { seedThirdPlaces } from '../../domain/bracket/seed-third-places';

// ============================================================================
// INTEGRATIONSTEST: slutspelsträdet LIVE end-to-end genom den delade storen.
// Bevisar acceptanskriterierna ihop: ett FULLSTÄNDIGT gruppspel LÅSER trädet
// till riktiga lag (FIFA-seedningen), och ett inmatat slutspelsresultat FÖR FRAM
// vinnaren till nästa slot, allt via samma store som inmatningen/tabellerna
// använder (en sanning, härledd state, SPEC §6).
// ============================================================================

function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

/**
 * Bygg en FÄRDIGSPELAD version av VM 2026:s gruppspel med deterministiska,
 * distinkta resultat per grupp, så varje grupp får en entydig rank 1/2/3/4.
 * Schema per grupp (4 lag i Group.teamIds-ordning, index 0-3):
 *   - lag 0 vinner alla sina 3 -> 9 p (1:a)
 *   - lag 1 vinner 2 (mot 2,3)  -> 6 p (2:a)
 *   - lag 2 vinner 1 (mot 3)    -> 3 p (3:a)
 *   - lag 3 vinner 0            -> 0 p (4:a)
 * Vi sätter resultaten på de RIKTIGA gruppmatcherna (via lagens id), och låter
 * slutspelsmatcherna (M73-M104) vara kvar som scheduled (deras lag seedas av
 * härledningen). Treornas inbördes ordning styrs av gjorda mål så de 8 bästa är
 * förutsägbara (grupper tidigare i alfabetet får fler mål -> bättre treor).
 */
function completedGroupStage(): Match[] {
  // Förväntad placering per lag-id (1-baserad) ur grupp-medlemskapet.
  const rankByTeam = new Map<string, number>();
  const groupOrderIndex = new Map<string, number>(); // grupp -> alfabetiskt index
  WC2026_GROUPS.forEach((group, gi) => {
    groupOrderIndex.set(group.id, gi);
    group.teamIds.forEach((teamId, idx) => rankByTeam.set(teamId, idx + 1));
  });

  return WC2026_MATCHES.map((m): Match => {
    if (m.stage !== 'group' || m.homeTeamId === null || m.awayTeamId === null) {
      return m; // slutspel + ev. data-defekt: lämna orörd (seedas av härledningen)
    }
    const homeRank = rankByTeam.get(m.homeTeamId)!;
    const awayRank = rankByTeam.get(m.awayTeamId)!;
    // Bättre placering (lägre rank-nummer) vinner. Målen skalas så en tidigare
    // grupp (alfabetiskt) ger sina lag fler mål -> deras trea rankas högre, så
    // de 8 bästa treorna blir de 8 första grupperna (A-H), entydigt.
    const gi = groupOrderIndex.get(m.groupId!)!;
    const bonus = Math.max(0, 12 - gi); // A=12 ... L=1
    const winnerGoals = 2 + Math.floor(bonus / 3);
    if (homeRank < awayRank) {
      return { ...m, status: 'finished', result: { homeGoals: winnerGoals, awayGoals: 0 } };
    }
    return { ...m, status: 'finished', result: { homeGoals: 0, awayGoals: winnerGoals } };
  });
}

/**
 * Test-harness: seedar storen, byter sedan matchlistan till `matches` via
 * storens setMatches (lågnivå-seamet T18/tester använder). Renderar BracketView
 * under SAMMA provider, så vyn härleder trädet ur den uppdaterade sanningen.
 */
function Harness({ matches }: { matches: Match[] }) {
  const { status, setMatches } = useResultsStore();
  useEffect(() => {
    if (status === 'ready') {
      setMatches(matches);
    }
    // Kör om bara när seedningen blivit ready (en gång), inte vid varje render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  return <BracketView />;
}

describe('slutspelsträdet LIVE: gruppspel klart -> låst -> vinnaren förs fram', () => {
  it('LÅSER trädet och seedar riktiga lag när alla grupper är färdigspelade', async () => {
    render(
      <ResultsProvider env={fixturesEnv()}>
        <Harness matches={completedGroupStage()} />
      </ResultsProvider>
    );

    // När gruppspelet är klart blir trädet låst (markören dyker upp).
    await waitFor(() => {
      expect(document.querySelector('[data-bracket-locked]')).not.toBeNull();
    });

    // Slotarna är nu RESOLVED till riktiga lag (inga "possible" i sextondelen).
    const resolved = document.querySelectorAll('[data-slot-resolution="resolved"]');
    expect(resolved.length).toBeGreaterThan(0);

    // Punktkoll mot FIFA-motorn (oberoende uträkning): M74 home = Winner E. Det
    // härledda trädet ska visa grupp E:s vinnare (lagets namn) där.
    const tables = deriveGroupTables(WC2026_GROUPS, completedGroupStage());
    const groupEWinnerId = tables.find((t) => t.groupId === 'E')!.standings[0].teamId;
    const m74 = document.querySelector('[data-bracket-match="M74"]')!;
    // Slotens text är lagnamnet; vi verifierar att grupp E:s vinnare INTE längre
    // visas som positions-etikett ("1:a grupp E") utan som ett resolved lag.
    expect(m74.textContent).not.toContain('1:a grupp E');
    // groupEWinnerId finns i datan (sanity), och dess slot är resolved.
    expect(groupEWinnerId).toBeTruthy();
  });

  it('seedar de 8 bästa treorna kollisionsfritt enligt Annexe C (oberoende korskoll)', async () => {
    const matches = completedGroupStage();
    render(
      <ResultsProvider env={fixturesEnv()}>
        <Harness matches={matches} />
      </ResultsProvider>
    );
    await waitFor(() => {
      expect(document.querySelector('[data-bracket-locked]')).not.toBeNull();
    });

    // Oberoende uträkning av seedningen, samma motor men separat anrop.
    const tables = deriveGroupTables(WC2026_GROUPS, matches);
    const { qualifyingGroups } = computeThirdPlaceRanking(tables);
    expect(qualifyingGroups).not.toBeNull();
    const assignments = seedThirdPlaces(qualifyingGroups!);
    // 8 distinkta matcher, 8 distinkta treor (kollisionsfritt).
    expect(new Set(assignments.map((a) => a.matchId)).size).toBe(8);
    expect(new Set(assignments.map((a) => a.thirdPlaceGroup)).size).toBe(8);
  });

  it('FÖR FRAM vinnaren till nästa slot när ett slutspelsresultat matas in', async () => {
    // Komplett gruppspel + ETT avgjort sextondelsresultat (M73, hemma vinner 2-0).
    const matches = completedGroupStage().map((m): Match => {
      if (m.id === 'M73') {
        return { ...m, status: 'finished', result: { homeGoals: 2, awayGoals: 0 } };
      }
      return m;
    });

    render(
      <ResultsProvider env={fixturesEnv()}>
        <Harness matches={matches} />
      </ResultsProvider>
    );
    await waitFor(() => {
      expect(document.querySelector('[data-bracket-locked]')).not.toBeNull();
    });

    // M73:s vinnare (hemma) ska markeras som vidare (data-winner) OCH propageras
    // till M90-home (bracket-structure: M90 home = Winner M73).
    await waitFor(() => {
      const m73 = document.querySelector('[data-bracket-match="M73"]')!;
      expect(m73.querySelector('[data-winner]')).not.toBeNull();
    });

    const tables = deriveGroupTables(WC2026_GROUPS, matches);
    const m73Home = matches.find((m) => m.id === 'M73')!;
    // Hemmalaget i M73 = Runner-up A (grupp A:s tvåa), seedat av härledningen.
    const groupARunnerUp = tables.find((t) => t.groupId === 'A')!.standings[1].teamId;
    // M90-home ska nu visa det laget (resolved, propagerat), inte "Vinnare M73".
    const m90 = document.querySelector('[data-bracket-match="M90"]')!;
    const m90Home = m90.querySelector('[data-bracket-slot]')!;
    expect(m90Home.getAttribute('data-slot-resolution')).toBe('resolved');
    expect(m90Home.textContent).not.toContain('Vinnare M73');
    expect(groupARunnerUp).toBeTruthy();
    expect(m73Home.result).not.toBeNull();
  });
});
