// STARTSIDANS TOPPLISTE-VINNAR-NOTIS (Daniels önskemål vid VM-slutet): en varm,
// gyllene hyllning till den som vann hela VM-tipset (globala topplistans etta), med
// namn + poäng, "Grattis <namn>". Syskon till ChampionBanner: den firar fotbolls-
// mästaren (Spanien), denna firar TIPS-mästaren (personen som tippade bäst).
//
// DATADRIVEN, GISSAR ALDRIG: vinnaren läses ur den globala topplistan (rank 1), och
// visas BARA när VM är avgjort (en fotbolls-mästare är korad = alla resultat inne),
// annars vore "ettan" bara en mellanställning, inte en vinnare. Namn + poäng kommer
// ur topplistan, ingen hårdkodning.
//
// LIVE-LÄGE ONLY: i demo/fixtures är topplistan bot-fylld (ingen riktig vinnare att
// hylla) , providern mountas därför bara i live, så ingen extra edge-hämtning sker i
// demo/test och App-/daily-testerna är opåverkade.
//
// GULD (design): samma champion-estetik som ChampionBanner (--vm-gold + AA-mätt mörk
// ink), men krona-motiv (person-mästare, inte pokal) i winner-banner.css.

import { useMemo } from 'react';
import { useRoomsStore } from '../rooms';
import { useBracketData } from '../bracket/use-bracket-data';
import { championTeamIdFromBracket } from './champion-from-bracket';
import { TotalLeaderboardProvider, useTotalLeaderboardStore } from '../total-leaderboard';
import { pickLeaderboardWinner } from './pick-leaderboard-winner';
import './winner-banner.css';

function WinnerBannerInner() {
  const { status, total } = useTotalLeaderboardStore();
  const { bracket } = useBracketData();

  // Kröna tips-vinnaren BARA när VM är avgjort (fotbolls-mästare korad = alla
  // slutspelsresultat inne). Annars är topplistans etta en mellanställning.
  const championDecided = useMemo(() => championTeamIdFromBracket(bracket) !== null, [bracket]);
  const winner = pickLeaderboardWinner(total);

  if (status !== 'ready' || !championDecided || winner === null) {
    return null;
  }

  return (
    <aside
      data-winner-banner=""
      role="note"
      aria-label={`Vinnare av VM-tipset: ${winner.displayName}. Grattis till segern.`}
      className="vm-winner-banner flex flex-wrap items-center gap-3 rounded-card border px-4 py-3"
    >
      {/* Krona i en gyllene disc (person-mästare). Ren dekor (aria-hidden). */}
      <span
        aria-hidden="true"
        className="vm-winner-banner-crown inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-pill"
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
          <path d="M3 8l3.5 3L12 5l5.5 6L21 8l-1.5 10.5a1 1 0 0 1-1 .5H5.5a1 1 0 0 1-1-.5L3 8Z" />
          <path d="M4.5 19h15" />
        </svg>
      </span>

      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
        <span className="vm-winner-banner-kicker w-fit rounded-pill px-2 py-0.5 font-display text-[0.625rem] font-bold uppercase tracking-[0.18em]">
          Vinnare av VM-tipset
        </span>
        <p className="vm-winner-banner-headline font-display text-base font-semibold sm:text-lg">
          Grattis {winner.displayName}!
        </p>
        <p className="vm-winner-banner-body text-sm leading-snug">
          Du tippade dig hela vägen till toppen och vann med {winner.points} poäng, skarpast av
          alla. En lysande bedrift och en helt förtjänad seger. Hatten av, mästare!
        </p>
      </div>
    </aside>
  );
}

export function WinnerBanner() {
  const rooms = useRoomsStore();
  // Live-läge only (se filhuvudet): mounta inte providern i demo/test.
  if (!rooms.enabled) {
    return null;
  }
  return (
    <TotalLeaderboardProvider>
      <WinnerBannerInner />
    </TotalLeaderboardProvider>
  );
}
