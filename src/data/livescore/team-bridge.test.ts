// Brygg-tester: den FULLA 48/48-bryggan är källhänvisad och måste stämma mot appens
// 48 lag-id (och bara dem), och okända lag ger null (gissas aldrig). Skarven mot appens
// team-refs bevisas: bryggans värden MÅSTE finnas som faktiska app-lag-id, och VARJE
// app-lag ska täckas (annars är bryggan ofullständig och en VM-fixture skulle hoppas).

import { describe, expect, it } from 'vitest';
import { resolveApiTeamId, resolveAppTeamId, WC2026_API_TEAM_BRIDGE } from './team-bridge';
import { WC2026_TEAMS } from '../wc2026/teams';

describe('WC2026_API_TEAM_BRIDGE: full 48/48, källhänvisad', () => {
  it('mappar ett stickprov av källhänvisade rader (API-id -> app-lag-id)', () => {
    // Stickprov ur de 48 (källhänvisade i decisions.md 2026-06-15). Ett byte här
    // failar mot källan, så raderna kan BEKRÄFTAS, inte bara antas.
    expect(resolveAppTeamId(1118)).toBe('ned');
    expect(resolveAppTeamId(12)).toBe('jpn');
    expect(resolveAppTeamId(5)).toBe('swe');
    expect(resolveAppTeamId(26)).toBe('arg');
    expect(resolveAppTeamId(2)).toBe('fra');
    expect(resolveAppTeamId(10)).toBe('eng');
    // De två kod-avvikande men entydiga (cuw/cod), uttryckligen vaktade:
    expect(resolveAppTeamId(5530)).toBe('cuw');
    expect(resolveAppTeamId(1508)).toBe('cod');
  });

  it('ger null för ett lag bryggan inte känner (ej med i VM 2026)', () => {
    expect(resolveAppTeamId(999999)).toBeNull();
  });

  it('SKARVEN: varje brygg-värde är ett FAKTISKT app-lag-id (annars är bryggan fel)', () => {
    // Bevisar mappningen mot appens verkliga lag-lista, inte mot en handskriven
    // sträng. En felstavad kod (t.ex. "ne" i stället för "ned") failar här.
    const appTeamIds = new Set(WC2026_TEAMS.map((t) => t.id));
    for (const appId of Object.values(WC2026_API_TEAM_BRIDGE)) {
      expect(appTeamIds.has(appId), `brygg-värdet "${appId}" finns inte som app-lag-id`).toBe(true);
    }
  });

  it('TÄCKNING: alla 48 app-lag finns i bryggan (full täckning, inget VM-lag saknas)', () => {
    // Full täckning är poängen med Bit 2: inget VM-lag får sakna sin API-id, annars
    // skulle dess live-fixture hoppas. En till/borttagen rad failar här.
    expect(WC2026_TEAMS).toHaveLength(48);
    const bridgedAppIds = new Set(Object.values(WC2026_API_TEAM_BRIDGE));
    expect(bridgedAppIds.size).toBe(48); // 48 unika app-id (inga dubbletter)
    for (const team of WC2026_TEAMS) {
      expect(bridgedAppIds.has(team.id), `app-laget "${team.id}" saknas i bryggan`).toBe(true);
    }
  });

  it('är BIJEKTIV: 48 unika API-id <-> 48 unika app-id (ingen kollision)', () => {
    const apiIds = Object.keys(WC2026_API_TEAM_BRIDGE);
    expect(apiIds).toHaveLength(48);
    expect(new Set(apiIds).size).toBe(48);
  });

  it('omvänd uppslag (resolveApiTeamId) är invers av resolveAppTeamId för varje lag', () => {
    for (const team of WC2026_TEAMS) {
      const apiId = resolveApiTeamId(team.id);
      expect(apiId, `inget API-id för app-laget "${team.id}"`).not.toBeNull();
      // Rundtur: app-id -> API-id -> app-id ger samma lag (bevisar inversen).
      expect(resolveAppTeamId(apiId as number)).toBe(team.id);
    }
    expect(resolveApiTeamId('xyz')).toBeNull();
  });

  it('är frusen (oavsiktlig mutation av en källhänvisad tabell vägras)', () => {
    expect(Object.isFrozen(WC2026_API_TEAM_BRIDGE)).toBe(true);
  });
});
