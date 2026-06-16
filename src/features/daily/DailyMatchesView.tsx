// Den dagliga matchvyn (T7, issue #7): startskärmens hjärta.
//
// Ansvar (senior-devs FUNKTIONELLA + tillgängliga lager): rendera dagens matcher
// (tid, svensk TV-kanal, ev. arena), en datumnavigering dag för dag, en "Match of
// the day"-hero med live-nedräkning till nästa avspark, och de icke-happy-path-
// tillstånden (loading/error/tom dag). All data + logik kommer från useDailyMatches
// (delad store + rena härledningar); vyn är en tunn konsument.
//
// VISUELL DESIGN (design-frontend-agentens lager, ovanpå): WOW-hero, premium-
// matchkort, nedräknings-visual. Vyn ger en STABIL semantik + data-attribut
// (data-match-card, data-highlight, data-countdown) att hänga premium-styling på,
// och håller färg via semantiska tokens (inga inbakade statusfärger, T7-pin:
// accent==success-grön i ljust tema, baka inte in en krock).
//
// MÅSTE renderas inuti en <ResultsProvider> (useDailyMatches -> useResultsStore
// fail-loud:ar annars). Speldagar/dag-gruppering är i SVENSK tid (kickoff är UTC),
// se group-matches-by-day.ts (off-by-one-skyddet).

import { useMemo } from 'react';
import type { Match, Team } from '../../domain/types';
import { Fade, Slide, transitions } from '../../motion';
import { useDailyMatches } from './use-daily-matches';
import { useLiveData } from './use-live-data';
import { useDayTheme } from './use-day-theme';
import { useTodayKey } from './use-today-key';
import { localDateKey } from './group-matches-by-day';
import { MatchCard } from './MatchCard';
import { LiveNowSection } from './LiveNowSection';
import { selectLiveFeed } from './live-feed';
import { MatchReactions, MatchComments } from '../rooms';
import { useFavoriteTeam, matchHasFavorite, FavoriteTeamPicker } from '../favorite-team';
import { formatDayHeading, formatDayHeadingNoYear, formatDayShort } from './format-datetime';
import type { CountdownState } from './countdown';
import { stageLabel, teamDisplayName } from './match-display';

/**
 * Etiketten ovanför hero:ns framträdande match: "Dagens match" BARA när matchen
 * faktiskt spelas idag (svensk kalenderdag), annars matchens dag ("torsdag 11
 * juni"), versaliserad av CSS. T32 (#54, fynd 3): turneringen kan ligga dagar bort
 * (premiär 11 juni), och då var "Dagens match" missvisande, matchen är inte idag.
 *
 * @param match    Den framträdande matchen (kickoff i UTC).
 * @param todayKey Dagens svenska kalenderdag-nyckel (YYYY-MM-DD) från useTodayKey.
 */
function featuredMatchLabel(match: Match, todayKey: string): string {
  const matchDayKey = localDateKey(match.kickoff);
  return matchDayKey === todayKey ? 'Dagens match' : formatDayHeadingNoYear(matchDayKey);
}

/** Bygg ett snabbt teamId -> Team-uppslag (en gång per lag-lista). */
function indexTeams(teams: readonly Team[]): Map<string, Team> {
  return new Map(teams.map((t) => [t.id, t]));
}

/**
 * En enskild nedräknings-enhet som en upphöjd "tile" (t.ex. "02" + "tim").
 * tabular-nums + fast bredd = siffran hoppar aldrig i sidled (ingen CLS när
 * sekunderna tickar). Tilen bär en svag yt-ton så enheterna känns som en rad
 * fysiska brickor, en premium-detalj för startskärmens hjärta.
 */
function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="inline-flex min-w-[2.25rem] items-center justify-center rounded-md border border-border px-2 py-1.5 font-display text-2xl font-bold tabular-nums leading-none sm:min-w-[2.75rem] sm:text-4xl"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-fg) 6%, var(--color-surface-raised))',
        }}
      >
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-[0.625rem] uppercase tracking-[0.15em] text-fg-muted">{label}</span>
    </div>
  );
}

/** En dekorativ separator-prick mellan nedräknings-tilarna. aria-hidden. */
function CountdownSeparator() {
  return (
    <span aria-hidden="true" className="-mt-3 self-center text-2xl font-bold text-fg-muted">
      :
    </span>
  );
}

/**
 * Live-nedräkningen i hero:n. Renderar enheterna vid 'upcoming', annars ett
 * lugnt sluttillstånd ('no-upcoming' = efter finalen / inga matcher). aria-live
 * polite så en skärmläsare inte spammas varje sekund men ändå får uppdateringar.
 */
function Countdown({
  countdown,
  teamsById,
}: {
  countdown: CountdownState;
  teamsById: ReadonlyMap<string, Team>;
}) {
  if (countdown.kind === 'no-upcoming') {
    return (
      <p data-countdown="done" className="text-sm text-fg-muted">
        Alla matcher är spelade. Tack för det här mästerskapet.
      </p>
    );
  }

  const { match, remaining } = countdown;
  const home = teamDisplayName(match.homeTeamId, teamsById);
  const away = teamDisplayName(match.awayTeamId, teamsById);

  return (
    <div data-countdown="live" className="flex flex-col gap-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
        {/* Pulsande "live"-prick: hero:n känns levande. CSS-pulsen (vm-live-dot)
            stannar vid reducerad rörelse (index.css), så ingen distraktion. */}
        <span
          aria-hidden="true"
          className="vm-live-dot inline-block h-2 w-2 rounded-pill bg-accent"
        />
        <span>
          Nästa avspark: <span className="font-semibold text-fg">{home}</span> mot{' '}
          <span className="font-semibold text-fg">{away}</span> ({stageLabel(match)})
        </span>
      </p>
      {/* aria-live polite: tiden uppdateras varje sekund i DOM:en, men vi ger
          också en sammanfattande aria-label så skärmläsaren kan läsa hela
          nedräkningen som en mening i stället för fyra lösa tal. */}
      <div
        aria-live="polite"
        aria-label={`Tid till avspark: ${remaining.days} dagar, ${remaining.hours} timmar, ${remaining.minutes} minuter, ${remaining.seconds} sekunder`}
        className="flex items-start gap-2 sm:gap-3"
      >
        <CountdownUnit value={remaining.days} label="dgr" />
        <CountdownSeparator />
        <CountdownUnit value={remaining.hours} label="tim" />
        <CountdownSeparator />
        <CountdownUnit value={remaining.minutes} label="min" />
        <CountdownSeparator />
        <CountdownUnit value={remaining.seconds} label="sek" />
      </div>
    </div>
  );
}

/**
 * "Nästa avspark" som ett SEPARAT, SEKUNDÄRT block (Bit 3c). När en match pågår LEDER
 * live-blocket (LiveNowSection) sidan; nedräkningen flyttas hit, till en egen lugn pelare
 * med tydligt mindre tyngd än den stora arena-hero:n , så "vad kommer sen" aldrig
 * konkurrerar med "vad händer nu". Egen rubrik + eget utrymme, men samma nedräknings-
 * innehåll (Countdown), så det är EN sanning för nedräkningen (DRY). Nedräkningen pekar
 * redan på nästa OSPELADE avspark (computeCountdown hoppar över pågående/spelade matcher),
 * så denna pelare kan aldrig visa en match som live-blocket redan visar.
 */
function NextKickoffPillar({
  countdown,
  teamsById,
}: {
  countdown: CountdownState;
  teamsById: ReadonlyMap<string, Team>;
}) {
  return (
    <div
      data-next-kickoff=""
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-[var(--vm-shadow-card)] sm:p-6"
    >
      <p className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-fg-muted">
        Nästa avspark
      </p>
      <Countdown countdown={countdown} teamsById={teamsById} />
    </div>
  );
}

export interface DailyMatchesViewProps {
  /**
   * Visa favoritlags-väljaren i matchvyns header. Default true (bevarar tidigare
   * beteende, t.ex. i fixtures-/standalone-render). Idag-fliken sätter false (U2):
   * väljaren är en INSTÄLLNING och flyttas till Mer, så Idag avlastas och leder med
   * matcherna. Den DISKRETA lyftningen av favoritlagets matcher i listan/hero:n
   * påverkas INTE av detta (den läser favoritlags-storen, inte väljaren), så ett valt
   * favoritlag lyfts som förr även när väljaren bor i en annan flik.
   */
  showFavoritePicker?: boolean;
}

export function DailyMatchesView({ showFavoritePicker = true }: DailyMatchesViewProps = {}) {
  const {
    status,
    mode,
    error,
    teams,
    days,
    selectedIndex,
    selectedDay,
    matchOfTheDay,
    countdown,
    canGoPrev,
    canGoNext,
    goPrev,
    goNext,
  } = useDailyMatches();
  const teamsById = useMemo(() => indexTeams(teams), [teams]);
  // Dagens svenska kalenderdag (dag-medvetet: flyttar sig över midnatt/PWA-väckning,
  // se use-today-key). Driver hero-etiketten "Dagens match" vs matchens datum (#54).
  const { todayKey } = useTodayKey();

  // PINNAT FAVORITLAG (T23, #23): lyft favoritlagets matcher DISKRET i listan (+ hero:n
  // om dagens match rör laget). Tolerant hook (ingen provider -> null), så vyn fungerar
  // oförändrat utan favoritlags-providern. Markeringen är ren visning, ingen data-yta.
  const { favoriteTeamId } = useFavoriteTeam();

  // LIVE-DATA (Bit 3b, #181): persisterad live-data per match-id, färsk via realtid.
  // Berikar varje matchkort med ett livekort när det FINNS live-data (pågående ELLER
  // avslutad/frusen match), faller annars tillbaka till kortets vanliga utseende. I
  // fixtures-läge bär hooken den committade demo-matchen (re-nycklad till app-match-id),
  // så livekortet syns utan backend. byMatchId är referens-stabil tills datan ändras.
  const { byMatchId: liveByMatchId } = useLiveData();

  // ALLA turneringens matcher per id (Bit 3c): live-blocket leder med matcher som PÅGÅR
  // var som helst i schemat, inte bara den valda dagen, så ett uppslag mot HELA
  // match-listan behövs (live-datan är nycklad på app-match-id). days rymmer varje
  // kalenderdag i spannet, så en flatten ger alla matcher. Referens-stabil tills days byts.
  const matchById = useMemo(() => {
    const map = new Map<string, Match>();
    for (const day of days) {
      for (const match of day.matches) {
        map.set(match.id, match);
      }
    }
    return map;
  }, [days]);

  // PÅGÅENDE MATCHER (Bit 3c, Daniels live-feedback): de matcher som faktiskt rullar just
  // nu (live/paus), ordnade mest relevant först. Tom lista = inget pågår -> topp-fältet
  // behåller sitt vanliga utseende (nedräkning + dagens match). Finns minst en live -> vyn
  // LEDER med live-blocket och flyttar nedräkningen till en separat sekundär pelare, så en
  // pågående match aldrig krockar med "nästa avspark" (rent urval i selectLiveFeed).
  const liveFeed = useMemo(
    () => selectLiveFeed(liveByMatchId, matchById, teamsById),
    [liveByMatchId, matchById, teamsById]
  );
  const hasLive = liveFeed.length > 0;

  // Dynamiskt DAGS-TEMA (T8): härled en subtil, deterministisk accent-hue ur den
  // valda dagens lag och lägg den som en CSS-variabel + stabilt data-attribut på
  // hero:ns dekor-yta. Påverkar BARA dekorativa ytor (design-frontend väver in
  // hue:n i gradienter/glow), aldrig text-/yt-tokens, så läsbarheten (WCAG AA)
  // aldrig sänks (kontrast-vakt, decisions.md T8). Mjuka övergångar vid dag-byte
  // sköts av en CSS-transition på ytan (design-frontend), som reduced-motion-
  // grinden i index.css nollar. Tom/ingen vald dag -> default-tema (ingen hue).
  const { dayThemeProps } = useDayTheme(
    selectedDay?.matches ?? [],
    teamsById,
    selectedDay?.dateKey
  );

  return (
    <section aria-labelledby="dagens-matcher-rubrik" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Matcher
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="dagens-matcher-rubrik" className="font-display text-2xl font-bold sm:text-3xl">
            Dagens matcher
          </h2>
          {mode === 'fixtures' ? <span className="vm-demo-chip">Demo-data</span> : null}
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          Bläddra dag för dag genom mästerskapet. Tider visas i svensk tid med svensk TV-kanal.
        </p>

        {/* FAVORITLAGS-VÄLJAREN (T23, #23): pinna ett lag så dess matcher lyfts diskret i
            listan. Visas först när lagen laddats (annars en tom väljare). Egen liten yta
            under rubriken, lågmäld. U2: Idag-fliken döljer väljaren (showFavoritePicker=
            false) och visar den i stället i Mer, eftersom det är en INSTÄLLNING , så Idag
            inte blir en vägg. Den diskreta match-lyftningen påverkas inte (läser storen). */}
        {showFavoritePicker && teams.length > 0 ? (
          <div className="mt-1 max-w-md rounded-card border border-border bg-surface p-4 shadow-[var(--vm-shadow-card)]">
            <FavoriteTeamPicker teams={teams} />
          </div>
        ) : null}
      </header>

      {status === 'loading' ? (
        <p role="status" className="text-sm text-fg-muted">
          Laddar matcher ...
        </p>
      ) : null}

      {status === 'error' ? (
        <Fade>
          <p
            role="alert"
            className="flex items-start gap-3 rounded-card border px-4 py-3 text-sm"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-danger) 50%, transparent)',
              backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
              color: 'var(--color-danger)',
            }}
          >
            <span aria-hidden="true" className="mt-0.5 text-base leading-none">
              !
            </span>
            <span>Kunde inte ladda matcherna: {error}</span>
          </p>
        </Fade>
      ) : null}

      {status === 'ready' && days.length === 0 ? (
        <p className="rounded-card border border-border bg-surface px-4 py-8 text-center text-sm text-fg-muted">
          Inga matcher i spelschemat än.
        </p>
      ) : null}

      {status === 'ready' && days.length > 0 ? (
        <>
          {/* TOPP-FÄLTET, LÄGESMEDVETET (Bit 3c, Daniels live-feedback):
              - PÅGÅR en match (hasLive): LED med live-blocket (LiveNowSection) , det som
                händer NU i fokus , och flytta nedräkningen till en SEPARAT, sekundär
                "Nästa avspark"-pelare med mindre tyngd. Så en pågående match visas aldrig
                som ett statiskt "dagens match"-kort, och "nu" vs "sen" är tydligt åtskilt.
              - INGET pågår: behåll den vanliga arena-hero:n (nedräkning + dagens match)
                helt oförändrad , den är bara ett problem när något faktiskt pågår. */}
          {hasLive ? (
            <Slide direction="up">
              <div className="flex flex-col gap-4">
                <LiveNowSection entries={liveFeed} />
                <NextKickoffPillar countdown={countdown} teamsById={teamsById} />
              </div>
            </Slide>
          ) : (
            // Hero: "Match of the day" + live-nedräkning, startskärmens hjärta.
            // Konceptet är "arena i kvällsljus" (SPEC §7): en djup, mörk fond med
            // ett pitch-grönt ljus som tänds ur hörnen, plus ett långsamt rörligt
            // ljus-svep (aria-hidden, stannar vid reducerad rörelse). Nedräkningen
            // pekar mot turneringens NÄSTA avspark (inte nödvändigtvis vald dag),
            // hero-kortet mot den valda dagens framträdande match.
            <Slide direction="up">
              <div
                data-daily-hero=""
                data-day-theme={dayThemeProps['data-day-theme']}
                data-day-theme-source={dayThemeProps['data-day-theme-source']}
                className="vm-daily-hero relative isolate overflow-hidden rounded-card border border-border shadow-[var(--vm-shadow-raised)]"
                // Dags-temats hue (--vm-day-hue) injiceras via seamen som en INLINE-
                // OVERRIDE i style när dagen har lag. Hero-dekoren (radiella ljus +
                // sheen) byggs i .vm-daily-hero (tokens.css §6) och tonas mot hue:n
                // när data-day-theme='active'. --vm-day-hue har alltid en default i
                // :root (tokens.css), så i default-läget saknas inte variabeln, det
                // som saknas är den dynamiska inline-override:n: ingen ton-skiftning
                // sker och dekoren faller på T2:s neutrala ton (default-grenen styrs
                // av data-day-theme). Den dynamiska tonen lever BARA i background-image
                // (dekor), aldrig i en text-/yt-token, så läsbarheten (WCAG AA) kan
                // inte sänkas (kontrast-vakt).
                style={dayThemeProps.style}
              >
                {/* Rörligt ljus-svep: ett brett, mjukt sken som långsamt drar över
                    fonden (arena-strålkastare). Rent dekorativt, aria-hidden.
                    vm-hero-sheen driver animationen (index.css, stannar vid reducerad
                    rörelse); vm-daily-hero-sheen bär själva gradienten (tonas mot
                    dagens hue i active-läget, tokens.css §6). */}
                <div
                  aria-hidden="true"
                  className="vm-hero-sheen vm-daily-hero-sheen pointer-events-none absolute inset-0 -z-10 opacity-70"
                />

                <div className="flex flex-col gap-7 p-5 sm:p-7 lg:flex-row lg:items-stretch lg:gap-10 lg:p-8">
                  {/* Vänster: nedräkningen, hero:ns drama. */}
                  <div className="flex flex-col justify-center gap-3 lg:flex-1">
                    <p className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                      Nedräkning till avspark
                    </p>
                    <Countdown countdown={countdown} teamsById={teamsById} />
                  </div>

                  {matchOfTheDay
                    ? (() => {
                        // EN etikett, DELAD av hero-rubriken OCH kortets highlight-chip,
                        // så de aldrig säger olika saker (datum ovanför men "Dagens match"
                        // i chippet). "Dagens match" bara när matchen spelas IDAG; annars
                        // matchens dag ("TORSDAG 11 JUNI", versaliserat av uppercase-
                        // klassen), så etiketten aldrig ljuger när turneringen ligger
                        // dagar bort (#54, fynd 3 + C3).
                        const heroLabel = featuredMatchLabel(matchOfTheDay, todayKey);
                        return (
                          <div className="flex flex-col gap-2 lg:max-w-sm lg:flex-1">
                            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-fg-muted">
                              {heroLabel}
                            </p>
                            <MatchCard
                              match={matchOfTheDay}
                              teamsById={teamsById}
                              highlight
                              highlightLabel={heroLabel}
                              favorite={matchHasFavorite(
                                favoriteTeamId,
                                matchOfTheDay.homeTeamId,
                                matchOfTheDay.awayTeamId
                              )}
                            />
                          </div>
                        );
                      })()
                    : null}
                </div>
              </div>
            </Slide>
          )}

          {/* Datumnavigering: föregående/nästa speldag + dagens rubrik. Riktiga
              <button>:ar med disabled vid kant (a11y/tangentbord). Rubriken är
              ett aria-live region så bläddring annonseras. Knapparna får en
              hover-lyft (accent-kant) så de känns tryckbara, och pilen + dagen
              staplas så en lång svensk dag-etikett aldrig tränger ut layouten. */}
          <nav
            aria-label="Datumnavigering"
            className="flex items-center justify-between gap-2 rounded-card border border-border bg-surface px-2 py-2 shadow-[var(--vm-shadow-card)] sm:gap-3 sm:px-3"
          >
            <button
              type="button"
              onClick={goPrev}
              disabled={!canGoPrev}
              aria-label={
                canGoPrev
                  ? `Föregående speldag, ${formatDayShort(days[selectedIndex - 1].dateKey)}`
                  : 'Föregående speldag'
              }
              className="group flex items-center gap-1.5 rounded-pill px-3 py-2 text-sm font-semibold transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <span
                aria-hidden="true"
                className="text-base leading-none text-fg-muted transition-colors group-hover:text-accent group-disabled:text-fg-muted"
              >
                ‹
              </span>
              <span aria-hidden="true" className="hidden sm:inline">
                {canGoPrev ? formatDayShort(days[selectedIndex - 1].dateKey) : 'Tidigare'}
              </span>
            </button>

            <p
              aria-live="polite"
              className="flex-1 text-center font-display text-sm font-bold capitalize sm:text-base"
            >
              {selectedDay ? formatDayHeading(selectedDay.dateKey) : ''}
            </p>

            <button
              type="button"
              onClick={goNext}
              disabled={!canGoNext}
              aria-label={
                canGoNext
                  ? `Nästa speldag, ${formatDayShort(days[selectedIndex + 1].dateKey)}`
                  : 'Nästa speldag'
              }
              className="group flex items-center gap-1.5 rounded-pill px-3 py-2 text-sm font-semibold transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <span aria-hidden="true" className="hidden sm:inline">
                {canGoNext ? formatDayShort(days[selectedIndex + 1].dateKey) : 'Senare'}
              </span>
              <span
                aria-hidden="true"
                className="text-base leading-none text-fg-muted transition-colors group-hover:text-accent group-disabled:text-fg-muted"
              >
                ›
              </span>
            </button>
          </nav>

          {/* Dagens matchlista. En tom dag ÄR ett förväntat tillstånd: `days`
              rymmer nu varje kalenderdag i turneringsspannet inklusive vilodagar
              (group-matches-by-day, C7), så datumnavigeringen kan landa på en
              vilodag och då visas vilodags-panelen nedan i stället för en blank yta.

              Match-of-the-day FRAMHÄVS inte igen i listan: hero:n kröner den redan
              ovanför, så ett andra identiskt featured-kort vore en visuell dubblett.
              I listan visas den som ett vanligt kort (kortet bär dock alltid sin
              egen a11y-sammanfattning, så inget tappas för skärmläsare). */}
          {selectedDay && selectedDay.matches.length > 0 ? (
            // EN CENTRERAD ENKEL-KOLUMN (omdesign, Daniels rot-fix): korten staplas
            // vertikalt i en kolumn med max-bredd, så VARJE kort får sin EGEN höjd.
            // Tidigare var detta ett 2-/3-kolumns-rutnät där kort med olika mycket
            // innehåll (mål, kort, utfälld statistik, kommentarer) tvingades dela
            // radhöjd , ett kort sträcktes ut och grann-kortet blev tomt, och en
            // expandering/kommentar drog ut grannen. I en enkel-kolumn kan inget kort
            // dela höjd med ett annat, så expandering och kommentarer påverkar bara
            // sitt EGET kort. Mobil-först: på telefon var det redan en kolumn
            // (oförändrat); på bredare skärm centreras kolumnen i stället för att bli
            // två/tre. Max-bredden håller radlängden behaglig (ingen utdragen rad på
            // ultrawide), mx-auto centrerar.
            <ul className="m-0 mx-auto flex w-full max-w-[40rem] list-none flex-col gap-4 p-0">
              {selectedDay.matches.map((match, i) => (
                <li key={match.id}>
                  <Slide
                    direction="up"
                    transition={{ ...transitions.smooth, delay: Math.min(i * 0.04, 0.32) }}
                  >
                    {/* Fotraden i LIST-korten (matchkorten där snacket händer): reaktions-
                        raden (T24, #24) + den HOPFÄLLDA kommentar-affordansen (T77, #161),
                        i samma anda, per match, per rum. Båda självhider när sitt lager är
                        inaktivt (lokalt läge / inget aktivt rum), så ett kort utan rum ser
                        ut precis som förr. Hero-kortet ovanför får ingen fotrad: matchen
                        visas ändå i listan här, så vi undviker två snack-ytor för samma
                        match (KISS, decisions.md T24/T77). Kommentarerna ligger UNDER
                        reaktionsraden, hopfällda default så kortet inte blir rörigt (Daniel
                        mån om det). */}
                    <MatchCard
                      match={match}
                      teamsById={teamsById}
                      liveData={liveByMatchId.get(match.id) ?? null}
                      footer={
                        <>
                          <MatchReactions matchId={match.id} />
                          <MatchComments matchId={match.id} />
                        </>
                      }
                      favorite={matchHasFavorite(
                        favoriteTeamId,
                        match.homeTeamId,
                        match.awayTeamId
                      )}
                    />
                  </Slide>
                </li>
              ))}
            </ul>
          ) : (
            // Tom dag (vanligt FÖRE turneringsstarten 11 juni): ingen blank yta,
            // utan en lugn, prydlig "vilodag"-panel som pekar vidare mot nästa
            // speldag i stället. Nedräkningen i hero:n bär själva väntan.
            <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center">
              <span
                aria-hidden="true"
                className="inline-flex h-11 w-11 items-center justify-center rounded-pill border border-border text-lg text-fg-muted"
                style={{
                  backgroundColor:
                    'color-mix(in srgb, rgb(var(--vm-glow-accent)) 8%, var(--color-surface-raised))',
                }}
              >
                ⚽
              </span>
              <p className="font-display text-base font-bold">Ingen match den här dagen</p>
              <p className="max-w-sm text-sm text-fg-muted">
                {canGoNext
                  ? 'En vilodag i mästerskapet. Bläddra framåt till nästa speldag, eller följ nedräkningen ovan.'
                  : 'Följ nedräkningen ovan till nästa avspark.'}
              </p>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
