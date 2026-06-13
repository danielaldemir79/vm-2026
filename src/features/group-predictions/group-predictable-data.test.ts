import { describe, expect, it } from 'vitest';
import { groupFirstMatchId, selectPredictableGroups } from './group-predictable-data';
import { POOL_EXTENDED_DEADLINE_ISO } from '../../data/predictions';
import type { Group, Match, Team } from '../../domain/types';

const TEAMS: Team[] = [
  { id: 'mex', name: 'Mexiko', code: 'MEX', group: 'A' },
  { id: 'rsa', name: 'Sydafrika', code: 'RSA', group: 'A' },
  { id: 'kor', name: 'Sydkorea', code: 'KOR', group: 'A' },
  { id: 'cze', name: 'Tjeckien', code: 'CZE', group: 'A' },
  { id: 'can', name: 'Kanada', code: 'CAN', group: 'B' },
  { id: 'bih', name: 'Bosnien', code: 'BIH', group: 'B' },
  { id: 'sui', name: 'Schweiz', code: 'SUI', group: 'G' },
  { id: 'nor', name: 'Norge', code: 'NOR', group: 'G' },
];

const GROUPS: Group[] = [
  { id: 'B', teamIds: ['can', 'bih'] },
  { id: 'A', teamIds: ['mex', 'rsa', 'kor', 'cze'] },
  // Grupp G bär här ett SYNTETISKT sent ankare (g-G-1 spelas EFTER den platta
  // pool-deadlinen). Under T72:s PLATTA modell ska G ändå låsas vid SAMMA platta tid
  // som alla andra grupper, dess egna senare ankare styr inte längre. (Inget riktigt
  // gruppankare ligger efter 17/6 20:00, g-L-1 ÄR maxet, men vi vaktar att den platta
  // regeln gäller oberoende av indata så ingen tyst återinför per-grupp-fönster.)
  { id: 'G', teamIds: ['sui', 'nor'] },
];

function groupMatch(id: string, kickoff: string): Match {
  return {
    id,
    stage: 'group',
    groupId: id.charAt(2) as Group['id'],
    homeTeamId: null,
    awayTeamId: null,
    kickoff,
    venue: 'x',
    result: null,
    status: 'scheduled',
  };
}

// g-A-1 (11/6) och g-B-1 (12/6) ligger FÖRE den platta pool-deadlinen (17/6 20:00Z).
// g-G-1 bär ett SYNTETISKT sent ankare (23/6) som ligger EFTER. Under T72:s PLATTA
// modell låses ALLA tre vid SAMMA platta tid, ankarets egen avspark styr inte längre.
// (Riktiga G..L startar 15-17 juni, dvs PÅ eller FÖRE g-L-1; det syntetiska 23/6-ankaret
// bevisar att den platta regeln gäller oavsett indata.) decisions.md T72.
const G_G_1_ISO = '2026-06-23T19:00:00.000Z';
const MATCHES: Match[] = [
  groupMatch('g-A-1', '2026-06-11T19:00:00.000Z'),
  groupMatch('g-B-1', '2026-06-12T19:00:00.000Z'),
  groupMatch('g-G-1', G_G_1_ISO),
];

describe('groupFirstMatchId', () => {
  it('bygger gruppens första match-id (deadline-ankaret)', () => {
    expect(groupFirstMatchId('A')).toBe('g-A-1');
    expect(groupFirstMatchId('L')).toBe('g-L-1');
  });
});

describe('selectPredictableGroups', () => {
  it('sorterar grupperna A..L och mappar lagen till code + namn', () => {
    const before = new Date('2026-06-10T00:00:00.000Z');
    const result = selectPredictableGroups(GROUPS, TEAMS, MATCHES, before);
    expect(result.map((g) => g.groupId)).toEqual(['A', 'B', 'G']); // sorterad
    expect(result[0].teams).toEqual([
      { code: 'MEX', name: 'Mexiko' },
      { code: 'RSA', name: 'Sydafrika' },
      { code: 'KOR', name: 'Sydkorea' },
      { code: 'CZE', name: 'Tjeckien' },
    ]);
  });

  // ===== T72 (#151): PLATT deadline (omgång 1 spelad), samma instant för alla grupper =====

  it('T72: ALLA grupper får SAMMA platta deadline (omgång-1-tiden), oavsett ankare', () => {
    // A (11/6) + B (12/6) ligger före, G:s syntetiska ankare (23/6) ligger efter, men
    // ALLA tre låses vid samma platta tid (ingen per-grupp-GREATEST längre).
    const before = new Date('2026-06-10T00:00:00.000Z');
    const result = selectPredictableGroups(GROUPS, TEAMS, MATCHES, before);
    expect(result.find((g) => g.groupId === 'A')?.deadlineIso).toBe(POOL_EXTENDED_DEADLINE_ISO);
    expect(result.find((g) => g.groupId === 'B')?.deadlineIso).toBe(POOL_EXTENDED_DEADLINE_ISO);
    // Kärnan i T72: G:s SENARE egna ankare (23/6) styr INTE längre, den platta tiden gäller.
    expect(result.find((g) => g.groupId === 'G')?.deadlineIso).toBe(POOL_EXTENDED_DEADLINE_ISO);
  });

  it('T72: en startad TIDIG grupp är ÖPPEN igen fram till den platta tiden (reopen)', () => {
    // Mellan g-A-1 (11/6 19:00, redan startad) och den platta tiden (17/6): A ska vara
    // ÖPPEN igen, så de som inte hann före premiären får tippa tills omgång 1 är spelad.
    const reopened = new Date('2026-06-13T12:00:00.000Z');
    const result = selectPredictableGroups(GROUPS, TEAMS, MATCHES, reopened);
    expect(result.find((g) => g.groupId === 'A')?.locked).toBe(false);
  });

  it('GRÄNS: olåst sekunden FÖRE den platta tiden, låst exakt PÅ den', () => {
    const oneSecBefore = new Date('2026-06-17T19:59:59.000Z');
    const openResult = selectPredictableGroups(GROUPS, TEAMS, MATCHES, oneSecBefore);
    expect(openResult.find((g) => g.groupId === 'A')?.locked).toBe(false);

    // Exakt på deadline (now === deadline): hör till LÅST, samma riktning som
    // server-RLS (now() < deadline nekar på likhet). Platta tiden = 17/6 20:00:00Z.
    const atDeadline = new Date(POOL_EXTENDED_DEADLINE_ISO);
    const lockedResult = selectPredictableGroups(GROUPS, TEAMS, MATCHES, atDeadline);
    expect(lockedResult.find((g) => g.groupId === 'A')?.locked).toBe(true);
  });

  it('T72: efter den platta tiden är ALLA grupper LÅSTA samtidigt (även en med sent ankare)', () => {
    // Efter den platta tiden (17/6 20:00) ska BÅDE en tidig grupp (A) OCH en med ett
    // senare eget ankare (G, syntetiskt 23/6) vara låsta , de delar EN låspunkt (T72).
    // Detta är skillnaden mot T67: där hade G varit öppen till sitt 23/6-ankare.
    const after = new Date('2026-06-18T08:00:00.000Z');
    const result = selectPredictableGroups(GROUPS, TEAMS, MATCHES, after);
    expect(result.find((g) => g.groupId === 'A')?.locked).toBe(true);
    expect(result.find((g) => g.groupId === 'G')?.locked).toBe(true);
  });

  it('FAIL-SAFE: en grupp utan första match i planen behandlas som LÅST (deadlineIso null)', () => {
    // Tar bort g-B-1 ur planen: grupp B saknar då deadline-ankare -> null (förlängningen
    // gissar ALDRIG fram en tid ur ett saknat ankare) -> låst (vi erbjuder aldrig ett
    // tips vi inte kan deadline-bevaka; RLS:ens NULL nekar ändå).
    const onlyAG = MATCHES.filter((m) => m.id !== 'g-B-1');
    const result = selectPredictableGroups(GROUPS, TEAMS, onlyAG, new Date('2026-06-10T00:00:00Z'));
    const b = result.find((g) => g.groupId === 'B');
    expect(b?.deadlineIso).toBeNull();
    expect(b?.locked).toBe(true);
  });

  it('faller tillbaka till team-id som code om laget saknas (ingen krasch)', () => {
    const groupWithUnknown: Group[] = [{ id: 'A', teamIds: ['mex', 'ghost'] }];
    const result = selectPredictableGroups(
      groupWithUnknown,
      TEAMS,
      MATCHES,
      new Date('2026-06-10T00:00:00Z')
    );
    expect(result[0].teams).toEqual([
      { code: 'MEX', name: 'Mexiko' },
      { code: 'ghost', name: 'ghost' },
    ]);
  });
});
