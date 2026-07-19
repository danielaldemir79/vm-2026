// STARTSIDANS VÄRLDSMÄSTAR-NOTIS (Daniels önskemål vid VM-slutet): en gyllene
// firande-banner på Idag när finalen är avgjord och en världsmästare är korad,
// "Grattis <lag> till VM-segern". Tar vid där SlutspelReminder slutar: den
// påminner om att tippa FRAM till finalen, denna firar mästaren EFTER finalen
// (SlutspelReminder slocknar när ingen kommande runda finns kvar).
//
// DATADRIVEN, GISSAR ALDRIG: mästaren härleds ur det redan härledda trädet
// (useBracketData), exakt som slutspelsträdets egen "Världsmästare"-ruta , finalens
// vinnar-slot, och BARA när finalen faktiskt är avgjord (winnerSlotId satt). Ingen
// hårdkodad lag-sträng, så notisen visar rätt mästare oavsett utfall och försvinner
// automatiskt om finalen inte är spelad.
//
// GATING (samma live-läge-kontrakt som SlutspelReminder): visas bara i live-läge
// (rooms.enabled) när datan är redo. I fixtures-/lokalt läge renderas inget, så
// App-/daily-testerna är opåverkade.
//
// GULD (design): guld-token --vm-gold + AA-mätt mörk ink på fylld guld, samma
// champion-estetik som trädets vm-bracket-champion-ruta (champion-banner.css).

import { useMemo } from 'react';
import type { Team } from '../../domain/types';
import { useRoomsStore } from '../rooms';
import { useBracketData } from '../bracket/use-bracket-data';
import { championTeamIdFromBracket } from './champion-from-bracket';
import { teamDisplayName } from './match-display';
import { TeamFlag } from './TeamFlag';
import './champion-banner.css';

/** teamId -> Team-uppslag (en gång per lag-lista), för namn + landskod. */
function indexTeams(teams: readonly Team[]): Map<string, Team> {
  return new Map(teams.map((t) => [t.id, t]));
}

export function ChampionBanner() {
  const rooms = useRoomsStore();
  const { status, bracket, teams } = useBracketData();

  const teamsById = useMemo(() => indexTeams(teams), [teams]);

  // Mästaren = finalens vinnar-slot (ren helper, samma härledning som trädets
  // "Världsmästare"-ruta), BARA när finalen är avgjord. Gissar aldrig i förväg.
  const championTeamId = useMemo(() => championTeamIdFromBracket(bracket), [bracket]);

  // Visa bara i live-läge, när datan är redo, och när en mästare faktiskt är korad.
  if (!rooms.enabled || status !== 'ready' || championTeamId === null) {
    return null;
  }

  const name = teamDisplayName(championTeamId, teamsById);
  const code = teamsById.get(championTeamId)?.code ?? null;

  return (
    <aside
      data-champion-banner=""
      role="note"
      aria-label={`Världsmästare: ${name}. Grattis till VM-segern.`}
      className="vm-champion-banner flex flex-wrap items-center gap-3 rounded-card border px-4 py-3"
    >
      {/* Pokal-glyf i en gyllene disc (form + guld-signal). Ren dekor (aria-hidden):
          budskapet bärs av texten + aria-label. Samma pokal som SlutspelReminder. */}
      <span
        aria-hidden="true"
        className="vm-champion-banner-trophy inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-pill"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      </span>

      <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
        <span className="vm-champion-banner-kicker w-fit rounded-pill px-2 py-0.5 font-display text-[0.625rem] font-bold uppercase tracking-[0.18em]">
          Världsmästare
        </span>
        <p className="vm-champion-banner-line font-display text-base font-semibold sm:text-lg">
          Grattis {name} till VM-segern!
        </p>
      </div>

      {/* Mästarens flagga (lg) till höger som en firande avslutning på raden.
          Bara när landskoden finns (annars ingen platshållar-flagga). */}
      {code ? <TeamFlag code={code} size="lg" /> : null}
    </aside>
  );
}
