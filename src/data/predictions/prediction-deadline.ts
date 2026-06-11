// EN DELAD SANNING för pool-tipsens FÖRLÄNGDA deadline (T53, #95): den fasta
// söndagstiden + GREATEST-regeln som gäller GRUPPVINNAR-tips och CHAMPION-tipset.
// Ingen React, inget I/O, fristående testbar. Speglar RLS-helpers EXAKT (klient + DB
// är en sanning), se supabase/migrations/...t53_extended_deadline_group_and_champion.sql.
//
// DANIELS BESLUT 2026-06-11 (källa, gissas inte): de som inte hann tippa före premiären
// får t.o.m. SÖNDAG 2026-06-14 23:59 svensk tid på sig att tippa GRUPPVINNARE/TVÅA och
// VM-VINNARE (champion). Match-tips + bracket-SLOT-tips (M73..M104) behåller sina EGNA
// avsparks-lås (rörs INTE). Issue #95, decisions.md T53.
//
// FAST TIDPUNKT: 2026-06-14 23:59 svensk sommartid (CEST, UTC+2) = 2026-06-14T21:59:00Z.
// Sverige är på sommartid i juni, så 23:59 lokal = 21:59 UTC. Denna konstant är den
// ENDA platsen tiden bor på klienten (ingen hårdkodad text-dubblett av den, lessons).
//
// KRITISK DESIGN-REGEL , FÖRLÄNG, FÖRKORTA ALDRIG (GREATEST): den nya deadlinen är
// GREATEST(ursprungligt kickoff-ankare, fasta tiden). Grupperna G..L spelar sin FÖRSTA
// match EFTER 14 juni (15-17 juni), så att tvinga dem till fasta tiden skulle FÖRKORTA
// deras fönster och låsa ute folk. GREATEST ger A..F den förlängda söndagstiden OCH
// låter G..L behålla sitt SENARE egna ankare. Champion-ankaret g-A-1 (11 juni) ligger
// FÖRE fasta tiden, så champion förlängs till söndagen.

/**
 * Pool-tipsens förlängda deadline (UTC ISO): SÖNDAG 2026-06-14 23:59 svensk sommartid.
 * EN sanning, mirror av DB:ns public.pool_extended_deadline() (samma instant).
 * Daniels beslut #95.
 */
export const POOL_EXTENDED_DEADLINE_ISO = '2026-06-14T21:59:00.000Z';

const POOL_EXTENDED_DEADLINE_MS = new Date(POOL_EXTENDED_DEADLINE_ISO).getTime();

/**
 * Tillämpa GREATEST(ankare, fasta tiden) på ett deadline-ankare som OMFATTAS av
 * förlängningen (grupp-tips eller champion). FÖRLÄNGER aldrig bakåt: ett senare ankare
 * (sen grupp G..L) behålls oförändrat. Fail-safe bevaras: ett null-ankare (saknad
 * ankar-match, oväntat) förblir null (vi gissar aldrig fram en deadline ur tomma luften;
 * samma riktning som RLS:ens NULL-fail-safe och vyernas/copy-lockets locked-vid-saknat).
 *
 * @param anchorIso  ankar-matchens avspark (UTC ISO), eller null om matchen saknas.
 * @returns          GREATEST(anchorIso, fasta tiden) som ISO, eller null om anchorIso null.
 */
export function applyExtendedDeadline(anchorIso: string | null): string | null {
  if (anchorIso === null) {
    return null;
  }
  // GREATEST: behåll det SENARE av de två (förkorta aldrig en sen grupps fönster).
  return new Date(anchorIso).getTime() >= POOL_EXTENDED_DEADLINE_MS
    ? anchorIso
    : POOL_EXTENDED_DEADLINE_ISO;
}
