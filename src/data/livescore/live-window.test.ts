// Fönster-gating-tester (pollare-v3): bevisa att BARA matcher i sitt live-fönster
// väljs , det är nyckeln till att budgeten räcker (inga anrop mellan matcher). Edge
// (fönster-gränserna exakt), fel-vägar (negativ/ogiltig input), och negativ-kontroll
// (en match LÅNGT före kickoff eller LÅNGT efter slutet väljs INTE, dvs INGA anrop
// mellan matcher).

import { describe, expect, it } from 'vitest';
import { LIVE_WINDOW_AFTER_MS, LIVE_WINDOW_BEFORE_MS, selectInWindowMatches } from './live-window';
import type { MatchPlanEntry } from './fixture-map-resolver';

// Två matcher med 6h mellanrum (typiskt VM-dygn): en på eftermiddagen, en på kvällen.
const PLAN: MatchPlanEntry[] = [
  { matchId: 'g-A-1', kickoffUtc: '2026-06-14T16:00:00.000Z', homeAppId: 'mex', awayAppId: 'rsa' },
  { matchId: 'g-B-1', kickoffUtc: '2026-06-14T22:00:00.000Z', homeAppId: 'esp', awayAppId: 'uru' },
];

describe('selectInWindowMatches: vilka matcher är i sitt live-fönster NU', () => {
  it('väljer en match vars avspark nyss passerat (mitt i matchen)', () => {
    // 16:45 = 45 min in i g-A-1, INNAN g-B-1 (22:00) ens närmar sig fönstret.
    const out = selectInWindowMatches(PLAN, new Date('2026-06-14T16:45:00.000Z'));
    expect(out.map((m) => m.matchId)).toEqual(['g-A-1']);
    expect(out[0].msSinceKickoff).toBe(45 * 60 * 1000);
  });

  it('väljer en match strax FÖRE avspark (inom före-fönstret, varma upp pollaren)', () => {
    // 15:57 = 3 min före g-A-1 (16:00), inom LIVE_WINDOW_BEFORE_MS (5 min).
    const out = selectInWindowMatches(PLAN, new Date('2026-06-14T15:57:00.000Z'));
    expect(out.map((m) => m.matchId)).toEqual(['g-A-1']);
    expect(out[0].msSinceKickoff).toBeLessThan(0); // kickoff ligger strax fram
  });

  // NEGATIV-KONTROLL (Daniels HARD-krav: INGA anrop mellan matcher): mellan en
  // avslutad match och nästa avspark får INGEN match vara i fönster.
  it('INGEN match i fönster i pausen MELLAN två matcher (inga anrop mellan matcher)', () => {
    // 20:00 = 4h efter g-A-1 (slut + utanför 3,5h-fönstret) och 2h FÖRE g-B-1
    // (långt utanför 5-min-före-fönstret). Tomt = pollaren hoppar hela ticket.
    const out = selectInWindowMatches(PLAN, new Date('2026-06-14T20:00:00.000Z'));
    expect(out).toEqual([]);
  });

  it('väljer INTE en match som ligger LÅNGT fram i tiden (innan dess fönster öppnat)', () => {
    // 12:00 = 4h före g-A-1, långt utanför före-fönstret.
    const out = selectInWindowMatches(PLAN, new Date('2026-06-14T12:00:00.000Z'));
    expect(out).toEqual([]);
  });

  it('väljer INTE en match som är klar för länge sedan (efter att fönstret stängt)', () => {
    // g-A-1 + 5h = 21:00. 3,5h-fönstret stängde 19:30, så g-A-1 är ute. g-B-1
    // (22:00) är 1h bort, fortfarande utanför 5-min-före-fönstret. Tomt.
    const out = selectInWindowMatches(PLAN, new Date('2026-06-14T21:00:00.000Z'));
    expect(out).toEqual([]);
  });

  it('väljer BÅDA när två matcher överlappar i fönster (tät slutspelskväll)', () => {
    // Två matcher 2h isär, båda pågående: en på 90:e min, en nyss avsparkad.
    const overlap: MatchPlanEntry[] = [
      { matchId: 'tidig', kickoffUtc: '2026-06-14T18:00:00.000Z', homeAppId: 'a', awayAppId: 'b' },
      { matchId: 'sen', kickoffUtc: '2026-06-14T20:00:00.000Z', homeAppId: 'c', awayAppId: 'd' },
    ];
    const out = selectInWindowMatches(overlap, new Date('2026-06-14T20:01:00.000Z'));
    expect(out.map((m) => m.matchId)).toEqual(['tidig', 'sen']); // äldst-kickoff först
  });

  it('sorterar äldst-kickoff FÖRST (mest "färdig" match prioriteras i budget-allokering)', () => {
    const overlap: MatchPlanEntry[] = [
      { matchId: 'sen', kickoffUtc: '2026-06-14T20:00:00.000Z', homeAppId: 'c', awayAppId: 'd' },
      { matchId: 'tidig', kickoffUtc: '2026-06-14T18:00:00.000Z', homeAppId: 'a', awayAppId: 'b' },
    ];
    const out = selectInWindowMatches(overlap, new Date('2026-06-14T20:30:00.000Z'));
    expect(out.map((m) => m.matchId)).toEqual(['tidig', 'sen']);
    expect(out[0].msSinceKickoff).toBeGreaterThan(out[1].msSinceKickoff);
  });

  it('bär med lag-par (eller null för oseedat slutspel) för discovery-steget', () => {
    const ko: MatchPlanEntry[] = [
      { matchId: 'M73', kickoffUtc: '2026-06-14T16:00:00.000Z', homeAppId: null, awayAppId: null },
    ];
    const out = selectInWindowMatches(ko, new Date('2026-06-14T16:30:00.000Z'));
    expect(out).toHaveLength(1);
    expect(out[0].homeAppId).toBeNull();
    expect(out[0].awayAppId).toBeNull();
    expect(out[0].kickoffUtc).toBe('2026-06-14T16:00:00.000Z');
  });

  // EDGE: exakt på fönster-gränserna (inklusive bägge ändar).
  it('EXAKT på efter-gränsen (3,5h) väljs, en ms senare väljs INTE', () => {
    const ko = new Date('2026-06-14T16:00:00.000Z').getTime();
    const onEdge = new Date(ko + LIVE_WINDOW_AFTER_MS);
    const justOver = new Date(ko + LIVE_WINDOW_AFTER_MS + 1);
    expect(selectInWindowMatches(PLAN, onEdge).map((m) => m.matchId)).toEqual(['g-A-1']);
    expect(selectInWindowMatches(PLAN, justOver).map((m) => m.matchId)).toEqual([]);
  });

  it('EXAKT på före-gränsen (5 min) väljs, en ms tidigare väljs INTE', () => {
    const ko = new Date('2026-06-14T16:00:00.000Z').getTime();
    const onEdge = new Date(ko - LIVE_WINDOW_BEFORE_MS);
    const justBefore = new Date(ko - LIVE_WINDOW_BEFORE_MS - 1);
    expect(selectInWindowMatches(PLAN, onEdge).map((m) => m.matchId)).toEqual(['g-A-1']);
    expect(selectInWindowMatches(PLAN, justBefore).map((m) => m.matchId)).toEqual([]);
  });

  it('tom plan ger tom lista (inget att polla)', () => {
    expect(selectInWindowMatches([], new Date('2026-06-14T16:00:00.000Z'))).toEqual([]);
  });

  it('hoppar en planrad med ogiltig kickoff (gissar aldrig på NaN-tid)', () => {
    const broken: MatchPlanEntry[] = [
      { matchId: 'trasig', kickoffUtc: 'inte-en-tid', homeAppId: 'a', awayAppId: 'b' },
      { matchId: 'ok', kickoffUtc: '2026-06-14T16:00:00.000Z', homeAppId: 'c', awayAppId: 'd' },
    ];
    const out = selectInWindowMatches(broken, new Date('2026-06-14T16:30:00.000Z'));
    expect(out.map((m) => m.matchId)).toEqual(['ok']);
  });

  it('fail loud på ogiltigt now-datum (korrupt klocka gissas aldrig)', () => {
    expect(() => selectInWindowMatches(PLAN, new Date('inte-ett-datum'))).toThrow(/now/);
  });

  it('fail loud på negativa fönster-gränser (orimlig input)', () => {
    const now = new Date('2026-06-14T16:00:00.000Z');
    expect(() => selectInWindowMatches(PLAN, now, { beforeMs: -1 })).toThrow(/negativa/);
    expect(() => selectInWindowMatches(PLAN, now, { afterMs: -1 })).toThrow(/negativa/);
  });

  it('justerbara fönster-gränser respekteras (injicerade bounds)', () => {
    // Snävt fönster: bara 1 min efter kickoff. En match 5 min in faller utanför.
    const tight = selectInWindowMatches(PLAN, new Date('2026-06-14T16:05:00.000Z'), {
      afterMs: 60 * 1000,
    });
    expect(tight).toEqual([]);
    const wide = selectInWindowMatches(PLAN, new Date('2026-06-14T16:05:00.000Z'), {
      afterMs: 10 * 60 * 1000,
    });
    expect(wide.map((m) => m.matchId)).toEqual(['g-A-1']);
  });

  it('default-konstanterna är de Daniels modell föreskriver (5 min före, 3,5h efter)', () => {
    expect(LIVE_WINDOW_BEFORE_MS).toBe(5 * 60 * 1000);
    expect(LIVE_WINDOW_AFTER_MS).toBe(3.5 * 60 * 60 * 1000);
  });
});
