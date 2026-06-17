// FÖRE/EFTER-SKYDDET för bot-seedningen (T82, #173). REN, testbar logik.
//
// VARFÖR EGEN MODUL: skyddet är seedningens säkerhets-nät , det ska AVBRYTA om
// riktig (icke-bot) data rördes under en live-körning. Ett load-bearing skydd får
// inte ligga otestat i den tunna I/O-exekvereraren (scripts/seed-bots.ts), där
// ingen assertion bevisar att det ens kan kasta. Vi bryter därför ut själva
// BESLUTET (jämför före/efter, kasta vid skillnad) hit, så det enhetstestas och
// bevisas vakta (negativ-kontroll: en ändrad räkning ska kasta). Hur SIFFRORNA
// hämtas (server-side, utan jätte-URL) bor kvar i skriptet , den biten är I/O.

/** Antal RIKTIGA (icke-bot) rader vi vaktar: medlemmar och match-tips. */
export interface RealDataCounts {
  members: number;
  predictions: number;
}

/**
 * Skydds-grinden: kasta (fail loud) om de RIKTIGA (icke-bot) räkningarna ändrats
 * mellan före och efter seedningen. En skillnad betyder att seedningen rörde data
 * som inte är en bot , det får ALDRIG hända, så vi avbryter och kräver manuell
 * granskning i stället för att fortsätta tyst.
 *
 * Detta är en REN funktion (inga sido-effekter): den tar två räkningar och
 * antingen returnerar (oförändrat) eller kastar. Att den är ren är just det som
 * gör skyddet bevisbart , testet matar en ändrad räkning och verifierar att den
 * kastar (annars vaktar nätet ingenting).
 */
export function assertRealDataUnchanged(before: RealDataCounts, after: RealDataCounts): void {
  if (before.members !== after.members || before.predictions !== after.predictions) {
    throw new Error(
      `[VM2026] AVBRYTER: riktig (icke-bot) data ändrades under seedningen ` +
        `(medlemmar ${before.members}->${after.members}, tips ${before.predictions}->` +
        `${after.predictions}). Detta får ALDRIG hända , granska och rulla tillbaka.`
    );
  }
}
