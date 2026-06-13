// App-shell , den färdiga app-vyn.
//
// Headern bär wordmark + tema-toggle + nät-status, och main:en de RIKTIGA vyerna
// (daglig matchvy, gruppspel, "vad krävs", slutspelsträd, resultatinmatning,
// tips-ligan). T2:s "designfundament"-showcase (palett/rörelse/typografi-prov)
// togs bort i T31 (#51, Daniels feedback): den var byggnadsställning som inte
// hör hemma i den färdiga appen. Tema-TOGGLEN i headern är INTE showcasen och
// är kvar, den är en riktig funktion.

import type { ReactNode } from 'react';
import { Fade, Slide } from './motion';
import { ThemeToggle } from './components/ThemeToggle';
import { Wordmark } from './components/Wordmark';
import { DailyMatchesView } from './features/daily';
import { GroupStageView } from './features/groups';
import { BracketView } from './features/bracket';
import { GoalCelebrationOverlay, ResultEntryGate, ResultsProvider } from './features/results';
import { ScenarioView } from './features/scenarios';
import { SimulationBanner, SimulationFrame } from './features/simulation';
import { TeamProfileProvider } from './features/team-profile';
import {
  RoomSection,
  RoomsProvider,
  ReactionsProvider,
  MatchCommentsProvider,
  useRoomsStore,
} from './features/rooms';
import { OfficialResultsProvider } from './features/official-results';
import { PredictionSection, PredictionsProvider } from './features/predictions';
import { GroupPredictionSection } from './features/group-predictions';
import { BracketPredictionSection } from './features/bracket-predictions';
import { LeaderboardProvider, LeaderboardSection } from './features/leaderboard';
import { FavoriteTeamProvider } from './features/favorite-team';
import { AdminSection } from './features/admin';
import {
  InstallButton,
  OnboardingDialog,
  OnlineStatusIndicator,
  SettingsControl,
  UpdatePrompt,
  useOnboarding,
} from './features/app-settings';
import { SectionNav, SectionNavProvider } from './features/section-nav';
import { VersionStamp } from './components/VersionStamp';

/** Ett innehållskort på en yt-token, delad yt-form för app-vyns sektioner. */
function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-[var(--vm-shadow-card)] sm:p-7">
      {children}
    </section>
  );
}

/**
 * Online-indikatorn KOPPLAD till rums-synk-läget (T14). `live` är true när det
 * finns ett aktivt rum med delad server-data, då speglar indikatorn synk-status
 * ärligt; annars (lokalt läge / inget rum) faller den till T13:s "fungerar ändå".
 * Wiringen bor här (inte i app-settings) så app-settings slipper ett beroende till
 * rums-feature:n (undviker cirkulärt beroende).
 */
function SyncAwareOnlineStatus() {
  const rooms = useRoomsStore();
  return <OnlineStatusIndicator live={rooms.enabled && rooms.activeRoom !== null} />;
}

export default function App() {
  return (
    // RoomsProvider omsluter hela appen (T14): det sociala rums-lagret + auth.
    // Är Supabase inte konfigurerat är det inaktivt (enabled=false) och appen
    // fungerar lokalt precis som förr. Online-indikatorn läser dess synk-läge.
    //
    // OfficialResultsProvider (T42, #72): det GLOBALA facit-lagret + admin-status.
    // Ligger INNANFÖR RoomsProvider (delar auth-sessionen) och OMSLUTER hela appen
    // så topplistan (facit-källan), resultat-feedback och admin-inmatningen alla
    // läser SAMMA globala facit. Vilande utan Supabase, precis som rums-lagret.
    <RoomsProvider>
      <OfficialResultsProvider>
        {/* FavoriteTeamProvider (T23, #23): det pinnade favoritlaget (localStorage,
            per-enhet, ingen Supabase-yta). Omsluter hela appen så dagsvyn (lyfter
            favoritlagets matcher) och favoritlags-väljaren delar samma favorit-store.
            (Personliga statistiken läser LeaderboardStore, inte denna.) Vilande utan
            effekt om inget lag är pinnat; helt oberoende av Supabase. */}
        <FavoriteTeamProvider>
          <AppShell />
        </FavoriteTeamProvider>
      </OfficialResultsProvider>
    </RoomsProvider>
  );
}

function AppShell() {
  // EN onboarding-instans ägs här och delas med både touren och install-gaten,
  // så "är touren öppen?" är EN sanning (inte två divergerande hook-tillstånd).
  const onboarding = useOnboarding();
  return (
    // SectionNavProvider (T78, #165) omsluter hela skalet: sektionerna registrerar sig
    // själva när de FAKTISKT renderar (useRegisterSection i varje vy), och den sticky
    // chip-raden under headern (SectionNav) läser registret + scroll-spy:n. En sektion som
    // returnerar null (fixtures-/icke-live-läge) registrerar sig aldrig, så raden får aldrig
    // ett dött chip. Providern är vilande utan registrerade sektioner (raden döljs då).
    <SectionNavProvider>
      {/* min-h-dvh + overflow-x-clip = aldrig horisontell scroll på någon skärm.
          Den dekorativa gröna glow-fonden ligger bakom innehållet via en pseudo-yta. */}
      <div className="relative min-h-dvh overflow-x-clip">
        {/* Dekorativ ljusgloria (arena-ljus). aria-hidden, ren stämning, följer temat
          via --vm-glow-accent (RGB-delar) så den fungerar i båda lägena. */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[60vh] opacity-60"
          style={{
            background:
              'radial-gradient(60% 60% at 50% 0%, rgb(var(--vm-glow-accent) / 0.18), transparent 70%)',
          }}
        />

        {/* Header: wordmark + tema-toggle. Frostat glas-band (tema-troget via
          color-mix mot --color-surface), sticky så toggle alltid är nåbar.
          data-app-header = den STABILA, entydiga kroken SectionNav mäter höjden mot
          (T78, F1): appen har många <header>-element (sektionsvyer, dialoger), så en
          ren document.querySelector('header') skulle binda mätningen till det FÖRSTA i
          DOM-ordning, en ordnings-tillfällighet en framtida banner/portal kan bryta. */}
        <header
          data-app-header=""
          className="sticky top-0 z-10 border-b border-border backdrop-blur-md"
        >
          <div
            className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-8"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-surface) 70%, transparent)' }}
          >
            <Wordmark className="text-xl sm:text-2xl" />
            {/* Nät-status + inställningar (kugghjul) + tema-toggle. Status-chippet
              döljs på de minsta skärmarna (sm:inline-flex) så headern aldrig
              trängs; offline-läget syns ändå tydligt via offline-bannern nedan. */}
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="hidden sm:inline-flex">
                <SyncAwareOnlineStatus />
              </span>
              <SettingsControl />
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Sticky sektions-navet (T78, #165): den smala chip-raden DIREKT under headern,
          hoppar till varje sektion på den långa en-sides-appen. Den klistrar under headern
          (egen sticky, mätt offset) och renderar bara chips för sektioner som FAKTISKT
          finns i DOM:en (registret), så aldrig en död länk. Lean per Daniels krav: rums-
          och admin-ytorna hålls utanför raden. Funktionell + tillgänglig struktur här;
          design-frontend lägger premium-finishen ovanpå (chip-styling, band, swipe). */}
        <SectionNav />

        <main className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-10 sm:px-8 sm:py-16">
          {/* Hero. Wordmark som h1 (bär appens tillgängliga namn, håller smoke-testet). */}
          <Fade>
            <section className="flex flex-col items-start gap-5 py-6 sm:py-10">
              <span className="rounded-pill border border-border bg-surface px-3 py-1 text-xs font-medium text-fg-muted">
                USA · Kanada · Mexiko · sommaren 2026
              </span>
              <Wordmark as="h1" className="text-5xl leading-none sm:text-7xl" />
              <p className="max-w-xl text-balance text-lg text-fg-muted sm:text-xl">
                Följ mästerskapet tillsammans. Matcher, tabeller och ett slutspelsträd som lever,
                plus tips-ligan med kompisarna. Allt i en app du delar med en länk.
              </p>
              <div className="flex flex-wrap gap-3">
                <span className="rounded-pill bg-accent px-5 py-2.5 font-display text-sm font-semibold text-accent-fg shadow-md">
                  48 lag · 12 grupper
                </span>
                <span className="rounded-pill border border-border px-5 py-2.5 font-display text-sm font-semibold">
                  Installeras som app
                </span>
              </div>
            </section>
          </Fade>

          {/* Den KOMPAKTA install-knappen (T63, #113): ytan överst är en diskret,
            klickbar "Installera som app"-pill, INGEN informationsruta som tar fokus
            (Daniels förtydligande). Install-INFON visas bara NÄR man klickar: ett
            klick ger webbläsarens äkta install-prompt på Android/desktop (T39:s
            beforeinstallprompt-mekanik), öppnar kom-igång-guiden (T54) på iPhone-
            fliken på iOS, eller öppnar guiden som ärlig fallback när ingen prompt finns
            (aldrig en död knapp). HELT dold i app-läge (standalone): InstallButton
            renderar då ingenting (Daniels skarpa krav, "onödigt surr där då den redan
            är installerad"). Bär sin egen synlighets-logik (useInstallPrompt), så den
            tar ingen plats när dold.

            ERSÄTTER den gamla InstallBannern (T13/T39) på huvudytan: bannern var just
            den informationsruta Daniel inte vill ha framme. Den diskreta knappen är ett
            enradigt erbjudande som inte stjäl fokus; den utförliga guiden (samma som
            inställnings-portalens "Kom igång") når man bakom ett klick. Kom-igång-raden
            i inställningarna (SettingsControl) finns kvar som gömd hjälp-yta.

            GATAD bakom onboarding (T39/#68, F1): touren är en z-50 helskärms-overlay
            vid FÖRSTA besöket och ligger ÖVER denna yta, så en första-gångs-vän som
            öppnar delningslänken inte kan klicka knappen förrän touren stängts (den
            skulle se ut att "inte göra något"). Medan touren är öppen visas därför INTE
            knappen; när touren är klar/hoppad faller den tillbaka på sin vanliga logik
            (ej standalone => visas, väg enligt plattform/event). */}
          {onboarding.open ? null : (
            <Slide direction="up">
              <div className="flex">
                <InstallButton />
              </div>
            </Slide>
          )}

          {/* Gruppspelsvyn (T5) + resultatinmatningen (T6) delar EN ResultsProvider
            (T6:s delade store): en inmatning i ResultEntryView uppdaterar samma
            matcher som gruppspelstabellerna härleds ur, så tabellerna räknas om
            live (härledd state, SPEC §6). Den FUNKTIONELLA + tillgängliga
            strukturen byggs här; design-frontend ger premium-polish + den
            visuella målfirande-animationen ovanpå. */}
          <ResultsProvider>
            {/* Lag-profiler (T10): klickbara lagnamn i matchkort + tabeller öppnar en
              profil-modal (FIFA-ranking, stjärnspelare, kuriosa, lagets väg). Providern
              ligger INNANFÖR ResultsProvider eftersom profil-modalen läser den delade
              storen (lag/grupper/matcher), och OMSLUTER alla vyer med klickbara lagnamn
              (daily, gruppspel, resultatinmatning) så profilen kan öppnas från dem alla. */}
            <TeamProfileProvider>
              {/* What-if-simulatorn (T12): slå på sim-läget och spela ut tänkta
              resultat, så tabell + slutspelsträd + "Vad krävs" ändras live UTAN
              att de riktiga resultaten rörs. SimulationFrame omsluter banner:n +
              alla simulerade vyer och lägger, NÄR sim-läget är PÅ, en violett
              ram + svag tint + en sticky "Simuleringsläge"-badge runt hela zonen,
              så ingen förväxlar en simulering med de riktiga resultaten. Ramen är
              en tunn wrapper som bara läser sim-seamen i storen (en sanning); i
              vilo-läge är den helt neutral (ingen ram, ingen tint). */}
              <SimulationFrame>
                {/* Daglig matchvy (T7): startskärmens hjärta, dagens matcher +
                datumnavigering + "Match of the day"-hero med live-nedräkning. Läser
                SAMMA delade store som gruppspelet och inmatningen. Den FUNKTIONELLA
                + tillgängliga strukturen byggs här; design-frontend ger WOW-hero +
                premium-matchkort + nedräknings-visual ovanpå.

                ReactionsProvider (T24, #24) omsluter BARA dagens-vyn (den enda ytan med
                reaktions-rad i MVP, decisions.md T24): emoji-reaktioner på matchkorten,
                per rum, live via Realtime. Vilande (enabled=false) utan Supabase/aktivt
                rum, så fixtures-/lokalt läge är oförändrat och korten ser ut precis som
                förr. Ligger innanför RoomsProvider (läser rooms-synk-seamen).

                MatchCommentsProvider (T77, #161) omsluter SAMMA dagens-vy: de HOPFÄLLDA
                per-match kommentar-trådarna på matchkorten, per rum, live via Realtime.
                Samma vilande-modell (enabled=false utan Supabase/aktivt rum) + samma
                rooms-synk-seam som reaktionerna. SKILD från rums-chatten (T66,
                CommentsProvider i RoomSection): den här bär bara match-trådarna. */}
                <Slide direction="up">
                  <ReactionsProvider>
                    <MatchCommentsProvider>
                      <DailyMatchesView />
                    </MatchCommentsProvider>
                  </ReactionsProvider>
                </Slide>

                <Slide direction="up">
                  <GroupStageView />
                </Slide>

                {/* "Vad krävs"-kalkylatorn (T11): live-scenarier för sista
                gruppomgången, vad varje lag behöver för att gå vidare (Klar/Ute/
                Beror på). Läser SAMMA delade store, så scenarierna räknas om när ett
                resultat matas in. Den FUNKTIONELLA + tillgängliga strukturen +
                data-seamen byggs här; design-frontend ger premium-finish ovanpå. */}
                <Slide direction="up">
                  <ScenarioView />
                </Slide>

                {/* Slutspelsträdet (T9): det levande trädet sextondel -> final. Läser
                SAMMA delade store som gruppspelet, så det justeras under gruppspelet
                (möjliga lag), låses vid grupp-slut (FIFA-seedningen) och för fram
                vinnaren när ett slutspelsresultat matas in. Den FUNKTIONELLA +
                tillgängliga strukturen + data-seamen byggs här; design-frontend ger
                premium-trädet med kopplingslinjer + vinnar-animation ovanpå. */}
                <Slide direction="up">
                  <BracketView />
                </Slide>

                {/* What-if-KONTROLLEN (Starta/Återställ/Avsluta + statusmeddelandet)
                sitter DIREKT ovanför resultatinmatningen (T32, #54, Daniels feedback
                4, fynd 2). Sim-läget handlar om RESULTAT (man spelar ut tänkta
                resultat), så kontrollen får tydlig koppling genom att stå vid
                inmatnings-sektionen i stället för högst upp på sidan. Sim-RAMEN
                (SimulationFrame) omsluter fortfarande ALLA påverkade vyer (daily,
                gruppspel, "Vad krävs", slutspelsträd, inmatning) och bär den globala
                "labbet"-markeringen + den sticky badge:n; det är bara själva
                kontroll-banner:n som flyttat hit. */}
                <Slide direction="up">
                  <SimulationBanner />
                </Slide>

                {/* Resultatinmatningen (T6), GRINDAD i live-läge (T48, #81): i live
                  visas inmatningen BARA när what-if-läget är PÅ, för ALLA inkl.
                  arrangören (då är den den lokala "tänk om"-leken, skriver aldrig
                  delat/officiellt facit, se ResultEntryGate). Officiella resultat
                  matas in via AdminResultEntry (AdminSection). I fixtures-läge är den
                  oförändrat alltid synlig. ResultEntryGate renderar inget (inkl. Panelen
                  via `surface`) när vyn ska döljas, så ingen tom ruta blir kvar. Design-
                  frontends premium-firande kopplas in via render-proppen (kroken styr
                  trigger/timing/reduced-motion, overlayn ritar bara explosionen). */}
                <Slide direction="up">
                  <ResultEntryGate
                    surface={(children) => <Panel>{children}</Panel>}
                    renderCelebration={(celebration) => (
                      <GoalCelebrationOverlay celebration={celebration} />
                    )}
                  />
                </Slide>
              </SimulationFrame>
            </TeamProfileProvider>
          </ResultsProvider>

          {/* Tips-ligan (T14): skapa/gå med i ett rum, se medlemmar, dela koden.
            Det FUNKTIONELLA + tillgängliga rums-UI:t byggs här (stabil semantik +
            data-attribut); design-frontend ger premium-finish ovanpå. RoomSection
            renderar HELA kortet bara när Supabase är konfigurerat (live-läge), i
            lokalt läge syns ingenting, så appen fungerar precis som förr. */}
          <Slide direction="up">
            <RoomSection surface={(children) => <Panel>{children}</Panel>} />
          </Slide>

          {/* EN DELAD LeaderboardProvider (T58, #99) omsluter tips-poolens sektioner OCH
            topplistan, så tips-sektionens poäng-summering (TipsScoreSummary) och
            topplistan läser SAMMA store och delar EN hämtning, ingen dubbelhämtning mot
            Supabase. Providern är vilande (enabled=false) utan Supabase/aktivt rum, så
            ingen sektion påverkas i fixtures-läge. Tidigare ägde LeaderboardSection sin
            egen provider; den hoistades hit just för att tips-vyn skulle nå samma store. */}
          <LeaderboardProvider>
            {/* EN DELAD PredictionsProvider (T64, #118) omsluter match-tips-sektionen OCH
              grupp-tips-sektionen, så grupp-tips-vyns SIMULERADE slutspelsträd kan läsa
              MINA MATCH-tips (och härleda de 8 bästa treorna ur dem, Article 13 + Annexe
              C) UTAN en andra hämtning. Tidigare ägde PredictionSection sin egen provider;
              den hoistades hit (samma mönster som LeaderboardProvider, T58) just för att
              den tips-härledda treplats-seedningen skulle nå samma match-tips-store.
              Providern är vilande (enabled=false) utan Supabase/aktivt rum, så fixtures-
              läget är oförändrat. */}
            <PredictionsProvider>
              {/* Tips-motorn (T15): vänner gissar resultat före avspark. Tips är per rum,
                så PredictionSection visar tips-vyn när det sociala lagret är konfigurerat
                (live-läge), med "gå med i ett rum för att tippa" tills ett rum är aktivt.
                Deadline-låset (inget tips efter avspark) + tips-sekretessen (andras tips
                dolda före avspark) upprätthålls SERVER-SIDE av RLS, bevisat med riktiga
                sessioner. Poäng-summeringen överst (T58) läser den delade providern.
                Det FUNKTIONELLA + tillgängliga UI:t byggs här (stabil semantik +
                data-attribut, samma #39-formspråk som resultatinmatningen); design-
                frontend ger premium-finish ovanpå. */}
              <Slide direction="up">
                <PredictionSection surface={(children) => <Panel>{children}</Panel>} />
              </Slide>

              {/* Gruppvinnar-tipsen (T16, VM-poolens kärna): tippa 1:an + 2:an i varje
                grupp FÖRE gruppspelet. Per rum, deadline per grupp (gruppens första
                match), server-side RLS-lås + sekretess (bevisat med riktiga sessioner).
                Funktionellt + tillgängligt UI byggs här; design-frontend ger finishen.
                Den tips-härledda slutspelsbilden under kupongerna (T51/T64) läser mina
                grupp-tips OCH mina match-tips (treorna seedas ur match-tipsen). */}
              <Slide direction="up">
                <GroupPredictionSection surface={(children) => <Panel>{children}</Panel>} />
              </Slide>
            </PredictionsProvider>

            {/* Bracket-/slutspels-tipsen (T16b, #59): tippa VM-vinnaren + vem som går
              vidare ur varje slutspels-slot (M73-M104). Per rum, deadline per slot
              (slottens egen avspark) + champion vid turneringsstart, server-side
              RLS-lås + sekretess (bevisat i T16). En slot tippas först när dess två lag
              är kända (gissa aldrig laget). Funktionellt + tillgängligt UI byggs här;
              design-frontend ger finishen ovanpå (datakärnan finns från T16). */}
            <Slide direction="up">
              <BracketPredictionSection surface={(children) => <Panel>{children}</Panel>} />
            </Slide>

            {/* Arrangörs-facit (T42, #72): de OFFICIELLA matchresultaten matas in av
              arrangören (Daniel) och gäller GLOBALT för alla rum. För en admin visas
              facit-inmatningen; för en vanlig deltagare en read-only-not + en lågmäld
              arrangörs-inloggning (e-post magic-link/OTP). Bara i live-läge, precis som
              de andra sociala sektionerna. Poäng-källan för topplistan nedan är detta
              globala facit (inte längre per-rum). Funktionell bas här; premium-design
              i T42b (samma arbetsdelning som T16/T16b). */}
            <Slide direction="up">
              <AdminSection surface={(children) => <Panel>{children}</Panel>} />
            </Slide>

            {/* Topplistan + tips-avslöjandet (T17, #17): vem tippar bäst (poäng från
              ALLA tre tips-typer mot facit, delad placering vid lika, rörelse-animation
              vid placeringsändring) + vad alla tippade per avgjord match (avslöjas
              FÖRST efter avspark, sekretessen är server-side i RLS, T15/T16). Per rum,
              "gå med i ett rum" tills ett rum är aktivt. Konsumerar den delade providern
              ovan (T58). Det FUNKTIONELLA + tillgängliga UI:t byggs här (stabil semantik
              + data-attribut); design-frontend ger premium-finish (medaljer, glow,
              finputsad rörelse) ovanpå. */}
            <Slide direction="up">
              <LeaderboardSection surface={(children) => <Panel>{children}</Panel>} />
            </Slide>
          </LeaderboardProvider>

          <footer className="flex flex-col gap-5 border-t border-border pt-6 text-sm text-fg-muted">
            {/* Footerns ledtext + appens SYNLIGA adress (T44, #75, Daniels feedback): appen
              sprids muntligt/genom att skrivas av, så adressen ska gå att LÄSA och säga
              högt, inte bara gömmas bakom en delningsknapp. Därför står vm-2026.pages.dev
              som synlig, klickbar länk-text (utan https-prefixet, det läses/sägs renare),
              medan href bär hela URL:en. Egen-flik + tabnabbing-skydd (noopener noreferrer)
              precis som signatur-länken (T39), samma säkerhets-recept i hela footern. */}
            <p>
              VM 2026, USA, Kanada och Mexiko. Följ mästerskapet tillsammans, dela appen med vänner,{' '}
              <a
                href="https://vm-2026.pages.dev"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Öppna appens adress vm-2026.pages.dev i en ny flik"
                className="rounded-sm font-medium text-fg underline-offset-[3px] decoration-accent decoration-2 hover:underline focus-visible:underline"
              >
                vm-2026.pages.dev
              </a>
              .
            </p>

            {/* UPPHOVS-KORTET (T38 signatur -> T44 runda 2, #75, Daniels feedback "footern ska
              lyfta upp mig, få med hela min hemsida så man ser att man kan klicka dit"): den
              tidigare LUGNA signaturraden var FÖR blygsam. Daniel vill att footern LYFTER honom
              och att hela danielaldemir.com SYNS och ser uppenbart klickbar ut. Två medvetna
              höjningar, byggda HELT av redan AA-bevisade mönster (ingen ny färgkombination,
              alltså ingen ny kontrast-mätning):

              1. NAMNET som blickfång (inte en bisats): "DA"-sigillet (.vm-signature-seal,
                 solid accent-bricka med accent-fg-ink = den färg-oberoende solid-bricka-formen,
                 10.85:1 mörkt / 5.40:1 ljust, T38-mätt) bredvid namnet i full fg + display-vikt
                 (--vm-fg, 17.04:1 mörkt / 16.25:1 ljust, T38-mätt) på en EGEN, framträdande rad,
                 med "Byggd av" som en liten dämpad eyebrow (fg-muted, FULL opacitet = 8.39:1
                 mörkt / 5.92:1 ljust, T38-mätt) ovanför. Titel-raden ".NET-systemutvecklare"
                 (fg-muted, full opacitet, samma mätta par) står som stödtext direkt under, inte
                 längre som en undanskuffad sista rad.

              2. HEMSIDAN som en UPPENBART klickbar CTA-pill: danielaldemir.com återanvänder den
                 delade .vm-install-pill-formen (tokens.css §22) , surface-tonad pill med kant,
                 hover tänder en accent-kant + lyfter ytan, focus-visible ger den delade accent-
                 ringen, plus en extern-länk-ikon (pil ut ur ruta). Pillen är appens ETABLERADE
                 "tydligt klickbar"-affordans (samma som install-knappen), så det är omisskännligt
                 att man kan klicka dit. Texten är fg på opak surface (README-mätt brödtext-par
                 12.6:1 - 17.9:1 i BÅDA teman, sektion 0 i tokens.css), ikonen är accent-dekor
                 (aria-hidden) , INGEN ny färgkombination införs, så T44-höjningen ärver de redan
                 uppmätta AA-värdena utan ny mätning.

              data-app-signature = stabil krok + testad semantik (T38-testet vaktar "Daniel
              Aldemir" i signaturen). Namn-länkens kontrakt (href/target/rel mot
              www.danielaldemir.com) är OFÖRÄNDRAT, så T39-testet håller. Hela kortet står på
              sidans FOND (--vm-bg), inte en surface-yta, men pill-ytan är opak surface, så
              pill-textens README-par gäller; eyebrow/namn/titel mättes mot fonden i T38. */}
            <div data-app-signature="" className="flex flex-col gap-3">
              {/* Avsändar-raden: sigill + "Byggd av" / namnet i två rader, namnet är blickfånget. */}
              <div className="flex items-center gap-2.5">
                <span aria-hidden="true" className="vm-signature-seal">
                  DA
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="text-xs text-fg-muted">Byggd av</span>
                  <a
                    href="https://www.danielaldemir.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Daniel Aldemir, öppna www.danielaldemir.com i en ny flik"
                    className="rounded-sm font-display text-base font-semibold text-fg underline-offset-[3px] decoration-accent decoration-2 hover:underline focus-visible:underline"
                  >
                    Daniel Aldemir
                  </a>
                </span>
              </div>

              {/* Titel-raden (T44, #75): promotar Daniel som utvecklaren, nu som stödtext under
                namnet i stället för en undanskuffad sista rad. Full opacitet = AA-säkert. */}
              <p className="text-xs text-fg-muted">.NET-systemutvecklare</p>

              {/* HEMSIDE-CTA:n (T44 runda 2, #75-kärnan, "se att man kan klicka dit"): hela
                danielaldemir.com som en uppenbart klickbar pill, den delade .vm-install-pill-
                formen (DRY mot install-knappen, ingen ny färgkombination). Visas utan https-
                prefix (renare läsning), href bär hela URL:en. Extern-länk-ikonen (pil ut ur
                ruta) + pill-affordansen gör klickbarheten omisskännlig. Egen-flik + tabnabbing-
                skydd, samma säkerhets-recept som resten av footern. */}
              <a
                href="https://www.danielaldemir.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Öppna danielaldemir.com i en ny flik"
                className="vm-install-pill self-start"
              >
                danielaldemir.com
                {/* Extern-länk-ikon (pil ut ur ruta), dekorativ; texten bär adressen. */}
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="vm-install-pill-icon"
                >
                  <path d="M15 3h6v6" />
                  <path d="M10 14 21 3" />
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                </svg>
              </a>
            </div>

            {/* Version-stämpel (T43, #74): diskret bygg-identifierare (kort commit-SHA
              + byggtid) så live-versionen kan verifieras mot develop-HEAD. Löser
              framtida "är det live?"-förvirring (debug-agentens förbättring). */}
            <VersionStamp />
          </footer>
        </main>

        {/* Onboarding-touren (T13): visas EN gång vid första start (localStorage-
          flagga), aldrig igen efter klar/hoppad. Ligger på rot-nivå (utanför main)
          så modalen täcker hela skärmen. Får den DELADE onboarding-instansen så
          install-gaten ovan och touren stänger i takt (EN sanning, T39/#68 F1). */}
        <OnboardingDialog onboarding={onboarding} />

        {/* "Ny version finns"-prompten (T43, #74): registrerar SW:n (registerType
          'prompt') och visar en diskret banner när en ny app-version väntar, så en
          användare aldrig fastnar på en gammal cachad version, ETT klick uppdaterar.
          Ligger på rot-nivå (utanför main, fixed längst ner) så den aldrig tränger
          layouten och syns över allt innehåll. */}
        <UpdatePrompt />
      </div>
    </SectionNavProvider>
  );
}
