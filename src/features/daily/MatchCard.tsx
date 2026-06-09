// Matchkort (PRESENTATIONS-komponent, ren): visar en match i den dagliga vyn.
//
// FOKUS (senior-devs lager): den FUNKTIONELLA + tillgängliga strukturen. Tar en
// färdig Match + ett team-uppslag och renderar tid (svensk), steg, lagen, svensk
// TV-kanal och ev. arena. Ingen data-hämtning, ingen logik utöver visnings-
// uppslag (match-display.ts). Design-frontend lägger premium-styling ovanpå en
// stabil semantik + data-attribut (inga inbakade statusfärger, T7-pin).
//
// A11y: kortet är en <article> med ett tillgängligt namn (aria-label) som
// sammanfattar matchen, så en skärmläsare hör "21:00, Mexiko mot Sydafrika,
// grupp A, TV4" utan att navigera varje liten text. Tiden bär ett <time>-element
// med maskinläsbart datetime (UTC-instanten). Arena visas bara om den är
// verifierad (platshållaren döljs, se isVenuePlaceholder).

import type { Match, Team } from '../../domain/types';
import { formatKickoffTime } from './format-datetime';
import { isVenuePlaceholder, stageLabel, teamDisplayName } from './match-display';

export interface MatchCardProps {
  match: Match;
  teamsById: ReadonlyMap<string, Team>;
  /**
   * Markera kortet som dagens framträdande match. Påverkar bara ett data-attribut
   * + ett litet textmärke här; design-frontend hänger sin hero/premium-styling på
   * data-highlight (ingen statusfärg inbakad).
   */
  highlight?: boolean;
}

export function MatchCard({ match, teamsById, highlight = false }: MatchCardProps) {
  const time = formatKickoffTime(match.kickoff);
  const home = teamDisplayName(match.homeTeamId, teamsById);
  const away = teamDisplayName(match.awayTeamId, teamsById);
  const stage = stageLabel(match);
  const showVenue = !isVenuePlaceholder(match.venue);

  // Tillgängligt namn: en mening som sammanfattar kortet (tid, lag, steg, kanal).
  const channelPart = match.tvChannel ? `, ${match.tvChannel}` : '';
  const label = `${time}, ${home} mot ${away}, ${stage}${channelPart}`;

  return (
    <article
      aria-label={label}
      data-match-card=""
      data-highlight={highlight ? '' : undefined}
      data-stage={match.stage}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-[var(--vm-shadow-card)]"
    >
      {/* Rad 1: tid + steg-märke. <time> bär maskinläsbar UTC-instant; den synliga
          texten är svensk tid (formatKickoffTime). */}
      <div className="flex items-center justify-between gap-2">
        <time
          dateTime={match.kickoff}
          className="font-display text-lg font-bold tabular-nums leading-none"
        >
          {time}
        </time>
        <span className="rounded-pill border border-border px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-fg-muted">
          {stage}
        </span>
      </div>

      {/* Rad 2: lagen. "mot" som dekorativ separator (det tillgängliga namnet bär
          redan "mot", så separatorn är aria-hidden för att inte dubbel-läsas). */}
      <div className="flex items-center gap-2 text-base font-semibold">
        <span className="min-w-0 flex-1 truncate text-right">{home}</span>
        <span aria-hidden="true" className="shrink-0 text-xs font-normal text-fg-muted">
          mot
        </span>
        <span className="min-w-0 flex-1 truncate">{away}</span>
      </div>

      {/* Rad 3: metadata (TV-kanal + ev. arena). dl/dt/dd ger semantiska par.
          dt:erna är visuellt dolda (sr-only-mönster via klass) men når skärmläsare.
          Highlight-märket är en liten textetikett (färg-oberoende, T7-pin). */}
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
        {highlight ? (
          <div className="flex items-center gap-1">
            <dt className="sr-only">Utvald</dt>
            <dd className="font-semibold text-accent">Dagens match</dd>
          </div>
        ) : null}
        {match.tvChannel ? (
          <div className="flex items-center gap-1">
            <dt className="font-semibold">TV</dt>
            <dd>{match.tvChannel}</dd>
          </div>
        ) : null}
        {/* Arena visas BARA om den är verifierad. Platshållaren ("Arena ej
            verifierad", #35) visas inte som om den vore data; den döljs här tills
            riktig arena-data finns. */}
        {showVenue ? (
          <div className="flex items-center gap-1">
            <dt className="font-semibold">Arena</dt>
            <dd>{match.venue}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}
