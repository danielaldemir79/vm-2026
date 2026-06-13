// EN DELAD SANNING för pool-tipsens FÖRLÄNGDA deadline (T53 #95, flyttad i T67 #123,
// nu PLATT i T72 #151): den tidpunkt då GRUPPVINNAR-tips och CHAMPION-tipset låser sig.
// Ingen React, inget I/O, fristående testbar. Speglar RLS-helpers EXAKT (klient + DB
// är en sanning), se supabase/migrations/...t72_extended_deadline_round1_flat.sql.
//
// DANIELS BESLUT 2026-06-13 (källa, gissas inte, issue #151): "ändra så gruppspel
// tippning och mästerskap tippningen låser sig efter första omgången är slutspelad.
// dvs varje grupp har gått igenom första matchen. så blir det mer rättvist." Den
// gamla 21/6-deadlinen (T67) var för sen, den nya rättvisare låspunkten är när
// omgång 1 är spelad, dvs när ALLA 12 gruppers FÖRSTA match har sparkat igång.
//
// FAST TIDPUNKT: 2026-06-17T20:00:00.000Z. Det är avsparket för den SISTA gruppens
// första match (g-L-1) = MAX över de 12 gruppernas (A..L) tidigaste match-kickoff.
// När den matchen startar har varje grupp gått igenom sin första match, alltså är
// omgång 1 i spel. (Verifierat ur WC2026_MATCHES: per grupp A..L är g-X-1 den
// tidigaste kickoffen, och max av dem = g-L-1 = 2026-06-17T20:00:00Z. Ett test
// härleder denna max ur schemat och asserterar likhet, så en framtida schema-ändring
// fångas rött, se extended-deadline-schema.test.ts.) Denna konstant är den ENDA
// platsen tiden bor på klienten (ingen hårdkodad text-dubblett av den, lessons).
//
// VARFÖR PLATT och inte längre GREATEST(ankare, fasta tiden) (T53/T67):
//   Tidigare var den fasta tiden en söndags-23:59 som kunde ligga FÖRE en sen grupps
//   första match, så GREATEST behövdes för att inte FÖRKORTA den gruppens fönster.
//   Den NYA tiden ÄR den sista gruppens första match, alltså ligger den per definition
//   PÅ ELLER EFTER varje grupps första match. Daniels intent är EN gemensam låspunkt
//   (= när omgång 1 är spelad), inte per-grupp-fönster. Därför låses ALLA grupp- +
//   champion-tips vid exakt samma instant (platt), och GREATEST-maskineriet tas bort.
//   Beslut + härledning källhänvisat i docs/decisions.md T72.
//
// AVGRÄNSNING: match-tips + bracket-SLOT-tips (M73..M104) behåller sina EGNA
// avsparks-lås (rörs INTE här). Bara grupp-tips + champion-tipset omfattas av denna
// gemensamma deadline.

/**
 * Pool-tipsens förlängda deadline (UTC ISO): 2026-06-17 20:00:00Z, avsparket för den
 * SISTA gruppens första match (g-L-1) = när omgång 1 är spelad (alla 12 gruppers
 * första match igång). EN sanning, mirror av DB:ns public.pool_extended_deadline()
 * (samma instant). Daniels beslut #151 (platt, ersätter 21/6-tiden från T67 #123).
 */
export const POOL_EXTENDED_DEADLINE_ISO = '2026-06-17T20:00:00.000Z';

/**
 * Tillämpa den PLATTA pool-deadlinen på ett grupp- eller champion-tips. Returnerar den
 * gemensamma låspunkten (omgång 1 spelad) oavsett ankar-matchens egen avspark: ALLA
 * grupp- + champion-tips låses vid SAMMA instant (Daniels intent, T72). Tar fortfarande
 * ankaret som argument så call-sites (vyer + copy-lås) och RLS-helpern delar EN
 * funktions-signatur, och så fail-safen kan bevaras: ett null-ankare (saknad ankar-match,
 * oväntat) förblir null (vi gissar aldrig fram en deadline ur tomma luften, samma riktning
 * som RLS:ens NULL-fail-safe och vyernas/copy-lockets locked-vid-saknat).
 *
 * @param anchorIso  ankar-matchens avspark (UTC ISO), eller null om matchen saknas.
 * @returns          den platta pool-deadlinen som ISO, eller null om anchorIso null.
 */
export function applyExtendedDeadline(anchorIso: string | null): string | null {
  if (anchorIso === null) {
    return null;
  }
  // PLATT: alla omfattade tips låses vid den gemensamma omgång-1-tiden (T72), oberoende
  // av ankarets egen avspark. Fail-safen (null-ankare -> null) ligger kvar ovanför.
  return POOL_EXTENDED_DEADLINE_ISO;
}
