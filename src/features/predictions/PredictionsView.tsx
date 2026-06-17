// Tips-INMATNINGSVYN (FUNKTIONELLT + a11y-lager, T15, #15).
//
// FOKUS (senior-devs lager): rätt matcher, rätt lägen, tillgänglig struktur. Visar
// tips-formulär per KOMMANDE match (båda lag kända) i RUM-läge, ett tydligt LÅST-
// läge efter avspark, och mitt tips synligt. UTAN ett aktivt rum visas "gå med i
// ett rum för att tippa" (tips är per rum).
//
// VISUELL DESIGN (designen, T15): tips-ligan är det SOCIALA hjärtat, det ska
// kännas KUL att tippa. Vyn får en guld-tonad eyebrow + rubrik (kupong-identiteten),
// en inbjudande "gå med i ett rum"-ruta som pekar mot rum-sektionen, och korten
// (PredictionForm) bär kupong-finishen. Stabil semantik + data-attribut bevaras,
// inga inbakade statusfärger (T7-pin).
//
// SÄKERHET: deadline-låset + sekretessen upprätthålls SERVER-SIDE (RLS). Vyn visar
// bara läget; ett save som nekas (matchen hann låsas) blir ett fail-loud-fel i formuläret.

import { useId, useMemo, useRef, useState } from 'react';
import { ExpandToggle } from '../../components/ExpandToggle';
import { StickyFollowToggle } from '../../components/collapsible-list';
import { ScoreGuide } from '../scoring-guide';
import { useTodayKey } from '../daily';
import { selectTodayMatches } from '../results/result-window';
import { usePredictionsStore } from './predictions-context';
import { usePredictableData } from './use-predictable-matches';
import { selectPredictableMatches } from './predictable-matches';
import { PredictionForm } from './PredictionForm';
import { useDeadlineTick } from './use-deadline-tick';

export interface PredictionsViewProps {
  /** Injicerbar env (testbarhet), default = import.meta.env. */
  env?: ImportMetaEnv;
  /** Injicerbart "nu" (testbarhet) för låst-härledningen, default = nuet. */
  now?: Date;
}

// Default-värdena sätts HÄR (inte bara inne i hookarna): proparna är optional för
// testbarhet, men utan rum kallas hookarna ändå ovillkorligt (Rules of Hooks), så
// vi coalescar till giltiga icke-undefined värden FÖRE anropen. Hookarna har egna
// defaultar också, men att uttrycka det vid call-siten gör typkontraktet sant och
// läsbart, ingen konsument behöver gissa att undefined "blir" nuet/env.
export function PredictionsView({ env = import.meta.env, now = new Date() }: PredictionsViewProps) {
  const store = usePredictionsStore();
  const { status, matches, teams, error } = usePredictableData(env);

  // Deadline-medveten re-render: låst-statusen (now >= kickoff) räknas om varje
  // minut/vid återaktiverad flik så en match som passerat avspark syns som låst
  // utan manuell omladdning. En avspark passerar MITT PÅ DAGEN, så useTodayKey
  // (stabil inom en dag) räcker inte, det krävs en finare tick (use-deadline-tick).
  // Server-RLS är ändå det riktiga låset; detta gör bara VISNINGEN sann.
  const evalNow = useDeadlineTick(now);

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  // evalNow ingår i deps (det är HELA poängen, C1): hooken ger ett "nu" som tickar
  // på en stabil minut-kadens, så detta räknas om när tiden passerar en avspark,
  // inte en ny Date() per render (som skulle loopa).
  const predictable = useMemo(() => selectPredictableMatches(matches, evalNow), [matches, evalNow]);

  // Hur många KOMMANDE (icke-låsta) matcher finns att tippa? Driver en liten,
  // motiverande räknare i rubriken ("3 matcher öppna att tippa", "1 match öppen
  // att tippa" i singular, både substantiv och adjektiv böjs), så det känns
  // levande och kul. Låsta matcher räknas inte (de går inte att tippa längre).
  const openCount = useMemo(() => predictable.filter((p) => !p.locked).length, [predictable]);

  // DAGENS-FÖNSTER + expandera (Daniels spec T68/#129, MEDVETET smalare än resultatvyns):
  // hela VM:t är 104 matcher = en orimligt lång tips-lista. Default visar nu BARA DAGENS
  // matcher att tippa (eller premiärdagen om turneringen inte börjat), resten fälls ut på
  // begäran. Detta ERSÄTTER tips-listans tidigare igår+framåt-fönster: tips handlar om vad
  // man kan tippa NU (dagens kommande matcher), inte om gårdagens redan spelade. Resultat-
  // /poängvyn BEHÅLLER sitt bredare fönster (windowMatches, där gårdagens avgjorda matchers
  // poäng ska synas, T62), så paritetsguarden mot resultatvyn är MEDVETET uppdaterad: de
  // två vyerna har nu OLIKA default-fönster (se predictions-results-window-parity.test).
  // selectTodayMatches delar shape med windowMatches, så ExpandToggle + hidden-wiringen
  // nedan är oförändrad.
  const [expanded, setExpanded] = useState(false);

  // DAG-MEDVETET "nu" för fönstret (samma PWA-fälla som resultatvyn, #39 C1): appen
  // lämnas öppen hela VM:t, så fliken kan stå öppen över midnatt. useTodayKey ger ett
  // `nowMs` som är referens-STABILT inom en dag och bara byts vid en faktisk dygns-
  // växling (eller när fliken blir synlig igen). DET är dag-granulariteten: ett useMemo
  // som har `nowMs` i deps räknas bara om vid dagsbyte, inte varje render/minut.
  // OBS: detta är ett SEPARAT "nu" från evalNow (use-deadline-tick): fönstret mäts i
  // DAGAR (useTodayKey, stabil inom dygnet), låset flippar MITT PÅ DAGEN vid avspark
  // (deadline-tick). De är två olika kadenser med två olika syften, men SEEDAS av
  // samma injicerade `now` (testbarhet + ett konsekvent start-"nu" för båda), sen tar
  // respektive hook över sin egen tick (dygn resp minut) i appen.
  const { nowMs } = useTodayKey(now);

  // Fönster-indata: matcherna i visnings-ordning (tidigast först), MEN frikopplat från
  // lås-statusen. `predictable` (ovan) får en NY referens varje minut-tick (evalNow
  // räknar om `locked`), så att memoizera fönstret på `predictable` skulle räkna om det
  // varje minut , fel granularitet, fönstret beror på DAGEN, inte minuten. Vi memoizerar
  // därför match-listan (samma sort, tidigast först, från selectPredictableMatches) på
  // `matches` ENSAMT: vilka matcher som är tippbara och deras ordning ändras inte av en
  // minut-tick, bara av ny data. Lås-statusen lever kvar i `predictable` (per minut).
  // Detta är T15:s tick-granularitet-knep: memoizera på exakt det som faktiskt ska
  // räknas om. (`selectPredictableMatches` tar ett `now` bara för `locked`, som vi kastar
  // bort här; default-nuet räcker, listans innehåll/ordning beror enbart på `matches`.)
  const windowMatchList = useMemo(
    () => selectPredictableMatches(matches).map((p) => p.match),
    [matches]
  );
  // Fönstret räknas över match-listan i visnings-ordning (tidigast först). selectTodayMatches
  // bevarar indata-ordningen i `visible`, så dagens matcher ligger korrekt överst utan en
  // egen omsortering. DAG-granularitet via `nowMs` (stabilt inom en dag): en minut-tick som
  // inte korsar en dygnsgräns ger samma `nowMs` + samma listreferens -> ingen omräkning;
  // fönstret räknas bara om vid ny data eller ett faktiskt dagsbyte (glider över midnatt).
  const windowed = useMemo(
    () => selectTodayMatches(windowMatchList, nowMs),
    [windowMatchList, nowMs]
  );
  // Vilka match-id som ligger i fönstret (snabb koll). ALLA tippbara matcher renderas
  // alltid; detta avgör bara vilka som DÖLJS när listan inte är utfälld (se nedan).
  const visibleIds = useMemo(() => new Set(windowed.visible.map((m) => m.id)), [windowed]);
  const isInWindow = (matchId: string): boolean => expanded || visibleIds.has(matchId);

  // Knappen behövs bara när det FINNS något dolt (alla inom fönstret -> ingen knapp).
  const hasHidden = windowed.hiddenCount > 0;
  // Stabil id-koppling för aria-controls/aria-expanded mellan knapparna och listan.
  const listId = useId();

  // FOKUS-FLYTT vid ihopfällning (samma a11y-grepp som resultatvyn, #42): den NEDRE
  // toggeln kan ligga långt ner i en utfälld lista. Fäller användaren ihop därifrån
  // ska fokus (och därmed vyporten) flyttas till den ÖVRE toggeln, så hen landar vid
  // listans topp i stället för kvar långt ner vid en kontroll som just försvann. Bara
  // vid IHOPFÄLLNING (vid utfällning är det rätt att fokus stannar där användaren var).
  const topToggleRef = useRef<HTMLButtonElement>(null);
  function toggleExpanded() {
    setExpanded((prev) => {
      const next = !prev;
      if (!next) {
        // Ihopfällning: flytta fokus till den övre kontrollen (listans topp).
        // requestAnimationFrame så fokus sätts EFTER att React renderat om.
        requestAnimationFrame(() => topToggleRef.current?.focus());
      }
      return next;
    });
  }

  const ready = store.enabled && status === 'ready' && store.status === 'ready';

  return (
    <section aria-labelledby="predictions-heading" data-predictions-view="">
      <header className="flex flex-col gap-2">
        {/* Guld eyebrow (kupong-identiteten): tips-ligan signaleras varmt redan i
            rubriken. accent-grön vore resultat-tonen, guld är tips-tonen. FÄRG:
            --color-warning (den AA-säkra guld-TEXT-tonen per tema), inte rå --vm-gold
            (faller under AA som text på ljus yta, lessons guld-på-ljus). */}
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-warning">
          Tips-ligan
        </p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="predictions-heading" className="font-display text-xl font-semibold sm:text-2xl">
            Tippa matcherna
          </h2>
          {/* Motiverande räknare: bara när det FINNS öppna matcher att tippa, så den
              aldrig säger "0 öppna" (det vore nedslående, inte kul). role=status så
              den annonseras artigt när den dyker upp. */}
          {ready && openCount > 0 ? (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 rounded-pill border border-[color-mix(in_srgb,var(--vm-gold)_30%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_8%,transparent)] px-2.5 py-0.5 font-display text-xs font-semibold text-fg-muted"
            >
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-pill"
                style={{ backgroundColor: 'var(--vm-gold)' }}
              />
              {openCount} {openCount === 1 ? 'match öppen' : 'matcher öppna'} att tippa
            </span>
          ) : null}
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          Gissa resultaten före avspark. Exakt resultat ger mest, rätt vinnare ger en poäng. Du och
          kompisarna tippar blint, sen jämför ni.
        </p>
        {/* "Så funkar poängen": en synlig, inbjudande väg till hela poäng-förklaringen
            redan vid tippningen (Daniels huvudkrav, #62). Samma komponent monteras vid
            topplistan, så texten är EN sanning. Talen härleds ur poäng-konstanterna. */}
        <div className="mt-1">
          <ScoreGuide surface="tips" />
        </div>
      </header>

      {/* UTAN aktivt rum: tips är per rum, så peka INBJUDANDE mot rums-flödet. En
          egen guld-tonad ruta med en kupong-ikon, inte bara en grå rad, så porten
          till tips känns som en inbjudan att gå med, inte ett felmeddelande. */}
      {!store.enabled ? (
        <div
          data-predictions-no-room=""
          className="mt-4 flex items-start gap-3 rounded-card border border-[color-mix(in_srgb,var(--vm-gold)_22%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_6%,var(--color-surface))] p-4 sm:p-5"
        >
          <span
            aria-hidden="true"
            className="mt-0.5 shrink-0 rounded-md border border-[color-mix(in_srgb,var(--vm-gold)_30%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_12%,transparent)] p-2 text-warning"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 5.5A1 1 0 0 1 3 4.5h10a1 1 0 0 1 1 1v1a1.5 1.5 0 0 0 0 3v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1a1.5 1.5 0 0 0 0-3z" />
              <path d="M10 4.75v6.5" strokeDasharray="1.4 1.4" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="m-0 font-display text-sm font-semibold text-fg">
              Gå med i ett rum för att tippa
            </p>
            <p className="m-0 mt-1 text-sm text-fg-muted">
              Tipsen är per rum, du och kompisarna gissar resultaten före avspark och jämför sen.
              Skapa eller gå med i ett rum ovanför, så öppnar tips-kupongerna här.
            </p>
          </div>
        </div>
      ) : null}

      {/* Fel-väg (fail loud): datakällan eller tips-laddningen brast. */}
      {store.enabled && (status === 'error' || store.status === 'error') ? (
        <p
          role="alert"
          data-predictions-error=""
          className="mt-4 rounded-md border px-4 py-3 text-sm"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
            backgroundColor: 'color-mix(in srgb, var(--color-danger) 9%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          {error ?? store.error ?? 'Något gick fel när tipsen skulle laddas.'}
        </p>
      ) : null}

      {/* Laddning: enkel status (annonseras artigt). */}
      {store.enabled && (status === 'loading' || store.status === 'loading') ? (
        <p role="status" data-predictions-loading="" className="mt-4 text-sm text-fg-muted">
          Laddar matcher att tippa…
        </p>
      ) : null}

      {/* Tips-listan: en kupong per tippbar match, kommande överst, låsta nedtill.
          ALLA tippbara matcher renderas alltid; out-of-window-korten DÖLJS med `hidden`
          (display:none + borttaget ur a11y-trädet), de UNMOUNTAS inte. VARFÖR `hidden`
          och inte filtrering: PredictionForm håller osparad inmatning i lokal useState
          (samma som resultatformuläret), filtrerar vi bort ett kort vid ihopfällning
          tappas den inmatningen. `hidden` bevarar React-instansen, så ett pågående tips
          (och låst-/sekretess-/epoch-läget i storen) överlever expandera/ihopfäll.

          STICKY "FÖLJ-MED"-KONTROLL (#173 T82 del 4 + F1-fix T83): när fönstret döljer
          något wrappar StickyFollowToggle den övre kontrollen OCH listan i EN container,
          så den sticky baren (utfällt läge) klistrar under sajt-headern och FÖLJER MED
          ner i listan (komprimera alltid ett tryck bort, oavsett scroll-position). Listan
          ligger som `children` (inte ett syskon) just för att en sticky-yta bara följer
          med inom sin egen containing block , det var F1-buggen (baren gled ur vy). Den
          övre kontrollen är dessutom fokus-MÅLET vid ihopfällning (toggleExpanded). */}
      {ready ? (
        predictable.length > 0 ? (
          (() => {
            // Listan byggs EN gång (DRY) och placeras antingen inuti StickyFollowToggle
            // (när fönstret döljer något => sticky följ-med-bar) eller renderas naken
            // (kort lista, ingen toggle). Samma `<ol id={listId}>` i båda fallen, så
            // listans id/data-attribut/innehåll är oförändrade.
            const list = (
              <ol
                id={listId}
                data-predictions-list=""
                className="mt-5 flex list-none flex-col gap-3 p-0"
              >
                {predictable.map(({ match, locked }) => {
                  const mine = store.myPredictions.get(match.id) ?? null;
                  return (
                    <li key={match.id} hidden={!isInWindow(match.id)}>
                      <PredictionForm
                        match={match}
                        teamsById={teamsById}
                        current={
                          mine ? { homeGoals: mine.homeGoals, awayGoals: mine.awayGoals } : null
                        }
                        locked={locked}
                        onSubmit={async (matchId, homeGoals, awayGoals) => {
                          await store.savePrediction({ matchId, homeGoals, awayGoals });
                        }}
                      />
                    </li>
                  );
                })}
              </ol>
            );
            return hasHidden ? (
              <StickyFollowToggle
                expanded={expanded}
                hiddenCount={windowed.hiddenCount}
                controls={listId}
                onToggle={toggleExpanded}
                buttonRef={topToggleRef}
                name="predictions"
              >
                {list}
              </StickyFollowToggle>
            ) : (
              list
            );
          })()
        ) : (
          // Aktivt rum men inga tippbara matcher (t.ex. alla framtida matcher saknar
          // ännu kända lag): en lugn, vänlig tom-ruta i stället för en tom sektion.
          <p className="mt-5 rounded-card border border-border bg-surface px-4 py-8 text-center text-sm text-fg-muted">
            Inga matcher att tippa just nu. Så snart nästa match har båda lag klara dyker kupongen
            upp här.
          </p>
        )
      ) : null}

      {/* NEDRE ihopfäll-/expandera-kontroll (dubblerad): i UTFÄLLT läge ligger den efter
          hela listan, så användaren kan fälla ihop utan att skrolla tillbaka upp.
          Identisk semantik som den övre (samma ExpandToggle), och vid ihopfällning
          härifrån flyttas fokus upp till den ÖVRE toggeln (listans topp, toggleExpanded).
          I ihopfällt läge ligger de två direkt ovanpå varandra, ofarligt och billigare
          än att villkora bort den ena per läge (KISS), aria-haken hålls på BÅDA. */}
      {ready && predictable.length > 0 && hasHidden ? (
        <div className="mt-4 flex">
          <ExpandToggle
            expanded={expanded}
            hiddenCount={windowed.hiddenCount}
            controls={listId}
            onToggle={toggleExpanded}
            position="bottom"
            name="predictions"
          />
        </div>
      ) : null}
    </section>
  );
}
