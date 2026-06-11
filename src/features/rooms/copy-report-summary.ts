// Ärlig svensk sammanfattning av en kopierings-rapport (T52, #91): gör CopyReport:ens
// siffror till en begriplig sammanfattning (en inlednings-mening, plus en extra mening
// när hoppade/felade kategorier förekom): "X tips kopierade, Y hoppades över (låsta),
// Z hoppades över (redan tippade), W kunde inte kopieras". Ren funktion, ingen React,
// fristående testbar, så UI:t (CopyTipsControl) blir en tunn konsument.
//
// SANNINGS-KRAV (T52-direktivet): beskedet MÅSTE spegla det faktiska utfallet , vi
// hittar aldrig på "klart" om inget kopierades, och vi döljer aldrig låsta/felade
// items. Texten härleds DIREKT ur rapportens totaler, så den kan aldrig drifta från
// vad som faktiskt hände (samma anda som konstant-härledd UI-text + mutations-vakt).
//
// SINGULAR/PLURAL böjs ("1 tips" vs "3 tips" , "tips" är samma i sing/plur på svenska,
// men verbet/efterledet böjs där det märks), så meningen läser rent.

import type { CopyReport } from '../../data/predictions';

/** Böj "kopierat/kopierade" efter antal (1 -> singular). */
function copiedVerb(n: number): string {
  return n === 1 ? 'kopierat' : 'kopierade';
}

/**
 * Bygg den ärliga sammanfattningen av en kopiering FRÅN `sourceName`.
 *
 * Inleder med vad som FAKTISKT kopierades (eller att inget gjorde det), och lägger
 * sedan till de hoppade/felade kategorierna BARA när de förekom (>0), så meningen är
 * kort när allt gick rent och fullständig när något hoppades.
 *
 * @param report      kopierings-rapporten (totaler per utfall).
 * @param sourceName  käll-rummets namn (för "... från <rum>").
 * @returns           en svensk mening som speglar utfallet exakt.
 */
export function summarizeCopyReport(report: CopyReport, sourceName: string): string {
  const { copied, skippedLocked, skippedExisting, failed } = report.total;
  const totalItems = copied + skippedLocked + skippedExisting + failed;

  // Inget fanns att kopiera alls (källan hade inga tips i någon kategori).
  if (totalItems === 0) {
    return `Du hade inga tips att kopiera från ${sourceName}.`;
  }

  // Huvudsatsen: vad som kopierades (eller att inget gick att kopiera den här gången).
  const lead =
    copied > 0
      ? `${copied} tips ${copiedVerb(copied)} från ${sourceName}.`
      : `Inga tips kopierades från ${sourceName} den här gången.`;

  // Tilläggen: bara de utfall som faktiskt förekom, i en fast, läsbar ordning.
  const extras: string[] = [];
  if (skippedExisting > 0) {
    extras.push(`${skippedExisting} hoppades över (redan tippade här)`);
  }
  if (skippedLocked > 0) {
    extras.push(`${skippedLocked} hoppades över (låsta)`);
  }
  if (failed > 0) {
    extras.push(`${failed} kunde inte kopieras`);
  }

  if (extras.length === 0) {
    return lead;
  }
  return `${lead} ${extras.join(', ')}.`;
}
