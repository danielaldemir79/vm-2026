import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ResultsProvider } from '../results/ResultsProvider';
import { TeamProfileProvider } from '../team-profile';
import { MatchDetailProvider } from '../match-detail';
import { DailyMatchesView } from './DailyMatchesView';
import type { DataSource } from '../../data';
import type { LiveDataResult } from './use-live-data';
import type { LiveData } from '../../data/livescore';
import type { Group, Match, Team } from '../../domain/types';
import { createFailingDataSource } from '../../test/failing-data-source';
import { HIGHLIGHTS_SEEN_KEY } from '../app-settings';
import { HIGHLIGHTS_FEATURE_LAUNCH_MS } from './match-display';

// useLiveData mockas så HERO-/dags-tema-/etikett-testerna (no-live-vägen) är
// DETERMINISTISKA. Fixtures-läget bär numera en PÅGÅENDE demo-match (g-F-1), så utan
// mock leder live-blocket och hero:n renderas inte , och en grön hero-assertion skulle
// bara bero på att den asynkrona live-laddningen inte hunnit klart (flaxigt). Default =
// tom byMatchId (inget live). Live-blockets EGEN integration testas i ett separat block
// nedan som sätter en pågående rad via denna mock. (Lessons: bevisa skarven, gissa aldrig
// att ett grönt test rör rätt gren.)
const liveDataMock = vi.fn(
  (): LiveDataResult => ({
    status: 'ready',
    byMatchId: new Map<string, LiveData>(),
    error: null,
  })
);
vi.mock('./use-live-data', () => ({
  useLiveData: (): LiveDataResult => liveDataMock(),
}));

function noLive(): LiveDataResult {
  return { status: 'ready', byMatchId: new Map<string, LiveData>(), error: null };
}

function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

// Fel-vägs-testet injicerar en REJECTANDE datakälla (sedan T14 kastar live-källan
// inte längre, så ett genuint datakälle-fel testas via dataSource-injektionen).
function renderView(env: ImportMetaEnv, children: ReactNode, dataSource?: DataSource) {
  return render(
    <ResultsProvider env={env} dataSource={dataSource}>
      <TeamProfileProvider>
        {/* MatchDetailProvider (T86, #178): listans matchkort bär nu en drill-in-trigger
            (MatchDetailTrigger), som fail-loud:ar utan provider. Den riktiga appen wrappar
            alltid Idag-fliken i provideren, så dessa render-tester gör likadant. */}
        <MatchDetailProvider>{children}</MatchDetailProvider>
      </TeamProfileProvider>
    </ResultsProvider>
  );
}

async function waitSettled() {
  await waitFor(() => {
    // Loading-indikatorn (role=status) ska ha försvunnit (ready eller error).
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
}

// Default per test: INGEN live-match (no-live-vägen). Live-blockets tester sätter en
// pågående rad själva. Reset i beforeEach så ett test inte läcker live-läge till nästa.
beforeEach(() => {
  liveDataMock.mockImplementation(() => noLive());
});

describe('DailyMatchesView, tillgänglig struktur + happy path (fixtures)', () => {
  it('renderar i ett etiketterat section-landmark', async () => {
    renderView(fixturesEnv(), <DailyMatchesView />);
    expect(screen.getByRole('region', { name: /dagens matcher/i })).toBeInTheDocument();
    await waitSettled();
  });

  it('visar en datumnavigering med riktiga knappar (tangentbord/a11y)', async () => {
    renderView(fixturesEnv(), <DailyMatchesView />);
    await waitSettled();

    const nav = await screen.findByRole('navigation', { name: /datumnavigering/i });
    // Två navigerings-knappar (föregående/nästa speldag).
    expect(within(nav).getAllByRole('button').length).toBe(2);
  });

  it('renderar dagens matchkort (minst ett) när data är redo', async () => {
    renderView(fixturesEnv(), <DailyMatchesView />);
    await waitSettled();

    await waitFor(() => {
      expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
    });
  });

  it('visar en live-nedräkning till nästa avspark (eller sluttillståndet)', async () => {
    const { container } = renderView(fixturesEnv(), <DailyMatchesView />);
    await waitSettled();

    await waitFor(() => {
      // Antingen tickar nedräkningen (data-countdown=live) eller så är allt spelat.
      const cd = container.querySelector('[data-countdown]');
      expect(cd).not.toBeNull();
    });
  });

  it('flicker-visar ALDRIG tom-dag-panelen med matcher i schemat (Copilot R1, C1)', async () => {
    // REGRESSION: startdagen härleds synkront i render (use-daily-matches), så det
    // finns ingen ready-render där days>0 men selectedDay===null. Tidigare sattes
    // startdagen via en useEffect och då kunde "Ingen match den här dagen" blinka
    // till fast fixtures har matcher. Vi mäter genom att observera DOM:en från
    // första render via en MutationObserver: dyker tom-dag-rubriken någonsin upp,
    // failar testet. Sedan väntar vi tills matchkorten är på plats (ready+dagar).
    let emptyPanelSeen = false;
    const seesEmptyPanel = () =>
      Array.from(document.querySelectorAll('p')).some(
        (p) => p.textContent === 'Ingen match den här dagen'
      );

    const observer = new MutationObserver(() => {
      if (seesEmptyPanel()) {
        emptyPanelSeen = true;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    try {
      renderView(fixturesEnv(), <DailyMatchesView />);
      // Synkront direkt efter mount (innan effekter flushats): inte heller då.
      if (seesEmptyPanel()) emptyPanelSeen = true;

      await waitSettled();
      // Bekräfta att vi faktiskt nådde ready-läget MED matcher (annars vore
      // frånvaron av panelen meningslös).
      await waitFor(() => {
        expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
      });
    } finally {
      observer.disconnect();
    }

    expect(emptyPanelSeen).toBe(false);
  });

  it('en VILODAG är nåbar via "nästa speldag"-knappen och visar vilodags-panelen (C7)', async () => {
    // F4 + C7: VM 2026 har vilodagar mellan ronderna. Tidigare hoppade navigeringen
    // rakt över dem (days saknade tomma dagar) och vilodags-panelen var oåtkomlig.
    // Nu går navigeringen dag för dag; bläddrar vi framåt ska vi förr eller senare
    // landa på en vilodag och se panelen "Ingen match den här dagen".
    renderView(fixturesEnv(), <DailyMatchesView />);
    await waitSettled();
    await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0));

    const nextButton = () =>
      within(screen.getByRole('navigation', { name: /datumnavigering/i })).getAllByRole(
        'button'
      )[1];

    // Spannet är 11 juni-19 juli (< 45 dagar). En gräns skyddar mot oändlig loop
    // om navigeringen skulle gå sönder; vilodagen ska nås långt innan dess.
    let restPanelSeen = false;
    for (let step = 0; step < 45; step += 1) {
      if (screen.queryByText('Ingen match den här dagen')) {
        restPanelSeen = true;
        break;
      }
      const btn = nextButton();
      if ((btn as HTMLButtonElement).disabled) break; // nått sista dagen
      fireEvent.click(btn);
    }

    expect(restPanelSeen).toBe(true);
  });
});

// U2 (designen): favoritlags-väljaren är en INSTÄLLNING. Idag-fliken döljer
// den (showFavoritePicker=false) och visar den i Mer i stället, så Idag avlastas.
// Default (ingen prop) bevarar tidigare beteende (väljaren synlig), för standalone-
// render / fixtures. Vaktar BÅDA grenarna av flaggan.
describe('DailyMatchesView, favoritlags-väljarens synlighet (U2)', () => {
  it('visar favoritlags-väljaren som DEFAULT (showFavoritePicker ej satt)', async () => {
    const { container } = renderView(fixturesEnv(), <DailyMatchesView />);
    await waitSettled();
    await waitFor(() => {
      expect(container.querySelector('[data-favorite-team-control]')).not.toBeNull();
    });
  });

  it('DÖLJER favoritlags-väljaren när showFavoritePicker={false} (Idag-fliken, U2)', async () => {
    const { container } = renderView(
      fixturesEnv(),
      <DailyMatchesView showFavoritePicker={false} />
    );
    await waitSettled();
    // Vänta in att matchkorten är på plats (data redo) och bekräfta sedan att väljaren
    // ALDRIG renderats (den är gatad på flaggan, inte på data-laddning).
    await waitFor(() => {
      expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
    });
    expect(container.querySelector('[data-favorite-team-control]')).toBeNull();
  });
});

describe('DailyMatchesView, dynamiskt dags-tema (T8)', () => {
  // DATUM-STABILT (annars datum-kopplat): vyn väljer dagen ur det VERKLIGA "nu"
  // (followDayIndex), så utan en pinnad klocka SKIFTAR "vald dag" med kalendern. Under
  // slutspelet blir dagens matcher knockout-platser vars lag är null tills bracket-
  // seedningen löst dem (resolveKnockoutTeams kräver inmatade gruppresultat, som
  // fixtures-läget saknar), och temat faller då till 'date' i stället för 'teams'. Vi
  // pinnar därför klockan till premiärdagen (11 juni 2026), en GRUPPDAG med kända lag, så
  // testet deterministiskt får en dag MED lag och bevisar 'teams'-temat oavsett verkligt
  // datum. Bara Date fejkas (toFake: ['Date']) så providerns async-seedning + waitFor kör
  // på riktiga timers (samma mönster som hero-etikett-blocket nedan).
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-11T08:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hero:n bär dags-temats data-attribut + en --vm-day-hue när en dag har lag', async () => {
    const { container } = renderView(fixturesEnv(), <DailyMatchesView />);
    await waitSettled();
    await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0));

    const hero = container.querySelector<HTMLElement>('[data-daily-hero]');
    expect(hero).not.toBeNull();
    // Seamen är på plats: stabilt data-attribut för designen/test.
    expect(hero?.getAttribute('data-day-theme')).not.toBeNull();
    // Premiärdagen (11 juni 2026, pinnad klocka ovan) är en gruppdag med kända lag ->
    // aktivt tema med en hue satt som inline CSS-variabel på hero:ns dekor-yta.
    expect(hero?.getAttribute('data-day-theme')).toBe('active');
    expect(hero?.getAttribute('data-day-theme-source')).toBe('teams');
    const hue = hero?.style.getPropertyValue('--vm-day-hue');
    expect(hue).toBeTruthy();
    expect(Number(hue)).toBeGreaterThanOrEqual(0);
    expect(Number(hue)).toBeLessThan(360);
  });

  it('dags-temat ändras INTE av matchkortens text-/yt-färger (rör bara dekor)', async () => {
    // Kontrast-vakt (DOM-lagret): hero:ns dekor får en hue, men matchkorten (som
    // bär text) ska ALDRIG SÄTTA en inline --vm-day-hue själva. Vi bekräftar att
    // inget matchkort SÄTTER variabeln/attributet (seamen sitter bara på hero-ytan).
    //
    // VAD DEN HÄR VAKTEN VILAR PÅ (F2): den läser bara kortets EGNA inline-style,
    // alltså att kortet inte SÄTTER variabeln. Den kan INTE se ARV: "Dagens match"-
    // kortet renderas inne i .vm-daily-hero (som sätter --vm-day-hue inline), och
    // CSS-custom-properties ärvs nedåt, så en framtida kort-CSS-regel som LÄSER
    // var(--vm-day-hue) skulle vara osynlig för det här testet. Den luckan täcks av
    // den DOM-OBEROENDE käll-scannen i day-theme-contrast-guard.test.ts, som failar
    // om var(--vm-day-hue) konsumeras utanför .vm-daily-hero*-scopet. De två testen
    // är komplementära: detta vaktar SÄTTNING i DOM, käll-scannen vaktar KONSUMTION
    // i källan.
    const { container } = renderView(fixturesEnv(), <DailyMatchesView />);
    await waitSettled();
    await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0));

    for (const card of Array.from(container.querySelectorAll<HTMLElement>('[data-match-card]'))) {
      expect(card.style.getPropertyValue('--vm-day-hue')).toBe('');
      expect(card.getAttribute('data-day-theme')).toBeNull();
    }
  });
});

// HERO-ETIKETTEN "Dagens match" vs matchens datum (T32, #54, fynd 3). Daniel såg
// "DAGENS MATCH" fast nästa match var dagar bort (turneringen hade inte börjat).
// Etiketten ska säga "Dagens match" BARA när den framträdande matchen spelas IDAG,
// annars matchens dag ("torsdag 11 juni"). Vi fejkar BARA Date (toFake: ['Date']),
// så providerns async-seedning + waitFor kör på riktiga timers (samma mönster som
// ResultEntryView-fönstertesterna). Hero-etiketten är den FÖRSTA <p> i kolumnen
// bredvid nedräkningen; vi läser den via den framträdande matchens highlight-kort.
describe('DailyMatchesView, hero-etikett: "Dagens match" vs matchens datum (#54)', () => {
  /** Texten i etiketten ovanför hero:ns framträdande (highlight) matchkort. */
  function featuredLabelText(): string | null {
    // Det framträdande kortet bär ett (tomt) data-highlight-attribut. Etiketten är
    // dess föregående syskon (<p> ovanför kortet i samma kolumn-div). Kortets rot ÄR
    // en <article> (MatchCard, data-match-card), så vi tar dess FÖRÄLDER (kolumnen)
    // och läser kolumnens första <p>.
    const highlight = document.querySelector('[data-daily-hero] [data-match-card][data-highlight]');
    const column = highlight?.parentElement;
    const label = column?.querySelector('p');
    return label?.textContent?.trim() ?? null;
  }

  /**
   * Texten i highlight-CHIPPET inne i hero:ns framträdande kort (#54, C3). Chippet
   * är guld-brickan: en <dd> med title-attribut, hängd på <dt>Utvald</dt>. Den ska
   * ALLTID säga samma sak som etiketten ovanför (featuredLabelText).
   */
  function featuredChipText(): string | null {
    const chip = document.querySelector(
      '[data-daily-hero] [data-match-card][data-highlight] dd[title]'
    );
    return chip?.textContent?.trim() ?? null;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('visar "Dagens match" när den framträdande matchen spelas IDAG (premiärdagen)', async () => {
    // 2026-06-11 = premiärdagen (Mexiko-Sydafrika). Idag === matchens dag.
    vi.setSystemTime(new Date('2026-06-11T08:00:00.000Z'));
    renderView(fixturesEnv(), <DailyMatchesView />);
    await waitSettled();
    await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0));

    expect(featuredLabelText()).toBe('Dagens match');
    // Chippet inne i kortet säger SAMMA sak som etiketten (#54, C3).
    expect(featuredChipText()).toBe('Dagens match');
  });

  it('visar matchens DATUM (inte "Dagens match") när matchen inte är idag', async () => {
    // 2026-06-10 = dagen FÖRE premiären. Startdagen blir 11 juni (närmast kommande),
    // så den framträdande matchen är 11 juni, men IDAG är 10 juni -> etiketten ska
    // visa matchens dag, inte "Dagens match".
    vi.setSystemTime(new Date('2026-06-10T08:00:00.000Z'));
    renderView(fixturesEnv(), <DailyMatchesView />);
    await waitSettled();
    await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0));

    const label = featuredLabelText();
    expect(label).not.toBe('Dagens match');
    // Matchens dag, utan årtal (versaliseras av CSS, så jämför på gemener). Asserta
    // delsträngar (ICU-versioner kan skilja i interpunktion/mellanslag), inte exakt match.
    expect(label?.toLowerCase()).toContain('torsdag');
    expect(label?.toLowerCase()).toContain('11 juni');

    // Chippet inne i kortet följer etiketten: SAMMA datum-text, INTE "Dagens match"
    // (#54, C3, hela poängen). De ska aldrig divergera.
    const chip = featuredChipText();
    expect(chip).not.toBe('Dagens match');
    expect(chip).toBe(label);
  });
});

describe('DailyMatchesView, fel-väg (fail loud)', () => {
  it('visar role=alert när datakällan rejectar (genuint datakälle-fel), inte en tyst tom vy', async () => {
    renderView(fixturesEnv(), <DailyMatchesView />, createFailingDataSource());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Kunde inte ladda matcherna/i);
    // Ingen matchlista läcker fram i fel-läget.
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });
});

// TOPP-FÄLTET, LÄGESMEDVETET (Bit 3c, Daniels live-feedback). När en match PÅGÅR ska
// topp-fältet LEDA med live-blocket (det som händer NU) och flytta nedräkningen till en
// SEPARAT "Nästa avspark"-pelare , den statiska "dagens match"-hero:n får INTE visa en
// match som pågår. Vi sätter en pågående live-rad för en riktig schemamatch (g-F-1,
// Nederländerna-Japan) via useLiveData-mocken (samma re-nyckling appen gör i fixtures).
describe('DailyMatchesView, lägesmedvetet topp-fält när en match pågår (Bit 3c)', () => {
  /** En pågående live-rad för en riktig schemamatch (g-F-1). */
  function liveRow(matchId: string): LiveData {
    return {
      matchId,
      apiFixtureId: 1489376,
      status: 'live',
      elapsedMinute: 30,
      homeGoals: 1,
      awayGoals: 0,
      events: [],
      statistics: [],
      lineups: [],
      frozen: false,
      lastSyncedAt: new Date().toISOString(),
    };
  }

  function withLive(matchId: string) {
    liveDataMock.mockImplementation(() => ({
      status: 'ready',
      byMatchId: new Map<string, LiveData>([[matchId, liveRow(matchId)]]),
      error: null,
    }));
  }

  it('LEDER med live-blocket och visar INTE den statiska arena-hero:n', async () => {
    withLive('g-F-1');
    const { container } = renderView(fixturesEnv(), <DailyMatchesView />);
    await waitSettled();

    await waitFor(() => {
      expect(container.querySelector('[data-live-now]')).not.toBeNull();
    });
    // Den statiska "dagens match"-hero:n (som annars kunde visa en pågående match) är borta.
    expect(container.querySelector('[data-daily-hero]')).toBeNull();
    // Live-blocket är en etiketterad region.
    expect(screen.getByRole('region', { name: /live nu/i })).toBeInTheDocument();
  });

  it('håller nedräkningen i en SEPARAT "Nästa avspark"-pelare (åtskild från live)', async () => {
    withLive('g-F-1');
    const { container } = renderView(fixturesEnv(), <DailyMatchesView />);
    await waitSettled();

    await waitFor(() => {
      expect(container.querySelector('[data-live-now]')).not.toBeNull();
    });
    // Nedräkningen bor i sin egen pelare, ETT eget block skilt från live-blocket.
    const pillar = container.querySelector('[data-next-kickoff]');
    expect(pillar).not.toBeNull();
    // Pelaren ligger UTANFÖR live-blocket (inte nästlad i det), så de är två åtskilda block.
    expect(pillar?.closest('[data-live-now]')).toBeNull();
    // Och den bär faktiskt nedräknings-innehållet (eller sluttillståndet).
    expect(pillar?.querySelector('[data-countdown]')).not.toBeNull();
  });

  it('INGEN live -> behåller den vanliga arena-hero:n (oförändrat)', async () => {
    // Default-mocken (no-live) gäller: hero:n ska finnas, live-blocket inte.
    const { container } = renderView(fixturesEnv(), <DailyMatchesView />);
    await waitSettled();
    await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0));

    expect(container.querySelector('[data-daily-hero]')).not.toBeNull();
    expect(container.querySelector('[data-live-now]')).toBeNull();
  });
});

// HÖJDPUNKTER NYTT-BADGEN: visas BARA (inom tidsfönstret) OCH (användaren inte klickat
// än); efter första klicket på valfritt kort försvinner den på ALLA kort (per enhet,
// persisterat). Tidsfönstret (isHighlightsFeatureNew) är BACKUP för den som aldrig klickar.
//
// Deterministisk setup: vi fejkar BARA Date (toFake: ['Date'], samma mönster som
// hero-etikett-testerna ovan) och pinnar klockan på lanseringsdagen (inom fönstret),
// samt injicerar en datakälla med EN färdigspelad match (bär höjdpunkts-pillen) + EN
// kommande match samma svenska dag (så dagen inte rullar vidare och hero:n har en
// ospelad "dagens match"). Den färdigspelade matchen visas i LISTAN med pillen + badgen.
describe('DailyMatchesView, höjdpunkter NYTT-badge: visa, dölj vid klick + tidsbox-backup', () => {
  const team = (id: string, name: string): Team => ({
    id,
    name,
    code: id.toUpperCase(),
    group: 'A',
  });
  const teams: Team[] = [
    team('mex', 'Mexiko'),
    team('rsa', 'Sydafrika'),
    team('fra', 'Frankrike'),
    team('arg', 'Argentina'),
  ];
  const groups: Group[] = [{ id: 'A', teamIds: ['mex', 'rsa', 'fra', 'arg'] }];

  /** En färdigspelad gruppmatch (bär höjdpunkts-pillen) på lanseringsdagens svenska dag. */
  const finishedMatch: Match = {
    id: 'g-A-1',
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'mex',
    awayTeamId: 'rsa',
    kickoff: '2026-06-18T10:00:00.000Z',
    venue: 'Arena ej verifierad (egen data-punkt)',
    tvChannel: 'TV4',
    status: 'finished',
    result: { homeGoals: 2, awayGoals: 1 },
  };
  /** En KOMMANDE match samma svenska dag, så followDayIndex inte rullar vidare (todayAllFinished=false). */
  const scheduledMatch: Match = {
    id: 'g-A-2',
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'fra',
    awayTeamId: 'arg',
    kickoff: '2026-06-18T18:00:00.000Z',
    venue: 'Arena ej verifierad (egen data-punkt)',
    tvChannel: 'TV4',
    status: 'scheduled',
    result: null,
  };

  function highlightsSource(): DataSource {
    return {
      getTeams: () => Promise.resolve(teams),
      getGroups: () => Promise.resolve(groups),
      getMatches: () => Promise.resolve([finishedMatch, scheduledMatch]),
    };
  }

  /** Höjdpunkts-länken i den färdigspelade matchens kort (g-A-1, Mexiko-Sydafrika). */
  async function findHighlightsLink() {
    return screen.findByRole('link', {
      name: /Se höjdpunkter.*Mexiko mot Sydafrika/,
    });
  }

  beforeEach(() => {
    window.localStorage.clear();
    // Fejka bara Date (samma som hero-etikett-testerna): providerns async-seed + waitFor
    // kör på riktiga timers. Pinnad på lanseringsdagen (HIGHLIGHTS_FEATURE_LAUNCH_MS, UTC-
    // midnatt 2026-06-18) + 8h = klart INOM 14-dagars-fönstret.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(HIGHLIGHTS_FEATURE_LAUNCH_MS + 8 * 60 * 60 * 1000));
  });
  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('(a) VISAR NYTT-badgen när inom fönstret OCH ej sedd (ingen flagga satt)', async () => {
    renderView(fixturesEnv(), <DailyMatchesView />, highlightsSource());
    await waitSettled();
    const link = await findHighlightsLink();
    // Inom fönstret + ej klickat -> NYTT (data-haken satt, "(ny funktion)" i a11y-namnet).
    expect(link).toHaveAttribute('data-highlights-new', '');
    expect(link).toHaveAccessibleName(/Se höjdpunkter \(ny funktion\)/);
  });

  it('(b) DÖLJER NYTT-badgen när seen-flaggan redan är satt (även inom fönstret)', async () => {
    // Klickat på en TIDIGARE enhets-session: flaggan är satt -> ingen badge trots fönstret.
    window.localStorage.setItem(HIGHLIGHTS_SEEN_KEY, '1');
    renderView(fixturesEnv(), <DailyMatchesView />, highlightsSource());
    await waitSettled();
    const link = await findHighlightsLink();
    expect(link).not.toHaveAttribute('data-highlights-new');
    expect(link).toHaveAccessibleName(/Se höjdpunkter för Mexiko mot Sydafrika/);
  });

  it('(c) KLICK på pillen sätter flaggan + badgen FÖRSVINNER (på kortet)', async () => {
    renderView(fixturesEnv(), <DailyMatchesView />, highlightsSource());
    await waitSettled();
    const link = await findHighlightsLink();
    expect(link).toHaveAttribute('data-highlights-new', '');

    fireEvent.click(link);

    // Flaggan persisterades (per enhet) och badgen försvinner (re-render utan NYTT).
    expect(window.localStorage.getItem(HIGHLIGHTS_SEEN_KEY)).toBe('1');
    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: /Se höjdpunkter.*Mexiko mot Sydafrika/ })
      ).not.toHaveAttribute('data-highlights-new');
    });
  });

  it('(d) klicket BLOCKERAR INTE navigeringen (href/target intakt, ingen preventDefault)', async () => {
    renderView(fixturesEnv(), <DailyMatchesView />, highlightsSource());
    await waitSettled();
    const link = await findHighlightsLink();
    const href = link.getAttribute('href') ?? '';
    expect(href.startsWith('https://www.youtube.com/results?')).toBe(true);
    expect(link).toHaveAttribute('target', '_blank');

    // fireEvent.click (RTL-wrappat i act) returnerar false om eventet AVBRÖTS
    // (preventDefault kallades). true här = ingen preventDefault -> webbläsaren
    // navigerar som vanligt. Ett onClick som e.preventDefault():ar rödnar detta.
    const notPrevented = fireEvent.click(link);
    expect(notPrevented).toBe(true);
  });

  it('(e) tidsbox-BACKUP: ej sedd men EFTER fönstret -> badgen dold', async () => {
    // Efter 14-dagars-fönstret (launch + 14 dygn + 1h): isHighlightsFeatureNew=false, så
    // badgen är dold ÄVEN för en användare som aldrig klickat (frånvarande seen-flagga).
    const afterWindow = HIGHLIGHTS_FEATURE_LAUNCH_MS + 14 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000;
    vi.setSystemTime(new Date(afterWindow));
    renderView(fixturesEnv(), <DailyMatchesView />, highlightsSource());
    await waitSettled();
    const link = await findHighlightsLink();
    expect(window.localStorage.getItem(HIGHLIGHTS_SEEN_KEY)).toBeNull(); // aldrig klickat
    expect(link).not.toHaveAttribute('data-highlights-new');
  });
});
