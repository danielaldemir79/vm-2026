// Brygg-tester: varje seedad rad är källhänvisad och måste stämma mot appens
// lag-id, och okända lag ger null (blockerar inte). Skarven mot appens team-refs
// bevisas: bryggans värden MÅSTE finnas som faktiska app-lag-id (annars är bryggan
// trasig, inte appen).

import { describe, expect, it } from 'vitest';
import { resolveAppTeamId, WC2026_API_TEAM_BRIDGE } from './team-bridge';
import { WC2026_TEAMS } from '../wc2026/teams';

describe('WC2026_API_TEAM_BRIDGE: seedade, källhänvisade rader', () => {
  it('mappar Nederländerna (1118) och Japan (12) ur live-all-svaret', () => {
    expect(resolveAppTeamId(1118)).toBe('ned');
    expect(resolveAppTeamId(12)).toBe('jpn');
  });

  it('mappar England (10) och Iran (22) ur 2022-fixturens svar', () => {
    expect(resolveAppTeamId(10)).toBe('eng');
    expect(resolveAppTeamId(22)).toBe('irn');
  });

  it('ger null för ett lag bryggan inte (ännu) känner (kompletteras före go-live)', () => {
    expect(resolveAppTeamId(999999)).toBeNull();
  });

  it('SKARVEN: varje brygg-värde är ett FAKTISKT app-lag-id (annars är bryggan fel)', () => {
    // Detta bevisar mappningen mot appens verkliga lag-lista, inte mot en handskriven
    // sträng i samma rymd. En felstavad kod (t.ex. "ne" i stället för "ned") failar här.
    const appTeamIds = new Set(WC2026_TEAMS.map((t) => t.id));
    for (const appId of Object.values(WC2026_API_TEAM_BRIDGE)) {
      expect(appTeamIds.has(appId), `brygg-värdet "${appId}" finns inte som app-lag-id`).toBe(true);
    }
  });

  it('är frusen (oavsiktlig mutation av en källhänvisad tabell vägras)', () => {
    expect(Object.isFrozen(WC2026_API_TEAM_BRIDGE)).toBe(true);
  });
});
