// Tester för den SIDINDELADE full-läsningen (T90, #183, F1-fix). FOKUS: just den SKARV
// som de befintliga global-leaderboard-testerna ALDRIG korsade , sid-GRÄNSEN. Alla andra
// tester använder 1-3 små in-minnes-rum som ryms på EN sida, så completeness över flera
// sidor var en otestad gren (senior-developer-lärdom "paginerad-las-utan-stabil-order...").
//
// Vi sätter sidstorleken LÅGT (3) och matar > 1 sida, så loopen FAKTISKT korsar gränsen,
// och bevisar: (1) hela mängden läses i ordning, ingen rad tappas eller dubbleras, (2) en
// SISTA full sida följs av en tom sida utan att hänga/dubbla, (3) completeness-vakten
// KASTAR (fail-loud) vid både under-read (tappad rad) och over-read (dubblerad rad).

import { describe, expect, it, vi } from 'vitest';
import {
  selectAllPages,
  DEFAULT_PAGE_SIZE,
  type PageFetcher,
  type PageRequest,
} from './select-all-pages';

/**
 * En page-fetcher backad av en TOTALORDNAD in-minnes-array (modellerar en stabil ORDER BY).
 * `total` rapporteras som arrayens längd (precis som PostgREST `count: 'exact'`), så
 * completeness-vakten har ett sant förväntat antal att jämföra mot.
 */
function arrayFetcher<T>(all: readonly T[]): PageFetcher<T> {
  return ({ from, to }: PageRequest) =>
    Promise.resolve({ rows: all.slice(from, to + 1), total: all.length });
}

/** En array `[0, 1, ..., n-1]` , triviala, ordnade, UNIKA rader (så en dubblett syns). */
function seq(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

describe('selectAllPages, korsar sid-gränsen (completeness + ingen tapp/dubblering)', () => {
  it('läser HELA mängden i ordning över FLERA sidor (sidstorlek 3, 10 rader = 4 sidor)', async () => {
    const all = seq(10); // 10 rader -> sidor [0-2][3-5][6-8][9], sista är kort
    const fetchPage = vi.fn(arrayFetcher(all));
    const rows = await selectAllPages(fetchPage, 'test', 3);
    expect(rows).toEqual(all); // hela mängden, i ordning, exakt en gång var
    expect(rows).toHaveLength(10);
    // Bevisa att gränsen FAKTISKT korsades (4 sid-anrop, inte ett enda) , annars vore
    // testet inte ett seam-test. Sista sidan (9) är kortare än 3 -> loopen stannar.
    expect(fetchPage).toHaveBeenCalledTimes(4);
    expect(fetchPage).toHaveBeenNthCalledWith(1, { from: 0, to: 2 });
    expect(fetchPage).toHaveBeenNthCalledWith(4, { from: 9, to: 11 });
  });

  it('hanterar en EXAKT sid-gräns (antal delbart med sidstorlek -> extra TOM sista sida)', async () => {
    const all = seq(6); // 6 rader, sidstorlek 3 -> [0-2][3-5] båda fulla, sedan [] (tom)
    const fetchPage = vi.fn(arrayFetcher(all));
    const rows = await selectAllPages(fetchPage, 'test', 3);
    expect(rows).toEqual(all);
    // Två fulla sidor + en tom (en full sista sida kan inte signalera "klart", så en tom
    // sida krävs) -> 3 anrop. Bevisar att den jämna gränsen inte tappar eller hänger.
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(3, { from: 6, to: 8 });
  });

  it('en enda kort sida (färre än sidstorleken) räcker, inget andra anrop', async () => {
    const fetchPage = vi.fn(arrayFetcher(seq(2)));
    const rows = await selectAllPages(fetchPage, 'test', 3);
    expect(rows).toEqual([0, 1]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('tom källa ger tom lista (ett anrop, completeness 0 == 0)', async () => {
    const fetchPage = vi.fn(arrayFetcher<number>([]));
    const rows = await selectAllPages(fetchPage, 'test', 3);
    expect(rows).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('default-sidstorleken är PostgREST-cap:en (1000)', async () => {
    const fetchPage = vi.fn(arrayFetcher(seq(1)));
    await selectAllPages(fetchPage, 'test'); // ingen pageSize -> default
    expect(DEFAULT_PAGE_SIZE).toBe(1000);
    expect(fetchPage).toHaveBeenCalledWith({ from: 0, to: 999 });
  });
});

describe('selectAllPages, completeness-vakt FAIL-LOUD (just den bug T90 fixar)', () => {
  it('KASTAR vid UNDER-READ (en rad tappad mellan sidorna -> understruken poäng)', async () => {
    // total=10 rapporteras, men källan levererar bara 9 rader (en tappades vid gränsen,
    // t.ex. instabil ordning). Vakten MÅSTE fail-loud:a, inte returnera 9 av 10.
    const fetchPage: PageFetcher<number> = ({ from, to }) =>
      Promise.resolve({ rows: seq(9).slice(from, to + 1), total: 10 });
    await expect(selectAllPages(fetchPage, 'predictions', 3)).rejects.toThrow(
      /predictions.*hämtade 9.*rapporterade 10.*ofullständig/is
    );
  });

  it('KASTAR vid OVER-READ (en rad dubblerad mellan sidorna -> uppblåst poäng)', async () => {
    // Källan rapporterar total=4 men returnerar 6 rader (en sida dök upp två gånger , den
    // klassiska instabil-ordning-dubbletten). Over-read-vakten bryter loopen och kastar.
    const pages = [
      { rows: [0, 1, 2], total: 4 },
      { rows: [1, 2, 3], total: 4 }, // 1 & 2 dyker upp igen (drift)
      { rows: [3], total: 4 },
    ];
    let call = 0;
    const fetchPage: PageFetcher<number> = () => Promise.resolve(pages[call++]);
    await expect(selectAllPages(fetchPage, 'bracket_predictions', 3)).rejects.toThrow(
      /bracket_predictions.*over-read.*stabil ORDER BY/is
    );
  });

  it('KASTAR vid en ogiltig sidstorlek (<= 0)', async () => {
    const fetchPage = vi.fn(arrayFetcher(seq(3)));
    await expect(selectAllPages(fetchPage, 'test', 0)).rejects.toThrow(
      /sidstorlek måste vara > 0/i
    );
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
