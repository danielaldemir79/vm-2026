// Tester för den rena seed-planeraren (T82, #173). Bevisar: korrekt antal/scopning per
// kohort, att VM2026/FSU-botar pekar på sina namngivna befintliga rum, att RHODOS aldrig
// rörs (varken som mål eller via id), idempotens (en andra körning med alla konton
// befintliga ger en TOM plan, inga dubbletter), och fail-loud när ett namngivet rum saknas.

import { describe, expect, it } from 'vitest';
import {
  buildSeedPlan,
  personaKey,
  VM2026_ROOM_NAME,
  FSU_ROOM_NAME,
  PROTECTED_ROOM_NAME,
  type RoomsSnapshot,
  type SeedDomain,
  type ExistingRoom,
} from './seed-plan';
import { generatePersonas } from './personas';
import { WC2026_GROUPS, WC2026_TEAM_BASES } from '../wc2026/team-refs';
import { WC2026_MATCHES } from '../wc2026/matches';
import { derivePoolFacit } from '../../features/leaderboard/derive-facit';
import type { Team, Match, Group } from '../../domain/types';

/* ------------------------------------------------------------------ *
 * Fixtures.
 * ------------------------------------------------------------------ */

const TEAMS: Team[] = WC2026_TEAM_BASES.map((b) => ({
  id: b.id,
  name: b.name,
  code: b.code,
  group: b.group,
}));
const GROUPS: Group[] = WC2026_GROUPS;

// Några avgjorda gruppmatcher -> ett icke-tomt facit (samma mönster som predict.test.ts).
const FINISHED_MATCHES: Match[] = WC2026_MATCHES.map((m, idx) =>
  m.stage === 'group' && m.groupId === 'A'
    ? { ...m, status: 'finished', result: { homeGoals: idx % 3, awayGoals: (idx + 1) % 2 } }
    : m
);

const DOMAIN: SeedDomain = {
  matches: FINISHED_MATCHES,
  groups: GROUPS,
  facit: derivePoolFacit(TEAMS, GROUPS, FINISHED_MATCHES),
};

const RHODOS: ExistingRoom = { id: 'room-rhodos', name: PROTECTED_ROOM_NAME };
const VM_ROOM: ExistingRoom = { id: 'room-vm', name: VM2026_ROOM_NAME };
const FSU_ROOM: ExistingRoom = { id: 'room-fsu', name: FSU_ROOM_NAME };

/** En frisk snapshot: Rhodos + VM + FSU finns, inga botar seedade än. */
function freshSnapshot(): RoomsSnapshot {
  return {
    existingRooms: [RHODOS, VM_ROOM, FSU_ROOM],
    existingBotKeys: new Set<string>(),
  };
}

const PERSONAS = generatePersonas();

/* ------------------------------------------------------------------ *
 * Antal + scopning.
 * ------------------------------------------------------------------ */

describe('buildSeedPlan (antal + scopning per kohort)', () => {
  const plan = buildSeedPlan(PERSONAS, freshSnapshot(), DOMAIN);

  it('planerar ett konto per persona (240) på en frisk DB', () => {
    expect(plan.accounts).toHaveLength(240);
    expect(plan.summary.accountsToCreate).toBe(240);
  });

  it('skapar 20 nya rum (ett per använt new-room-index)', () => {
    expect(plan.newRooms).toHaveLength(20);
    expect(plan.summary.newRoomsToCreate).toBe(20);
  });

  it('per-kohort-summan stämmer (200 / 35 / 5)', () => {
    expect(plan.summary.byCohort['new-room']).toBe(200);
    expect(plan.summary.byCohort.vm2026).toBe(35);
    expect(plan.summary.byCohort.fsu).toBe(5);
  });

  it('ett medlemskap per konto (240)', () => {
    expect(plan.memberships).toHaveLength(240);
  });

  it('rapporterar ett positivt antal tips-rader (botarna tippar)', () => {
    expect(plan.summary.predictionRowsToCreate).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * VM/FSU pekar på rätt befintligt rum; new-room på nya rum.
 * ------------------------------------------------------------------ */

describe('mål-rum per kohort', () => {
  const plan = buildSeedPlan(PERSONAS, freshSnapshot(), DOMAIN);

  function membershipsForCohort(cohort: 'vm2026' | 'fsu') {
    const keys = new Set(PERSONAS.filter((p) => p.cohort === cohort).map((p) => personaKey(p)));
    return plan.memberships.filter((m) => keys.has(m.personaKey));
  }

  it('alla vm2026-botar pekar på det BEFINTLIGA VM-rummet', () => {
    const ms = membershipsForCohort('vm2026');
    expect(ms).toHaveLength(35);
    for (const m of ms) {
      expect(m.target).toEqual({ kind: 'existing', roomId: VM_ROOM.id });
    }
  });

  it('alla fsu-botar pekar på det BEFINTLIGA FSU-rummet', () => {
    const ms = membershipsForCohort('fsu');
    expect(ms).toHaveLength(5);
    for (const m of ms) {
      expect(m.target).toEqual({ kind: 'existing', roomId: FSU_ROOM.id });
    }
  });

  it('alla new-room-medlemskap pekar på NYA rum (kind new), aldrig ett befintligt id', () => {
    const newRoomKeys = new Set(
      PERSONAS.filter((p) => p.cohort === 'new-room').map((p) => personaKey(p))
    );
    const ms = plan.memberships.filter((m) => newRoomKeys.has(m.personaKey));
    for (const m of ms) {
      expect(m.target.kind).toBe('new');
    }
  });
});

/* ------------------------------------------------------------------ *
 * RHODOS RÖRS ALDRIG.
 * ------------------------------------------------------------------ */

describe('Rhodos rörs aldrig', () => {
  const plan = buildSeedPlan(PERSONAS, freshSnapshot(), DOMAIN);

  it('inget medlemskap pekar på Rhodos rum-id', () => {
    for (const m of plan.memberships) {
      if (m.target.kind === 'existing') {
        expect(m.target.roomId).not.toBe(RHODOS.id);
      }
    }
  });

  it('inget tips-paket pekar på Rhodos rum-id', () => {
    for (const p of plan.predictions) {
      if (p.target.kind === 'existing') {
        expect(p.target.roomId).not.toBe(RHODOS.id);
      }
    }
  });

  it('inget nytt rum heter Rhodos (vi skapar inget rum med skyddat namn)', () => {
    for (const r of plan.newRooms) {
      expect(r.name).not.toBe(PROTECTED_ROOM_NAME);
    }
  });

  it('fungerar även om Rhodos saknas i snapshot (kan då omöjligt röras)', () => {
    const snap: RoomsSnapshot = {
      existingRooms: [VM_ROOM, FSU_ROOM],
      existingBotKeys: new Set(),
    };
    expect(() => buildSeedPlan(PERSONAS, snap, DOMAIN)).not.toThrow();
  });

  it('VAKTEN KASTAR om ett planerat mål refererar Rhodos rum-id (F7, negativ-kontroll)', () => {
    // Bevisar att Rhodos-vakten faktiskt kan UTLÖSA (den gamla jämförde rhodos.name mot
    // mål-rumsnamnen, alltid falskt -> kunde aldrig kasta). Vi simulerar en framtida
    // mappnings-bugg: VM-rummet bär samma id som Rhodos, så vm2026-botarnas 'existing'-
    // mål pekar på det SKYDDADE id:t. Vakten ska då fail-loud:a på den färdiga planen.
    const vmRoomSharingRhodosId: ExistingRoom = { id: RHODOS.id, name: VM2026_ROOM_NAME };
    const snap: RoomsSnapshot = {
      existingRooms: [RHODOS, vmRoomSharingRhodosId, FSU_ROOM],
      existingBotKeys: new Set(),
    };
    expect(() => buildSeedPlan(PERSONAS, snap, DOMAIN)).toThrow(/SKYDDADE Rhodos-rummet/);
  });
});

/* ------------------------------------------------------------------ *
 * Idempotens.
 * ------------------------------------------------------------------ */

describe('idempotens (en andra körning skapar inga dubbletter)', () => {
  it('alla konton redan seedade -> TOM plan (inget skapas, allt hoppas över)', () => {
    const allKeys = new Set(PERSONAS.map((p) => personaKey(p)));
    const snap: RoomsSnapshot = {
      existingRooms: [RHODOS, VM_ROOM, FSU_ROOM],
      existingBotKeys: allKeys,
    };
    const plan = buildSeedPlan(PERSONAS, snap, DOMAIN);
    expect(plan.accounts).toHaveLength(0);
    expect(plan.newRooms).toHaveLength(0);
    expect(plan.memberships).toHaveLength(0);
    expect(plan.predictions).toHaveLength(0);
    expect(plan.skippedExisting).toHaveLength(240);
  });

  it('HALVA seedad -> bara den andra halvan planeras (inga dubbletter av de befintliga)', () => {
    const half = PERSONAS.slice(0, 120).map((p) => personaKey(p));
    const snap: RoomsSnapshot = {
      existingRooms: [RHODOS, VM_ROOM, FSU_ROOM],
      existingBotKeys: new Set(half),
    };
    const plan = buildSeedPlan(PERSONAS, snap, DOMAIN);
    expect(plan.accounts).toHaveLength(120);
    expect(plan.skippedExisting).toHaveLength(120);
    // Ingen planerad persona-nyckel får ligga i de redan-seedade.
    const planned = new Set(plan.accounts.map((a) => a.personaKey));
    for (const key of half) {
      expect(planned.has(key)).toBe(false);
    }
  });

  it('personaKey är stabil (samma persona -> samma nyckel, idempotens-ankaret håller)', () => {
    const a = generatePersonas();
    const b = generatePersonas();
    for (let i = 0; i < a.length; i++) {
      expect(personaKey(a[i])).toBe(personaKey(b[i]));
    }
  });
});

/* ------------------------------------------------------------------ *
 * Fail loud när ett namngivet rum saknas.
 * ------------------------------------------------------------------ */

describe('fail loud när ett namngivet mål-rum saknas', () => {
  it('kastar om VM 2026-rummet saknas men vm2026-botar finns', () => {
    const snap: RoomsSnapshot = {
      existingRooms: [RHODOS, FSU_ROOM], // inget VM-rum
      existingBotKeys: new Set(),
    };
    expect(() => buildSeedPlan(PERSONAS, snap, DOMAIN)).toThrow(new RegExp(VM2026_ROOM_NAME));
  });

  it('kastar om FSU-rummet saknas men fsu-botar finns', () => {
    const snap: RoomsSnapshot = {
      existingRooms: [RHODOS, VM_ROOM], // inget FSU-rum
      existingBotKeys: new Set(),
    };
    expect(() => buildSeedPlan(PERSONAS, snap, DOMAIN)).toThrow(/Full Stack United/);
  });

  it('kastar INTE om bara new-room-botar planeras och VM/FSU saknas', () => {
    const onlyNewRoom = PERSONAS.filter((p) => p.cohort === 'new-room');
    const snap: RoomsSnapshot = { existingRooms: [RHODOS], existingBotKeys: new Set() };
    expect(() => buildSeedPlan(onlyNewRoom, snap, DOMAIN)).not.toThrow();
  });
});

/* ------------------------------------------------------------------ *
 * LIV-LAGRET (T82 del 2): reaktioner + kommentarer i planen.
 * ------------------------------------------------------------------ */

describe('liv-lagret i planen (reaktioner + kommentarer)', () => {
  const plan = buildSeedPlan(PERSONAS, freshSnapshot(), DOMAIN);
  const botKeys = new Set(PERSONAS.map((p) => personaKey(p)));

  it('planen innehåller reaktioner (botarna reagerar) + summan stämmer', () => {
    expect(plan.reactions.length).toBeGreaterThan(0);
    expect(plan.summary.reactionsToCreate).toBe(plan.reactions.length);
  });

  it('planen innehåller kommentarer (sparsamt) + summan + svar-räkningen stämmer', () => {
    expect(plan.comments.length).toBeGreaterThan(0);
    expect(plan.summary.commentsToCreate).toBe(plan.comments.length);
    expect(plan.summary.replyComments).toBe(plan.comments.filter((c) => c.isReply).length);
  });

  it('kommentarer är FÄRRE än reaktioner (kommentar = krydda, reaktion = primärt)', () => {
    expect(plan.comments.length).toBeLessThan(plan.reactions.length);
  });

  it('varje reaktion + kommentar hör till ett PLANERAT bot-konto (scopat, ingen riktig data)', () => {
    for (const r of plan.reactions) {
      expect(botKeys.has(r.personaKey)).toBe(true);
    }
    for (const c of plan.comments) {
      expect(botKeys.has(c.personaKey)).toBe(true);
    }
  });

  it('inget liv-lager-mål pekar på ett befintligt Rhodos-id', () => {
    for (const r of plan.reactions) {
      if (r.target.kind === 'existing') {
        expect(r.target.roomId).not.toBe(RHODOS.id);
      }
    }
    for (const c of plan.comments) {
      if (c.target.kind === 'existing') {
        expect(c.target.roomId).not.toBe(RHODOS.id);
      }
    }
  });

  it('reaktioner: ingen bot reagerar två gånger på samma match i samma rum (PK-invariant)', () => {
    const seen = new Set<string>();
    for (const r of plan.reactions) {
      const targetId = r.target.kind === 'existing' ? r.target.roomId : `new#${r.target.roomIndex}`;
      const key = `${r.personaKey}|${targetId}|${r.matchId}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('svar-kommentarer ligger i en tråd som har minst en ANNAN bots primär-kommentar', () => {
    // En svar-kommentar är bara giltig om det finns en primär kommentar från en ANNAN bot
    // i samma (rum, match). Annars vore svaret påklistrat (svar i en tom/egen tråd).
    const primariesByThread = new Map<string, Set<string>>();
    for (const c of plan.comments) {
      if (c.isReply) {
        continue;
      }
      const targetId = c.target.kind === 'existing' ? c.target.roomId : `new#${c.target.roomIndex}`;
      const threadKey = `${targetId}|${c.matchId}`;
      const authors = primariesByThread.get(threadKey) ?? new Set<string>();
      authors.add(c.personaKey);
      primariesByThread.set(threadKey, authors);
    }
    const replies = plan.comments.filter((c) => c.isReply);
    for (const reply of replies) {
      const targetId =
        reply.target.kind === 'existing' ? reply.target.roomId : `new#${reply.target.roomIndex}`;
      const threadKey = `${targetId}|${reply.matchId}`;
      const authors = primariesByThread.get(threadKey);
      expect(authors).toBeDefined();
      // Det finns minst en primär-författare som INTE är svararen (någon att svara på).
      const others = [...authors!].filter((a) => a !== reply.personaKey);
      expect(others.length).toBeGreaterThan(0);
    }
  });

  it('idempotens: redan-seedade botar ger inga reaktioner/kommentarer (tom plan)', () => {
    const snap: RoomsSnapshot = {
      existingRooms: [RHODOS, VM_ROOM, FSU_ROOM],
      existingBotKeys: new Set(PERSONAS.map((p) => personaKey(p))),
    };
    const empty = buildSeedPlan(PERSONAS, snap, DOMAIN);
    expect(empty.reactions).toHaveLength(0);
    expect(empty.comments).toHaveLength(0);
  });

  it('RHODOS-VAKTEN KASTAR om en reaktion riktas mot Rhodos id (negativ-kontroll, liv-lagret)', () => {
    // VM-rummet bär Rhodos id => vm2026-botarnas reaktioner (existing-mål) pekar på det
    // SKYDDADE id:t. Vakten ska fail-loud:a på den färdiga planen (täcker nu liv-lagret).
    const vmSharingRhodosId: ExistingRoom = { id: RHODOS.id, name: VM2026_ROOM_NAME };
    const snap: RoomsSnapshot = {
      existingRooms: [RHODOS, vmSharingRhodosId, FSU_ROOM],
      existingBotKeys: new Set(),
    };
    expect(() => buildSeedPlan(PERSONAS, snap, DOMAIN)).toThrow(/SKYDDADE Rhodos-rummet/);
  });
});
