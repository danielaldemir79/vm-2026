// Klickbar lag-knapp som ÖPPNAR lag-profilen (återanvänds i matchkort + tabeller).
//
// FOKUS (senior-devs FUNKTIONELLA + tillgängliga lager): en RIKTIG <button> (inte
// en klickbar <span>), så den nås med tangentbord (Tab/Enter/Space), har rätt roll
// för skärmläsare och ett tydligt aria-label ("Visa lagprofil för X"). Den bär bara
// beteendet (öppna profilen via context) + en stabil semantik/data-attribut-seam;
// den VISUELLA finishen (hover-affordans, understruken-på-hover m.m.) lämnas till
// designen via klass-haken + data-attributet.
//
// VARFÖR en knapp och inte en länk: profilen är en modal/overlay i samma vy (ingen
// router, ingen URL-navigering, se decisions.md T10), så semantiskt är detta en
// KNAPP som öppnar en dialog, inte en länk till en ny sida (a11y: rätt roll för rätt
// interaktion). Ett okänt lag (teamId null, t.ex. en ännu oseedare slutspelsslot)
// ska INTE vara klickbart, då finns ingen profil att visa, returnera då bara texten.

import type { ReactNode } from 'react';
import { useTeamProfile } from './team-profile-context';

export interface TeamNameButtonProps {
  /** Lag-id profilen ska öppna. Null = okänt lag (slutspel innan seedning) -> ej klickbar. */
  teamId: string | null;
  /** Visningsnamnet (eller platshållaren för okänt lag). */
  name: string;
  /** Extra klasser från call-site (t.ex. truncate-beteende), slås ihop med bas-klassen. */
  className?: string;
  /** Valfritt eget innehåll i stället för bara namnet (t.ex. namn + landskod-chip). */
  children?: ReactNode;
}

/**
 * En lag-namns-knapp som öppnar profilen. Är teamId null (okänt slutspelslag) blir
 * det en ren <span> i stället (inget att öppna), så vi aldrig erbjuder en knapp som
 * inte gör något (a11y: en disabled-knapp vore förvirrande för ett namn som "Ej klart").
 */
export function TeamNameButton({ teamId, name, className, children }: TeamNameButtonProps) {
  const { openProfile } = useTeamProfile();

  if (teamId === null) {
    return <span className={className}>{children ?? name}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => openProfile(teamId)}
      // aria-label är EXPLICIT så skärmläsaren säger vad knappen gör ("Visa lagprofil
      // för Sverige"), inte bara läser lagnamnet (då vore det otydligt att det är en
      // knapp som öppnar något). Den synliga texten är bara lagnamnet.
      aria-label={`Visa lagprofil för ${name}`}
      data-team-profile-trigger=""
      data-team-id={teamId}
      // Bas-semantik: en in-line knapp som ärver text-stilen (ingen knapp-chrome),
      // så den smälter in i matchkortet/tabellen (tabellernas lugn bevaras).
      // AFFORDANS (design, T10): en SUBTIL prickad underline som bara tänds på
      // hover/fokus signalerar "klickbart" utan att skrika i vila. underline-offset
      // håller strecket luftigt under baslinjen, decoration-color = fg-muted så det
      // är diskret. Vid tangentbords-fokus tar :focus-visible-ringen (index.css)
      // över som primär affordans, men understrykningen tänds även där (samma regel),
      // så mus- och tangentbordsanvändare får samma signal.
      className={`cursor-pointer rounded-sm bg-transparent p-0 text-left text-inherit underline-offset-[3px] decoration-fg-muted/60 decoration-dotted hover:underline focus-visible:underline ${className ?? ''}`}
    >
      {children ?? name}
    </button>
  );
}
