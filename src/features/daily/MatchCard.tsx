// Matchkort (PRESENTATIONS-komponent, ren): visar en match i den dagliga vyn.
//
// FOKUS (senior-devs lager, OFÖRÄNDRAT): den FUNKTIONELLA + tillgängliga
// strukturen. Tar en färdig Match + ett team-uppslag och renderar tid (svensk),
// steg, lagen, svensk TV-kanal och ev. arena. Ingen data-hämtning, ingen logik
// utöver visnings-uppslag (match-display.ts).
//
// VISUELL DESIGN (design-frontend-agentens lager, ovanpå): premium-matchkort.
// Komprimerar informationen visuellt (SPEC §7) i stället för en textig rad:
//   - lag-emblem (TeamFlag) ger varje lag en igenkännbar färg-signatur,
//   - TV-kanalen blir ett kännbart märke (TvBadge) i stället för lös text,
//   - tid + steg sitter i en egen "topp-rad" så kortet skummas snabbt.
// Två visuella varianter ur EN markup (a11y-semantiken är identisk):
//   - 'list' (default): det vanliga kortet i dagslistan.
//   - 'featured' (highlight): hero-behandling i "Dagens match". Framhävningen är
//     FÄRG-OBEROENDE (T7-pin: i ljust tema är accent === success === samma
//     skogsgrön): den bärs av en GULD-ton + en upphöjd yta + en gradient + en
//     "Dagens match"-etikett, inte av en accent/success-färg som krockar. Så den
//     läses i båda teman utan att låsa success-rollen.
//
// A11y: kortet är en <article> med ett tillgängligt namn (aria-label) som
// sammanfattar matchen, så en skärmläsare hör "21:00, Mexiko mot Sydafrika,
// grupp A, TV4" utan att navigera varje liten text. Tiden bär ett <time>-element
// med maskinläsbart datetime (UTC-instanten). Lag-emblemen är dekorativa
// (aria-hidden). Arena visas bara om den är verifierad (platshållaren döljs).

import type { CSSProperties } from 'react';
import type { Match, Team } from '../../domain/types';
import { formatKickoffTime } from './format-datetime';
import {
  formatPenalties,
  formatScore,
  isFinished,
  isVenuePlaceholder,
  stageLabel,
  teamDisplayName,
} from './match-display';
import { TeamFlag } from './TeamFlag';
import { TvBadge } from './TvBadge';
import { TeamNameButton } from '../team-profile';

export interface MatchCardProps {
  match: Match;
  teamsById: ReadonlyMap<string, Team>;
  /**
   * Markera kortet som dagens framträdande match. Styr data-highlight + den
   * FÄRG-OBEROENDE 'featured'-varianten (guld-ton + upphöjning), aldrig en
   * statusfärg (T7-pin).
   */
  highlight?: boolean;
  /**
   * Texten i highlight-CHIPPET (guld-brickan) när highlight är satt. Default
   * "Dagens match" (bakåtkompatibelt). DailyMatchesView skickar ner den DYNAMISKA
   * hero-etiketten här så chip + etikett ALLTID säger samma sak: "Dagens match"
   * när matchen spelas idag, annars matchens dag ("Torsdag 11 juni"). Tidigare
   * sade chippet alltid "Dagens match" medan etiketten ovanför visade datumet, en
   * inkonsekvent UI när turneringen låg dagar bort (#54, C3).
   */
  highlightLabel?: string;
}

/** Landskoden för ett lag (för emblemet), eller null när laget ännu är okänt. */
function teamCode(teamId: string | null, teamsById: ReadonlyMap<string, Team>): string | null {
  if (teamId === null) {
    return null;
  }
  return teamsById.get(teamId)?.code ?? null;
}

/**
 * En sida (hemma/borta): emblem + KLICKBART namn (öppnar lagprofilen, T10).
 * Emblemet är dekoration; namnet är en TeamNameButton som öppnar profilen, eller
 * (för ett ännu okänt slutspelslag, teamId null) en ren text utan knapp.
 */
function TeamSide({
  teamId,
  name,
  code,
  align,
}: {
  teamId: string | null;
  name: string;
  code: string | null;
  align: 'start' | 'end';
}) {
  const flag =
    code !== null ? (
      <TeamFlag code={code} />
    ) : (
      // Okänt slutspelslag: en neutral platshållar-disc, ingen gissad flagga.
      <span
        aria-hidden="true"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-pill border border-border font-display text-xs font-bold text-fg-muted"
      >
        ?
      </span>
    );
  // På hemma-sidan står namnet höger-ställt mot mitten (emblem ytterst), på
  // borta-sidan vänster-ställt, så de två lagen speglar varandra runt "mot".
  return (
    <span
      className={`flex min-w-0 flex-1 items-center gap-2 ${
        align === 'end' ? 'flex-row-reverse text-right' : 'text-left'
      }`}
    >
      {flag}
      {/* Lagnamnet öppnar profilen (T10). TeamNameButton blir en ren <span> när
          teamId är null (okänt slutspelslag), så vi aldrig erbjuder en knapp utan
          profil. truncate flyttas till knappen så namnet kapas inom kort-bredden. */}
      <TeamNameButton teamId={teamId} name={name} className="min-w-0 truncate" />
    </span>
  );
}

export function MatchCard({
  match,
  teamsById,
  highlight = false,
  highlightLabel = 'Dagens match',
}: MatchCardProps) {
  const time = formatKickoffTime(match.kickoff);
  const home = teamDisplayName(match.homeTeamId, teamsById);
  const away = teamDisplayName(match.awayTeamId, teamsById);
  const homeCode = teamCode(match.homeTeamId, teamsById);
  const awayCode = teamCode(match.awayTeamId, teamsById);
  const stage = stageLabel(match);
  const showVenue = !isVenuePlaceholder(match.venue);

  // Resultat för en färdigspelad match (T57, #98): visas i kortet så man kan
  // bläddra bakåt i dag-listan och se alla resultat utan att öppna varje match.
  // Datan är den VÄVDA matchdatan (officiella resultat driver storen sedan T48),
  // så kortet visar facit, inte den statiska planen. isFinished narrowar typen så
  // match.result är icke-null (diskriminerat unions-kontrakt).
  const finished = isFinished(match);
  const score = finished ? formatScore(match.result) : null;
  const penalties = finished ? formatPenalties(match.result) : null;

  // Tillgängligt namn: en mening som sammanfattar kortet. För en spelad match
  // läses "Mexiko 2-1 Sydafrika" (resultatet i mitten); annars "Mexiko mot
  // Sydafrika" (ospelad). Straffar läggs till efteråt så slutspel inte är tvetydigt.
  const channelPart = match.tvChannel ? `, ${match.tvChannel}` : '';
  const resultPart = penalties ? ` ${penalties}` : '';
  const matchupPart = finished ? `${home} ${score} ${away}${resultPart}` : `${home} mot ${away}`;
  const label = `${time}, ${matchupPart}, ${stage}${channelPart}`;

  // FÄRG-OBEROENDE featured-stil (T7-pin): guld-ton i kant + upphöjd yta + en
  // mjuk gradient, allt via color-mix mot tokens (följer temat, ingen rå hex).
  const featuredStyle: CSSProperties | undefined = highlight
    ? {
        borderColor: 'color-mix(in srgb, var(--vm-gold) 45%, var(--color-border))',
        backgroundImage:
          'linear-gradient(135deg, color-mix(in srgb, var(--vm-gold) 10%, var(--color-surface-raised)), var(--color-surface-raised))',
      }
    : undefined;

  return (
    <article
      aria-label={label}
      data-match-card=""
      data-highlight={highlight ? '' : undefined}
      data-stage={match.stage}
      className={`flex h-full flex-col gap-3 rounded-card border p-4 transition-shadow ${
        highlight
          ? 'border-border bg-surface-raised shadow-[var(--vm-shadow-raised)]'
          : 'border-border bg-surface shadow-[var(--vm-shadow-card)] hover:shadow-[var(--vm-shadow-raised)]'
      }`}
      style={featuredStyle}
    >
      {/* Topp-rad: tid + steg-märke. <time> bär maskinläsbar UTC-instant; den
          synliga texten är svensk tid (formatKickoffTime). Tiden är det första
          ögat söker, så den hålls stor och tydlig. */}
      <div className="flex items-center justify-between gap-2">
        <time
          dateTime={match.kickoff}
          className="font-display text-xl font-bold tabular-nums leading-none"
        >
          {time}
        </time>
        <span
          className="rounded-pill border border-border px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-fg-muted"
          style={
            // Featured: en GULD-KANT signalerar steg-märket som del av hero-kortet.
            // Texten hålls på fg-muted (AA i båda teman) i stället för en guld-text
            // som inte når AA på den ljusa ytan (T7-pin: form/kant bär framhävningen,
            // inte en svag färg-på-färg-kontrast).
            highlight
              ? { borderColor: 'color-mix(in srgb, var(--vm-gold) 55%, var(--color-border))' }
              : undefined
          }
        >
          {stage}
        </span>
      </div>

      {/* Mitt-rad: lagen med emblem, speglade runt mitten. Mitten bär antingen
          "mot" (ospelad match) eller RESULTATET (spelad match, T57). Det
          tillgängliga namnet på <article> bär redan hela sammanfattningen, så
          mitten är aria-hidden för att inte dubbel-läsas av en skärmläsare.
          Resultatet är FÄRG-OBEROENDE (T7-pin: ingen accent/success-färg, som i
          ljust tema är samma gröna): det bärs av tyngd + tabular-nums i fg, så det
          läses i båda teman utan att låsa en statusfärg. */}
      <div className="flex items-center gap-2 text-base font-semibold">
        <TeamSide teamId={match.homeTeamId} name={home} code={homeCode} align="end" />
        {score !== null ? (
          <span
            aria-hidden="true"
            data-match-score=""
            // På ett FÄRDIGSPELAT kort är resultatet hjälten: man vill läsa facit
            // DIREKT, inte kickoff-tiden (som är historisk när matchen är spelad).
            // Därför bär resultatet samma tyngd som tiden (text-xl, font-display,
            // bold, tabular-nums) i stället för en snäpp mindre (text-lg), så det
            // blir kortets ankarpunkt jämte tiden i stället för att klämmas in i
            // mitten av lag-raden. FÄRG-OBEROENDE (T7-pin): tyngd + storlek bär
            // signalen, ingen accent/success-färg som i ljust tema är samma gröna.
            className="shrink-0 font-display text-xl font-bold tabular-nums leading-none"
          >
            {score}
          </span>
        ) : (
          <span aria-hidden="true" className="shrink-0 text-xs font-normal text-fg-muted">
            mot
          </span>
        )}
        <TeamSide teamId={match.awayTeamId} name={away} code={awayCode} align="start" />
      </div>

      {/* Straffrad: bara i slutspel som avgjordes på straffar. Separat rad så
          ordinarie-resultatet och straffarna aldrig blandas ihop till en tvetydig
          siffra (aria-hidden: ligger redan i kortets a11y-namn). */}
      {penalties !== null ? (
        <p aria-hidden="true" className="-mt-1 text-center text-xs text-fg-muted">
          {penalties}
        </p>
      ) : null}

      {/* Botten-rad: metadata (TV-kanal-märke + ev. arena + featured-etikett).
          dl/dt/dd ger semantiska par. De flesta dt:er är visuellt dolda (sr-only)
          eftersom värdet bär sin egen identitet (TV-badgen, det färg-oberoende
          highlight-chippet), men Arena-dt:n är SYNLIG (font-semibold): ett bart
          arena-/stadsnamn behöver en synlig "Arena"-etikett för att inte bli
          tvetydigt. Alla dt:er når ändå skärmläsare oavsett. */}
      <dl className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-fg-muted">
        {highlight ? (
          <div className="flex min-w-0 items-center gap-1">
            <dt className="sr-only">Utvald</dt>
            {/* highlight-CHIPPET: en SOLID guld-bricka med mörk ink-text. Solid
                fyllning + mörk text ger garanterad AA i BÅDA teman (guld är ljus/
                mellanljus i båda, så near-black text klarar >= 4.5:1), till skillnad
                från guld-text-på-tint som föll under AA på den ljusa ytan. Guld =
                den färg-oberoende hero-signalen (T7-pin: inte accent/success).
                Texten är highlightLabel (default "Dagens match"); den följer hero-
                etiketten så chip + etikett aldrig säger olika saker (#54, C3). En
                längre datum-etikett ("Torsdag 11 juni") kapas med truncate +
                min-w-0 så den aldrig spränger kortet på 280px (samma bricka, samma
                AA-ton, bara annan text). title ger full text vid kapning. */}
            <dd
              title={highlightLabel}
              className="min-w-0 truncate rounded-pill px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide"
              style={{ backgroundColor: 'var(--vm-gold)', color: '#1c1403' }}
            >
              {highlightLabel}
            </dd>
          </div>
        ) : null}
        {match.tvChannel ? (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">TV</dt>
            <dd>
              <TvBadge channel={match.tvChannel} />
            </dd>
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
