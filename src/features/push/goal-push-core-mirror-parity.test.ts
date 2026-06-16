// @vitest-environment node
//
// Kör i NODE-miljön (inte jsdom): esbuild kräver en äkta TextEncoder/Uint8Array-invariant som
// jsdom bryter (samma som v3-/global-leaderboard-mirror-parity). Testet rör ingen DOM, bara
// ren logik + esbuild-bundling.
//
// MIRROR-PARITETSTEST (T89, #182): bevisa att den GENERERADE Deno-mirror:n i
// `supabase/functions/_shared/goal-push-core.ts` ger EXAKT samma utdata som src-grafen
// (parseEvents -> extractGoals -> diffNewGoals/scoringSide/formatGoalNotification +
// shouldNotifyUser) som goal-push-dispatcher kör i prod.
//
// VARFÖR (patterns.md "genererad-edge-mirror..." steg 4 + lessons): mirror:n typas/lintas INTE
// av app-grafen och importeras bara av den @ts-nocheck:ade dispatchern (som inte körs i CI).
// Även genererad (esbuild-bundle) kan den bli STALE om någon glömmer regenerera efter en
// ändring av mål-detekteringen. Detta är grinden: vi bundlar src-entrypointen FÄRSKT OCH laddar
// den COMMITTADE mirror-filen, och kör SAMMA diskriminerande in->ut mot BÅDA. En glömd
// regenerering (committad != src) failar i CI i stället för i prod (där dispatchern skickar
// notiser till vänners enheter). Mål-push måste dela SAMMA måltolkning som skytteligan (SPEC §13.3).

import { build } from 'esbuild';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  diffNewGoals as srcDiff,
  scoringSideFromScoreDelta as srcSide,
  formatGoalNotification as srcFormat,
} from './goal-detection';
import { shouldNotifyUser as srcShould } from './push-preferences';
import { parseEvents as srcParse } from '../../data/livescore/parse-live';
import type { RawApiResponse, RawEvent } from '../../data/livescore/api-football-types';

/** Den publika ytan dispatchern + paritetstestet använder ur mirror:n/edge-entry. */
interface CoreModule {
  parseEvents: typeof srcParse;
  diffNewGoals: typeof srcDiff;
  scoringSideFromScoreDelta: typeof srcSide;
  formatGoalNotification: typeof srcFormat;
  shouldNotifyUser: typeof srcShould;
}

let mirror: CoreModule;
let freshBundle: CoreModule;

/** Bundla en entrypoint till ESM + ladda via data:-URL (ingen fil skrivs, ingen node:fs). */
async function loadBundled(entry: string): Promise<CoreModule> {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
  });
  const code = result.outputFiles[0].text;
  return (await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(code)}`
  )) as CoreModule;
}

beforeAll(async () => {
  // 1) Den COMMITTADE mirror-filen (det artefakt dispatchern deployar).
  mirror = await loadBundled('supabase/functions/_shared/goal-push-core.ts');
  // 2) src-entrypointen FÄRSKT (upptäcker en glömd regenerering).
  freshBundle = await loadBundled('src/features/push/edge-entry.ts');
});

/* ------------------------------------------------------------------ *
 * Diskriminerande indata: ett RÅTT API-Football events-svar (kuvert-lindat, som
 * match_live_data lagrar), där FEL logik (parallell parse / fel signatur / fel sida)
 * skulle ge ETT ANNAT svar.
 * ------------------------------------------------------------------ */

const HOME_ID = 9;
const AWAY_ID = 14;

/** Ett rått events-svar i API-Footballs kuvert-form (samma som blobben i match_live_data). */
function rawEventsEnvelope(events: RawEvent[]): RawApiResponse<RawEvent> {
  return {
    get: 'fixtures/events',
    parameters: {},
    errors: [],
    results: events.length,
    paging: { current: 1, total: 1 },
    response: events,
  } as unknown as RawApiResponse<RawEvent>;
}

/** Ett rått mål-event (API-formen parse-live normaliserar). */
function rawGoal(over: Partial<RawEvent> = {}): RawEvent {
  return {
    time: { elapsed: 30, extra: null },
    team: { id: HOME_ID, name: 'Spanien', logo: '' },
    player: { id: 100, name: 'A. Skytt' },
    assist: { id: null, name: null },
    type: 'Goal',
    detail: 'Normal Goal',
    comments: null,
    ...over,
  } as unknown as RawEvent;
}

const OLD_RAW = rawEventsEnvelope([rawGoal({ time: { elapsed: 10, extra: null } })]);
const NEW_RAW = rawEventsEnvelope([
  rawGoal({ time: { elapsed: 10, extra: null } }), // känt (samma signatur)
  rawGoal({
    time: { elapsed: 30, extra: null },
    team: { id: AWAY_ID, name: 'Kroatien', logo: '' },
    player: { id: 200, name: 'B. Borta' },
  }), // NYTT mål
]);

describe('goal-push mirror-paritet: committad mirror == src (Deno-bundle)', () => {
  it('parseEvents: committad mirror och src parsar det råa svaret identiskt', () => {
    expect(mirror.parseEvents(NEW_RAW)).toEqual(srcParse(NEW_RAW));
    // Sanity: bundlingen drog faktiskt in parsern (2 mål-events).
    expect(srcParse(NEW_RAW)).toHaveLength(2);
  });

  it('diffNewGoals: mirror och src detekterar SAMMA enda nya mål (re-poll-säkert)', () => {
    const oldEvents = srcParse(OLD_RAW);
    const newEvents = srcParse(NEW_RAW);
    const src = srcDiff(oldEvents, newEvents, 'g-A-1');
    const mir = mirror.diffNewGoals(
      mirror.parseEvents(OLD_RAW),
      mirror.parseEvents(NEW_RAW),
      'g-A-1'
    );
    expect(mir).toEqual(src);
    // Diskriminerande sanity: exakt ETT nytt mål (det kända 10-minutersmålet re-detekteras EJ).
    expect(src).toHaveLength(1);
    expect(src[0].goal.scorerName).toBe('B. Borta');
  });

  it('scoringSideFromScoreDelta: identisk sida , BÅDA grenarna (home OCH away) diskriminerande', () => {
    // away ökade -> 'away'. Muteras away-grenen rödnar detta.
    expect(mirror.scoringSideFromScoreDelta({ home: 1, away: 0 }, { home: 1, away: 1 })).toBe(
      srcSide({ home: 1, away: 0 }, { home: 1, away: 1 })
    );
    expect(srcSide({ home: 1, away: 0 }, { home: 1, away: 1 })).toBe('away');
    // home ökade -> 'home'. Muteras home-grenen rödnar detta (täcker BÅDA grenarna, inte bara en).
    expect(mirror.scoringSideFromScoreDelta({ home: 0, away: 2 }, { home: 1, away: 2 })).toBe(
      srcSide({ home: 0, away: 2 }, { home: 1, away: 2 })
    );
    expect(srcSide({ home: 0, away: 2 }, { home: 1, away: 2 })).toBe('home');
  });

  it('formatGoalNotification: identisk notis-text ("Kroatien 1-1")', () => {
    const src = srcFormat('away', { home: 1, away: 1 }, 'Kroatien');
    const mir = mirror.formatGoalNotification('away', { home: 1, away: 1 }, 'Kroatien');
    expect(mir).toEqual(src);
    expect(src.body).toBe('Kroatien 1-1');
  });

  it('shouldNotifyUser: identiskt beslut i nattfönstret (quiet-hours)', () => {
    const prefs = {
      notifyEnabled: true,
      quietHoursEnabled: true,
      scope: 'all' as const,
      favoriteTeamId: null,
    };
    const match = { homeTeamId: 'ESP', awayTeamId: 'CRO' };
    const night = new Date('2026-06-20T22:00:00Z'); // 00:00 svensk
    expect(mirror.shouldNotifyUser(prefs, match, night)).toEqual(srcShould(prefs, match, night));
    expect(srcShould(prefs, match, night)).toEqual({ notify: false, reason: 'quiet-hours' });
  });

  it('FÄRSK src-bundle == committad mirror (fångar en glömd `npm run gen:goal-push-core`)', () => {
    const oldEvents = freshBundle.parseEvents(OLD_RAW);
    const newEvents = freshBundle.parseEvents(NEW_RAW);
    const fresh = freshBundle.diffNewGoals(oldEvents, newEvents, 'g-A-1');
    const committed = mirror.diffNewGoals(
      mirror.parseEvents(OLD_RAW),
      mirror.parseEvents(NEW_RAW),
      'g-A-1'
    );
    expect(committed).toEqual(fresh);
  });

  it('NEGATIV KONTROLL: paritets-assertionen KAN rödna (en muterad mirror skulle faila)', () => {
    // Bevisa att expect(mir).toEqual(src) inte är vakuöst grön: kör src mot ett medvetet FEL
    // mirror-resultat (som om mirror tappat re-poll-dedupen och re-detekterade BÅDA målen).
    const brokenMirrorDiff = (
      _old: unknown,
      newEvents: ReturnType<typeof srcParse>,
      matchId: string
    ) => srcDiff([], newEvents, matchId); // ignorerar OLD -> re-detekterar allt
    const oldEvents = srcParse(OLD_RAW);
    const newEvents = srcParse(NEW_RAW);
    const correct = srcDiff(oldEvents, newEvents, 'g-A-1'); // 1 nytt mål
    const broken = brokenMirrorDiff(oldEvents, newEvents, 'g-A-1'); // 2 "nya" mål
    expect(broken).not.toEqual(correct);
    expect(broken).toHaveLength(2);
  });
});
