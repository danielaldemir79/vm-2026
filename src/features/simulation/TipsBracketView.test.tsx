// Tester för den simulerade slutspels-vyn (T51, #88).
//
// Vaktar de UI-invarianter som issue #88 kräver:
//   - tomt tips -> en uppmaning, inget skelett-träd,
//   - tippade möten syns med lagnamn i sextondelen (Daniels kärnvärde),
//   - bästa-trea-slots visas ÖPPNA (märkta "Öppen"), aldrig ett gissat lagnamn,
//   - vyn är TYDLIGT märkt som SIMULERING (inte facit),
//   - senare rundor visas strukturellt ("Vinnare M73").
//
// Vi injicerar `data` (TipsBracketViewProps.data) så vyn testas deterministiskt
// utan provider/Supabase, exakt det seamen finns till för.

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { Team } from '../../domain/types';
import { WC2026_TEAM_BASES } from '../../data/wc2026/team-refs';
import { deriveTipsBracket, type GroupTipPick } from './derive-tips-bracket';
import type { TipsThirdSeeding } from './derive-tips-thirds';
import { TipsBracketView } from './TipsBracketView';
import type { TipsBracketData } from './use-tips-bracket-data';

const TEAMS: Team[] = WC2026_TEAM_BASES.map((b) => ({
  id: b.id,
  name: b.name,
  code: b.code,
  group: b.group,
}));

/** Bygg injicerbar vy-data ur ett tips (samma motor som produktion). */
function dataFrom(
  picks: Map<string, GroupTipPick>,
  thirdSeeding?: TipsThirdSeeding
): TipsBracketData {
  return { bracket: deriveTipsBracket(picks, TEAMS, thirdSeeding), teams: TEAMS, ready: true };
}

describe('TipsBracketView, tomt läge', () => {
  it('visar en uppmaning (inget skelett-träd) när inga grupper är tippade', () => {
    render(<TipsBracketView data={dataFrom(new Map())} />);
    expect(screen.getByText(/tippa minst en grupp/i)).toBeInTheDocument();
    // Inget träd renderas (inga runda-kolumner).
    expect(document.querySelector('[data-bracket-round]')).toBeNull();
  });
});

describe('TipsBracketView, under laddning (ej ready)', () => {
  it('visar INTE tomläges-uppmaningen medan datan laddar (bracket null, ready false)', () => {
    // Under laddning vet vi ännu inte om något är tippat (bracket är null både
    // "laddar" och "tomt tips"). Tomtexten får ALDRIG blinka fram då (T51-fynd):
    // ej ready -> ingen tomläges-text, ingen tomläges-sektion, inget träd.
    const loadingData: TipsBracketData = { bracket: null, teams: TEAMS, ready: false };
    render(<TipsBracketView data={loadingData} />);
    expect(screen.queryByText(/tippa minst en grupp/i)).toBeNull();
    expect(document.querySelector('[data-tips-bracket-empty]')).toBeNull();
    expect(document.querySelector('[data-bracket-round]')).toBeNull();
  });

  it('visar tomläges-uppmaningen så snart datan är klar men inget är tippat', () => {
    // Kontroll-fall: när datan ÄR ready och tipset är tomt SKA uppmaningen synas
    // (gaten gäller bara laddning, inte det äkta tomma läget).
    render(<TipsBracketView data={dataFrom(new Map())} />);
    expect(screen.getByText(/tippa minst en grupp/i)).toBeInTheDocument();
  });
});

describe('TipsBracketView, märkning som simulering', () => {
  it('bär ett tydligt "Simulering"-märke och förklarar att det inte är facit', () => {
    const picks = new Map<string, GroupTipPick>([
      ['A', { winnerCode: 'MEX', runnerUpCode: 'RSA' }],
    ]);
    render(<TipsBracketView data={dataFrom(picks)} />);
    expect(screen.getByText('Simulering')).toBeInTheDocument();
    // Förklarande not: "inte riktiga resultat".
    expect(screen.getByText(/inte riktiga resultat/i)).toBeInTheDocument();
  });

  it('visar hur många av 12 grupper som tippats', () => {
    const picks = new Map<string, GroupTipPick>([
      ['A', { winnerCode: 'MEX', runnerUpCode: 'RSA' }],
      ['B', { winnerCode: 'CAN', runnerUpCode: 'SUI' }],
    ]);
    render(<TipsBracketView data={dataFrom(picks)} />);
    expect(screen.getByText(/2 av 12 grupper tippade/i)).toBeInTheDocument();
  });
});

describe('TipsBracketView, sextondels-möten ur tipsen', () => {
  it('visar de tippade lagens namn i sextondelsmatchen (Daniels kärnvärde)', () => {
    // M73 = 2:a grupp A v 2:a grupp B. Tippa A: tvåa Sydafrika, B: tvåa Schweiz.
    const picks = new Map<string, GroupTipPick>([
      ['A', { winnerCode: 'MEX', runnerUpCode: 'RSA' }],
      ['B', { winnerCode: 'CAN', runnerUpCode: 'SUI' }],
    ]);
    render(<TipsBracketView data={dataFrom(picks)} />);
    const m73 = document.querySelector('[data-bracket-match="M73"]');
    expect(m73).not.toBeNull();
    expect(within(m73 as HTMLElement).getByText('Sydafrika')).toBeInTheDocument();
    expect(within(m73 as HTMLElement).getByText('Schweiz')).toBeInTheDocument();
  });
});

describe('TipsBracketView, treorna gissas aldrig', () => {
  it('visar bästa-trea-slots som ÖPPNA (märkta "Öppen"), aldrig ett gissat lag', () => {
    // Fullt tips för alla grupper.
    const picks = new Map<string, GroupTipPick>();
    const byGroup = new Map<string, Team[]>();
    for (const t of TEAMS) {
      const list = byGroup.get(t.group) ?? [];
      list.push(t);
      byGroup.set(t.group, list);
    }
    for (const [group, teams] of byGroup) {
      picks.set(group, { winnerCode: teams[0].code, runnerUpCode: teams[1].code });
    }
    render(<TipsBracketView data={dataFrom(picks)} />);

    // M74-away är en bästa trea (Article 12.6). Den ska bära "Öppen" + ingen lag-placering.
    const m74 = document.querySelector('[data-bracket-match="M74"]') as HTMLElement;
    const openSlot = m74.querySelector('[data-tips-slot-resolution="open-third"]');
    expect(openSlot).not.toBeNull();
    expect(within(openSlot as HTMLElement).getByText('Öppen')).toBeInTheDocument();
    // Etiketten är en behörighets-text "3:a ...", inte ett lagnamn.
    expect((openSlot as HTMLElement).textContent).toMatch(/3:a [A-L/]+/);
  });

  it('renderar exakt 8 öppna bästa-trea-slots i sextondelen', () => {
    const picks = new Map<string, GroupTipPick>([
      ['A', { winnerCode: 'MEX', runnerUpCode: 'RSA' }],
    ]);
    render(<TipsBracketView data={dataFrom(picks)} />);
    const openThirds = document.querySelectorAll('[data-tips-slot-resolution="open-third"]');
    expect(openThirds.length).toBe(8);
  });
});

describe('TipsBracketView, treorna fyllda ur match-tipsen (T64)', () => {
  // En komplett tips-seedning: grupp C:s trea seedas till M74 (Annexe C-kolumn 1E).
  // Vi använder grupp C:s lottnings-position-3-lag som "trea" (känt id ur lag-listan).
  function seedingForM74(group: string): TipsThirdSeeding {
    const groupTeams = TEAMS.filter((t) => t.group === group);
    const thirdId = groupTeams[2].id;
    return {
      seedingByMatchId: new Map([['M74', group as never]]),
      thirdTeamIdByGroup: new Map([[group as never, thirdId]]),
      complete: true,
    };
  }

  it('visar det tips-seedade lagets NAMN i bästa-trea-sloten (inte "Öppen")', () => {
    const picks = new Map<string, GroupTipPick>([
      ['A', { winnerCode: 'MEX', runnerUpCode: 'RSA' }],
    ]);
    // Grupp C:s position-3-lag (känt namn ur lag-listan) seedas till M74.
    const cThird = TEAMS.filter((t) => t.group === 'C')[2];
    render(<TipsBracketView data={dataFrom(picks, seedingForM74('C'))} />);

    const m74 = document.querySelector('[data-bracket-match="M74"]') as HTMLElement;
    const thirdSlot = m74.querySelector('[data-tips-slot-resolution="tipped-third"]');
    expect(thirdSlot).not.toBeNull();
    // Lagnamnet syns, och den lågmälda "3:a"-markören (simulerad trea), inte "Öppen".
    expect(within(thirdSlot as HTMLElement).getByText(cThird.name)).toBeInTheDocument();
    expect((thirdSlot as HTMLElement).querySelector('[data-tips-third]')).not.toBeNull();
    expect((thirdSlot as HTMLElement).querySelector('[data-tips-open-third]')).toBeNull();
  });

  it('utan seedning (ofullständiga match-tips) står samma trea-slot ÖPPEN', () => {
    // Kontroll: utan thirdSeeding är M74:s trea fortfarande öppen (T51-beteendet).
    const picks = new Map<string, GroupTipPick>([
      ['A', { winnerCode: 'MEX', runnerUpCode: 'RSA' }],
    ]);
    render(<TipsBracketView data={dataFrom(picks)} />);
    const m74 = document.querySelector('[data-bracket-match="M74"]') as HTMLElement;
    expect(m74.querySelector('[data-tips-slot-resolution="open-third"]')).not.toBeNull();
    expect(m74.querySelector('[data-tips-slot-resolution="tipped-third"]')).toBeNull();
  });
});

describe('TipsBracketView, vägen vidare visas strukturellt', () => {
  it('visar åttondelarna med struktur-etiketter ("Vinnare M73"), inte gissade lag', () => {
    const picks = new Map<string, GroupTipPick>([
      ['A', { winnerCode: 'MEX', runnerUpCode: 'RSA' }],
    ]);
    render(<TipsBracketView data={dataFrom(picks)} />);
    // Åttondelsfinaler-kolumnen finns och bär struktur-etiketter.
    expect(screen.getByText('Åttondelsfinaler')).toBeInTheDocument();
    // M89 (en åttondel) bär "Vinnare M74"/"Vinnare M77" (strukturen), inga lag.
    const m89 = document.querySelector('[data-bracket-match="M89"]') as HTMLElement;
    expect(m89.textContent).toMatch(/Vinnare M\d+/);
  });

  it('renderar hela trädet fram till finalen (sextondel -> final)', () => {
    const picks = new Map<string, GroupTipPick>([
      ['A', { winnerCode: 'MEX', runnerUpCode: 'RSA' }],
    ]);
    render(<TipsBracketView data={dataFrom(picks)} />);
    expect(screen.getByText('Sextondelsfinaler')).toBeInTheDocument();
    expect(screen.getByText('Final')).toBeInTheDocument();
    expect(screen.getByText('Bronsmatch')).toBeInTheDocument();
  });
});
