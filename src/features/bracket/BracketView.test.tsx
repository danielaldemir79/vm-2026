import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BracketView, SlotRow } from './BracketView';
import { ResultsProvider } from '../results/ResultsProvider';
import type { DataSource } from '../../data';
import type { BracketSlotState } from './derive-bracket';
import { createFailingDataSource } from '../../test/failing-data-source';

// Fixtures-miljö (ingen Supabase-env) => datakällan ger den verifierade VM 2026-
// datan (alla 12 grupper + 104 matcher, alla scheduled). BracketView är en ren
// konsument av den delade storen (samma som gruppspelet), så vi wrappar den.
function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

function renderView(env: ImportMetaEnv, dataSource?: DataSource) {
  return render(
    <ResultsProvider env={env} dataSource={dataSource}>
      <BracketView />
    </ResultsProvider>
  );
}

describe('BracketView, rendering + a11y', () => {
  it('renderar i ett etiketterat section-landmark med rubrik', async () => {
    renderView(fixturesEnv());
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: /Slutspelsträdet/i })
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('region', { name: /Slutspelsträdet/i })).toBeInTheDocument();
  });

  it('renderar alla 6 rundorna (sextondel -> final + bronsmatch) som regioner', async () => {
    renderView(fixturesEnv());
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Sextondelsfinaler/i })).toBeInTheDocument();
    });
    // Varje runda är en etiketterad region (a11y-navigerbar). Exakta namn med
    // antalet matcher, så "Final (1 match)" inte krockar med "Semifinaler ...".
    // Antalet böjs grammatiskt: 1 -> "match", >1 -> "matcher" (C1/C2), så
    // skärmläsaren inte säger "Final (1 matcher)".
    // Ordningen speglar trädets kolumner vänster -> höger: bronsmatchen står
    // FÖRE finalen (C4), eftersom den spelas före (verifierat mot T4:s tablå).
    const expectedOrder = [
      'Sextondelsfinaler (16 matcher)',
      'Åttondelsfinaler (8 matcher)',
      'Kvartsfinaler (4 matcher)',
      'Semifinaler (2 matcher)',
      'Bronsmatch (1 match)',
      'Final (1 match)',
    ];
    for (const name of expectedOrder) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    // ...och i DOM-ordning (kolumnerna vänster -> höger), så bronsmatchen
    // RENDERAS före finalen, inte bara existerar. Vaktar C4-ordningen i vyn.
    const renderedOrder = screen
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-label'))
      .filter((label): label is string => expectedOrder.includes(label ?? ''));
    expect(renderedOrder).toEqual(expectedOrder);
  });

  it('visar 16 match-kort i sextondelsrundan (M73-M88)', async () => {
    renderView(fixturesEnv());
    const round = await screen.findByRole('region', { name: /Sextondelsfinaler/i });
    // Varje match-kort har en stabil data-hake (design-seam).
    expect(round.querySelectorAll('[data-bracket-match]')).toHaveLength(16);
  });
});

describe('BracketView, GRUPPSPEL PÅGÅR (fixtures: alla matcher scheduled)', () => {
  it('är INTE låst (ingen "Låst seedning"-markör) medan gruppspelet pågår', async () => {
    renderView(fixturesEnv());
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Slutspelsträdet/i })).toBeInTheDocument();
    });
    expect(document.querySelector('[data-bracket-locked]')).toBeNull();
  });

  it('visar grupp-positions-etiketter (möjliga lag), inte gissade lag', async () => {
    renderView(fixturesEnv());
    await screen.findByRole('region', { name: /Sextondelsfinaler/i });
    // M73 = Runner-up A v Runner-up B. Positions-etiketterna ska synas.
    expect(screen.getAllByText(/2:a grupp A/).length).toBeGreaterThan(0);
    // En bästa-trea-slot bär sin eligibleGroups-etikett EXAKT (Article 12.6).
    expect(screen.getAllByText(/3:a A\/B\/C\/D\/F/).length).toBeGreaterThan(0);
  });

  it('markerar obestämda slots med data-slot-resolution (design-seam)', async () => {
    renderView(fixturesEnv());
    await screen.findByRole('region', { name: /Sextondelsfinaler/i });
    const possible = document.querySelectorAll('[data-slot-resolution="possible"]');
    // Gruppvinnar-/tvåa-/bästa-trea-slots är "possible" under gruppspelet.
    expect(possible.length).toBeGreaterThan(0);
    // Ingen slot är "resolved" än (inga grupper klara).
    expect(document.querySelectorAll('[data-slot-resolution="resolved"]')).toHaveLength(0);
  });

  it('bär demo-data-märket i fixtures-läge', async () => {
    renderView(fixturesEnv());
    await waitFor(() => {
      expect(screen.getByText(/Demo-data/i)).toBeInTheDocument();
    });
  });

  it('en horisontellt scrollbar container håller trädet (responsiv-förberedd)', async () => {
    renderView(fixturesEnv());
    await screen.findByRole('region', { name: /Sextondelsfinaler/i });
    const scroll = document.querySelector('[data-bracket-scroll]');
    expect(scroll).not.toBeNull();
    expect(scroll).toHaveClass('overflow-x-auto');
  });
});

// C10 (Copilot runda 3): möjliga-lag-chippets text/aria var alltid plural
// ("möjliga"), så vid exakt 1 kandidat blev det grammatiskt fel ("1 möjliga
// lag"). Böjs nu som matchCountLabel: "1 möjligt lag" / "n möjliga lag".
describe('SlotRow, möjliga-lag-chippets böjning (C10)', () => {
  // Bygg en 'possible'-slot med ett givet antal kandidater (bara fälten chippet
  // läser; resten av BracketSlotState är irrelevant för den här raden).
  function possibleSlot(candidateTeamIds: string[]): BracketSlotState {
    return {
      id: 'M73-home',
      matchId: 'M73',
      side: 'home',
      stage: 'round-of-32',
      nextSlotId: null,
      resolution: 'possible',
      label: '2:a grupp A',
      teamId: null,
      candidateTeamIds,
    };
  }

  function renderSlot(slot: BracketSlotState) {
    return render(
      <ul>
        <SlotRow slot={slot} teamsById={new Map()} isWinner={false} />
      </ul>
    );
  }

  it('SINGULAR: exakt 1 kandidat böjs "1 möjligt lag" (inte "1 möjliga lag")', () => {
    renderSlot(possibleSlot(['A1']));
    const chip = screen.getByText('1 möjligt lag');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute('aria-label', '1 möjligt lag');
    expect(screen.queryByText('1 möjliga lag')).toBeNull();
  });

  it('PLURAL: fler än 1 kandidat böjs "n möjliga lag"', () => {
    renderSlot(possibleSlot(['A3', 'B3', 'C3', 'D3', 'F3']));
    const chip = screen.getByText('5 möjliga lag');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute('aria-label', '5 möjliga lag');
  });
});

describe('BracketView, fel-väg (fail loud)', () => {
  it('visar ett fel-meddelande när datakällan rejectar (genuint datakälle-fel)', async () => {
    // Sedan T14 kastar live-källan inte längre (ger giltig data), så ett genuint
    // datakälle-fel injiceras via en rejectande datakälla.
    renderView(fixturesEnv(), createFailingDataSource());
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Kunde inte ladda slutspelsträdet/i);
    });
    // Inget träd renderas vid fel (ingen tyst tom-vy med stale data).
    expect(document.querySelector('[data-bracket-match]')).toBeNull();
  });
});
