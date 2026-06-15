// "LIVE NU"-FÄLTET (Bit 3c): topp-fältets PRIMÄRA block när minst en match pågår.
//
// DANIELS LIVE-FEEDBACK: topp-fältet blandade ihop en PÅGÅENDE match (visad som ett
// statiskt "dagens match"-kort) med NÄSTA avspark (nedräkningen). Det här blocket LEDER
// sidan med det som händer NU , en prominent, pulsande live-rubrik + den pågående
// matchens livekort i fokus , så "vad händer nu" och "vad kommer sen" (nedräkningen,
// ett separat sekundärt block i vyn) aldrig kan förväxlas.
//
// FLERA LIVE SAMTIDIGT: den mest relevanta matchen (live före paus, sedan längst kommen)
// visas överst som ett FULLT livekort i fokus. Övriga pågående matcher når man via
// kompakta, KLICKBARA live-rader under, som lyfter sin match till fokus-platsen. Så en
// match som pågår visas ALDRIG som ett statiskt kort, och alla pågående matcher är ett
// klick bort utan att fältet blir rörigt.
//
// ÅTERBRUK (bygg inte om): själva live-panelen ÄR LiveMatchCard (Bit 3b) , samma klocka,
// puls, ställning, målskyttar, "Visa mer". Det här lagret är bara FÖRPACKNINGEN: en
// fokus-ram + rubrik + match-väljaren. Urvalet/ordningen kommer rent ur selectLiveFeed.
//
// A11Y: blocket är en region med ett tillgängligt namn ("Live nu") + en aria-live
// (polite) statusrad som annonserar hur många matcher som pågår, så en skärmläsare hör
// läget utan att gräva. Match-väljarna är riktiga <button>:ar (tangentbord/fokus), den
// aktiva markerad med aria-pressed. Den pulsande rubrik-punkten är aria-hidden (ordet
// "Live nu" bär betydelsen) och stannar vid reducerad rörelse (live-now.css).

import { useEffect, useState } from 'react';
import { resolveApiTeamId } from '../../data/livescore';
import { LiveMatchCard } from './LiveMatchCard';
import { stageLabel } from './match-display';
import type { LiveFeedEntry } from './live-feed';
import './live-now.css';

export interface LiveNowSectionProps {
  /** De pågående matcherna, redan ordnade (mest relevant först), från selectLiveFeed. */
  entries: readonly LiveFeedEntry[];
  /** Nuet (epoch-ms), vidare till livekortets klocka (test-injicerbart). */
  now?: number;
}

/** API-Football-id för en matchs hemmalag (för event/kolumn-paringen i livekortet). */
function homeApiId(entry: LiveFeedEntry): number | null {
  return entry.match.homeTeamId !== null ? resolveApiTeamId(entry.match.homeTeamId) : null;
}

export function LiveNowSection({ entries, now }: LiveNowSectionProps) {
  // Vilken match som står i fokus-platsen. Match-id (inte index) är stabilt om listan
  // ändrar längd (en match tar slut / en ny startar via realtid), så fokus inte hoppar
  // till fel match. Default = den mest relevanta (entries[0], redan sorterad).
  const [focusedId, setFocusedId] = useState<string>(() => entries[0]?.match.id ?? '');

  // Faller den fokuserade matchen ur listan (avslutas), eller pekar fokus på en match
  // som inte finns (första render-race), återställ till den mest relevanta. En effekt
  // (inte i render) så vi inte sätter state under render; listan är referens-stabil per
  // datahämtning, så detta kör bara vid ett FAKTISKT skifte (ny/borttagen live-match).
  useEffect(() => {
    if (entries.length === 0) {
      return;
    }
    if (!entries.some((e) => e.match.id === focusedId)) {
      setFocusedId(entries[0].match.id);
    }
  }, [entries, focusedId]);

  if (entries.length === 0) {
    return null; // inget pågår -> blocket renderas inte (vyn behåller vanligt topp-fält)
  }

  // Den match som ska visas i fokus: den valda om den finns kvar, annars den mest
  // relevanta (samma fallback som effekten, så fokus-kortet är rätt redan denna render).
  const focused = entries.find((e) => e.match.id === focusedId) ?? entries[0];
  const others = entries.filter((e) => e.match.id !== focused.match.id);

  const liveCount = entries.length;
  const countLabel =
    liveCount === 1 ? 'En match pågår just nu' : `${liveCount} matcher pågår just nu`;

  return (
    <section
      data-live-now=""
      aria-label="Live nu"
      className="vm-live-now relative isolate flex flex-col gap-4 overflow-hidden rounded-card border p-5 shadow-[var(--vm-shadow-raised)] sm:p-6"
    >
      {/* Rubrik-rad: en pulsande LIVE-markör + "Live nu" + en diskret status-räknare.
          Markören pulsar (live-now.css), stannar vid reducerad rörelse; ordet bär
          betydelsen (färg-oberoende). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          data-live-now-badge=""
          className="vm-live-now-badge inline-flex items-center gap-2 rounded-pill px-3 py-1 font-display text-xs font-bold uppercase tracking-[0.18em]"
        >
          <span aria-hidden="true" className="vm-live-now-dot inline-block h-2 w-2 rounded-pill" />
          Live nu
        </span>
        {/* Status-räknaren bär full fg (inte fg-muted): den sitter i samma övre hörn som
            arena-glow:en är som starkast, och full fg håller AA med marginal även där
            (uppmätt >= 8:1 över glow-patchen i båda teman), medan fg-muted hade legat
            nära tröskeln. font-medium + text-sm gör den ändå tydligt SEKUNDÄR mot den
            fyllda "Live nu"-brickan, utan att tumma på läsbarheten. */}
        <p aria-live="polite" className="text-sm font-medium text-fg" data-live-now-count="">
          {countLabel}
        </p>
      </div>

      {/* FOKUS: den mest relevanta (eller valda) matchen som ett fullt livekort.
          Etiketten ovanför säger steget, så man vet vilken match man tittar på även
          innan namnen lästs. key på match-id så React monterar ett FÄRSKT kort vid
          byte (klockans interna state följer rätt match, inget gammalt tick-läge). */}
      <div className="flex flex-col gap-1.5">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          {stageLabel(focused.match)}
        </p>
        <LiveMatchCard
          key={focused.match.id}
          data={focused.live}
          homeName={focused.homeName}
          awayName={focused.awayName}
          homeApiId={homeApiId(focused)}
          homeCode={focused.homeCode}
          awayCode={focused.awayCode}
          now={now}
        />
      </div>

      {/* FLER PÅGÅENDE: kompakta, klickbara rader som lyfter sin match till fokus.
          Bara när det FINNS fler än en (annars ingen tom yta). Riktiga knappar med
          aria-pressed, så tangentbord + skärmläsare når dem. */}
      {others.length > 0 ? (
        <div className="flex flex-col gap-2" data-live-now-others="">
          <p className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-fg-muted">
            Fler matcher live
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {others.map((entry) => (
              <li key={entry.match.id}>
                <LiveRowButton
                  entry={entry}
                  active={false}
                  onSelect={() => setFocusedId(entry.match.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/**
 * En kompakt live-rad: ställning + namn + status-cue, en knapp som lyfter matchen till
 * fokus-platsen. Visar bara KÄRNAN (ställning + lag + minut/paus), de fulla detaljerna
 * finns i fokus-kortet när raden valts , så listan är skummbar utan att bli rörig.
 */
function LiveRowButton({
  entry,
  active,
  onSelect,
}: {
  entry: LiveFeedEntry;
  active: boolean;
  onSelect: () => void;
}) {
  const { live, homeName, awayName, match } = entry;
  const paused = live.status === 'paused';
  // Kort status-cue, färg-oberoende (texten bär betydelsen): "Paus" i halvtidsvila,
  // annars "Live". Den exakta tickande minuten bor i fokus-kortets klocka; här räcker
  // läget, så raden är stabil och inte tickar i sidled.
  const stateWord = paused ? 'Paus' : 'Live';
  const homeGoals = live.homeGoals ?? 0;
  const awayGoals = live.awayGoals ?? 0;
  const label = `Visa ${homeName} ${homeGoals}-${awayGoals} ${awayName} i fokus, ${stateWord}`;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={label}
      data-live-now-row=""
      data-live-row-status={live.status}
      className="vm-live-now-row flex w-full items-center gap-3 rounded-card border px-3 py-2.5 text-left transition-colors"
    >
      <span
        data-live-row-badge={paused ? 'paused' : 'live'}
        className="vm-live-now-row-badge inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.1em]"
      >
        {!paused ? (
          <span
            aria-hidden="true"
            className="vm-live-now-dot inline-block h-1.5 w-1.5 rounded-pill"
          />
        ) : null}
        {stateWord}
      </span>
      <span className="min-w-0 flex-1 truncate text-right font-display text-sm font-semibold">
        {homeName}
      </span>
      <span className="shrink-0 font-display text-base font-bold tabular-nums leading-none">
        {homeGoals}
        <span className="px-1 text-fg-muted">-</span>
        {awayGoals}
      </span>
      <span className="min-w-0 flex-1 truncate text-left font-display text-sm font-semibold">
        {awayName}
      </span>
      <span
        aria-hidden="true"
        className="shrink-0 text-[0.625rem] font-semibold uppercase tracking-wide text-fg-muted"
      >
        {stageLabel(match)}
      </span>
    </button>
  );
}
