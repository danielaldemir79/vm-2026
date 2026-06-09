import { describe, expect, it } from 'vitest';
import { buildBracket, slotId, type BracketNode } from './build-bracket';
import { BRACKET_MATCHES } from './bracket-structure';

// Test för slot-grafen: bevisar att hela slutspelsträdet kopplas ihop genom
// nextSlotId enligt FIFA:s officiella schema (Article 12.6-12.11), och att varje
// slot bär rätt källa och börjar utan löst lag (resolvedTeamId null).

const nodes = buildBracket();
const byId = new Map(nodes.map((n) => [n.id, n]));

describe('buildBracket: noder och form', () => {
  it('skapar två slots (hemma/borta) per slutspelsmatch = 64 noder', () => {
    expect(nodes).toHaveLength(BRACKET_MATCHES.length * 2);
    expect(nodes).toHaveLength(64);
  });

  it('varje slot börjar utan löst lag (resolvedTeamId null)', () => {
    for (const n of nodes) {
      expect(n.resolvedTeamId).toBeNull();
    }
  });

  it('slot-id är stabilt och unikt (matchId-side)', () => {
    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(byId.has('M104-home')).toBe(true);
    expect(byId.has('M104-away')).toBe(true);
  });

  it('varje slots källa speglar strukturen (grupp-position eller match-progression)', () => {
    for (const match of BRACKET_MATCHES) {
      expect(byId.get(slotId(match.id, 'home'))?.source).toEqual(match.home);
      expect(byId.get(slotId(match.id, 'away'))?.source).toEqual(match.away);
    }
  });
});

describe('buildBracket: nästa-slot-kopplingen följer det officiella schemat', () => {
  it('båda slots i en match pekar på SAMMA nästa-slot (matchens vinnare går vidare)', () => {
    for (const match of BRACKET_MATCHES) {
      const home = byId.get(slotId(match.id, 'home'))!;
      const away = byId.get(slotId(match.id, 'away'))!;
      expect(home.nextSlotId).toBe(away.nextSlotId);
    }
  });

  it('en sextondelsfinals vinnare matas in i rätt åttondelsfinal-slot', () => {
    // FIFA 12.7: vinnare M74 -> M89 (hemma), vinnare M77 -> M89 (borta).
    expect(byId.get('M74-home')!.nextSlotId).toBe('M89-home');
    expect(byId.get('M77-home')!.nextSlotId).toBe('M89-away');
    // Vinnare M73 -> M90 hemma, M75 -> M90 borta.
    expect(byId.get('M73-home')!.nextSlotId).toBe('M90-home');
    expect(byId.get('M75-home')!.nextSlotId).toBe('M90-away');
  });

  it('semifinalvinnarna går till finalen, semifinalförlorarna till bronsmatchen', () => {
    // M101/M102 vinnare -> final (M104). Båda M101-slots pekar på samma final-slot.
    expect(byId.get('M101-home')!.nextSlotId).toBe('M104-home');
    expect(byId.get('M102-home')!.nextSlotId).toBe('M104-away');
    // Bronsmatchens slots MATAS av semi-förlorarna (källa match-loser); de
    // pekar inte vidare själva (ingen match efter bronsmatchen).
    expect(byId.get('M103-home')!.source).toEqual({ kind: 'match-loser', matchId: 'M101' });
    expect(byId.get('M103-away')!.source).toEqual({ kind: 'match-loser', matchId: 'M102' });
  });

  it('finalen och bronsmatchen är ändstationer (nextSlotId null)', () => {
    for (const id of ['M104-home', 'M104-away', 'M103-home', 'M103-away']) {
      expect(byId.get(id)!.nextSlotId).toBeNull();
    }
  });

  it('grafen är navigerbar hela vägen: en R32-vinnare når finalen via giltiga slots', () => {
    // Följ vinnar-kedjan från en sextondelsfinal till finalen och verifiera att
    // varje hopp landar i en slot som finns och i en senare runda.
    const stageOrder = ['round-of-32', 'round-of-16', 'quarter-final', 'semi-final', 'final'];
    let current: BracketNode | undefined = byId.get('M79-home');
    const visitedStages: string[] = [];
    let guard = 0;
    while (current && guard < 10) {
      visitedStages.push(current.stage);
      if (current.nextSlotId === null) break;
      const next: BracketNode | undefined = byId.get(current.nextSlotId);
      expect(next, `nästa slot ${current.nextSlotId} finns`).toBeDefined();
      // Varje hopp går framåt i rundordningen.
      expect(stageOrder.indexOf(next!.stage)).toBeGreaterThan(stageOrder.indexOf(current.stage));
      current = next;
      guard += 1;
    }
    // Kedjan slutar i finalen.
    expect(visitedStages[visitedStages.length - 1]).toBe('final');
    expect(visitedStages).toEqual(stageOrder);
  });

  it('exakt 4 slots är ändstationer (final 2 + bronsmatch 2), resten pekar vidare', () => {
    const terminal = nodes.filter((n) => n.nextSlotId === null);
    expect(terminal).toHaveLength(4);
    for (const n of terminal) {
      expect(['final', 'third-place']).toContain(n.stage);
    }
  });
});
