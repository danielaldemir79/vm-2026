// Resultatinmatnings-VYN (T6, issue #6): lista matcher och låt användaren mata
// in/redigera resultat. Tabellerna (och senare slutspelsträdet) uppdateras från
// inmatningen via den delade storen, EN sanning (härledd state, SPEC §6).
//
// FOKUS (senior-devs lager): den FUNKTIONELLA + tillgängliga strukturen. Vyn
// läser den delade storen (useResultsStore), renderar ett ResultEntryForm per
// match, och kopplar in målfirande-KROKEN (useGoalCelebration) vid ett sparat
// resultat. Den hanterar även icke-happy-path (loading/error/tom) precis som
// gruppspelsvyn (fail loud, role="status"/"alert").
//
// VISUELL DESIGN (design-frontend-agentens lager, ovanpå): premium-styling +
// den faktiska målfirande-ANIMATIONEN. Vyn exponerar en tydlig SEAM för den: ett
// aria-hidden firande-slot som renderar `children` med det aktiva firande-
// tillståndet. Design-frontend fyller den med konfetti/mål-pop (bygger på T2:s
// motion-primitiver, reducerad rörelse respekteras redan i kroken). Funktionellt
// fungerar inmatningen helt utan firandet, det är ren glädje-yta.

import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Match, Team } from '../../domain/types';
import { ExpandToggle } from '../../components/ExpandToggle';
import { formatDayHeading, useTodayKey } from '../daily';
import { triggerResultFeedback, useFeedbackSettings } from '../app-settings';
import { useGoalCelebration, type GoalCelebration } from './goal-celebration';
import { groupMatchesForEntry } from './group-matches-for-entry';
import { useResultsStore } from './results-context';
import { ResultEntryForm } from './ResultEntryForm';
import { windowMatches } from './result-window';
import type { ResultEntry } from './validate-result';
import { StickyFollowToggle } from '../../components/collapsible-list';

/** Bygg ett snabbt teamId -> Team-uppslag (en gång per lag-lista). */
function indexTeams(teams: readonly Team[]): Map<string, Team> {
  return new Map(teams.map((t) => [t.id, t]));
}

export interface ResultEntryViewProps {
  /**
   * Render-prop för det VISUELLA målfirande-lagret (design-frontends ansvar).
   * Får det aktiva firande-tillståndet (eller null) och renderar sin animation.
   * Default: inget visuellt lager (funktionellt komplett ändå), så vyn fungerar
   * fristående och design-frontend kopplar in sin premium-animation utan att röra
   * inmatnings-logiken.
   */
  renderCelebration?: (celebration: GoalCelebration | null) => ReactNode;
}

export function ResultEntryView({ renderCelebration }: ResultEntryViewProps) {
  const { status, matches, teams, submitResult, error } = useResultsStore();
  const teamsById = useMemo(() => indexTeams(teams), [teams]);
  const { celebration, celebrateGoal } = useGoalCelebration();
  // Valbar haptik + ljud (AV som standard, T13). Läses via den TOLERANTA
  // accessorn (faller till tyst standard utan provider) så den BEFINTLIGA
  // spar-seamen (handleSaved) kan spela en kort feedback utan att tvinga vyn att
  // känna till settings-providern, exakt som det valfria firande-lagret.
  // triggerResultFeedback gatar varje kanal internt, så detta är invasivt minimum.
  const { haptics, sound } = useFeedbackSettings();

  // Bara matcher med BÅDA lag kända kan matas in (ett slutspels-slot utan
  // framräknat lag har inget att mata in mot än, T4/T9 fyller dem). Filtrera
  // defensivt så formuläret aldrig visar ett "Okänt lag mot Okänt lag".
  //
  // Type predicate som FAKTISKT narrowar: efter filtret är båda id:n `string`
  // (icke-null), inte `string | null`, så konsumenterna slipper en extra null-
  // koll. Vi intersectar `Match` med just de fält filtret garanterar (samma
  // mönster som isCounted i compute-standings), i stället för ett `m is Match`
  // som inte uttrycker någon ny information.
  const editable = useMemo(
    () =>
      matches.filter(
        (m): m is Match & { homeTeamId: string; awayTeamId: string } =>
          m.homeTeamId !== null && m.awayTeamId !== null
      ),
    [matches]
  );

  // 3-DAGARS FÖNSTER (#39): hela VM:t är 104 matcher = en orimligt lång lista att
  // skrolla. Default visar bara matcherna inom de närmaste 3 svenska dagarna (från
  // idag, eller premiärdagen om turneringen inte börjat), resten fälls ut på begäran.
  // Urvalet är en REN funktion (result-window.ts), testad fristående (edge-fall:
  // ej börjad, slutet, allt inom fönstret, vilodag); här äger vyn bara expandera-
  // tillståndet och den tillgängliga kontrollen.
  const [expanded, setExpanded] = useState(false);

  // DAG-MEDVETET "nu" (Copilot R1, C1, PWA-fälla): fönstret läser "idag", och appen
  // lämnas öppen hela VM:t, så fliken kan stå öppen över midnatt. useTodayKey ger ett
  // `nowMs` som är referens-STABILT inom en dag och bara ändras vid en faktisk
  // dygnsväxling (eller när fliken blir synlig igen efter att ha varit dold). Genom
  // att memoizera fönstret på `nowMs` (inte bara `editable`) flyttar sig fönstret över
  // midnatt utan en omladdning, men räknas inte om i onödan varje tick.
  const { nowMs } = useTodayKey();
  const windowed = useMemo(() => windowMatches(editable, nowMs), [editable, nowMs]);

  // Vilka matcher som ligger i fönstret (snabb id-koll). ALLA editable-matcher renderas
  // alltid (se nedan, C2); detta avgör bara vilka som DÖLJS när listan inte är utfälld.
  const visibleIds = useMemo(() => new Set(windowed.visible.map((m) => m.id)), [windowed]);
  const isInWindow = (matchId: string): boolean => expanded || visibleIds.has(matchId);

  // DAG-GRUPPERING (T28/#42, Daniels feedback 2): gruppera de inmatningsbara
  // matcherna per svensk speldag så listan får dag-rubriker (sammanhanget som
  // tappades). Ren funktion (group-matches-for-entry.ts) som återanvänder daily/
  // groupMatchesByDay (en sanning för svensk-dag-grupperingen, DRY). Beror BARA på
  // `editable` (inte på fönster-/expandera-läget): ALLA dagar grupperas alltid,
  // fönstret döljer sedan korten PER KORT (hidden), inte genom att klippa bort dem.
  // Så samma dag-struktur används i både ihopfällt och utfällt läge, bara
  // synligheten skiljer (kravet: rubriker korrekta även i ihopfällt läge).
  const dayGroups = useMemo(() => groupMatchesForEntry(editable), [editable]);

  // En dag-rubrik visas så länge dagen har MINST EN synlig (in-window) match i
  // ihopfällt läge, annars vore rubriken en tom rad. I utfällt läge syns alla.
  // (Kortens egna `hidden` skyddar fortfarande osparad inmatning per kort, C2.)
  const dayHasVisible = (day: { matches: readonly Match[] }): boolean =>
    expanded || day.matches.some((m) => visibleIds.has(m.id));

  // Knappen behövs bara när det FINNS något dolt (alla inom fönstret -> ingen knapp).
  const hasHidden = windowed.hiddenCount > 0;
  // Stabil id-koppling för aria-controls/aria-expanded mellan knappen och listan.
  const listId = useId();

  // FOKUS-FLYTT vid ihopfällning (T28/#42, a11y, "tappa inte bort användaren"):
  // den NEDRE toggeln kan ligga långt ner i en utfälld lista. Fäller användaren
  // ihop därifrån ska fokus (och därmed vyporten) flyttas till den ÖVRE toggeln,
  // så hen landar vid listans topp i stället för att bli kvar långt ner vid en
  // kontroll som just försvann. Vi gör detta bara vid IHOPFÄLLNING (expand -> nej):
  // vid utfällning är det rätt att fokus stannar där användaren var.
  const topToggleRef = useRef<HTMLButtonElement>(null);
  function toggleExpanded() {
    setExpanded((prev) => {
      const next = !prev;
      if (!next) {
        // Ihopfällning: flytta fokus till den övre kontrollen (listans topp).
        // requestAnimationFrame så fokus sätts EFTER att React renderat det
        // ihopfällda läget (den nedre toggeln finns kvar, men användaren ska
        // ändå föras upp till toppen).
        requestAnimationFrame(() => topToggleRef.current?.focus());
      }
      return next;
    });
  }

  // Trigga målfirande + valbar feedback EFTER ett lyckat sparande av en spelad
  // match. Firande-kroken hoppar själv reducerad rörelse + mållösa resultat
  // (a11y), så vi anropar den ovillkorligt här. Haptik/ljud spelas vid SPARANDET
  // (oavsett mål, det är spar-handlingen som bekräftas) men bara om kanalen är
  // PÅ, triggerResultFeedback gatar internt. Båda är ren glädje-/bekräftelse-yta;
  // själva inmatningen är klar oavsett.
  function handleSaved(match: Match, entry: ResultEntry) {
    if (entry.status === 'finished') {
      const total = (entry.homeGoals ?? 0) + (entry.awayGoals ?? 0);
      celebrateGoal(match.id, total);
      triggerResultFeedback({ haptics, sound });
    }
  }

  return (
    <section aria-labelledby="resultatinmatning-rubrik" className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Resultat
        </p>
        <h2 id="resultatinmatning-rubrik" className="font-display text-2xl font-bold sm:text-3xl">
          Mata in resultat
        </h2>
        <p className="max-w-2xl text-sm text-fg-muted">
          Skriv in mål för spelade matcher. Tabellerna räknas om direkt, etta och tvåa går vidare.
        </p>
      </header>

      {status === 'loading' ? (
        <p role="status" className="text-sm text-fg-muted">
          Laddar matcher ...
        </p>
      ) : null}

      {status === 'error' ? (
        <p
          role="alert"
          className="rounded-card border px-4 py-3 text-sm"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-danger) 50%, transparent)',
            backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          Kunde inte ladda matcher: {error}
        </p>
      ) : null}

      {status === 'ready' && editable.length === 0 ? (
        <p className="rounded-card border border-border bg-surface px-4 py-8 text-center text-sm text-fg-muted">
          Inga matcher att mata in än.
        </p>
      ) : null}

      {/* ÖVRE ihopfäll-/expandera-kontroll (T28/#42): DUBBLERAD (även nedanför
          listan) så en toggle ALLTID nås utan att skrolla igenom en utfälld lista.
          Den övre är dessutom fokus-MÅLET vid ihopfällning (se toggleExpanded), så
          användaren förs upp till listans topp. Syns bara när fönstret döljer något.
          Båda kontrollerna delar EN komponent (ExpandToggle), så deras semantik
          (aria-expanded/-controls, etikett) aldrig kan drifta isär.

          STICKY "FÖLJ-MED"-KONTROLL i UTFÄLLT läge (#173 T82 del 4, ägarens feedback
          "den där raden som följer med i listorna bör finnas på alla"): när listan är
          utfälld (104 matcher = lång) klistrar den övre kontrollen direkt under sajt-
          headern (top-16), så KOMPRIMERA alltid är ett tryck bort oavsett hur djupt man
          skrollat , man behöver inte längre skrolla tillbaka till listans topp. I
          KOMPRIMERAT läge (3-dygnsfönstret, kort) är den en vanlig inline-kontroll (inget
          att följa med i). Den inre 3-dygns-komprimeringen + hidden-bevarad inmatning är
          OFÖRÄNDRAD; bara kontrollens klister-position ändras per läge (ren list-
          presentation, ingen inmatnings-/validerings-logik rörd). */}
      {status === 'ready' && editable.length > 0
        ? (() => {
            // DAG-GRUPPERAD lista (T28/#42): varje speldag är ett <li> med en rubrik
            // (h3) + en nästlad <ul> av matchkort. Listans yttre id är aria-controls-
            // målet för båda toggle-kontrollerna.
            //
            // STICKY "FÖLJ-MED" (F1-fix T83): när fönstret döljer något wrappar
            // StickyFollowToggle den övre kontrollen OCH hela dag-listan i EN container,
            // så den sticky baren (utfällt läge) klistrar under sajt-headern och följer
            // med ner i listan. Listan ligger som `children` (inte ett syskon) just för
            // att en sticky-yta bara följer med inom sin egen containing block , det var
            // F1-buggen. I komprimerat läge (3-dygnsfönstret, kort) ingen toggle => naken
            // lista (oförändrat). Den inre 3-dygns-komprimeringen + hidden-bevarad
            // inmatning + dag-rubrikernas egen sticky är OFÖRÄNDRADE.
            const list = (
              //
              // BEVARAR #39-invarianten (C2): varje MATCHKORTS <li> behåller sitt egna
              // `hidden`-attribut (out-of-window-kort döljs, men UNMOUNTAS inte, så
              // osparad inmatning överlever expandera/ihopfäll). Dag-<li>:t döljs bara
              // när HELA dagen är utanför fönstret (annars vore rubriken en tom rad),
              // men kortens egna hidden står kvar oberoende, så closest('li')-haken i
              // C2-testet (det innersta korts-<li>:t) fortsätter stämma.
              <ul id={listId} className="m-0 flex list-none flex-col gap-6 p-0">
                {dayGroups.map((day) => (
                  <li key={day.dateKey} data-result-day={day.dateKey} hidden={!dayHasVisible(day)}>
                    {/* Dag-rubrik: läsbar svensk dag ("torsdag 11 juni 2026") via daily/
                  formatDayHeading (DRY, EN sanning för dag-rubriken). h3 under vyns
                  h2, så rubrik-hierarkin är korrekt för skärmläsare.

                  VISUELL FINISH (design-frontend, T28/#42): en elegant AVDELARE som
                  ger tydlig hierarki utan att stjäla fokus från korten. "Arena i
                  kvällsljus"-tonen bärs av tre lager: en liten accent-"tändsticka"
                  (en kort lodrät list som glöder grönt), datumet i display-fonten,
                  och en hårfin horisont-linje som tonar ut åt höger (gräns mot guld),
                  som en arena-tier-linje. Allt via color-mix mot tokens, så det följer
                  temat och dämpas rent i ljust läge.

                  STICKY (Daniels önskemål): rubriken klistrar inom listan så DAGEN
                  man skrollar i alltid syns. top-16 (inte top-0) KLARAR den sticky
                  sajt-headern (App.tsx, ~64px hög, sticky top-0 z-10): vid top-0
                  skulle dag-rubriken glida in BAKOM headern och döljas. top-16
                  pinnar den precis under headern så den förblir läsbar. En tonad,
                  lätt blur:ad bakgrunds-platta gör att korten som glider under aldrig
                  syns igenom texten (annars blir en sticky-rubrik oläslig); negativ
                  x-marginal + px gör att plattan täcker hela list-gapet i sidled.
                  z-10 lägger den över korten (men under/jämsides headern, ingen
                  överlapp eftersom de inte delar y-rum). capitalize lyfter
                  veckodags-initialen. */}
                    {/* I UTFÄLLT läge ligger en STICKY komprimera-bar ovanför listan (#173 T82 del 4),
                  så dag-rubriken pinnas en bit LÄGRE (top-28) för att hamna UNDER baren i
                  stället för bakom den. I komprimerat läge (ingen sticky bar) pinnar den som
                  förr (top-16, precis under sajt-headern). */}
                    <div
                      className={`sticky z-10 -mx-1 mb-3 bg-[color-mix(in_srgb,var(--color-bg)_82%,transparent)] px-1 py-2 backdrop-blur-sm ${
                        expanded ? 'top-28' : 'top-16'
                      }`}
                    >
                      <h3
                        data-result-day-heading=""
                        className="flex items-center gap-2.5 font-display text-sm font-semibold capitalize tracking-tight text-fg"
                      >
                        {/* Accent-"tändsticka": en kort lodrät glöd-list (gräsplan-grön),
                      den lilla kvällsljus-gnistan som markerar dagens start. */}
                        <span
                          aria-hidden="true"
                          className="h-4 w-[3px] shrink-0 rounded-pill bg-[var(--color-accent)] shadow-[0_0_8px_color-mix(in_srgb,var(--color-accent)_60%,transparent)]"
                        />
                        <span className="whitespace-nowrap">{formatDayHeading(day.dateKey)}</span>
                        {/* Horisont-linje: en hårfin gradient som tonar ut åt höger (grön ->
                      guld -> inget), arena-tier-linjen. Tar resten av bredden så
                      rubriken fyller raden snyggt. aria-hidden (ren dekoration). */}
                        <span
                          aria-hidden="true"
                          className="h-px min-w-6 flex-1 rounded-pill bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-accent)_45%,transparent),color-mix(in_srgb,var(--vm-gold)_30%,transparent)_45%,transparent)]"
                        />
                      </h3>
                    </div>
                    <ul className="m-0 flex list-none flex-col gap-3 p-0">
                      {/* RENDERA ALLA dagens matcher alltid, dölj de utanför fönstret med
                    `hidden` (Copilot R1, C2 från #39). VARFÖR `hidden` i stället för
                    att FILTRERA bort dem: ett out-of-window-formulär kan ha OSPARAD
                    inmatning i sin lokala useState; filtrerar vi bort det vid
                    ihopfällning unmountas formuläret och inmatningen tappas. `hidden`
                    (= display:none + borttaget ur a11y-trädet) bevarar React-instansen,
                    så ett pågående edit överlever expandera/ihopfäll. Dolda kort nås
                    inte av tab eller skärmläsare, och getAllByRole('group') räknar
                    bara de synliga, så hiddenCount i knappen stämmer. */}
                      {day.matches.map((match) => (
                        <li key={match.id} hidden={!isInWindow(match.id)}>
                          {/* STABIL key (match.id), INTE en data-beroende key (C7/C8):
                        ResultEntryForm synkar sig själv mot matchens nuvarande värden
                        via en DIRTY-medveten effekt (mål/status/straffar konsekvent),
                        men bara när formuläret är "rent", så pågående inmatning bevaras.
                        Därför behövs ingen re-mount-key, instansen lever kvar. */}
                          <ResultEntryForm
                            match={match}
                            teamsById={teamsById}
                            onSubmit={submitResult}
                            onSaved={handleSaved}
                          />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            );
            return hasHidden ? (
              <StickyFollowToggle
                expanded={expanded}
                hiddenCount={windowed.hiddenCount}
                controls={listId}
                onToggle={toggleExpanded}
                buttonRef={topToggleRef}
                name="results"
              >
                {list}
              </StickyFollowToggle>
            ) : (
              list
            );
          })()
        : null}

      {/* NEDRE ihopfäll-/expandera-kontroll (T28/#42, dubblerad): i UTFÄLLT läge
          ligger den efter hela listan, så användaren kan fälla ihop utan att skrolla
          tillbaka upp. Identisk semantik som den övre (samma ExpandToggle), och vid
          ihopfällning härifrån flyttas fokus upp till den ÖVRE toggeln (listans topp,
          toggleExpanded). I ihopfällt läge ligger de två kontrollerna direkt ovanpå
          varandra (kort lista), vilket är ofarligt och billigare än att villkora bort
          den ena per läge (KISS), aria-haken hålls konsekvent på BÅDA. */}
      {status === 'ready' && editable.length > 0 && hasHidden ? (
        <ExpandToggle
          expanded={expanded}
          hiddenCount={windowed.hiddenCount}
          controls={listId}
          onToggle={toggleExpanded}
          position="bottom"
          name="results"
        />
      ) : null}

      {/* Målfirande-SEAM: aria-hidden (ren visuell glädje, dubblerar ingen info).
          Design-frontend renderar sitt premium-lager via renderCelebration; utan
          den är vyn funktionellt komplett (firandet är valfri yta). */}
      {renderCelebration ? (
        <div aria-hidden="true" data-celebration-slot="">
          {renderCelebration(celebration)}
        </div>
      ) : null}
    </section>
  );
}
