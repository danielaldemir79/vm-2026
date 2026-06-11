// DEADLINE-BUDSKAPET för ett ÖPPET pool-tips (grupp + bracket, T35 #63 AC#3).
//
// FOKUS (senior-devs lager): säg KLART och KORREKT när tippningen låses, så ingen
// blir överraskad (Daniels feedback 5). Ren presentation ovanpå den verifierade
// deadline-modellen: texten kommer ur formatDeadline(deadlineIso), som formaterar
// SAMMA ISO som driver låset (en sanning, ingen hårdkodad tid). Visas bara i ÖPPET
// läge, i låst läge tar låst-etiketten över (kortet säger då "låst", inte "låses").
//
// A11y: en <time> bär den maskinläsbara UTC-instanten (datetime), den synliga texten
// är svensk tid. Hela raden är synlig informationstext (inte status/alert): den ska
// läsas tillsammans med formuläret, inte annonseras som en händelse.
//
// VISUELL DESIGN (design-frontend, T35): STRUKTUREN här hålls ren (hänglås-glyf +
// "Låses <tid>" + relativ närhet), stabil data-hake (data-deadline-notice) +
// data-deadline-iso för finputs/test. Färg/ton lämnas till design-lagret ovanpå,
// här bär texten läsbarhet (fg/fg-muted, inte rå dekor-färg som text, lessons).

import { formatDeadline } from './format-deadline';

export interface DeadlineNoticeProps {
  /** Deadline-ankarets avspark (UTC ISO), SAMMA värde som driver `locked`. */
  deadlineIso: string | null;
  /** Injicerbart "nu" (testbarhet) för den relativa etiketten, default = nuet. */
  now?: Date;
  /**
   * Ledande ord, t.ex. "Tippningen låses" (grupp) / "Låses" (slot). Default "Låses".
   * Hålls kort, hela budskapet blir "<led> <dag> kl <tid> (<relativ>)".
   */
  lead?: string;
}

/**
 * En kompakt, tillgänglig deadline-rad: "Låses fredag 11 juni kl 21:00 · om 3 dagar".
 * Returnerar null när ingen deadline kan härledas (ankar-matchen saknas, oväntat),
 * så anroparen inte renderar en tom rad.
 */
export function DeadlineNotice({
  deadlineIso,
  now = new Date(),
  lead = 'Låses',
}: DeadlineNoticeProps) {
  const msg = formatDeadline(deadlineIso, now);
  if (msg === null || deadlineIso === null) {
    return null;
  }
  return (
    <p
      data-deadline-notice=""
      data-deadline-iso={deadlineIso}
      className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.75rem] leading-snug text-fg-muted"
    >
      {/* Hänglås-glyf (samma signatur som låst-etiketten, men "kommer att låsas"):
          ren dekoration, aria-hidden, texten bär betydelsen. TON (design-frontend,
          T35): glyfen bär samma dämpade fg-muted-ton som raden, INTE warning-amber.
          En vänlig UPPLYSNING ("bra att veta när det låses"), inte en VARNING, ska
          läsas som en lugn rad. Warning-amber drog ögat som ett larm; fg-muted gör
          hela raden till en stillsam informationsrad där den exakta TIDEN (text-fg,
          semibold nedan) är det enda som lyfts. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5 shrink-0 text-fg-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3.25" y="7" width="9.5" height="6.5" rx="1.4" />
        <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" />
      </svg>
      <span>
        {lead}{' '}
        {/* Den maskinläsbara instanten ligger på <time>; den synliga texten är den
            svenska formateringen ur formatDeadline (en sanning, samma ISO som låset). */}
        <time dateTime={deadlineIso} className="font-semibold text-fg">
          {msg.absolute}
        </time>
        {/* relative är ALLTID satt (ärligt kontrakt i DeadlineMessage, copilot R1). */}
        <span className="text-fg-muted">
          {' · '}
          {msg.relative}
        </span>
      </span>
    </p>
  );
}
