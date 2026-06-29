import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BracketView, SlotRow } from './BracketView';
import { ResultsProvider } from '../results/ResultsProvider';
import type { DataSource } from '../../data';
import type { BracketSlotState } from './derive-bracket';
import type { Team } from '../../domain/types';
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

  it('EXPANDERAD som default (startExpanded): hela trädet syns direkt, kan fällas ihop', async () => {
    renderView(fixturesEnv());
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Sextondelsfinaler/i })).toBeInTheDocument();
    });
    // Rubriken alltid synlig; kroppen UTFÄLLD som default (2026-06-28: slutspelet är det
    // som gäller nu, trädet ska synas direkt utan att fällas ut).
    expect(screen.getByRole('heading', { level: 2, name: /Slutspelsträdet/i })).toBeInTheDocument();
    const body = document.querySelector('[data-collapsible-body]') as HTMLElement;
    expect(body).toHaveAttribute('data-collapsed', 'false');
    // Hela trädet finns i DOM: alla rundor kvar.
    expect(body.querySelectorAll('[data-bracket-round]')).toHaveLength(6);
    // Komprimera (möjligheten finns kvar) -> expandera tillbaka.
    const [topCollapse] = screen.getAllByRole('button', { name: /Visa mindre av trädet/i });
    fireEvent.click(topCollapse);
    expect(body).toHaveAttribute('data-collapsed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Visa hela slutspelsträdet/i }));
    expect(body).toHaveAttribute('data-collapsed', 'false');
  });
});

describe('BracketView, GRUPPSPEL PÅGÅR, PRELIMINÄRT levande läge (T56, fixtures: alla matcher scheduled)', () => {
  it('är INTE låst (ingen "Låst seedning"-markör) medan gruppspelet pågår', async () => {
    renderView(fixturesEnv());
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Slutspelsträdet/i })).toBeInTheDocument();
    });
    expect(document.querySelector('[data-bracket-locked]')).toBeNull();
  });

  it('visar ett ÄRLIGT "Nuvarande ställning"-märke + förklarar att det inte är klart', async () => {
    renderView(fixturesEnv());
    await screen.findByRole('region', { name: /Sextondelsfinaler/i });
    // Det preliminära märket (design-seam + synlig text) signalerar levande läge.
    expect(document.querySelector('[data-bracket-preliminary]')).not.toBeNull();
    expect(screen.getByText('Nuvarande ställning')).toBeInTheDocument();
    // Den ärliga meningen: inte klart förrän grupperna är färdigspelade (samma anda
    // som T51). "Inte klart" + "nuvarande ställning" ska finnas i intro-texten.
    expect(screen.getByText(/Inte klart/i)).toBeInTheDocument();
    expect(screen.getByText(/färdigspelade/i)).toBeInTheDocument();
  });

  it('fyller slotarna PRELIMINÄRT med konkreta lag som rör sig (data-slot-resolution=preliminary)', async () => {
    renderView(fixturesEnv());
    await screen.findByRole('region', { name: /Sextondelsfinaler/i });
    // Under gruppspelet (T56) fylls grupp-/trea-slotarna preliminärt med nuvarande
    // ledar-lag, inte bara positions-etiketter. Design-seamen markerar dem.
    const preliminary = document.querySelectorAll('[data-slot-resolution="preliminary"]');
    expect(preliminary.length).toBeGreaterThan(0);
    // Ingen slot är "resolved" (skarpt facit) än, inga grupper är klara.
    expect(document.querySelectorAll('[data-slot-resolution="resolved"]')).toHaveLength(0);
    // Varje preliminär slot bär sin position som ärlig under-etikett ("... , nu"),
    // så ett preliminärt lag aldrig läses som facit (data-slot-preliminary-seam).
    expect(document.querySelectorAll('[data-slot-preliminary]').length).toBeGreaterThan(0);
  });

  it('en preliminär trea bär ändå sin behörighets-etikett (Article 12.6) i under-raden', async () => {
    renderView(fixturesEnv());
    await screen.findByRole('region', { name: /Sextondelsfinaler/i });
    // En bästa-trea-slot bär sin eligibleGroups-etikett EXAKT, även preliminärt seedad.
    expect(screen.getAllByText(/3:a A\/B\/C\/D\/F/).length).toBeGreaterThan(0);
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

// 2026-06-28 (Daniels turnering-lyft): en obestämd slot visar nu sina ALTERNATIV
// (kandidatlag som flagg+namn-chips) i stället för bara en räknare, så man ser vilka
// lag som kan ta platsen hela vägen mot finalen. Räknar-böjningen (C10: "1 möjligt
// lag" / "n möjliga lag") lever kvar i strip:ens aria-label (hela sanningen för
// skärmläsaren även när chipsen i bild trunkeras till "+N").
describe('SlotRow, alternativ + flagga + säkrad-plats-markör', () => {
  // Minimal Team-fixtur (bara fälten slot-raden läser: id/name/code; group krävs av typen).
  function team(id: string, name: string, code: string): Team {
    return { id, name, code, group: 'A' };
  }
  const teams = new Map<string, Team>([
    ['BRA', team('BRA', 'Brasilien', 'BRA')],
    ['ARG', team('ARG', 'Argentina', 'ARG')],
  ]);

  // En obestämd 'possible'-slot (inget fyllt lag) med ett givet antal kandidater.
  function possibleSlot(candidateTeamIds: string[]): BracketSlotState {
    return {
      id: 'M89-home',
      matchId: 'M89',
      side: 'home',
      stage: 'round-of-16',
      nextSlotId: null,
      resolution: 'possible',
      label: 'Vinnare M73',
      teamId: null,
      candidateTeamIds,
    };
  }

  // En resolved sextondels-slot (R32) med ett konkret lag: ett GRUPP-SEEDAT lag
  // (inträdet i slutspelet), INTE ett lag som avancerat via en slutspelsvinst.
  function resolvedSlot(teamId: string): BracketSlotState {
    return {
      id: 'M73-home',
      matchId: 'M73',
      side: 'home',
      stage: 'round-of-32',
      nextSlotId: 'M89-home',
      resolution: 'resolved',
      label: '1:a grupp A',
      teamId,
      candidateTeamIds: [],
    };
  }

  // En resolved åttondels-slot (R16) med ett konkret lag: ett lag som AVANCERAT
  // hit genom en slutspelsvinst (källa = match-winner), alltså en "säkrad plats".
  function advancedSlotR16(teamId: string): BracketSlotState {
    return {
      id: 'M89-home',
      matchId: 'M89',
      side: 'home',
      stage: 'round-of-16',
      nextSlotId: 'M101-home',
      resolution: 'resolved',
      label: 'Vinnare M73',
      teamId,
      candidateTeamIds: [],
    };
  }

  function renderSlot(
    slot: BracketSlotState,
    teamsById: ReadonlyMap<string, Team> = teams,
    isWinner = false
  ) {
    return render(
      <ul>
        <SlotRow slot={slot} teamsById={teamsById} isWinner={isWinner} />
      </ul>
    );
  }

  it('visar kandidatlagen ("alternativen") som namn-chips, inte bara en räknare', () => {
    renderSlot(possibleSlot(['BRA', 'ARG']));
    expect(screen.getByText('Brasilien')).toBeInTheDocument();
    expect(screen.getByText('Argentina')).toBeInTheDocument();
    // Det gamla synliga räknar-chippet ("2 möjliga lag") finns inte längre.
    expect(screen.queryByText('2 möjliga lag')).toBeNull();
  });

  it('faller till "+N" när kandidaterna är fler än MAX (smal cell svämmar inte)', () => {
    // 6 kandidater -> 4 chips + "+2".
    renderSlot(possibleSlot(['BRA', 'ARG', 'C3', 'D3', 'E3', 'F3']));
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('bär hela sanningen i aria-label (alla namn + böjt antal, C10-böjningen bevarad)', () => {
    const { container } = renderSlot(possibleSlot(['BRA']));
    const alts = container.querySelector('[data-bracket-alts]');
    // C10: exakt 1 kandidat böjs "1 möjligt lag" (inte "1 möjliga lag").
    expect(alts?.getAttribute('aria-label')).toContain('1 möjligt lag');
    expect(alts?.getAttribute('aria-label')).toContain('Brasilien');
  });

  // SÄKRAD PLATS (Daniels önskemål #2, ersätter den tvetydiga "Klar"-markören): ett lag
  // som AVANCERAT till sin nästa rundas slot (R16+ resolved, ej vinnare/förlorare) lyfts
  // som "säkrad plats". data-slot-secured bär den FÄRG-OBEROENDE accent-behandlingen.
  it('en resolved icke-vinnare i en SENARE runda (R16+) märks SÄKRAD + visar lag med flagga', () => {
    const { container } = render(
      <ul>
        <SlotRow slot={advancedSlotR16('BRA')} teamsById={teams} isWinner={false} matchPending />
      </ul>
    );
    // Den gamla "Klar"/definitiv-markören är BORTA (den lästes som "matchen spelad").
    expect(container.querySelector('[data-slot-definitiv]')).toBeNull();
    expect(screen.queryByText('Klar')).toBeNull();
    // I stället: säkrad-plats-behandlingen (accent-seam) + en "Säkrad"-bricka.
    expect(container.querySelector('[data-slot-secured]')).not.toBeNull();
    expect(screen.getByText('Säkrad')).toBeInTheDocument();
    // Laget syns med namn (full kontrast) + flagga (data-team-flag-seamen).
    expect(screen.getByText('Brasilien')).toBeInTheDocument();
    expect(container.querySelector('[data-team-flag]')).not.toBeNull();
  });

  it('en säkrad plats bär accent-behandlingen men INTE "Säkrad"-brickan när matchen är klar att spelas (båda lag kända)', () => {
    // matchPending=false (ready: motståndaren är också känd) -> datumet i match-huvudet
    // bär "när", så slot-raden behöver inte upprepa "Säkrad" (lugnare, mindre rörigt).
    const { container } = render(
      <ul>
        <SlotRow
          slot={advancedSlotR16('BRA')}
          teamsById={teams}
          isWinner={false}
          matchPending={false}
        />
      </ul>
    );
    expect(container.querySelector('[data-slot-secured]')).not.toBeNull();
    expect(screen.queryByText('Säkrad')).toBeNull();
  });

  it('en GRUPP-SEEDAD sextondels-slot (R32) är INTE "säkrad" (inträde, inte avancemang) och bär ingen "Klar"', () => {
    // En R32-slot fylls av grupp-seedningen, inte av en slutspelsvinst, så den ska INTE
    // bära säkrad-plats-lyftet (det skulle bli brus, alla 32 lagen vore "säkrade").
    const { container } = render(
      <ul>
        <SlotRow slot={resolvedSlot('BRA')} teamsById={teams} isWinner={false} matchPending />
      </ul>
    );
    expect(container.querySelector('[data-slot-secured]')).toBeNull();
    expect(screen.queryByText('Säkrad')).toBeNull();
    expect(container.querySelector('[data-slot-definitiv]')).toBeNull();
    expect(screen.queryByText('Klar')).toBeNull();
    // Laget syns ändå med namn + flagga (inträdet är konkret).
    expect(screen.getByText('Brasilien')).toBeInTheDocument();
  });

  it('en resolved VINNARE bär INTE säkrad-markören (vinnar-medaljen + "(vidare)" bär det i stället)', () => {
    const { container } = render(
      <ul>
        <SlotRow slot={advancedSlotR16('BRA')} teamsById={teams} isWinner matchPending />
      </ul>
    );
    expect(container.querySelector('[data-slot-secured]')).toBeNull();
    expect(screen.queryByText('Säkrad')).toBeNull();
    expect(screen.getByText('(vidare)')).toBeInTheDocument();
  });

  // RESULTAT PÅ NODEN + AVANCEMANG/UTSLAGEN (2026-06-29, Daniels turnering-lyft, del A):
  // en avgjord match-rad bär lagets mål, vinnaren lyfts ("Vidare"), förloraren dämpas
  // (data-slot-eliminated) och bär INTE säkrad-markören (den slogs ju ut).
  it('VINNAR-raden visar sitt resultat (mål) + en tydlig "Vidare"-markör', () => {
    const { container } = render(
      <ul>
        <SlotRow slot={resolvedSlot('BRA')} teamsById={teams} isWinner goals={2} />
      </ul>
    );
    const score = container.querySelector('[data-bracket-slot-score]');
    expect(score).not.toBeNull();
    expect(score).toHaveTextContent('2');
    // "Vidare"-pillen (avancemang TYDLIGT, utöver medaljen) + sr-only "(vidare)".
    expect(container.querySelector('[data-slot-advance]')).not.toBeNull();
    expect(screen.getByText('Vidare')).toBeInTheDocument();
    expect(screen.getByText('(vidare)')).toBeInTheDocument();
  });

  it('FÖRLORAR-raden (isLoser) visar sitt resultat + märks utslagen, INTE säkrad', () => {
    const { container } = render(
      <ul>
        <SlotRow
          slot={advancedSlotR16('ARG')}
          teamsById={teams}
          isWinner={false}
          isLoser
          goals={0}
          matchPending={false}
        />
      </ul>
    );
    expect(container.querySelector('[data-slot-eliminated]')).not.toBeNull();
    // En utslagen rad är resolved, men ska INTE märkas säkrad (den slogs ut, inte "platsen klar").
    expect(container.querySelector('[data-slot-secured]')).toBeNull();
    expect(screen.queryByText('Säkrad')).toBeNull();
    expect(screen.getByText('(utslagen)')).toBeInTheDocument();
    expect(container.querySelector('[data-bracket-slot-score]')).toHaveTextContent('0');
  });

  it('en straff-avgjord rad visar straffsiffran i parentes bredvid ordinarie mål', () => {
    const { container } = render(
      <ul>
        <SlotRow slot={resolvedSlot('BRA')} teamsById={teams} isWinner goals={1} penaltyGoals={4} />
      </ul>
    );
    const score = container.querySelector('[data-bracket-slot-score]');
    // Slutställning "1" + straffar "(4)" på samma rad (slutställning + ev. straffar).
    expect(score).toHaveTextContent('1');
    expect(score).toHaveTextContent('(4)');
  });

  it('en o-spelad rad (goals=null) visar ingen resultat-siffra', () => {
    const { container } = render(
      <ul>
        <SlotRow slot={resolvedSlot('BRA')} teamsById={teams} isWinner={false} />
      </ul>
    );
    expect(container.querySelector('[data-bracket-slot-score]')).toBeNull();
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
