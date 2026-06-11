// Tester för det branded `TeamCode`-kontraktet (T16b/C1+C2): en versal FIFA-code
// accepteras, ogiltiga former (gemen id, fel längd, icke-bokstäver) faller HÖGT,
// och DB-betrodda strängar brandas utan validering. Bevisar att kontraktet är
// tydligt: koden som lagras ÄR Team.code, inte Team.id.

import { describe, expect, it } from 'vitest';
import { teamCode, asTeamCode, TEAM_CODE_PATTERN, type TeamCode } from './team-code';

describe('teamCode (validerad brandning av en FIFA-code)', () => {
  it('accepterar en versal trebokstavskod (Team.code) och returnerar samma sträng', () => {
    const code = teamCode('BRA');
    // Branded men i grunden samma sträng-värde (märket är bara typ-nivå).
    expect(code).toBe('BRA');
  });

  it('accepterar alla VM-lagets code-former (versal, exakt 3 bokstäver)', () => {
    for (const c of ['SWE', 'ARG', 'ESP', 'USA', 'MEX', 'QAT']) {
      expect(teamCode(c)).toBe(c);
    }
  });

  it('FAIL LOUD: ett gemen Team.id ("bra") avvisas (det är just den tysta-noll-fällan C1/C2)', () => {
    // "bra" är Team.id (teamId(code)=toLowerCase), INTE en code. Att skicka det till
    // ett TeamCode-fält ska smälla, inte tyst bli fel poäng.
    expect(() => teamCode('bra')).toThrow(/Ogiltig lag-code "bra"/);
  });

  it('FAIL LOUD: fel längd och icke-bokstäver avvisas', () => {
    expect(() => teamCode('BR')).toThrow(/måste vara en versal FIFA-trebokstavskod/);
    expect(() => teamCode('BRAS')).toThrow(/Ogiltig lag-code/);
    expect(() => teamCode('B1A')).toThrow(/Ogiltig lag-code/);
    expect(() => teamCode('')).toThrow(/Ogiltig lag-code/);
  });

  it('mönstret speglar DB-constrainten ^[A-Z]{3}$ (en sanning, klient + DB)', () => {
    expect(TEAM_CODE_PATTERN.test('BRA')).toBe(true);
    expect(TEAM_CODE_PATTERN.test('bra')).toBe(false);
  });
});

describe('asTeamCode (betrodd brandning vid DB-gränsen, ingen validering)', () => {
  it('brandar en redan DB-validerad sträng utan att kasta', () => {
    // DB-constrainten har redan garanterat formen på write; read behöver inte re-validera.
    const fromDb: string = 'ARG';
    const code = asTeamCode(fromDb);
    expect(code).toBe('ARG');
  });
});

describe('TYP-KONTRAKT (KONTRAKTET ÄR TYDLIGT): ett TeamCode-fält accepterar en code-sträng', () => {
  it('en brandad code är tilldelningsbar där TeamCode krävs (kompilerar + körs)', () => {
    // Detta är det kontrakt C1/C2 låser: fält som BÄR en code typas som TeamCode.
    // En rå `string` (t.ex. ett gemen Team.id) går INTE att tilldela utan teamCode()/
    // asTeamCode() (annars TS-fel: "Type 'string' is not assignable to type 'TeamCode'"),
    // vilket är exakt skyddet, bevisat negativt nedan med @ts-expect-error.
    const stored: { winnerTeamId: TeamCode } = { winnerTeamId: teamCode('BRA') };
    expect(stored.winnerTeamId).toBe('BRA');

    // Negativt bevis: en rå sträng AVVISAS av typsystemet. @ts-expect-error gör att
    // bygget (tsc -b) FAILAR om raden mot förmodan skulle bli giltig, så skyddet kan
    // inte tyst försvinna.
    // @ts-expect-error en rå string (t.ex. ett gemen Team.id "bra") får inte bli en TeamCode utan teamCode()/asTeamCode()
    const leaked: TeamCode = 'bra';
    expect(leaked).toBe('bra');
  });
});
