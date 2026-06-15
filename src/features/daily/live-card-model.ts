// REN VISNINGS-MODELL för livekortet (Bit 3b, UI-lagret ovanpå läs-lagret Bit 3a).
//
// ANSVAR (tunt, en sak): forma den redan parsade LiveData (status/ställning/events/
// statistik/laguppställningar) till de små, sorterade strukturer livekortet RITAR,
// helt utan IO och utan Date.now() , rent in, rent ut, så varje gren är trivialt
// testbar (mål-listan, kort-listan, statistik-urvalet, hemma/borta-paringen).
//
// VARFÖR ett eget rent lager och inte logik i komponenten: livekortet ska kunna
// renderas för EN pågående match, EN avslutad (frusen) match och i utfällt läge,
// och paras mot ett app-lag (hemma/borta) som API-datan inte alltid sorterar likadant.
// Den paringen + sorteringen är just den klass av skarv-logik som tyst kan bli fel
// (lessons: "bevisa skarven, inte bara happy-path"), så den bor här, hårt testad.
//
// HEMMA/BORTA-PARING (skarven): events/statistik/laguppställningar bär API:ts
// numeriska team-id, INTE appens hemma/borta-roll. Livekortet vet vilket API-id som
// är hemma (ur snapshotten/raden) och delar upp resten mot det. Faller ett id utanför
// (fixtures-läge väver in rika 2022-blobbar vars lag inte är ned/jpn) hanteras det
// fail-safe: den första laguppställningen/statistik-kolumnen blir "hemma", den andra
// "borta" (positions-fallback), så kortet ALDRIG blir tomt bara för att id:t inte
// råkar matcha , men när id:t MATCHAR (live) styr id:t (korrekt roll), gissa aldrig.

import type {
  LiveEvent,
  LiveLineup,
  LiveStatisticValue,
  LiveTeamStatistics,
} from '../../data/livescore';

/** Ena sidan (hemma/borta) i en par-uppdelning. */
export type MatchSide = 'home' | 'away';

/** Ett mål så kortet ritar det: minut (+ ev. tillägg), målskytt, ev. assist, ev. straff. */
export interface GoalEntry {
  side: MatchSide;
  /** Spelad minut. */
  minute: number;
  /** Tilläggsminut (45+`extra`/90+`extra`), null när inget tillägg. */
  extra: number | null;
  /** Målskyttens namn, eller en neutral platshållare när API:t saknade det. */
  scorer: string;
  /** Assistens namn, null när ingen assist. */
  assist: string | null;
  /** true för straffmål (detail "Penalty"), så kortet kan markera (str.). */
  penalty: boolean;
  /** true för självmål (detail "Own Goal"). */
  ownGoal: boolean;
}

/** Ett kort (gult/rött) så kortet ritar det: minut, spelare, sida, färg. */
export interface CardEntry {
  side: MatchSide;
  minute: number;
  extra: number | null;
  player: string;
  color: 'yellow' | 'red';
}

/** Ett byte: minut, in (player) och ut (assist bär den utbytte i API-formen). */
export interface SubEntry {
  side: MatchSide;
  minute: number;
  extra: number | null;
  /** Spelaren som kom IN (API:ts event.player vid en subst). */
  playerIn: string;
  /** Spelaren som gick UT (API:ts event.assist vid en subst), null om okänd. */
  playerOut: string | null;
}

/** Neutral platshållare när API:t saknade ett namn (gissa aldrig en spelare). */
const UNKNOWN_PLAYER = 'Okänd spelare';

/**
 * Avgör vilken SIDA ett API-team-id hör till. Matchar id mot hemma-id (då 'home'),
 * annars 'away'. homeApiId null (fixtures-läge utan känt id) -> allt blir 'away'
 * tills positions-fallbacken i paringsfunktionerna tar över, så vi aldrig gissar fel
 * roll när id:t saknas.
 */
function sideForTeam(teamApiId: number, homeApiId: number | null): MatchSide {
  return homeApiId !== null && teamApiId === homeApiId ? 'home' : 'away';
}

/**
 * Plocka ut målen ur händelse-listan, i kronologisk ordning (minut, sedan tillägg).
 * Ett mål = kind 'goal'. Straff/självmål härleds ur detail (källhänvisad text), så
 * kortet kan markera dem utan att gissa.
 *
 * @param events    de parsade händelserna (LiveData.events).
 * @param homeApiId hemmalagets API-id (ur raden/snapshotten), null i fixtures utan match.
 */
export function selectGoals(events: readonly LiveEvent[], homeApiId: number | null): GoalEntry[] {
  return events
    .filter((e) => e.kind === 'goal')
    .map((e) => ({
      side: sideForTeam(e.teamApiId, homeApiId),
      minute: e.minute,
      extra: e.extra,
      scorer: e.playerName ?? UNKNOWN_PLAYER,
      assist: e.assistName,
      penalty: /penalty/i.test(e.detail),
      ownGoal: /own goal/i.test(e.detail),
    }))
    .sort(byTime);
}

/** Plocka ut korten (gula/röda), kronologiskt. Färgen kommer redan normaliserad. */
export function selectCards(events: readonly LiveEvent[], homeApiId: number | null): CardEntry[] {
  return events
    .filter((e): e is LiveEvent & { cardColor: 'yellow' | 'red' } => e.cardColor !== null)
    .map((e) => ({
      side: sideForTeam(e.teamApiId, homeApiId),
      minute: e.minute,
      extra: e.extra,
      player: e.playerName ?? UNKNOWN_PLAYER,
      color: e.cardColor,
    }))
    .sort(byTime);
}

/** Plocka ut bytena, kronologiskt. In = event.player, ut = event.assist (API-formen). */
export function selectSubs(events: readonly LiveEvent[], homeApiId: number | null): SubEntry[] {
  return events
    .filter((e) => e.kind === 'subst')
    .map((e) => ({
      side: sideForTeam(e.teamApiId, homeApiId),
      minute: e.minute,
      extra: e.extra,
      playerIn: e.playerName ?? UNKNOWN_PLAYER,
      playerOut: e.assistName,
    }))
    .sort(byTime);
}

/** Sortera två tids-bärande poster: minut först, sedan tilläggsminut (null = 0). */
function byTime(
  a: { minute: number; extra: number | null },
  b: { minute: number; extra: number | null }
): number {
  if (a.minute !== b.minute) {
    return a.minute - b.minute;
  }
  return (a.extra ?? 0) - (b.extra ?? 0);
}

/**
 * En statistik-rad så kortet ritar den som en jämförelse-stapel: etikett (svensk),
 * hemma- och borta-värdet (rå sträng för visning) + de NUMERISKA andelarna 0..1 för
 * stapel-bredden (summan normaliserad, eller 0.5/0.5 när båda saknar tal).
 */
export interface StatRow {
  /** Svensk etikett ("Bollinnehav", "Skott", ...). */
  label: string;
  /** Visnings-värdet hemma/borta (rå, t.ex. "78%" eller "13"). */
  homeText: string;
  awayText: string;
  /** Andel av summan 0..1 för stapel-bredden (visuell jämförelse). */
  homeShare: number;
  awayShare: number;
}

/**
 * De statistik-typer livekortet visar, i ordning, med svensk etikett. URVAL med flit
 * (KISS): de mest spännande nyckeltalen, inte API:ts hela lista (som har dubbletter
 * som "Shots insidebox"). API:ts engelska `type` är nyckeln (källhänvisad, parse-live).
 */
const STAT_DISPLAY: ReadonlyArray<{ apiType: string; label: string }> = [
  { apiType: 'Ball Possession', label: 'Bollinnehav' },
  { apiType: 'Total Shots', label: 'Skott totalt' },
  { apiType: 'Shots on Goal', label: 'Skott på mål' },
  { apiType: 'Corner Kicks', label: 'Hörnor' },
  { apiType: 'Fouls', label: 'Frisparkar' },
  { apiType: 'Offsides', label: 'Offside' },
  { apiType: 'Yellow Cards', label: 'Gula kort' },
  { apiType: 'Goalkeeper Saves', label: 'Räddningar' },
  { apiType: 'Passes %', label: 'Passningar %' },
];

/** Slå upp ett statistik-värde för en given typ i ett lags lista, eller null. */
function statValue(stats: LiveTeamStatistics | null, apiType: string): LiveStatisticValue | null {
  if (stats === null) {
    return null;
  }
  return stats.statistics.find((s) => s.type === apiType) ?? null;
}

/** En statistik-värde -> visnings-text. null/saknat -> "-" (gissa aldrig en nolla). */
function statText(value: LiveStatisticValue | null): string {
  if (value === null || value.value === null) {
    return '-';
  }
  return String(value.value);
}

/**
 * Ett statistik-värde -> ett TAL för stapel-andelen (procent "78%" -> 78, "13" -> 13).
 * Icke-numeriskt/saknat -> 0, så en saknad sida bara ger noll bredd, aldrig NaN.
 */
function statNumber(value: LiveStatisticValue | null): number {
  if (value === null || value.value === null) {
    return 0;
  }
  if (typeof value.value === 'number') {
    return value.value;
  }
  const parsed = Number.parseFloat(value.value.replace('%', '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Para ihop de två statistik-blocken till hemma/borta. Matchar på API-id när det går
 * (live: korrekt roll), annars positions-fallback (block 0 = hemma, 1 = borta), så
 * kortet renderas även i fixtures-läge där de invävda 2022-blobbarna inte är ned/jpn.
 *
 * @param statistics alla lags statistik-block (LiveData.statistics, normalt 2).
 * @param homeApiId  hemmalagets API-id (ur raden), null -> positions-fallback.
 */
export function pairStatistics(
  statistics: readonly LiveTeamStatistics[],
  homeApiId: number | null
): { home: LiveTeamStatistics | null; away: LiveTeamStatistics | null } {
  if (statistics.length === 0) {
    return { home: null, away: null };
  }
  if (homeApiId !== null) {
    const home = statistics.find((s) => s.teamApiId === homeApiId) ?? null;
    if (home !== null) {
      const away = statistics.find((s) => s.teamApiId !== homeApiId) ?? null;
      return { home, away };
    }
  }
  // Positions-fallback (id matchade inte, t.ex. fixtures-läge): block 0 = hemma.
  return { home: statistics[0] ?? null, away: statistics[1] ?? null };
}

/**
 * Bygg statistik-raderna kortet ritar. Bara rader där MINST en sida har ett värde
 * tas med (en typ som helt saknas i datan hoppas, ingen tom "- mot -"-rad).
 *
 * @param statistics alla lags statistik (LiveData.statistics).
 * @param homeApiId  hemmalagets API-id (för paringen).
 */
export function buildStatRows(
  statistics: readonly LiveTeamStatistics[],
  homeApiId: number | null
): StatRow[] {
  const { home, away } = pairStatistics(statistics, homeApiId);
  if (home === null && away === null) {
    return [];
  }
  const rows: StatRow[] = [];
  for (const { apiType, label } of STAT_DISPLAY) {
    const hv = statValue(home, apiType);
    const av = statValue(away, apiType);
    if (hv === null && av === null) {
      continue; // typen saknas helt, ingen rad
    }
    const hn = statNumber(hv);
    const an = statNumber(av);
    const total = hn + an;
    // Andelar för stapeln: dela på summan, eller 0.5/0.5 när båda saknar tal (så
    // staplarna inte kollapsar till noll men inte heller ljuger om en skillnad).
    const homeShare = total > 0 ? hn / total : 0.5;
    rows.push({
      label,
      homeText: statText(hv),
      awayText: statText(av),
      homeShare,
      awayShare: 1 - homeShare,
    });
  }
  return rows;
}

/**
 * Para ihop de två laguppställningarna till hemma/borta (samma id-först-annars-
 * position-logik som pairStatistics, en sanning för par-regeln genom återbruk).
 */
export function pairLineups(
  lineups: readonly LiveLineup[],
  homeApiId: number | null
): { home: LiveLineup | null; away: LiveLineup | null } {
  if (lineups.length === 0) {
    return { home: null, away: null };
  }
  if (homeApiId !== null) {
    const home = lineups.find((l) => l.teamApiId === homeApiId) ?? null;
    if (home !== null) {
      const away = lineups.find((l) => l.teamApiId !== homeApiId) ?? null;
      return { home, away };
    }
  }
  return { home: lineups[0] ?? null, away: lineups[1] ?? null };
}

/** Formatera en minut + ev. tillägg för visning: 45 -> "45'", 45+1 -> "45+1'". */
export function formatEventMinute(minute: number, extra: number | null): string {
  return extra !== null && extra > 0 ? `${minute}+${extra}'` : `${minute}'`;
}
