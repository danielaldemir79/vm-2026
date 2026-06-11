// Kopiera MINA tips mellan rum (T52, #91): den rena orkestrerings-logiken bakom
// "kopiera in mina resultat från ett rum till ett annat" (Daniels önskan: slippa
// fylla om varenda match i varje nytt rum).
//
// ANSVAR (tunt, en sak): för varje tips-kategori (match / grupp / bracket) läsa
// MINA egna tips i KÄLLrummet och skriva dem i MÅLrummet, kategori för kategori,
// item för item, och RAPPORTERA utfallet ärligt. Ingen React, inget eget Supabase-
// anrop: vi ÅTERANVÄNDER de befintliga API-funktionerna (listMy* + upsertMy*), så
// det finns EN väg till databasen och RLS gäller likadant (PRINCIPLES §4).
//
// TRE HÅRDA REGLER (T52-direktivet, verifierade mot RLS i migrationerna):
//
//   1. BARA EGNA TIPS. Vi läser med listMy* (filtrerar på user_id ur sessionen) och
//      skriver med upsertMy* (sätter user_id = auth.uid()). En annans tips kan
//      varken läsas hit eller skrivas i deras namn (RLS, predictions-rls-migrationen).
//
//   2. DEADLINE-LÅS RESPEKTERAS. Servern (RLS) nekar en skrivning på ett LÅST item
//      (now() >= avspark). Men RLS-avslaget har SAMMA feltext för ett lås som för
//      andra avslag (Postgres 42501 "new row violates row-level security policy"),
//      så vi kan INTE lita på feltexten för att veta VARFÖR en skrivning nekades.
//      Därför PRE-KLASSIFICERAR vi lås på klienten med samma sanning som tips-vyerna
//      redan visar (en injicerad LockClassifier-closure, deriveCopyLocks, som härleder
//      låsen ur matchplanens avsparkstider), HOPPAR ÖVER låsta items utan skrivförsök, och
//      rapporterar dem som "låsta". Ett item vi ÄNDÅ försöker skriva och som nekas
//      rapporteras ärligt som "failed" med felets text (vi låtsas aldrig att en
//      nekad skrivning lyckades, PRINCIPLES §8).
//
//   3. SKRIV ALDRIG ÖVER BEFINTLIGA TIPS I MÅLRUMMET (fyll bara TOMMA). Valt för att
//      det är FÖRUTSÄGBART och OFÖRSTÖRBART: en kopiering kan aldrig råka radera ett
//      tips användaren redan lagt i målrummet. Items som redan finns i målet hoppas
//      över och rapporteras som "redan tippade". Motiv + alternativ: docs/decisions.md.
//
// ROBUST MOT DELFEL (PRINCIPLES §8): varje skrivning är sin egen try/catch. En låst
// eller felande match får ALDRIG stoppa resten, vi fortsätter och summerar utfallet.

import type { VmSupabaseClient } from '../supabase-browser';
import {
  listMyPredictions,
  upsertMyPrediction,
  listMyGroupPredictions,
  upsertMyGroupPrediction,
  listMyBracketPredictions,
  upsertMyBracketPrediction,
} from './index';

/** Vilken tips-kategori ett resultat gäller (för rapportens uppdelning). */
export type CopyCategory = 'match' | 'group' | 'bracket';

/** Hur det gick för ETT enskilt item i kopieringen (per-item-ärlighet). */
export type CopyOutcome = 'copied' | 'skippedLocked' | 'skippedExisting' | 'failed';

/** Ett rapporterat item: vilket, i vilken kategori, hur det gick, ev. feltext. */
export interface CopyItemResult {
  category: CopyCategory;
  /** Items nyckel inom sin kategori: matchId / groupId / slotId. */
  key: string;
  outcome: CopyOutcome;
  /** Felets text vid outcome 'failed' (annars undefined). Fail loud, inte tyst. */
  error?: string;
}

/** Summering per kategori (för "X kopierade, Y låsta ..."-raden i UI:t). */
export interface CopyCategorySummary {
  copied: number;
  skippedLocked: number;
  skippedExisting: number;
  failed: number;
}

/** Hela kopierings-rapporten: per item + totaler + per kategori. */
export interface CopyReport {
  items: CopyItemResult[];
  total: CopyCategorySummary;
  byCategory: Record<CopyCategory, CopyCategorySummary>;
}

/**
 * Lås-info för kopieringen: de KÄLL-nycklar (per kategori) som är LÅSTA just nu och
 * därför ska HOPPAS ÖVER utan skrivförsök. Härleds av anroparen ur SAMMA klient-sidiga
 * lås-sanning tips-vyerna redan visar (deriveCopyLocks -> isMatchLocked +
 * deadline-ankaren), så vi inte dubblerar deadline-logiken här. Tom mängd = inget
 * pre-klassificerat lås (servern nekar ändå låsta skrivningar, vi rapporterar då per item).
 */
export interface CopyLockSets {
  matchKeys: ReadonlySet<string>;
  groupKeys: ReadonlySet<string>;
  bracketKeys: ReadonlySet<string>;
}

/**
 * Källans tips-NYCKLAR per kategori (det lås-klassificeraren behöver). Engine:n läser
 * källans tips EN gång och ger klassificeraren bara nycklarna, så ingen dubbel-läsning
 * och ingen matchplan-kunskap läcker in i data-lagret (den bor i feature-lagret).
 */
export interface CopySourceKeys {
  matchKeys: readonly string[];
  groupKeys: readonly string[];
  bracketKeys: readonly string[];
}

/**
 * Klassificera vilka käll-nycklar som är låsta. Anroparen (feature-lagret) skickar in
 * en closure som använder matchplanens avsparkstider (deriveCopyLocks); engine:n
 * förblir generisk och fri från domän-data. En no-op (inga lås) är giltig.
 */
export type LockClassifier = (source: CopySourceKeys) => CopyLockSets;

/** Lås-klassificerare som inte pre-klassificerar något (servern nekar ändå låsta). */
export const NO_LOCKS: LockClassifier = () => ({
  matchKeys: new Set(),
  groupKeys: new Set(),
  bracketKeys: new Set(),
});

/** En tom summering (startvärde för ackumuleringen). */
function emptySummary(): CopyCategorySummary {
  return { copied: 0, skippedLocked: 0, skippedExisting: 0, failed: 0 };
}

/** Räkna upp rätt fält i summeringen utifrån ett items utfall. */
function tally(summary: CopyCategorySummary, outcome: CopyOutcome): void {
  switch (outcome) {
    case 'copied':
      summary.copied++;
      break;
    case 'skippedLocked':
      summary.skippedLocked++;
      break;
    case 'skippedExisting':
      summary.skippedExisting++;
      break;
    case 'failed':
      summary.failed++;
      break;
  }
}

/**
 * Generisk kopiering av EN kategori: för varje käll-item, avgör utfallet och (om det
 * ska skrivas) försök skriva via writeOne. Robust mot delfel: varje skrivning är sin
 * egen try/catch, ett fel stoppar inte resten. Pure kontroll-flöde, kategori-
 * specifika detaljer ligger i parametrarna (DRY: de tre kategorierna delar exakt
 * detta flöde, rule-of-three uppfylld).
 *
 * @param sourceItems  mina tips i KÄLLrummet (redan inlästa).
 * @param keyOf        items nyckel inom kategorin (matchId/groupId/slotId).
 * @param existingKeys mål-rummets befintliga nycklar (skrivs ej över, regel 3).
 * @param lockedKeys   låsta käll-nycklar (hoppas utan skrivförsök, regel 2).
 * @param writeOne     skriv ETT item till målrummet (återanvänder upsertMy*).
 */
async function copyCategory<T>(
  category: CopyCategory,
  sourceItems: readonly T[],
  keyOf: (item: T) => string,
  existingKeys: ReadonlySet<string>,
  lockedKeys: ReadonlySet<string>,
  writeOne: (item: T) => Promise<void>
): Promise<CopyItemResult[]> {
  const results: CopyItemResult[] = [];
  for (const item of sourceItems) {
    const key = keyOf(item);
    // Regel 3 FÖRST: finns tipset redan i målrummet rör vi det inte (oförstörbart).
    if (existingKeys.has(key)) {
      results.push({ category, key, outcome: 'skippedExisting' });
      continue;
    }
    // Regel 2: ett pre-klassificerat lås hoppas utan skrivförsök (servern nekar ändå,
    // men vi rapporterar ärligt VARFÖR i stället för att tolka ett tvetydigt RLS-fel).
    if (lockedKeys.has(key)) {
      results.push({ category, key, outcome: 'skippedLocked' });
      continue;
    }
    try {
      await writeOne(item);
      results.push({ category, key, outcome: 'copied' });
    } catch (err) {
      // Delfel sväljs INTE: vi fortsätter med resten MEN rapporterar detta item som
      // misslyckat med felets text (en låst match som glidit förbi klient-låset, ett
      // nätfel, en RLS-avvisning ...). Ärlig per-item-rapport, inte en tyst no-op.
      results.push({
        category,
        key,
        outcome: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

/** Bygg den slutliga rapporten (totaler + per kategori) ur item-listan. */
function buildReport(items: CopyItemResult[]): CopyReport {
  const byCategory: Record<CopyCategory, CopyCategorySummary> = {
    match: emptySummary(),
    group: emptySummary(),
    bracket: emptySummary(),
  };
  const total = emptySummary();
  for (const item of items) {
    tally(byCategory[item.category], item.outcome);
    tally(total, item.outcome);
  }
  return { items, total, byCategory };
}

/**
 * Kopiera MINA tips från `sourceRoomId` till `targetRoomId` (alla tre kategorier).
 *
 * Läser källans + målets tips per kategori (parallellt), avgör per item om det ska
 * kopieras, hoppas (låst / redan tippat) eller misslyckas, skriver det som ska
 * kopieras via de BEFINTLIGA upsert-funktionerna, och returnerar en ärlig rapport.
 *
 * @param client        Supabase-klienten (auth-session säkras av API-funktionerna).
 * @param sourceRoomId  rummet att kopiera FRÅN (där mina tips redan finns).
 * @param targetRoomId  rummet att kopiera TILL (mål; befintliga tips rörs ej).
 * @param classifyLocks closure som markerar vilka käll-nycklar som är låsta (lås
 *                      hoppas utan skrivförsök, regel 2). NO_LOCKS = pre-klassificera
 *                      inget. Källan läses EN gång och nycklarna ges till closuren.
 * @returns             en CopyReport (per item + totaler + per kategori).
 * @throws              bara om en INLÄSNING (listMy*) misslyckas, t.ex. nät/RLS på
 *                      läsvägen. Enskilda SKRIVfel fångas per item och stoppar inte
 *                      resten (fail loud per item, inte fail loud för hela jobbet).
 */
export async function copyMyPredictions(
  client: VmSupabaseClient,
  sourceRoomId: string,
  targetRoomId: string,
  classifyLocks: LockClassifier
): Promise<CopyReport> {
  // Läs källans OCH målets tips per kategori parallellt (oberoende nätanrop). En
  // läsmiss kastar (vi kan inte kopiera blint utan att veta vad som finns); det är
  // rätt fail-loud-läge här, till skillnad från en enskild skrivmiss som rapporteras.
  const [sourceMatches, targetMatches, sourceGroups, targetGroups, sourceBrackets, targetBrackets] =
    await Promise.all([
      listMyPredictions(client, sourceRoomId),
      listMyPredictions(client, targetRoomId),
      listMyGroupPredictions(client, sourceRoomId),
      listMyGroupPredictions(client, targetRoomId),
      listMyBracketPredictions(client, sourceRoomId),
      listMyBracketPredictions(client, targetRoomId),
    ]);

  // Klassificera lås UR KÄLLANS nycklar (en läsning, ingen dubblering). Feature-lagret
  // injicerar matchplan-medvetenheten via closuren; engine:n förblir domän-fri.
  const locks = classifyLocks({
    matchKeys: sourceMatches.map((p) => p.matchId),
    groupKeys: sourceGroups.map((g) => g.groupId),
    bracketKeys: sourceBrackets.map((b) => b.slotId),
  });

  const items: CopyItemResult[] = [];

  // MATCH-TIPS: nyckel = matchId. Skriv via upsertMyPrediction (mål-rummet).
  items.push(
    ...(await copyCategory(
      'match',
      sourceMatches,
      (p) => p.matchId,
      new Set(targetMatches.map((p) => p.matchId)),
      locks.matchKeys,
      async (p) => {
        await upsertMyPrediction(client, targetRoomId, {
          matchId: p.matchId,
          homeGoals: p.homeGoals,
          awayGoals: p.awayGoals,
        });
      }
    ))
  );

  // GRUPP-TIPS: nyckel = groupId. Skriv via upsertMyGroupPrediction.
  items.push(
    ...(await copyCategory(
      'group',
      sourceGroups,
      (g) => g.groupId,
      new Set(targetGroups.map((g) => g.groupId)),
      locks.groupKeys,
      async (g) => {
        await upsertMyGroupPrediction(client, targetRoomId, {
          groupId: g.groupId,
          winnerTeamId: g.winnerTeamId,
          runnerUpTeamId: g.runnerUpTeamId,
        });
      }
    ))
  );

  // BRACKET-/CHAMPION-TIPS: nyckel = slotId (M73..M104 + 'champion').
  items.push(
    ...(await copyCategory(
      'bracket',
      sourceBrackets,
      (b) => b.slotId,
      new Set(targetBrackets.map((b) => b.slotId)),
      locks.bracketKeys,
      async (b) => {
        await upsertMyBracketPrediction(client, targetRoomId, {
          slotId: b.slotId,
          advancingTeamId: b.advancingTeamId,
        });
      }
    ))
  );

  return buildReport(items);
}
