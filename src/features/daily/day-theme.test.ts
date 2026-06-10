import { describe, it, expect } from 'vitest';
import type { Match, Team } from '../../domain/types';
import { deriveDayTheme } from './day-theme';
import { hueFromCode } from './team-hue';

// --- Testdata-hjälpare (minimala, bara fälten härledningen läser) -------------

function team(id: string, code: string): Team {
  return { id, name: id, code, group: 'A' };
}

/** En gruppmatch mellan två kända lag (resten av fälten är irrelevanta här). */
function match(id: string, homeTeamId: string | null, awayTeamId: string | null): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId,
    awayTeamId,
    kickoff: '2026-06-11T16:00:00.000Z',
    venue: 'Arena',
    status: 'scheduled',
    result: null,
  };
}

function teamsMap(...teams: Team[]): ReadonlyMap<string, Team> {
  return new Map(teams.map((t) => [t.id, t]));
}

describe('deriveDayTheme: dag -> dekorativ accent-hue', () => {
  it('VILODAG (inga matcher) -> neutralt default-tema, ingen hue', () => {
    const theme = deriveDayTheme([], teamsMap(), '2026-06-20');
    expect(theme).toEqual({ hue: null, source: 'default', teamCount: 0 });
  });

  it('en match med två kända lag -> hue härledd ur LAGEN (source teams)', () => {
    const teams = teamsMap(team('bra', 'BRA'), team('swe', 'SWE'));
    const theme = deriveDayTheme([match('m1', 'bra', 'swe')], teams);
    expect(theme.source).toBe('teams');
    expect(theme.teamCount).toBe(2);
    expect(theme.hue).not.toBeNull();
    expect(theme.hue).toBeGreaterThanOrEqual(0);
    expect(theme.hue as number).toBeLessThan(360);
  });

  it('är DETERMINISTISK och ORDNINGS-OBEROENDE (samma lag -> samma hue oavsett ordning)', () => {
    const teams = teamsMap(team('a', 'ARG'), team('b', 'FRA'), team('c', 'ESP'), team('d', 'USA'));
    const dayA = [match('m1', 'a', 'b'), match('m2', 'c', 'd')];
    const dayB = [match('m2', 'd', 'c'), match('m1', 'b', 'a')]; // omkastad ordning
    expect(deriveDayTheme(dayA, teams).hue).toBe(deriveDayTheme(dayB, teams).hue);
  });

  it('ORDNINGS-OBEROENDE även vid exakt ANTIPODALA hues (degenererat fall, F1)', () => {
    // REGRESSION (review F1): CRO (hue 85) och QAT (hue 265) är exakt motstående
    // på färghjulet, så vektorsumman blir ~0 och circularMeanHue tar den
    // degenererade grenen. Tidigare returnerade den hues[0] = ordningsberoende
    // (85 om CRO hemma, 265 om QAT hemma) trots att doc/decisions.md påstod
    // ordnings-oberoende. Vakta att BÅDA ordningarna nu ger SAMMA hue.
    expect(hueFromCode('CRO')).toBe(85); // låser förutsättningen (antipodala)
    expect(hueFromCode('QAT')).toBe(265);
    const teams = teamsMap(team('cro', 'CRO'), team('qat', 'QAT'));
    const croHome = deriveDayTheme([match('m1', 'cro', 'qat')], teams).hue;
    const qatHome = deriveDayTheme([match('m1', 'qat', 'cro')], teams).hue;
    expect(croHome).toBe(qatHome);
    // Den dokumenterade regeln är "minsta hue:n" -> 85 oavsett ordning.
    expect(croHome).toBe(85);
  });

  it('samma lag som spelar TVÅ matcher räknas EN gång (unika lag)', () => {
    const teams = teamsMap(team('a', 'ARG'), team('b', 'FRA'), team('c', 'ESP'));
    // a möter b, sen a möter c -> 3 unika lag, inte 4.
    const theme = deriveDayTheme([match('m1', 'a', 'b'), match('m2', 'a', 'c')], teams);
    expect(theme.teamCount).toBe(3);
  });

  it('MÅNGA lag (premiärdag, 16 lag) -> en stabil, väldefinierad hue', () => {
    const codes = [
      'BRA',
      'SWE',
      'USA',
      'MEX',
      'CAN',
      'ARG',
      'FRA',
      'ESP',
      'GER',
      'ITA',
      'POR',
      'NED',
      'BEL',
      'CRO',
      'JPN',
      'KOR',
    ];
    const teams = teamsMap(...codes.map((c, i) => team(`t${i}`, c)));
    const matches = [];
    for (let i = 0; i < codes.length; i += 2) {
      matches.push(match(`m${i}`, `t${i}`, `t${i + 1}`));
    }
    const theme = deriveDayTheme(matches, teams);
    expect(theme.source).toBe('teams');
    expect(theme.teamCount).toBe(16);
    expect(theme.hue).toBeGreaterThanOrEqual(0);
    expect(theme.hue as number).toBeLessThan(360);
    // Deterministisk: en andra körning ger exakt samma hue.
    expect(deriveDayTheme(matches, teams).hue).toBe(theme.hue);
  });

  it('cirkulärt medel wrappar korrekt kring 0/360 (motverkar naivt aritmetiskt medel)', () => {
    // Konstruera två lag vars hues ligger nära 0 respektive nära 360. Det
    // cirkulära medlet ska landa NÄRA 0/360, inte nära 180 (som ett aritmetiskt
    // medel av t.ex. 5 och 355 skulle ge). Vi hittar koder med låg/hög hue.
    const lowCode = findCodeWithHueNear(5);
    const highCode = findCodeWithHueNear(355);
    const teams = teamsMap(team('lo', lowCode), team('hi', highCode));
    const theme = deriveDayTheme([match('m1', 'lo', 'hi')], teams);
    const hue = theme.hue as number;
    // Nära 0/360-sömmen (inte mitt på hjulet runt 180).
    const distanceFromSeam = Math.min(hue, 360 - hue);
    expect(distanceFromSeam).toBeLessThan(30);
    expect(Math.abs(hue - 180)).toBeGreaterThan(60);
  });

  describe('slutspel innan seedningen (okända lag)', () => {
    const knockout = (id: string): Match => ({
      id,
      stage: 'round-of-32',
      groupId: null,
      homeTeamId: null,
      awayTeamId: null,
      kickoff: '2026-07-01T18:00:00.000Z',
      venue: 'Arena',
      status: 'scheduled',
      result: null,
    });

    it('bara okända lag + datum -> hue ur DATUM-NYCKELN (source date)', () => {
      const theme = deriveDayTheme([knockout('M89')], teamsMap(), '2026-07-01');
      expect(theme.source).toBe('date');
      expect(theme.teamCount).toBe(0);
      expect(theme.hue).toBe(hueFromCode('2026-07-01'));
    });

    it('bara okända lag UTAN datum -> neutralt default (gissar aldrig lag)', () => {
      const theme = deriveDayTheme([knockout('M89')], teamsMap());
      expect(theme).toEqual({ hue: null, source: 'default', teamCount: 0 });
    });

    it('ett känt lag bland okända -> hue ur det KÄNDA laget (okänt hoppas över, inte fel)', () => {
      const teams = teamsMap(team('bra', 'BRA'));
      const mixed = match('m1', 'bra', null); // ett känt, ett okänt
      const theme = deriveDayTheme([mixed], teams, '2026-07-01');
      expect(theme.source).toBe('teams');
      expect(theme.teamCount).toBe(1);
      expect(theme.hue).toBe(hueFromCode('BRA'));
    });
  });

  describe('fel-vägar (fail loud)', () => {
    it('ett SATT teamId som saknas i uppslaget -> KASTAR (brutet referens-kontrakt)', () => {
      const teams = teamsMap(team('bra', 'BRA')); // 'swe' saknas
      expect(() => deriveDayTheme([match('m1', 'bra', 'swe')], teams)).toThrow(
        /okänt teamId "swe"/
      );
    });

    it('felmeddelandet pekar ut matchen och id:t (felsökbart, inte tyst)', () => {
      const teams = teamsMap();
      expect(() => deriveDayTheme([match('badmatch', 'x', null)], teams)).toThrow(/badmatch/);
    });
  });
});

// Hitta en VM-rimlig landskod vars hue ligger nära ett mål (för wrap-testet).
// Söker bland bokstavskombinationer tills en hue inom +-tolerans hittas.
function findCodeWithHueNear(target: number, tolerance = 12): string {
  const A = 'A'.charCodeAt(0);
  for (let i = 0; i < 26; i += 1) {
    for (let j = 0; j < 26; j += 1) {
      for (let k = 0; k < 26; k += 1) {
        const code = String.fromCharCode(A + i, A + j, A + k);
        const hue = hueFromCode(code);
        const dist = Math.min(Math.abs(hue - target), 360 - Math.abs(hue - target));
        if (dist <= tolerance) {
          return code;
        }
      }
    }
  }
  throw new Error(`Hittade ingen kod med hue nära ${target}`);
}
