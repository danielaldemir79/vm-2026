// "VAD ALLA TIPPADE"-SEKTIONEN (T92 del D, Daniels godkända lösning 2026-06-16). Flyttad
// FRÅN Topplista-fliken (där den var inbakad i LeaderboardSection) TILL botten av Tips-fliken,
// där den tematiskt hör hemma ("vad alla tippade" om tipsen).
//
// FORMEN (godkänd): EN sektions-kollaps + EN paginering + drill-in , aldrig två konkurrerande
// "fäll ihop".
//   - IHOPFÄLLD default: bara rubriken + en "Visa vad alla tippade (N matcher)"-knapp.
//   - UTFÄLLD: en PAGINERAD PLATT lista av KOMPAKTA matchrader (SENASTE spelade först,
//     reveal-rows). Varje rad = lagen + facit + DITT resultat. INGEN inline-expansion av allas
//     tips i listan (det var väggen).
//   - TAP på en matchrad -> DRILL-IN till den rika matchvyn (T86), som visar ALLAS tips (+
//     tidslinje/statistik/laguppställning). Wiringen är FÖRBEREDD i T86: raden ÄR en
//     MatchDetailTrigger som anropar useMatchDetail().openMatch(matchId).
//
// EGEN RAD MARKERAD (T92 del E, tvärgående): tippade DU matchen får raden samma färg-OBEROENDE
// "DU"-markering (data-self + DU-bricka) som topplistorna , konsekvent över alla listor.
//
// VARFÖR en KOMPAKT rad, inte hela facit-kortet: med fler matcher + fler tävlande blev den gamla
// "allas tips per match inline"-listan en vägg (Daniels feedback). Den kompakta raden visar bara
// det DU bryr dig om på överblicks-nivå (facit + ditt resultat), och allas tips når man via
// drill-in när man VILL , progressive disclosure (north-star §2).
//
// GATING: samma som RevealView , tyst (renderar inget) tills storen är ready OCH det finns minst
// en låst match att avslöja. Kräver en MatchDetailProvider (för drill-in); App wrappar Tips-
// fliken i den (samma provider som Idag-listans drill-in).

import { useId, useMemo, useState } from 'react';
import { useLeaderboardStore } from './leaderboard-context';
import { buildRevealRows, pageOfRevealRows, type RevealRow } from './reveal-rows';
import { matchPointLabel, outcomeOf, type Outcome, type Scoreline } from '../../data/predictions';
import { MatchDetailTrigger } from '../match-detail';
import { ExpandToggle } from '../../components/ExpandToggle';
import { StickyFollowToggle } from '../../components/collapsible-list';

/**
 * Härled facit-utfallet (för "Rätt kryss" vs "Rätt vinnare"-ordet i ditt resultat, #69).
 * Bara meningsfullt på en FÄRDIG match; en pågående match har inget facit (reason används
 * inte då, så fallback-värdet är oviktigt).
 */
function outcomeFromActual(match: RevealRow['match']): Outcome {
  return match.status === 'finished' ? outcomeOf(match.actual) : 'draw';
}

/** Hur många matchrader en sida visar. Håller listan kort + scroll-bar på mobil. */
const PAGE_SIZE = 12;

/** Formatera en målställning som "2-1". (Lokal kopia, samma form som RevealView; trivial.) */
function formatScore(score: Scoreline): string {
  return `${score.homeGoals}-${score.awayGoals}`;
}

/**
 * EN kompakt matchrad: en MatchDetailTrigger (drill-in-knapp) med lagen + facit/pågår + ditt
 * resultat. Hela raden är klickbar (en riktig <button>, tangentbordsnåbar, T86-triggern).
 */
function RevealRowItem({
  row,
  nameOf,
  isSelf,
}: {
  row: RevealRow;
  nameOf: (teamId: string | null) => string;
  isSelf: boolean;
}) {
  const { match, self } = row;
  const home = nameOf(match.homeTeamId);
  const away = nameOf(match.awayTeamId);
  const finished = match.status === 'finished';

  // Ditt resultat-text för raden: din ställning + (om färdig) varför + poäng. Tippade du inte,
  // visar vi ", " (en lugn em-streck-fri platshållare), aldrig en gissad poäng.
  const selfPoints = self?.points;
  const selfReason =
    self !== null && self.pointType !== null
      ? matchPointLabel(self.pointType, outcomeFromActual(match))
      : null;

  return (
    <li
      data-reveal-row=""
      data-match-id={match.matchId}
      data-reveal-status={match.status}
      data-self={isSelf ? 'true' : undefined}
      className="vm-reveal-row"
    >
      <MatchDetailTrigger
        matchId={match.matchId}
        ariaLabel={`Öppna matchsidan för ${home} mot ${away} och se vad alla tippade`}
        className="vm-reveal-row-button flex w-full items-center gap-3 rounded-card px-3 py-2.5 text-left"
      >
        {/* Lagen (truncar först när trångt) + facit/pågår-bricka. */}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="min-w-0 truncate font-display text-sm font-semibold">
            {home} mot {away}
          </span>
          <span className="flex items-center gap-2 text-xs text-fg-muted">
            {finished ? (
              <>
                <span className="text-[0.625rem] font-semibold uppercase tracking-[0.1em]">
                  Facit
                </span>
                <span data-reveal-row-actual="" className="font-semibold tabular-nums text-fg">
                  {formatScore(match.actual)}
                </span>
              </>
            ) : (
              <span
                data-reveal-row-pending=""
                className="font-semibold uppercase tracking-[0.08em]"
              >
                Pågår
              </span>
            )}
          </span>
        </span>

        {/* DU-bricka (del E): bara när DU tippade matchen, samma form/klass som topplistans. */}
        {isSelf ? (
          <span
            data-reveal-row-self=""
            aria-hidden="true"
            className="vm-board-self-badge shrink-0 rounded-pill px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.12em]"
          >
            Du
          </span>
        ) : null}

        {/* DITT RESULTAT: din ställning + (om färdig) poäng. Tippade du inte: en lugn ", ". */}
        <span data-reveal-row-self-result="" className="flex shrink-0 flex-col items-end gap-0.5">
          {self !== null ? (
            <>
              <span className="text-xs text-fg-muted">
                Du:{' '}
                <span className="font-semibold tabular-nums text-fg">
                  {formatScore(self.predicted)}
                </span>
              </span>
              {finished && selfPoints !== null && selfPoints !== undefined ? (
                <span
                  className={`text-[0.625rem] font-semibold tabular-nums ${
                    selfPoints > 0 ? 'text-warning' : 'text-fg-muted'
                  }`}
                >
                  {selfReason} {selfPoints > 0 ? `+${selfPoints}` : selfPoints}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-xs text-fg-muted">Du tippade inte</span>
          )}
        </span>

        {/* Drill-in-chevron (affordans: "tryck för mer"). aria-hidden , knappens aria-label
            bär betydelsen åt skärmläsare. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-4 w-4 shrink-0 text-fg-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
      </MatchDetailTrigger>
    </li>
  );
}

export function RevealSection() {
  const store = useLeaderboardStore();
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const listId = useId();

  // Lagnamn-uppslag (Team.id -> namn) ur lag-listan i storen (samma fallback som RevealView).
  const teamNameById = useMemo(
    () => new Map(store.teams.map((t) => [t.id, t.name])),
    [store.teams]
  );
  const nameOf = (teamId: string | null) =>
    teamId === null ? 'Okänt lag' : (teamNameById.get(teamId) ?? teamId);

  // De kompakta raderna i visningsordning (senaste spelade först) + ditt resultat per rad.
  const rows = useMemo(
    () => buildRevealRows(store.reveal, store.currentUserId),
    [store.reveal, store.currentUserId]
  );

  const ready = store.enabled && store.status === 'ready';
  // Tyst tills det finns något att avslöja (samma gate som RevealView), ingen tom rubrik.
  if (!ready || rows.length === 0) {
    return null;
  }

  // Sid-utsnittet (klampat). page styrs av användarens fram/bak-knappar.
  const { rows: pageRows, page: clampedPage, pageCount } = pageOfRevealRows(rows, page, PAGE_SIZE);

  const list = (
    <ol id={listId} data-reveal-row-list="" className="flex list-none flex-col gap-2 p-0">
      {pageRows.map((row) => (
        // EGEN RAD (del E): markera raden när DU tippade matchen. row.self != null betyder
        // exakt det (din pick fanns + en identitet gavs, se buildRevealRows), så vi behöver
        // ingen extra currentUserId-koll här , den är redan inbakad i self-projektionen.
        <RevealRowItem
          key={row.match.matchId}
          row={row}
          nameOf={nameOf}
          isSelf={row.self !== null}
        />
      ))}
    </ol>
  );

  return (
    <section aria-labelledby="reveal-section-heading" data-reveal-section="">
      <header className="flex flex-col gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-warning">
          Facit
        </p>
        <h2 id="reveal-section-heading" className="font-display text-xl font-semibold sm:text-2xl">
          Vad alla tippade
        </h2>
        <p className="max-w-2xl text-sm text-fg-muted">
          Senaste matcherna först. Tryck på en match för att se allas tips, facit och hur det gick.
        </p>
      </header>

      {!expanded ? (
        // IHOPFÄLLD: en enda expandera-kontroll (sektions-kollapsen). Ingen lista renderas.
        <div className="mt-4 flex">
          <ExpandToggle
            expanded={false}
            hiddenCount={rows.length}
            labels={{
              expand: `Visa vad alla tippade (${rows.length} ${
                rows.length === 1 ? 'match' : 'matcher'
              })`,
              collapse: 'Dölj',
            }}
            controls={listId}
            onToggle={() => setExpanded(true)}
            position="top"
            name="reveal"
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {/* EN sektions-kollaps: en STICKY följ-med "Dölj"-kontroll i utfällt läge (följer med
              ner i den paginerade listan, F1-mönstret , bar + lista delar EN containing block). */}
          <StickyFollowToggle
            expanded={true}
            labels={{
              expand: `Visa vad alla tippade (${rows.length} ${
                rows.length === 1 ? 'match' : 'matcher'
              })`,
              collapse: 'Dölj',
            }}
            controls={listId}
            onToggle={() => setExpanded(false)}
            name="reveal"
          >
            {list}
          </StickyFollowToggle>

          {/* EN paginering: fram/bak + "sida X av Y". Bara när det finns mer än en sida. */}
          {pageCount > 1 ? (
            <nav
              data-reveal-pagination=""
              aria-label="Sidnavigering för avslöjandet"
              className="flex items-center justify-between gap-3"
            >
              <button
                type="button"
                data-reveal-page-prev=""
                onClick={() => setPage(clampedPage - 1)}
                disabled={clampedPage <= 1}
                className="vm-total-control rounded-pill px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                Föregående
              </button>
              <span data-reveal-page-status="" aria-live="polite" className="text-sm text-fg-muted">
                Sida {clampedPage} av {pageCount}
              </span>
              <button
                type="button"
                data-reveal-page-next=""
                onClick={() => setPage(clampedPage + 1)}
                disabled={clampedPage >= pageCount}
                className="vm-total-control rounded-pill px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                Nästa
              </button>
            </nav>
          ) : null}
        </div>
      )}
    </section>
  );
}
