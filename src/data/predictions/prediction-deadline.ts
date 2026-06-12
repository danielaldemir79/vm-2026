// EN DELAD SANNING för pool-tipsens FÖRLÄNGDA deadline (T53 #95, flyttad i T67 #123): den
// fasta söndagstiden + GREATEST-regeln som gäller GRUPPVINNAR-tips och CHAMPION-tipset.
// Ingen React, inget I/O, fristående testbar. Speglar RLS-helpers EXAKT (klient + DB
// är en sanning), se supabase/migrations/...t67_extended_deadline_to_21_june.sql.
//
// DANIELS BESLUT 2026-06-12 (källa, gissas inte): den förlängda deadlinen flyttas från
// 14/6 till SÖNDAG 21/6 , "vald datum nu är för nära och kommer stressa alla som vill
// hoppa på i helgen. ta det till söndagen veckan efter." De som inte hann tippa före
// premiären får alltså t.o.m. SÖNDAG 2026-06-21 23:59 svensk tid på sig att tippa
// GRUPPVINNARE/TVÅA och VM-VINNARE (champion). Match-tips + bracket-SLOT-tips
// (M73..M104) behåller sina EGNA avsparks-lås (rörs INTE). Issue #123, decisions.md T67.
//
// FAST TIDPUNKT: 2026-06-21 23:59 svensk sommartid (CEST, UTC+2) = 2026-06-21T21:59:00Z.
// Sverige är på sommartid i juni, så 23:59 lokal = 21:59 UTC. Denna konstant är den
// ENDA platsen tiden bor på klienten (ingen hårdkodad text-dubblett av den, lessons).
//
// KRITISK DESIGN-REGEL , FÖRLÄNG, FÖRKORTA ALDRIG (GREATEST): den nya deadlinen är
// GREATEST(ursprungligt kickoff-ankare, fasta tiden). KONSEKVENS av 21/6-tiden
// (källverifierat live mot match_kickoffs, T67): ALLA 12 gruppers FÖRSTA match
// (g-A-1..g-L-1) ligger 11-17 juni, alltså FÖRE 21/6, så GREATEST ger nu ALLA grupper
// + champion samma 21/6-tid (med 14/6-tiden behöll G..L sitt senare 15-17/6-ankare).
// Förkortar ALDRIG: en hypotetisk grupp med första match EFTER 21/6 hade behållit sitt
// senare ankare , regeln, inte datat, är garantin. Champion-ankaret g-A-1 (11 juni)
// ligger FÖRE fasta tiden, så champion förlängs till söndagen.

/**
 * Pool-tipsens förlängda deadline (UTC ISO): SÖNDAG 2026-06-21 23:59 svensk sommartid.
 * EN sanning, mirror av DB:ns public.pool_extended_deadline() (samma instant).
 * Daniels beslut #123 (flyttad från 14/6, T53 #95).
 */
export const POOL_EXTENDED_DEADLINE_ISO = '2026-06-21T21:59:00.000Z';

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
