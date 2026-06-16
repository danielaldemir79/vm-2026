// AVSTÄNGDA SPELARE (T99, #200): en sektion i Turnering-fliken som visar vilka spelare som (enligt
// vår härledning ur kort-datan) sitter ute en kommande match, och VARFÖR + FRÅN vilken match. EN
// post per avstängd spelare; posten FÖRSVINNER automatiskt när avstängningen är avtjänad (laget
// har spelat matchen den gällde). NEAR-LIVE: korten uppdateras via useCrossMatchEvents-spinen, så
// en ny avstängning dyker upp inom sekunder efter ett rött/andra gult.
//
// UPPSKATTAT (Daniels direktiv, var TYDLIG): vi VET INTE disciplinnämndens exakta beslut. Längden
// är en uppskattning (default 1 match) och hela sektionen märks tydligt som uppskattad i UI:t, så
// ingen tror det är ett officiellt facit. Härlednings-reglerna (rött -> ban, 2 ackumulerade gula
// -> ban, gul-nollställning vid fas-gräns, auto-bort när avtjänad) bor källhänvisade i
// suspensions.ts (S1-S5) + docs/decisions.md 2026-06-16 (T99).
//
// SKADOR byggs INTE (Daniels besked: skippa om rörigt). De kräver API-Footballs injuries-endpoint
// = en ny låg-frekvent poll, medvetet utelämnat nu, se decisions.md.
//
// PRESENTATION (north-star §2/§3): EN omslags-Surface + en intro som flaggar "uppskattat", sedan en
// KOMPRIMERAD lista (topp-N + "Visa alla") via den DELADE CollapsibleList-primitiven, samma idiom
// som skytteligan/turneringsstatistiken (Daniels mönster: långa listor blir inte väggar). Lag-
// identitet via den delade TeamFlag-discen. INGEN egen datahämtning av reglerna , vyn laddar bara
// events + den resolvade matchplanen och låter den rena deriveSuspensions räkna (redan hårt testad).
//
// A11y: laddning = role=status, fel = role=alert (fail-loud), listan en <ol> med en beskrivande
// aria-label per rad. Motion ärvs av husets primitiver (reduced-motion-gatat där). Responsiv: namn
// truncar, badge/siffror är shrink-0 (samma grepp som de andra stat-korten).

import { useId, useMemo } from 'react';
import { Surface } from '../../components/Surface';
import { CollapsibleList } from '../../components/collapsible-list';
import { TeamFlag } from '../daily/TeamFlag';
import { stageLabel, teamDisplayName } from '../daily/match-display';
import { useResultsStore } from '../results';
import { useCrossMatchEvents } from './use-cross-match-events';
import { deriveSuspensions, type SuspensionPost } from './suspensions';

/** Hur många rader som visas i KOMPRIMERAT läge innan "Visa alla" (north-star: topp-N). */
const COLLAPSED_VISIBLE = 5;

/** En rad-modell efter att vyn löst lag-flagga + match-etiketter (ren visnings-form). */
interface SuspensionItem {
  /** Stabil React-nyckel (spelare + utlösande match). */
  key: string;
  playerName: string;
  teamName: string;
  /** FIFA-kod (gemen) för TeamFlag, null när bryggan inte känner laget (ingen disc då). */
  teamCode: string | null;
  /** Varför avstängd, läsbar svensk text ("Rött kort" / "Två gula kort"). */
  reasonText: string;
  /** "Sitter ute: <match>" , den match avstängningen gäller (en läsbar etikett). */
  servesLabel: string;
  /** "Från <match>" , den match avstängningen utlöstes i (en läsbar etikett). */
  fromLabel: string;
}

/** Läsbar svensk text för avstängnings-orsaken (S1/S2). */
function reasonText(reason: SuspensionPost['reason']): string {
  return reason === 'red-card' ? 'Rött kort' : 'Två gula kort';
}

/**
 * Avstängda-vyn. Laddar events (near-live) + den resolvade matchplanen, härleder avstängningarna
 * rent + memoiserat via deriveSuspensions, och visar en komprimerbar lista. Tål alla tillstånd:
 * laddning (status), fel (alert, fail-loud), tom data (lugn rad). I fixtures-läge mappar demo-
 * korten (api-id) inte mot matchplanen, så listan är tom där , det är ärligt (vi visar bara
 * avstängningar vi faktiskt kan placera i lag-sekvensen, gissar aldrig en from-/nästa-match).
 */
export function SuspensionsView() {
  const events = useCrossMatchEvents();
  const { matches: planMatches, teams, status: resultsStatus } = useResultsStore();
  const listId = useId();

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const matchById = useMemo(() => new Map(planMatches.map((m) => [m.id, m])), [planMatches]);

  // Härled avstängningarna rent (memoiserat: räknas om bara när events/matchplanen faktiskt
  // ändras). deriveSuspensions tar Date.now() default , vyn behöver ingen egen klocka.
  const suspensions = useMemo(
    () => deriveSuspensions(events.matches, planMatches),
    [events.matches, planMatches]
  );

  // En läsbar etikett för en match: "Grupp A: Brasilien mot Argentina" (lag via den delade
  // teamDisplayName, steg via stageLabel). Saknas matchen i uppslaget (borde inte hända, posten
  // härleds ur planen) faller vi tillbaka på match-id:t , aldrig en gissad text.
  const matchLabel = (matchId: string): string => {
    const match = matchById.get(matchId);
    if (!match) {
      return matchId;
    }
    const home = teamDisplayName(match.homeTeamId, teamsById);
    const away = teamDisplayName(match.awayTeamId, teamsById);
    return `${stageLabel(match)}: ${home} mot ${away}`;
  };

  const items: SuspensionItem[] = suspensions.map((s) => ({
    key: `${s.playerId}-${s.fromMatchId}`,
    playerName: s.playerName,
    teamName: s.teamName,
    teamCode: s.teamId,
    reasonText: reasonText(s.reason),
    servesLabel: matchLabel(s.servesMatchId),
    fromLabel: matchLabel(s.fromMatchId),
  }));

  // "Klar" = events laddade. (Matchplanen kommer ur results-storen; är den inte klar har vi ändå
  // events och en tom plan ger bara en tom lista, ingen krasch , men vi väntar in events-status
  // för en lugn laddnings-rad, samma mönster som skytteligan.)
  const ready = events.status === 'ready' && resultsStatus !== 'loading';

  return (
    <Surface aria-labelledby="suspensions-heading" data-suspensions-view="">
      <header className="flex flex-col gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-warning">
          Spelar-tillgänglighet
        </p>
        <h2 id="suspensions-heading" className="font-display text-xl font-semibold sm:text-2xl">
          Avstängda spelare
        </h2>
        <p className="max-w-2xl text-sm text-fg-muted">
          Härlett ur kort-datan: ett rött kort eller två ackumulerade gula ger avstängning nästa
          match. Längden är en <span className="font-semibold text-fg">uppskattning</span> (oftast
          en match), vi känner inte disciplinnämndens exakta beslut. En spelare faller av listan
          automatiskt när avstängningen är avtjänad.
        </p>
      </header>

      {events.status === 'error' ? (
        <p role="alert" data-suspensions-error="" className="mt-5 py-2 text-sm text-danger">
          Kunde inte ladda avstängningarna{events.error ? `: ${events.error}` : '.'}
        </p>
      ) : null}

      <div className="mt-5">
        {!ready ? (
          <p role="status" data-suspensions-notready="" className="py-2 text-sm text-fg-muted">
            Laddar...
          </p>
        ) : items.length === 0 ? (
          <p data-suspensions-empty="" className="py-2 text-sm text-fg-muted">
            Inga avstängda spelare just nu.
          </p>
        ) : (
          <CollapsibleList
            items={items}
            collapsedVisibleCount={COLLAPSED_VISIBLE}
            name="suspensions"
            listId={`${listId}-suspensions`}
            listAriaLabel="Hela listan: avstängda spelare"
            labels={{
              expand: (total) => `Visa alla ${total}`,
              collapse: 'Visa färre',
            }}
            getItemKey={(item) => item.key}
            renderPreview={({ previewItems }) => (
              <ol data-suspensions-preview="" className="flex flex-col gap-1">
                {previewItems.map((item) => (
                  <SuspensionRow key={item.key} item={item} />
                ))}
              </ol>
            )}
            renderItem={(item) => <SuspensionRow item={item} />}
          />
        )}
      </div>
    </Surface>
  );
}

/** En rad: spelare + lag-flagga + orsak-badge + "sitter ute / från"-rader. */
function SuspensionRow({ item }: { item: SuspensionItem }) {
  return (
    <li
      data-suspension-row=""
      aria-label={`${item.playerName}, ${item.teamName}, ${item.reasonText}, sitter ute ${item.servesLabel}`}
      className="flex items-start gap-3 rounded-card px-3 py-2.5"
    >
      {item.teamCode ? <TeamFlag code={item.teamCode} size="sm" /> : null}

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{item.playerName}</span>
          <span className="truncate text-xs text-fg-muted">{item.teamName}</span>
        </span>
        <span className="truncate text-xs text-fg-muted">Sitter ute: {item.servesLabel}</span>
        <span className="truncate text-[0.7rem] text-fg-muted">Från {item.fromLabel}</span>
      </span>

      <span
        data-suspension-reason=""
        className="shrink-0 rounded-pill bg-surface px-2.5 py-1 font-display text-xs font-semibold text-warning"
      >
        {item.reasonText}
      </span>
    </li>
  );
}
