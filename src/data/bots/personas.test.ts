// Tester för persona-motorn (T82, #173). Bevisar: antal per kohort, OJÄMN men icke-
// tom rums-fördelning, full determinism (samma seed -> samma personas), att fsu-
// botarna BARA är coola smeknamn (krav), att namn ryms i DB-gränsen (1..40), skill-
// skiktets spridning, och fail-loud på orimlig config.

import { describe, expect, it } from 'vitest';
import {
  generatePersonas,
  DEFAULT_PERSONA_CONFIG,
  type PersonaPlanConfig,
  type BotPersona,
} from './personas';
import { FSU_NICKNAMES } from './name-pools';

const personas = generatePersonas();

function byCohort(list: BotPersona[], cohort: BotPersona['cohort']): BotPersona[] {
  return list.filter((p) => p.cohort === cohort);
}

describe('generatePersonas (antal per kohort)', () => {
  it('ger totalt ~240 botar (200 + 35 + 5)', () => {
    expect(personas).toHaveLength(240);
  });

  it('200 new-room, 35 vm2026, 5 fsu', () => {
    expect(byCohort(personas, 'new-room')).toHaveLength(200);
    expect(byCohort(personas, 'vm2026')).toHaveLength(35);
    expect(byCohort(personas, 'fsu')).toHaveLength(5);
  });

  it('index löper 0..239 i genereringsordning, unikt', () => {
    const indices = personas.map((p) => p.index);
    expect(indices).toEqual(Array.from({ length: 240 }, (_, i) => i));
  });
});

describe('new-room-fördelning (OJÄMN men inget rum tomt)', () => {
  const newRoom = byCohort(personas, 'new-room');

  it('alla 20 rummen (0..19) har minst en bot (inget "nytt rum" är tomt)', () => {
    const used = new Set(newRoom.map((p) => p.roomIndex));
    for (let room = 0; room < DEFAULT_PERSONA_CONFIG.newRoomCount; room++) {
      expect(used.has(room)).toBe(true);
    }
  });

  it('rumsstorlekarna är OJÄMNA (inte alla lika stora)', () => {
    const sizes = new Map<number, number>();
    for (const p of newRoom) {
      sizes.set(p.roomIndex!, (sizes.get(p.roomIndex!) ?? 0) + 1);
    }
    const counts = [...sizes.values()];
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    // Ojämnhet bevisad: största rummet är klart större än minsta (inte en platt 10/rum).
    expect(max).toBeGreaterThan(min);
  });

  it('vm2026/fsu har roomIndex null (de går till befintliga namngivna rum)', () => {
    for (const p of [...byCohort(personas, 'vm2026'), ...byCohort(personas, 'fsu')]) {
      expect(p.roomIndex).toBeNull();
    }
  });
});

describe('determinism (samma seed -> samma personas)', () => {
  it('två körningar med samma config ger identiska personas', () => {
    const a = generatePersonas();
    const b = generatePersonas();
    expect(a).toEqual(b);
  });

  it('olika seed ger andra personas (annars vore seeden ignorerad)', () => {
    const other = generatePersonas({ ...DEFAULT_PERSONA_CONFIG, seed: 999 });
    expect(other).not.toEqual(personas);
  });
});

describe('fsu-botarna är COOLA SMEKNAMN, aldrig vanligt namn (krav)', () => {
  const fsu = byCohort(personas, 'fsu');

  it('varje fsu-namn kommer ur FSU_NICKNAMES-poolen', () => {
    for (const p of fsu) {
      expect(FSU_NICKNAMES).toContain(p.displayName);
    }
  });

  it('de fem fsu-namnen är distinkta (inget alias-krock)', () => {
    const names = fsu.map((p) => p.displayName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('inget fsu-namn innehåller mellanslag (inget "Förnamn Efternamn")', () => {
    for (const p of fsu) {
      expect(p.displayName).not.toContain(' ');
    }
  });
});

describe('visningsnamn ryms i DB-gränsen (1..40 tecken)', () => {
  it('alla personas har ett namn på 1..40 tecken', () => {
    for (const p of personas) {
      expect(p.displayName.length).toBeGreaterThanOrEqual(1);
      expect(p.displayName.length).toBeLessThanOrEqual(40);
    }
  });
});

describe('skill-skikt (0..1, spridd, inte alla samma)', () => {
  it('varje skill_tier ligger i [0,1]', () => {
    for (const p of personas) {
      expect(p.skillTier).toBeGreaterThanOrEqual(0);
      expect(p.skillTier).toBeLessThanOrEqual(1);
    }
  });

  it('skikten är SPRIDDA över hela skalan (låga, mellan och höga finns)', () => {
    const tiers = personas.map((p) => p.skillTier);
    expect(tiers.some((t) => t < 0.3)).toBe(true);
    expect(tiers.some((t) => t >= 0.3 && t <= 0.7)).toBe(true);
    expect(tiers.some((t) => t > 0.7)).toBe(true);
  });
});

describe('personlighet (fält definierade för liv-lagret, måttliga benägenheter)', () => {
  it('comment/reaction-chance ligger i sina måttliga intervall (ingen spam-bot)', () => {
    for (const p of personas) {
      expect(p.personality.commentChance).toBeGreaterThanOrEqual(0);
      expect(p.personality.commentChance).toBeLessThanOrEqual(0.3);
      expect(p.personality.reactionChance).toBeGreaterThanOrEqual(0);
      expect(p.personality.reactionChance).toBeLessThanOrEqual(0.5);
      expect(['peppig', 'analytisk', 'skämtsam', 'lugn']).toContain(p.personality.tone);
    }
  });
});

describe('fail loud på orimlig config', () => {
  const base = DEFAULT_PERSONA_CONFIG;

  it('kastar om newRoomCount < 1', () => {
    const bad: PersonaPlanConfig = { ...base, newRoomCount: 0 };
    expect(() => generatePersonas(bad)).toThrow(/newRoomCount/);
  });

  it('kastar om newRoomBotCount < newRoomCount (kan inte fylla varje rum)', () => {
    const bad: PersonaPlanConfig = { ...base, newRoomCount: 20, newRoomBotCount: 10 };
    expect(() => generatePersonas(bad)).toThrow(/minst newRoomCount/);
  });

  it('kastar om fsuBotCount överstiger antalet coola fsu-smeknamn', () => {
    const bad: PersonaPlanConfig = { ...base, fsuBotCount: FSU_NICKNAMES.length + 1 };
    expect(() => generatePersonas(bad)).toThrow(/fsu-smeknamn/);
  });
});
