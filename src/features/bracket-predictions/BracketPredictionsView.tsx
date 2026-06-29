// BRACKET-/SLUTSPELS-TIPS-VYN (FUNKTIONELLT + a11y-lager + VISUELL premium-finish,
// T16b, #59). Systerfil till GroupPredictionsView.tsx (T16).
//
// FOKUS (senior-devs lager): rätt slots, rätt lägen, tillgänglig struktur. Visar
// CHAMPION-väljaren (VM-vinnaren) överst + ett bracket-tips-formulär per slutspels-
// slot (M73..M104), rund-grupperat (sextondel -> final, T9:s ordning), i RUM-läge.
// Per slot ett tydligt LÅST-läge efter slottens avspark, ett OKÄNDA-LAG-läge tills
// tidigare resultat avgjort lagen, och mitt tips synligt. UTAN ett aktivt rum visas
// "gå med i ett rum för att tippa" (bracket-tips är per rum).
//
// DEADLINE: per slot (slottens egen avspark M73..M104) + champion (turneringsstart,
// g-A-1), inte ett globalt lås, så M104 kan tippas efter att M73 spelats. Härlett för
// VISNING; servern (RLS) är det riktiga låset. Minut-tick (useDeadlineTick) så ett
// lås flippar utan omladdning (en match startar mitt på dagen, T15 C1-lärdomen).
//
// LAG-IDENTITET: formulärets value är lagets CODE (TeamCode), brandas vid UI-gränsen
// (teamCode()) innan store.saveBracketPrediction, så API:t garanterat får en code.
//
// VISUELL DESIGN (designen, T16b): "VÄGEN TILL BUCKLAN". Rubriken bär pool-
// identiteten (guld-eyebrow + motiverande öppen-räknare). CHAMPION är HJÄLTE-momentet
// (egen guld-pokal-hero, variant="champion"). Slot-tipsen är en rund-grupperad kupong-
// grid där varje runda får en rubrik-marker vars intensitet BYGGER mot finalen (samma
// per-stage-guld som slutspelsträdet, bracket.css). "Gå med i ett rum"-läget är en
// INBJUDANDE guld-tonad port (pokal-ikon + tydlig väg framåt), inte en grå rad.
// Stabila roller + data-attribut bevaras (senior-devs seam + testkontrakt).

import { useMemo } from 'react';
import { CollapsibleBody } from '../../components/CollapsibleSection';
import { useBracketPredictionsStore } from './bracket-predictions-context';
import { useBracketPredictableData } from './use-bracket-predictable-data';
import { selectPredictableBracket } from './bracket-predictable-slots';
import { BracketPredictionForm } from './BracketPredictionForm';
import {
  deriveBracketPredictionResults,
  type BracketSlotResult,
} from './derive-bracket-prediction-results';
import { useDeadlineTick } from '../predictions/use-deadline-tick';
import { useOptionalResultsStore } from '../results/results-context';
import { derivePoolFacit } from '../leaderboard';
import { teamCode } from '../../domain/team-code';
import type { BracketSlotState } from '../bracket';

export interface BracketPredictionsViewProps {
  /** Injicerbar env (testbarhet), default = import.meta.env. */
  env?: ImportMetaEnv;
  /** Injicerbart "nu" (testbarhet) för låst-härledningen, default = nuet. */
  now?: Date;
}

/** Människo-läsbar etikett för en slutspels-slot (rund-namn + matchnummer). */
function slotLabel(roundLabel: string, slotId: string): string {
  return `${roundLabel} ${slotId}`;
}

/**
 * Rund-markörens innehåll: en stigande "intensitet" mot finalen, ekar slutspelsträdet
 * (bracket.css). De tidiga rundorna får ett ordningstal (1..4), bronsmatchen en brons-
 * prick och finalen en pokal-glyf, så rubrik-raden bygger mot trädets krona. Ren dekor.
 */
function RoundMarkerContent({ stage }: { stage: BracketSlotState['stage'] }) {
  // Ordnings-numret i slutspelet (sextondel = 1 ... semifinal = 4). Bronsmatch + final
  // bär symboler i stället för siffror (de är "slutet").
  const ORDINAL: Partial<Record<BracketSlotState['stage'], string>> = {
    'round-of-32': '1',
    'round-of-16': '2',
    'quarter-final': '3',
    'semi-final': '4',
  };
  if (stage === 'final') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 4h10v4a5 5 0 0 1-10 0z" />
        <path d="M7 5H4.5a1.5 1.5 0 0 0 0 5H7M17 5h2.5a1.5 1.5 0 0 1 0 5H17" />
        <path d="M12 13v3M9 20h6M9.5 20a2.5 2.5 0 0 1 5 0" />
      </svg>
    );
  }
  if (stage === 'third-place') {
    return <span className="text-[0.6875rem] font-bold leading-none">3</span>;
  }
  return <span className="text-[0.6875rem] font-bold leading-none">{ORDINAL[stage] ?? ''}</span>;
}

export function BracketPredictionsView({
  env = import.meta.env,
  now = new Date(),
}: BracketPredictionsViewProps) {
  const store = useBracketPredictionsStore();
  const { status, bracket, teams, matches, error } = useBracketPredictableData(env);

  // Deadline-medveten re-render (samma minut-tick som T15/T16): låst-statusen
  // (now >= slottens/championens avspark) räknas om utan manuell omladdning.
  const evalNow = useDeadlineTick(now);

  // evalNow ingår i deps (det är poängen): räkna om när tiden passerar en avspark.
  const predictable = useMemo(
    () => selectPredictableBracket(bracket, teams, matches, evalNow),
    [bracket, teams, matches, evalNow]
  );

  // Hur många slots är ÄNNU öppna att tippa (kända lag + ej låsta), champion inräknad?
  // Motiverande räknare (samma anda som T15/T16).
  const openCount = useMemo(() => {
    const openSlots = predictable.rounds
      .flatMap((r) => r.slots)
      .filter((s) => s.teamsKnown && !s.locked).length;
    const championOpen = predictable.champion.locked ? 0 : 1;
    return openSlots + championOpen;
  }, [predictable]);

  // RESULTAT per AVGJORD slot man tippat på (Del B): rätt/fel + poäng + vem som gick vidare.
  // Kräver de RIKTIGA (woven) resultaten ur results-storen (use-bracket-predictable-data:s
  // matcher saknar inte facit i appen, men facit-härledningen är EN sanning via derivePoolFacit,
  // samma som topplistan). Läses TOLERANT (null utan provider, t.ex. isolerade tester ->
  // inga resultat, formuläret visar bara tipset). Döljs i what-if-läge (placeringarna är
  // hypotetiska där) och före storen är 'ready'. Speglar GroupPredictionsView:s groupResults.
  const resultsStore = useOptionalResultsStore();
  const bracketResults = useMemo<Map<string, BracketSlotResult>>(() => {
    if (!resultsStore || resultsStore.status !== 'ready' || resultsStore.simulating) {
      return new Map();
    }
    const facit = derivePoolFacit(resultsStore.teams, resultsStore.groups, resultsStore.matches);
    return deriveBracketPredictionResults(
      facit.bracketSlots,
      facit.champion,
      store.myBracketPredictions
    );
  }, [resultsStore, store.myBracketPredictions]);

  const ready = store.enabled && status === 'ready' && store.status === 'ready';

  // Spara-handlern (delad av champion + match-slots): brandar value -> TeamCode vid
  // UI-gränsen (F1-fällan), så API:t garanterat får en versal code.
  const handleSave = async (slotId: string, advancingCode: string) => {
    await store.saveBracketPrediction({
      slotId,
      advancingTeamId: teamCode(advancingCode),
    });
  };

  const champion = predictable.champion;
  const myChampion = store.myBracketPredictions.get(champion.slotId) ?? null;

  return (
    <section aria-labelledby="bracket-predictions-heading" data-bracket-predictions-view="">
      <header className="flex flex-col gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-warning">
          VM-poolen
        </p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2
            id="bracket-predictions-heading"
            className="font-display text-xl font-semibold sm:text-2xl"
          >
            Tippa slutspelet
          </h2>
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
              {openCount} {openCount === 1 ? 'slot öppen' : 'slots öppna'} att tippa
            </span>
          ) : null}
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          Tippa vem som vinner hela VM och vilket lag som går vidare ur varje slutspelsmatch. Du
          tippar en slot så snart dess två lag är kända, men före matchen, så alla gissar blint.
        </p>
      </header>

      {/* EXPANDERAT FRÅN START (2026-06-28, Daniels önskemål): slutspelet är live, så hela
          slutspels-tipset (champion + alla slot-kuponger) visas direkt , man ska inte behöva
          fälla ut det för att tippa knockout-resultaten. Komprimeringen finns kvar som en
          MÖJLIGHET ("Visa färre"); collapsedMaxHeight styr då toppens storlek. Faden tonar
          mot surface (sektionen ligger på en Panel). */}
      <CollapsibleBody
        name="bracket-predictions"
        toggleLabels={{ expand: 'Visa hela slutspels-tipset', collapse: 'Visa färre' }}
        collapsedMaxHeight="16rem"
        startExpanded
      >
        {/* UTAN aktivt rum (taskens punkt 3): bracket-tips är per rum. En INBJUDANDE
          guld-tonad port med en pokal-ikon + tydlig väg framåt, inte en grå rad, den
          ska kännas som en inbjudan att vara med och tippa bucklan, inte ett fel. */}
        {!store.enabled ? (
          <div
            data-bracket-predictions-no-room=""
            className="mt-4 flex items-start gap-3 rounded-card border border-[color-mix(in_srgb,var(--vm-gold)_22%,var(--color-border))] bg-[color-mix(in_srgb,var(--vm-gold)_6%,var(--color-surface))] p-4 sm:p-5"
          >
            {/* Guld-tonad pokal-ikon i en rund bricka. Ikon-färgen är --color-warning
              (AA-säker guld-text-ton), tinten är dekor. aria-hidden, rubriken bär text. */}
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-[color-mix(in_srgb,var(--vm-gold)_14%,transparent)] text-warning"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 4h10v4a5 5 0 0 1-10 0z" />
                <path d="M7 5H4.5a1.5 1.5 0 0 0 0 5H7M17 5h2.5a1.5 1.5 0 0 1 0 5H17" />
                <path d="M12 13v3M9 20h6M9.5 20a2.5 2.5 0 0 1 5 0" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="m-0 font-display text-sm font-semibold text-fg">
                Gå med i ett rum för att tippa slutspelet
              </p>
              <p className="m-0 mt-1 text-sm text-fg-muted">
                Bracket-tipsen är per rum, du och kompisarna gissar VM-vinnaren och vem som går
                vidare, och jämför sen. Skapa eller gå med i ett rum ovanför, så öppnar slottarna
                här.
              </p>
            </div>
          </div>
        ) : null}

        {/* Fel-väg (fail loud). */}
        {store.enabled && (status === 'error' || store.status === 'error') ? (
          <p
            role="alert"
            data-bracket-predictions-error=""
            className="mt-4 rounded-md border px-4 py-3 text-sm"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
              backgroundColor: 'color-mix(in srgb, var(--color-danger) 9%, transparent)',
              color: 'var(--color-danger)',
            }}
          >
            {error ?? store.error ?? 'Något gick fel när slutspelet skulle laddas.'}
          </p>
        ) : null}

        {/* Laddning. */}
        {store.enabled && (status === 'loading' || store.status === 'loading') ? (
          <p
            role="status"
            data-bracket-predictions-loading=""
            className="mt-4 text-sm text-fg-muted"
          >
            Laddar slutspelet att tippa…
          </p>
        ) : null}

        {ready ? (
          <div className="mt-5 flex flex-col gap-7">
            {/* CHAMPION-VÄLJAREN (VM-vinnaren): HJÄLTE-momentet, överst, det största
              enskilda tipset. Alla 48 lag (KISS), låst vid turneringsstart. */}
            <div data-bracket-predictions-champion="">
              <BracketPredictionForm
                slotId={champion.slotId}
                label="VM-vinnare"
                teams={champion.teams}
                teamsKnown
                current={myChampion ? myChampion.advancingTeamId : null}
                locked={champion.locked}
                deadlineIso={champion.deadlineIso}
                now={evalNow}
                variant="champion"
                result={bracketResults.get(champion.slotId) ?? null}
                onSubmit={handleSave}
              />
            </div>

            {/* SLUTSPELS-SLOTSEN, rund-grupperade (sextondel -> final). Varje runda en
              rubrik-marker (intensitet bygger mot finalen) + en responsiv kupong-grid.
              Öppna, låsta och okända-lag-slots alla synliga (med sina respektive lägen),
              så hela vägen till bucklan känns helt. */}
            {predictable.rounds.map((round) => (
              <section
                key={round.stage}
                data-bracket-predictions-round={round.stage}
                aria-label={round.label}
                className="flex flex-col gap-3"
              >
                <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-fg-muted">
                  <span
                    aria-hidden="true"
                    data-round={round.stage}
                    className="vm-tips-round-marker h-6 w-6"
                  >
                    <RoundMarkerContent stage={round.stage} />
                  </span>
                  {round.label}
                </h3>
                <ol className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
                  {round.slots.map((slot) => {
                    const mine = store.myBracketPredictions.get(slot.slotId) ?? null;
                    return (
                      <li key={slot.slotId}>
                        <BracketPredictionForm
                          slotId={slot.slotId}
                          label={slotLabel(round.label, slot.slotId)}
                          teams={slot.teams}
                          teamsKnown={slot.teamsKnown}
                          current={mine ? mine.advancingTeamId : null}
                          locked={slot.locked}
                          deadlineIso={slot.deadlineIso}
                          now={evalNow}
                          result={bracketResults.get(slot.slotId) ?? null}
                          onSubmit={handleSave}
                        />
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        ) : null}
      </CollapsibleBody>
    </section>
  );
}
