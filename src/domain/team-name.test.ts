import { describe, expect, it } from 'vitest';
import type { Team } from './types';
import { teamShortName } from './team-name';

// teamShortName är EN sanning för fallback-regeln "kort namn om satt, annars det
// vanliga namnet" (T50). Testet vaktar den faktiska invarianten: shortName vinner
// när det finns, name annars, så ett lag UTAN kortform aldrig tappar sitt namn.

function team(over: Partial<Team>): Team {
  return { id: 'x', name: 'Namn', code: 'XXX', group: 'A', ...over };
}

describe('teamShortName, kort visningsnamn med fallback till name', () => {
  it('returnerar shortName när laget har satt ett (långt namn -> kortform)', () => {
    const bih = team({ name: 'Bosnien och Hercegovina', shortName: 'Bosnien' });
    expect(teamShortName(bih)).toBe('Bosnien');
  });

  it('faller tillbaka till name när shortName saknas (default-fallet)', () => {
    // Lejonparten av lagen sätter aldrig shortName; de ska visa sitt vanliga namn.
    expect(teamShortName(team({ name: 'Mexiko' }))).toBe('Mexiko');
  });

  it('faller tillbaka till name när shortName är explicit undefined', () => {
    // Samma utfall som "fältet saknas": en odefinierad kortform är ingen kortform.
    expect(teamShortName(team({ name: 'Sverige', shortName: undefined }))).toBe('Sverige');
  });

  it('respekterar en tom shortName-sträng som ett satt värde (gissar inte om datan)', () => {
    // ?? faller bara på null/undefined, inte på ''. En tom sträng vore ett data-fel
    // i källan, men helpern maskerar det inte tyst till name (det skulle dölja felet);
    // den returnerar det satta värdet, så en sådan bugg syns vid review/test.
    expect(teamShortName(team({ name: 'Land', shortName: '' }))).toBe('');
  });
});
