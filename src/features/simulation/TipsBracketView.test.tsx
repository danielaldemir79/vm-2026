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
import { TipsBracketView } from './TipsBracketView';
import type { TipsBracketData } from './use-tips-bracket-data';

const TEAMS: Team[] = WC2026_TEAM_BASES.map((b) => ({
  id: b.id,
  name: b.name,
  code: b.code,
  group: b.group,
}));

/** Bygg injicerbar vy-data ur ett tips (samma motor som produktion). */
function dataFrom(picks: Map<string, GroupTipPick>): TipsBracketData {
  return { bracket: deriveTipsBracket(picks, TEAMS), teams: TEAMS, ready: true };
}

describe('TipsBracketView, tomt läge', () => {
  it('visar en uppmaning (inget skelett-träd) när inga grupper är tippade', () => {
    render(<TipsBracketView data={dataFrom(new Map())} />);
    expect(screen.getByText(/tippa minst en grupp/i)).toBeInTheDocument();
    // Inget träd renderas (inga runda-kolumner).
    expect(document.querySelector('[data-bracket-round]')).toBeNull();
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
