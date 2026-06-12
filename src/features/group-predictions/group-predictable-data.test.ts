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
  // Grupp G bär här ett SYNTETISKT sent ankare: dess första match (g-G-1) spelas EFTER
  // den fasta söndagstiden (21/6, T67), så förlängningen ska BEVARA dess senare ankare
  // (inte förkorta). Inget RIKTIGT gruppankare ligger efter 21/6 (alla g-X-1 ligger
  // 11-17/6), men vi vaktar förkorta-aldrig-grenen oberoende av schemat , regeln, inte
  // datat, är garantin (T9-lessons: nå den gren påståendet skyddar).
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

// g-A-1 (11/6) och g-B-1 (12/6) ligger FÖRE fasta söndagstiden (21/6 21:59Z) -> förlängs.
// g-G-1 bär ett SYNTETISKT sent ankare (23/6) som ligger EFTER -> behåller sitt egna
// senare ankare. (Riktiga G..L startar 15-17 juni, dvs FÖRE 21/6, så de förlängs i
// verkligheten; här testar vi förkorta-aldrig-grenen oberoende av schemat.) decisions.md T67.
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

  // ===== T67 (#123): FÖRLÄNGD deadline 21/6 (GREATEST), FÖRLÄNG FÖRKORTA ALDRIG =====

  it('T67: en TIDIG grupp (g-X-1 före fasta tiden) FÖRLÄNGS till fasta söndagstiden', () => {
    // Grupp A:s första match är 11/6 (före 21/6 21:59Z) -> deadline = fasta tiden.
    const before = new Date('2026-06-10T00:00:00.000Z');
    const result = selectPredictableGroups(GROUPS, TEAMS, MATCHES, before);
    expect(result.find((g) => g.groupId === 'A')?.deadlineIso).toBe(POOL_EXTENDED_DEADLINE_ISO);
    expect(result.find((g) => g.groupId === 'B')?.deadlineIso).toBe(POOL_EXTENDED_DEADLINE_ISO);
  });

  it('T67: en SEN grupp (g-X-1 efter fasta tiden) BEHÅLLER sitt egna ankare (ej förkortad)', () => {
    // Grupp G:s SYNTETISKA ankare är 23/6 (EFTER 21/6 21:59Z): GREATEST behåller 23/6, så
    // dess fönster FÖRKORTAS INTE. Detta är kärnan i FÖRLÄNG-FÖRKORTA-ALDRIG-regeln.
    const before = new Date('2026-06-10T00:00:00.000Z');
    const result = selectPredictableGroups(GROUPS, TEAMS, MATCHES, before);
    expect(result.find((g) => g.groupId === 'G')?.deadlineIso).toBe(G_G_1_ISO);
  });

  it('T67: en startad TIDIG grupp är ÖPPEN igen fram till fasta tiden (reopen)', () => {
    // Mellan g-A-1 (11/6 19:00, redan startad) och fasta tiden (21/6): A ska vara ÖPPEN igen.
    const reopened = new Date('2026-06-13T12:00:00.000Z');
    const result = selectPredictableGroups(GROUPS, TEAMS, MATCHES, reopened);
    expect(result.find((g) => g.groupId === 'A')?.locked).toBe(false);
  });

  it('GRÄNS: olåst sekunden FÖRE fasta tiden, låst exakt PÅ den (tidig grupp)', () => {
    const oneSecBefore = new Date('2026-06-21T21:58:59.000Z');
    const openResult = selectPredictableGroups(GROUPS, TEAMS, MATCHES, oneSecBefore);
    expect(openResult.find((g) => g.groupId === 'A')?.locked).toBe(false);

    // Exakt på deadline (now === deadline): hör till LÅST, samma riktning som
    // server-RLS (now() < deadline nekar på likhet). Fasta tiden = 21/6 21:59:00Z.
    const atDeadline = new Date(POOL_EXTENDED_DEADLINE_ISO);
    const lockedResult = selectPredictableGroups(GROUPS, TEAMS, MATCHES, atDeadline);
    expect(lockedResult.find((g) => g.groupId === 'A')?.locked).toBe(true);
  });

  it('PER-GRUPP-LÅS efter fasta tiden: tidig grupp LÅST, sen grupp (G) ÖPPEN', () => {
    // Efter fasta tiden (21/6) men före g-G-1 (23/6): A låst (förlängningen passerad), G öppen
    // (sitt senare ankare ej passerat). Bevisar att G inte drogs ner till fasta tiden.
    const between = new Date('2026-06-22T08:00:00.000Z');
    const result = selectPredictableGroups(GROUPS, TEAMS, MATCHES, between);
    expect(result.find((g) => g.groupId === 'A')?.locked).toBe(true);
    expect(result.find((g) => g.groupId === 'G')?.locked).toBe(false);
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
