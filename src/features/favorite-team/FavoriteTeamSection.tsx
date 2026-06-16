// FAVORITLAGS-SEKTIONEN för Mer-fliken (U2, #175).
//
// VARFÖR: favoritlags-väljaren är en INSTÄLLNING ("pinna ett lag så lyfts dess
// matcher"), inte dagens-innehåll. Den låg tidigare i Idag-flikens header och
// bidrog till att Idag blev en vägg (U2). Här bor den i Mer , den lugna samlings-
// platsen för inställningar , som en egen, tydligt rubricerad sektion. Den DISKRETA
// lyftningen av favoritlagets matcher i Idag-listan/hero:n är oförändrad: den läser
// favoritlags-storen direkt, inte väljaren, så ett valt lag lyfts som förr.
//
// Komponenten läser lag-listan ur den delade results-storen (samma källa som Idag-
// vyn), så den behöver inget eget data-flöde. Renderar inget förrän lagen laddats
// (ingen tom väljare). `surface` injiceras av call-sitet (samma Panel-form som
// resten av Mer), så sektionen hör visuellt till flik-familjen (DRY-yta).

import type { ReactNode } from 'react';
import { useResultsStore } from '../results';
import { FavoriteTeamPicker } from './FavoriteTeamPicker';

export interface FavoriteTeamSectionProps {
  /** Yt-formen från call-sitet (App ger Panel/Surface), så sektionen matchar Mer. */
  surface: (children: ReactNode) => ReactNode;
}

export function FavoriteTeamSection({ surface }: FavoriteTeamSectionProps) {
  const { teams } = useResultsStore();

  // Inga lag laddade än: rendera inget (ingen tom väljare-yta i Mer).
  if (teams.length === 0) {
    return null;
  }

  return surface(
    <section data-favorite-team-section="" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Inställning
        </p>
        <h2 className="font-display text-xl font-semibold sm:text-2xl">Favoritlag</h2>
      </header>
      <FavoriteTeamPicker teams={teams} />
    </section>
  );
}
