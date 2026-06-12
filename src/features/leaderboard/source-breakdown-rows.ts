// REN härledning av käll-detaljens RADER ur poäng-uppdelningen (T58, #99).
// Inget I/O, ingen React, fristående testbar.
//
// VARFÖR denna fil finns (samma anda som score-explainer-items, T34): UI:t som visar
// "var kommer poängen ifrån?" får ALDRIG hårdkoda käll-ordningen eller plocka fälten
// fritt, så en framtida ändring av ScoreBySource lämnar UI:t i otakt. Genom att
// HÄRLEDA raderna ur bySource HÄR (en sanning för ordning + etikett + värde), och låta
// ett test vakta att radernas summa === totalen, kan detalj-vyn och totalen aldrig
// drifta. UI:t (TipsScoreSummary) renderar bara dessa rader.
//
// ORDNING (följer hur en tippare möter poängen, samma ordning som ScoreGuide:
// matcherna först (det man gör mest), sen special-tipsen grupp -> slutspel, mästaren
// sist (den tyngsta enskilda gissningen). EN ordning, så ytorna känns konsekventa.

import type { ScoreBySource } from './aggregate-scores';

/** En rad i käll-detaljen: vilken källa, etikett i klartext, och poängen den gav. */
export interface SourceBreakdownRow {
  /** Stabil nyckel för React-listan + test-/data-hakar (matchar ScoreBySource-fälten). */
  id: keyof ScoreBySource;
  /** Kort etikett i klartext (svenska), samma vokabulär som "Så funkar poängen". */
  label: string;
  /** Poängen källan gav (ur bySource, aldrig omräknad). */
  points: number;
}

/**
 * Bygg käll-detaljens rader ur poäng-uppdelningen. Varje rad LÄSER sitt värde ur
 * bySource (ingen omräkning), och ordningen + etiketterna bor HÄR (en sanning).
 * Radernas summa === den total bySource kom ifrån (vaktat i testet), så detaljen
 * aldrig kan motsäga summeringen överst.
 *
 * @param bySource  Aktuell användares poäng per källa (ur scoreMemberBreakdown).
 * @returns         Raderna i visnings-ordning (match, grupp, slutspel, VM-vinnare).
 */
export function buildSourceBreakdownRows(bySource: ScoreBySource): SourceBreakdownRow[] {
  return [
    { id: 'match', label: 'Matchtips', points: bySource.match },
    { id: 'group', label: 'Grupptippning', points: bySource.group },
    { id: 'bracket', label: 'Slutspelsträd', points: bySource.bracket },
    { id: 'champion', label: 'VM-vinnare', points: bySource.champion },
  ];
}
