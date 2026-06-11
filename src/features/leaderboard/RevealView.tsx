// TIPS-AVSLÖJANDE-VYN (T17, #17). FUNKTIONELLT + a11y-lager (senior-dev) + PREMIUM-
// FINISH (design-frontend), ett lager.
//
// IDENTITET ("FACIT-ÖGONBLICKET"): per avgjord match avslöjas allas tips jämte facit
// + poäng. Designen gör det till ett facit-ögonblick , vem prickade rätt, vem bommade,
// synligt på en blink:
//   - FACIT-TALET (det faktiska resultatet) är hjälten: en solid guld-bricka med mörk
//     ink (samma färg-oberoende solid-bricka-form som medaljerna), "domen är fälld".
//   - VARJE pick får en FÄRG-OBEROENDE utfalls-markör (IKON + FORM, inte bara färg):
//       * EXAKT (3p) = bock i en solid grön medalj.
//       * RÄTT UTFALL (1p) = halv-cirkel-glyf i en solid guld-medalj.
//       * MISS (0p) = kryss i en neutral ring.
//     Formen + ikonen skiljer dem även i gråskala / för en färgblind användare; en
//     dold etikett (sr-only) ger skärmläsaren samma besked i ord.
//
// SEKRETESS: andras tips dolda före deadline är redan garanterat server-side (RLS,
// T15) OCH i den rena reveal-gaten (buildMatchReveal kräver LÅST match; sedan T55
// visas även låsta PÅGÅENDE matcher, som 'live'-varianten utan poäng), så vyn
// renderar bara det som FÅR visas. Vyn LÄSER store.reveal + slår upp lagnamn ur den
// delade lag-listan (results-storen).
//
// UTFALLS-KATEGORI härleds ur pick.pointType (T46), den TESTADE poäng-TYPEN ur score.ts
// (pointTypeOf, samma sanning som poäng-siffran). Inte en egen tröskel mot points-talet,
// en sanning för "vad är en exakt träff" OCH "varför fick tipset sin poäng".
//
// T55 (#96): PÅGÅR-LÄGET. Avslöjandet visas nu redan vid AVSPARK, inte först vid
// slutsignal. En LÅST men PÅGÅENDE match (store.reveal-rad med status 'live') visar
// allas tips MEN inget facit och INGA poäng (ärligt "Pågår", vi gissar aldrig poäng på
// en oavgjord match, HARD T55). En FÄRDIG match (status 'finished') visar facit + poäng
// + varför som förut. Diskriminanten gör att poäng-fälten strukturellt bara finns på den
// färdiga grenen.
//
// PÅGÅR-FINISHEN (design-frontend, ovanpå data-attribut-hakarna): pågår-kortet bär
// appens PITCH-GRÖNA accent-identitet (.vm-reveal-card--live) i stället för facit-
// kortets kvällsljus-guld, så de två kort-typerna skiljs på en blink. "Pågår"-markören
// är en levande accent-pill med en pulsande prick (.vm-reveal-pending + .vm-pending-dot,
// samma vm-pulse som dagshero:ns live-prick), pulsen stannar vid reducerad rörelse och
// budskapet bärs då av form + ord, aldrig av enbart färg eller rörelse. Pågående tips
// får en svag accent-vänsterkant (.vm-reveal-pick--live), "ligger på bordet, ännu inte
// dömda". AA-mätt per tema, se tokens.css .vm-reveal-card--live-blocket.

import { useMemo } from 'react';
import { useLeaderboardStore } from './leaderboard-context';
import { type MatchPointType, type Scoreline } from '../../data/predictions';
import type { RevealedMatch, FinishedRevealedMatch, PendingRevealedMatch } from './reveal';

/** Formatera en målställning som "2-1". */
function formatScore(score: Scoreline): string {
  return `${score.homeGoals}-${score.awayGoals}`;
}

/**
 * Formatera ett poängtillägg synligt för en pick-rad: "+3", "+1" eller "0" (0 får inget
 * plustecken, det är ingen vinst). Visas i VARFÖR-etiketten ("Exakt resultat +3").
 */
function formatPointDelta(points: number): string {
  return points > 0 ? `+${points}` : `${points}`;
}

/** En utfalls-kategori + dess färg-oberoende markör (ikon, form, etiketter). */
interface Outcome {
  /** data-outcome-värde (CSS-hak för vänsterkant + markör-variant). Lika med pointType. */
  key: MatchPointType;
  /** Markör-glyf (ikon/form). Skiljer kategorierna även utan färg. */
  glyph: string;
  /** CSS-modifierare för markör-brickan. */
  markClass: string;
  /** SYNLIG VARFÖR-etikett (T46): orsaken bredvid poängen, "Exakt resultat" osv. */
  reason: string;
  /** Dold etikett för skärmläsare (kort besked i ord, samma anda som reason). */
  label: string;
}

/**
 * Slå upp utfalls-kategorin ur poäng-TYPEN (pointTypeOf, score.ts). Uttömmande över
 * MatchPointType ('exact' | 'outcome' | 'miss'), inget default-fall: en ny typ blir ett
 * KOMPILERINGSFEL här i stället för en tyst fallback (fail-loud i typen). VARFÖR-texten
 * (reason) följer poängregeln: exakt resultat / rätt vinnare-utfall / miss.
 */
const OUTCOME_BY_TYPE: Record<MatchPointType, Omit<Outcome, 'key'>> = {
  exact: {
    glyph: '✓',
    markClass: 'vm-reveal-mark--exact',
    reason: 'Exakt resultat',
    label: 'Exakt resultat',
  },
  outcome: {
    glyph: '◐',
    markClass: 'vm-reveal-mark--outcome',
    reason: 'Rätt vinnare',
    label: 'Rätt vinnare',
  },
  miss: {
    glyph: '✗',
    markClass: 'vm-reveal-mark--miss',
    reason: 'Miss',
    label: 'Miss',
  },
};

function outcomeFor(pointType: MatchPointType): Outcome {
  return { key: pointType, ...OUTCOME_BY_TYPE[pointType] };
}

/** Lagnamn-uppslag (Team.id -> namn). Returnerar en stabil fallback, ingen krasch. */
type TeamNameLookup = (teamId: string | null) => string;

/**
 * En FÄRDIG match: facit-talet (hjälten) + allas tips + poäng + VARFÖR-etikett. Oförändrat
 * beteende mot T17/T46, bara utbrutet ur en gemensam dispatch så pågår-läget kan ligga jämte.
 */
function FinishedMatchCard({
  match,
  nameOf,
}: {
  match: FinishedRevealedMatch;
  nameOf: TeamNameLookup;
}) {
  return (
    <li
      data-reveal-match=""
      data-match-id={match.matchId}
      data-reveal-status="finished"
      className="vm-reveal-card rounded-card p-4"
    >
      {/* Match-rubrik + FACIT-talet (det faktiska resultatet, hjälten). */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="m-0 font-display text-sm font-semibold">
          {nameOf(match.homeTeamId)} mot {nameOf(match.awayTeamId)}
        </p>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-fg-muted">
            Facit
          </span>
          <span
            data-reveal-actual=""
            className="vm-reveal-actual inline-flex items-center rounded-pill px-2.5 py-0.5 text-sm tabular-nums"
          >
            {formatScore(match.actual)}
          </span>
        </span>
      </div>

      {/* Allas tips + poäng (sorterade på poäng fallande av reveal-modulen). Varje
          rad bär en FÄRG-OBEROENDE utfalls-markör + en SYNLIG VARFÖR-etikett (T46)
          + en grön/guld vänsterkant. */}
      {match.picks.length > 0 ? (
        <ul data-reveal-picks="" className="mt-3 flex list-none flex-col gap-1.5 p-0">
          {match.picks.map((pick) => {
            const outcome = outcomeFor(pick.pointType);
            return (
              <li
                key={pick.userId}
                data-reveal-pick=""
                data-user-id={pick.userId}
                data-points={pick.points}
                data-outcome={outcome.key}
                className="vm-reveal-pick flex flex-wrap items-center gap-x-3 gap-y-1 py-1 pl-2 text-sm"
              >
                {/* FÄRG-OBEROENDE utfalls-markör: ikon + form. Etiketten står synlig
                    bredvid poängen, så ingen sr-only-dublett behövs här längre. */}
                <span
                  className={`vm-reveal-mark ${outcome.markClass} h-6 w-6 text-xs`}
                  aria-hidden="true"
                >
                  {outcome.glyph}
                </span>
                <span data-reveal-name="" className="min-w-0 flex-1 truncate">
                  {pick.displayName}
                </span>
                <span className="shrink-0 tabular-nums text-fg-muted">
                  {formatScore(pick.predicted)}
                </span>
                {/* VARFÖR + poäng (T46): orsaken bredvid poängen, "Exakt resultat +3".
                    data-reveal-reason = stabil krok för design-frontend + test. */}
                <span
                  data-reveal-reason=""
                  className={`shrink-0 text-right font-medium tabular-nums ${
                    outcome.key === 'exact'
                      ? 'text-warning'
                      : outcome.key === 'miss'
                        ? 'text-fg-muted'
                        : ''
                  }`}
                >
                  {outcome.reason} {formatPointDelta(pick.points)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p data-reveal-no-picks="" className="mt-3 text-sm text-fg-muted">
          Ingen i rummet tippade den här matchen.
        </p>
      )}
    </li>
  );
}

/**
 * En LÅST men PÅGÅENDE match (T55, #96): allas tips synliga, men INGET facit och INGA
 * poäng (ärligt "Pågår"). Ingen utfalls-markör/VARFÖR-etikett, det finns inget facit att
 * döma mot än. Vi visar bara vem som gissade vad. design-frontend polerar finishen ovanpå
 * data-reveal-status="live" + data-reveal-live-pick.
 */
function PendingMatchCard({
  match,
  nameOf,
}: {
  match: PendingRevealedMatch;
  nameOf: TeamNameLookup;
}) {
  return (
    <li
      data-reveal-match=""
      data-match-id={match.matchId}
      data-reveal-status="live"
      className="vm-reveal-card vm-reveal-card--live rounded-card p-4"
    >
      {/* Match-rubrik + PÅGÅR-pill (inget facit-tal än, matchen är inte avgjord). Pillen
          bär en pulsande accent-prick + ordet "Pågår": en LEVANDE markör (matchen rullar)
          som ändå är tydligt skild från facit-kortets solida guld-bricka. Den pulsande
          pricken är dekor (aria-hidden); ORDET "Pågår" är den lästa/upplästa etiketten,
          så budskapet bärs av text + form, aldrig av enbart färg eller enbart rörelse. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="m-0 font-display text-sm font-semibold">
          {nameOf(match.homeTeamId)} mot {nameOf(match.awayTeamId)}
        </p>
        <span
          data-reveal-pending=""
          className="vm-reveal-pending inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.12em]"
        >
          <span className="vm-pending-dot" aria-hidden="true" />
          Pågår
        </span>
      </div>

      {/* Allas tips (sorterade på namn). INGA poäng, matchen är inte avgjord (HARD T55). */}
      {match.picks.length > 0 ? (
        <ul data-reveal-picks="" className="mt-3 flex list-none flex-col gap-1.5 p-0">
          {match.picks.map((pick) => (
            <li
              key={pick.userId}
              data-reveal-pick=""
              data-reveal-live-pick=""
              data-user-id={pick.userId}
              className="vm-reveal-pick vm-reveal-pick--live flex flex-wrap items-center gap-x-3 gap-y-1 py-1 pl-2 text-sm"
            >
              <span data-reveal-name="" className="min-w-0 flex-1 truncate">
                {pick.displayName}
              </span>
              <span className="shrink-0 tabular-nums text-fg-muted">
                {formatScore(pick.predicted)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p data-reveal-no-picks="" className="mt-3 text-sm text-fg-muted">
          Ingen i rummet tippade den här matchen.
        </p>
      )}
    </li>
  );
}

/** Rendera ett avslöjande, dispatchat på status (pågår vs färdig). Uttömmande union. */
function RevealMatchCard({ match, nameOf }: { match: RevealedMatch; nameOf: TeamNameLookup }) {
  return match.status === 'finished' ? (
    <FinishedMatchCard match={match} nameOf={nameOf} />
  ) : (
    <PendingMatchCard match={match} nameOf={nameOf} />
  );
}

export function RevealView() {
  const store = useLeaderboardStore();

  // Lagnamn-uppslag (Team.id -> namn) ur lag-listan i storen, för läsbar match-rubrik.
  const teamNameById = useMemo(
    () => new Map(store.teams.map((t) => [t.id, t.name])),
    [store.teams]
  );
  const nameOf: TeamNameLookup = (teamId) =>
    teamId === null ? 'Okänt lag' : (teamNameById.get(teamId) ?? teamId);

  const ready = store.enabled && store.status === 'ready';

  // Inget att avslöja än (ingen låst match): rendera inget (vyn är tyst tills första
  // matchen sparkat igång, ingen tom-rubrik som distraherar).
  if (!ready || store.reveal.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="reveal-heading" data-reveal-view="">
      <header className="flex flex-col gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-warning">
          Facit
        </p>
        <h2 id="reveal-heading" className="font-display text-xl font-semibold sm:text-2xl">
          Vad alla tippade
        </h2>
        <p className="max-w-2xl text-sm text-fg-muted">
          Efter avspark avslöjas allas tips. Här ser du vad var och en gissade, och, när matchen är
          klar, hur det gick.
        </p>
      </header>

      <ol data-reveal-list="" className="mt-5 flex list-none flex-col gap-4 p-0">
        {store.reveal.map((match) => (
          <RevealMatchCard key={match.matchId} match={match} nameOf={nameOf} />
        ))}
      </ol>
    </section>
  );
}
