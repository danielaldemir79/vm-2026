import { describe, expect, it } from 'vitest';
import type { Match } from '../../domain/types';
import { windowMatches, WINDOW_DAYS } from './result-window';

// En minimal schemalagd match (bara fälten fönster-urvalet bryr sig om: id +
// kickoff). Samma stil som group-matches-by-day.test.ts.
function sched(id: string, kickoff: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'mex',
    awayTeamId: 'rsa',
    kickoff,
    venue: 'Testarena',
    result: null,
    status: 'scheduled',
  };
}

// Hjälp: en kickoff mitt på svensk dag (12:00Z = 14:00 svensk sommartid) så
// kalenderdagen är entydigt själva datumet (inga midnatts-gränsfall här, de
// täcks av localDateKey-testerna i daily).
function onDay(id: string, dateYmd: string): Match {
  return sched(id, `${dateYmd}T12:00:00.000Z`);
}

// "Nu" som en svensk kalenderdag, satt vid 09:00Z (11:00 svensk) så dagens
// nyckel är entydigt dateYmd.
function nowOn(dateYmd: string): Date {
  return new Date(`${dateYmd}T09:00:00.000Z`);
}

describe('windowMatches, default-fönstret (3 svenska dagar)', () => {
  it('WINDOW_DAYS är 3 (idag + två följande dagar), den dokumenterade fönsterbredden', () => {
    expect(WINDOW_DAYS).toBe(3);
  });

  it('visar matcher dag 0, 1 och 2 från idag, döljer dag 3 och framåt', () => {
    const matches = [
      onDay('d0', '2026-06-15'),
      onDay('d1', '2026-06-16'),
      onDay('d2', '2026-06-17'),
      onDay('d3', '2026-06-18'), // utanför fönstret
      onDay('d4', '2026-06-25'), // långt utanför
    ];
    const result = windowMatches(matches, nowOn('2026-06-15'));

    expect(result.visible.map((m) => m.id)).toEqual(['d0', 'd1', 'd2']);
    expect(result.hiddenCount).toBe(2);
    expect(result.anchorKey).toBe('2026-06-15');
  });

  it('bevarar indata-ordningen i visible (sorterar inte om, vyn äger ordningen)', () => {
    const matches = [onDay('b', '2026-06-17'), onDay('a', '2026-06-15'), onDay('c', '2026-06-16')];
    const result = windowMatches(matches, nowOn('2026-06-15'));
    // Alla tre ligger i fönstret -> samma ordning som de kom in, inte sorterad.
    expect(result.visible.map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('windowMatches, edge-fall: turneringen ej börjad (premiärfönstret)', () => {
  it('ankrar på PREMIÄRDAGEN när idag ligger före första matchen', () => {
    // Idag = 2026-06-01, men VM börjar 2026-06-11. Fönstret runt idag vore tomt;
    // i stället ska premiärfönstret (11-13 juni) visas.
    const matches = [
      onDay('p0', '2026-06-11'), // premiär
      onDay('p1', '2026-06-12'),
      onDay('p2', '2026-06-13'),
      onDay('p3', '2026-06-14'), // utanför premiärfönstret
    ];
    const result = windowMatches(matches, nowOn('2026-06-01'));

    expect(result.anchorKey).toBe('2026-06-11');
    expect(result.visible.map((m) => m.id)).toEqual(['p0', 'p1', 'p2']);
    expect(result.hiddenCount).toBe(1);
  });

  it('premiärdagen härleds oberoende av matchernas indata-ordning', () => {
    const matches = [
      onDay('later', '2026-06-13'),
      onDay('premiere', '2026-06-11'), // tidigast, men sist i listan
      onDay('mid', '2026-06-12'),
    ];
    const result = windowMatches(matches, nowOn('2026-06-01'));
    expect(result.anchorKey).toBe('2026-06-11');
    // Alla tre ligger i premiärfönstret 11-13.
    expect(result.hiddenCount).toBe(0);
  });
});

describe('windowMatches, edge-fall: slutet av turneringen (< 3 dagar kvar)', () => {
  it('fönstret slutar naturligt vid sista matchen, uppfinner inga extra dagar', () => {
    // Idag = näst sista speldagen; bara två speldagar kvar inom fönstret.
    const matches = [
      onDay('old', '2026-06-15'), // passerad, utanför fönstret
      onDay('s0', '2026-07-18'),
      onDay('s1', '2026-07-19'), // sista
    ];
    const result = windowMatches(matches, nowOn('2026-07-18'));

    expect(result.visible.map((m) => m.id)).toEqual(['s0', 's1']);
    expect(result.hiddenCount).toBe(1);
    expect(result.anchorKey).toBe('2026-07-18');
  });

  it('hela turneringen passerad: inga kommande matcher i fönstret, allt döljs', () => {
    // Idag ligger EFTER sista matchen. Det framåtblickande fönstret är tomt; allt
    // är "historik" som expandera-knappen visar. (Rätt: det finns inget kommande
    // att lyfta fram, men listan ska inte gå förlorad.)
    const matches = [onDay('a', '2026-06-11'), onDay('b', '2026-07-19')];
    const result = windowMatches(matches, nowOn('2026-08-01'));

    expect(result.visible).toEqual([]);
    expect(result.hiddenCount).toBe(2);
    expect(result.anchorKey).toBe('2026-08-01'); // ankrat på idag (turneringen ej "ej börjad")
  });
});

describe('windowMatches, edge-fall: allt inom fönstret (ingen knapp)', () => {
  it('alla matcher inom 3 dagar -> visible = alla, hiddenCount 0', () => {
    const matches = [onDay('a', '2026-06-15'), onDay('b', '2026-06-16'), onDay('c', '2026-06-17')];
    const result = windowMatches(matches, nowOn('2026-06-15'));

    expect(result.visible).toHaveLength(3);
    expect(result.hiddenCount).toBe(0);
  });
});

describe('windowMatches, edge-fall: vilodag inom fönstret', () => {
  it('en match dag 3 syns även om dag 2 är en vilodag (dagar räknas, inte matcher)', () => {
    // Idag = dag 0 (en match), dag 1 = VILODAG (ingen match), dag 2 = en match.
    // Fönstret 0-2 ska fånga BÅDA matcherna trots hålet på dag 1.
    const matches = [
      onDay('day0', '2026-06-15'),
      // 2026-06-16 är vilodag (ingen match)
      onDay('day2', '2026-06-17'),
      onDay('day3', '2026-06-18'), // utanför fönstret
    ];
    const result = windowMatches(matches, nowOn('2026-06-15'));

    expect(result.visible.map((m) => m.id)).toEqual(['day0', 'day2']);
    expect(result.hiddenCount).toBe(1);
  });
});

describe('windowMatches, edge-fall: tom indata + fel-väg', () => {
  it('tom matchlista -> tom visible, hiddenCount 0, anchorKey null', () => {
    const result = windowMatches([], nowOn('2026-06-15'));
    expect(result.visible).toEqual([]);
    expect(result.hiddenCount).toBe(0);
    expect(result.anchorKey).toBeNull();
  });

  it('kastar (fail loud) via localDateKey på en ogiltig kickoff i stället för att gissa', () => {
    // En trasig kickoff är ett datafel; localDateKey fail-loud:ar (känd fälla-
    // skydd), och vi maskerar inte det här. (Samma kontrakt som groupMatchesByDay.)
    const matches = [sched('bad', 'inte-ett-datum')];
    expect(() => windowMatches(matches, nowOn('2026-06-15'))).toThrow(/Ogiltig kickoff/);
  });
});

describe('windowMatches, midnatts-gränsfall (svensk dag, inte UTC-dygn)', () => {
  it('en match 00:00 svensk tid räknas till den svenska dagen i fönstret', () => {
    // 2026-06-17 22:00 UTC = 2026-06-18 00:00 svensk tid (sommartid +2). Med idag
    // = 2026-06-16 ligger den svenska dagen 06-18 i fönstret 16-18, så matchen ska
    // synas, en ren UTC-datumklippning (06-17) hade felräknat gränsen.
    const matches = [sched('midnight', '2026-06-17T22:00:00.000Z')];
    const result = windowMatches(matches, nowOn('2026-06-16'));
    expect(result.visible.map((m) => m.id)).toEqual(['midnight']);
    expect(result.hiddenCount).toBe(0);
  });
});
