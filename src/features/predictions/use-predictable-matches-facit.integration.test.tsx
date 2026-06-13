import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { PredictionsView } from './PredictionsView';
import { PredictionsStoreContext, type PredictionsStore } from './predictions-context';
import {
  OfficialResultsStoreContext,
  type OfficialResultsStore,
} from '../official-results/official-results-context';
import type { OfficialMatchResult } from '../../data/official';
import type { Prediction } from '../../data/predictions';

// ============================================================================
// INTEGRATIONSTEST: T76 (#158) , FACIT + POÄNG PÅ TIPS-INMATNINGSKORTET.
//
// PINNEN MOT DEN EXAKTA BUGGEN (lessons: handoff-pastar-ett-krav-levererat-men-koden-
// wirar-aldrig-in-ytan + mock-foljer-konsumenttyp-doljer-mappnings-drift-i-otestad-
// live-gren): de ISOLERADE PredictionsView/PredictionForm-testerna matar in en
// 'finished'-FIXTUR direkt (finishedMatch), så de bevisar bara att kortet KAN visa
// facit/poäng GIVET en avgjord match , aldrig att den LIVE-vägen (statisk plan +
// officiellt facit) faktiskt PRODUCERAR en avgjord match. Det var precis därför buggen
// shippade grön: matchplanen är alltid 'scheduled', facit vävdes aldrig in i tips-vyn,
// och isFinished-grinden öppnades aldrig i verkligheten.
//
// Detta test kör den RIKTIGA usePredictableData (vi MOCKAR den INTE) genom hela
// vävnings-seamen: den verkliga matchplanen (fixtures, g-A-1 = MEX-RSA) + ett
// VERKLIGT officiellt facit ur OfficialResultsProvider-kontexten (T42, samma källa
// topplistan väver in). Vi bevisar att tips-kortet då renderar FACIT (T73) + POÄNG
// (T58). Ett facit-FIXTUR i matchlistan vore samma blinda fläck som de gamla testerna;
// här kommer "finished" ENBART ur facit-vävningen, så en bortkopplad väv failar rött.
// ============================================================================

// g-A-1 ur den verkliga matchplanen (fixtures): MEX-RSA, avspark 2026-06-11T19:00:00Z.
const MATCH_ID = 'g-A-1';

// Ett "nu" EFTER g-A-1:s avspark (11 juni 19:00Z), så matchen är LÅST i tips-vyn
// (facit + poäng visas i låst-blocket) och dagens-fönstret ankrar på premiärdagen,
// så g-A-1 är default-synlig (samma dag som avspark) , inget expandera behövs.
const NOW_AFTER_KICKOFF = new Date('2026-06-11T21:30:00.000Z');

/** Fixtures-läge: tom env -> getDataSource ger den verkliga matchplanen (g-A-1..). */
function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

/** Facit-store som bär en uppsättning officiella resultat (T42-kontexten). */
function officialStoreWith(results: OfficialMatchResult[]): OfficialResultsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    results,
    isAdmin: false,
    client: null,
    saveOfficialResult: async () => {},
    refresh: async () => {},
  };
}

/** Ett officiellt (globalt) resultat för en match (samma form som live-DB-raden). */
function officialResult(matchId: string, home: number, away: number): OfficialMatchResult {
  return {
    matchId,
    homeGoals: home,
    awayGoals: away,
    penalties: null,
    status: 'finished',
    updatedBy: 'admin',
    updatedAt: '2026-06-11T21:00:00.000Z',
  };
}

function predictionsStore(myPredictions: ReadonlyMap<string, Prediction>): PredictionsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    activeRoomId: 'r1',
    myPredictions,
    savePrediction: async () => {},
  };
}

function myPrediction(matchId: string, home: number, away: number): Prediction {
  return { matchId, userId: 'me', homeGoals: home, awayGoals: away, updatedAt: 't' };
}

/**
 * Montera den RIKTIGA PredictionsView (riktig usePredictableData, EJ mockad) under en
 * facit-context + en tips-store, i samma ordning som appen. ResultsProvider behövs INTE:
 * tips-vyn läser sitt eget underlag via usePredictableData (env-gatad datakälla) och
 * facit via useOfficialResultsSync.
 */
function renderTipsView(opts: {
  official: OfficialMatchResult[];
  myPredictions?: ReadonlyMap<string, Prediction>;
  now?: Date;
  children?: ReactNode;
}) {
  return render(
    <OfficialResultsStoreContext.Provider value={officialStoreWith(opts.official)}>
      <PredictionsStoreContext.Provider value={predictionsStore(opts.myPredictions ?? new Map())}>
        <PredictionsView env={fixturesEnv()} now={opts.now ?? NOW_AFTER_KICKOFF} />
        {opts.children}
      </PredictionsStoreContext.Provider>
    </OfficialResultsStoreContext.Provider>
  );
}

/** Tips-kortet (PredictionForm) för en given match-id, eller null. */
function cardFor(matchId: string): HTMLElement | null {
  return document.querySelector(`[data-prediction-form][data-match-id="${matchId}"]`);
}

describe('T76 (#158): tips-kortet väver in officiellt facit (facit + poäng renderas live)', () => {
  it('officiellt facit för matchen -> kortet renderar FACIT (T73) OCH poäng (T58)', async () => {
    // g-A-1 avgjord 4-1 i facit; jag tippade 4-1 = EXAKT (3 poäng). Detta är den
    // verkliga buggvägen: facit kommer ENBART ur vävningen, matchplanen är 'scheduled'.
    renderTipsView({
      official: [officialResult(MATCH_ID, 4, 1)],
      myPredictions: new Map([[MATCH_ID, myPrediction(MATCH_ID, 4, 1)]]),
    });

    // Vänta in datakällans (mikro-task) seed + vävningen.
    await waitFor(() => expect(cardFor(MATCH_ID)).not.toBeNull());
    const card = cardFor(MATCH_ID) as HTMLElement;

    // Matchen är LÅST (avspark passerad) , låst-blocket (där facit/poäng bor) renderas.
    expect(card.getAttribute('data-prediction-locked')).toBe('true');

    // FACIT (T73): rätt slutresultat syns med "Facit"-etikett. Talet kommer ur den
    // delade formatScore (samma sanning som matchkortet/topplistan).
    const facit = card.querySelector('[data-tip-facit]') as HTMLElement | null;
    expect(facit).not.toBeNull();
    expect(facit?.getAttribute('data-tip-facit-score')).toBe('4-1');

    // POÄNG (T58): mitt tips 4-1 mot facit 4-1 = exakt (3 p), härlett ur score.ts via
    // SAMMA väg som topplistan. Bevisar att poäng-raden faktiskt renderas på den
    // live-invävda matchen (inte bara på en fixtur).
    const points = card.querySelector('[data-tip-result]') as HTMLElement | null;
    expect(points).not.toBeNull();
    expect(points?.getAttribute('data-tip-point-type')).toBe('exact');
    expect(points?.getAttribute('data-tip-points')).toBe('3');
  });

  it('facit visas även för en match jag INTE tippade (publikt), men ingen poäng-rad', async () => {
    // Inget eget tips: facit (publikt) ska ändå synas, men ingen poäng-rad (inget tips
    // att döma, ärligt , ingen "0 Miss" för den som inte var med).
    renderTipsView({ official: [officialResult(MATCH_ID, 2, 0)], myPredictions: new Map() });

    await waitFor(() => expect(cardFor(MATCH_ID)).not.toBeNull());
    const card = cardFor(MATCH_ID) as HTMLElement;

    const facit = card.querySelector('[data-tip-facit]') as HTMLElement | null;
    expect(facit?.getAttribute('data-tip-facit-score')).toBe('2-0');
    expect(card.querySelector('[data-tip-result]')).toBeNull();
  });

  it('REGRESSION: UTAN officiellt facit syns INGET facit/poäng (bug-läget får inte passera falskt)', async () => {
    // Detta är exakt det LIVE-läge buggen visade: facit-listan är tom, matchplanen är
    // 'scheduled', så kortet får varken facit eller poäng. Ett test som av misstag
    // matade in en finished-fixtur skulle dölja buggen; här bevisar vi att facit ENBART
    // kommer ur vävningen, så frånvaro av facit ger frånvaro av facit/poäng.
    renderTipsView({
      official: [],
      myPredictions: new Map([[MATCH_ID, myPrediction(MATCH_ID, 4, 1)]]),
    });

    await waitFor(() => expect(cardFor(MATCH_ID)).not.toBeNull());
    const card = cardFor(MATCH_ID) as HTMLElement;
    // Matchen är låst (avspark passerad) men INTE avgjord (inget facit), så facit/poäng
    // ska saknas (gissa aldrig ett resultat, T55).
    expect(card.getAttribute('data-prediction-locked')).toBe('true');
    expect(card.querySelector('[data-tip-facit]')).toBeNull();
    expect(card.querySelector('[data-tip-result]')).toBeNull();
  });

  it('REALTID: när facit-källan får resultatet uppdateras kortet utan omladdning', async () => {
    // T42-realtidsvägen: admin matar in ett resultat -> officialResults får en ny
    // referens. Vi simulerar det genom att rendera om providern med ett facit och
    // bevisar att kortet (samma instans, ingen reload) växlar till att visa facit.
    const view = renderTipsView({
      official: [],
      myPredictions: new Map([[MATCH_ID, myPrediction(MATCH_ID, 1, 0)]]),
    });
    await waitFor(() => expect(cardFor(MATCH_ID)).not.toBeNull());
    // Innan facit: inget facit/poäng.
    expect(cardFor(MATCH_ID)?.querySelector('[data-tip-facit]')).toBeNull();

    // Facit kommer in (admin/realtid): rerender med en NY officialResults-referens.
    // RTL:s rerender wrappar redan i act, så vävningen körs synkront och deterministiskt.
    view.rerender(
      <OfficialResultsStoreContext.Provider
        value={officialStoreWith([officialResult(MATCH_ID, 1, 0)])}
      >
        <PredictionsStoreContext.Provider
          value={predictionsStore(new Map([[MATCH_ID, myPrediction(MATCH_ID, 1, 0)]]))}
        >
          <PredictionsView env={fixturesEnv()} now={NOW_AFTER_KICKOFF} />
        </PredictionsStoreContext.Provider>
      </OfficialResultsStoreContext.Provider>
    );

    // Efter facit: kortet visar nu facit 1-0 + poäng (exakt, 3 p) , utan omladdning.
    await waitFor(() => {
      const facit = cardFor(MATCH_ID)?.querySelector('[data-tip-facit]') as HTMLElement | null;
      expect(facit?.getAttribute('data-tip-facit-score')).toBe('1-0');
    });
    const points = cardFor(MATCH_ID)?.querySelector('[data-tip-result]') as HTMLElement | null;
    expect(points?.getAttribute('data-tip-point-type')).toBe('exact');
  });
});
