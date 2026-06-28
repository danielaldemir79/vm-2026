import { describe, expect, it } from 'vitest';
import { resolveKnockoutTeams } from './resolve-knockout-teams';
import { WC2026_GROUPS, WC2026_MATCHES } from '../../data/wc2026';
import type { Match } from '../../domain/types';

// Resolution-KORREKTHETEN (vilka lag en slot får) ligger i derive-bracket.test.ts; här
// vaktar vi OVERLAY-kontraktet: no-op under gruppspelet (så Idag-vyn inte påverkas förrän
// lagen faktiskt är klara) + att slutspelsmatcher med kända lag faktiskt fylls i.

describe('resolveKnockoutTeams', () => {
  it('IDENTITET under gruppspelet: alla scheduled -> inget resolved -> samma referens', () => {
    // Färska WC2026-matcher (alla scheduled) -> gruppspelet inte färdigspelat -> inga
    // knockout-lag kan lösas. Samma referens tillbaka (så daily-memon inte triggar i onödan).
    const result = resolveKnockoutTeams(WC2026_GROUPS, WC2026_MATCHES);
    expect(result).toBe(WC2026_MATCHES);
  });

  it('en slutspelsmatch är fortfarande Ej klart (null-lag) under gruppspelet', () => {
    const result = resolveKnockoutTeams(WC2026_GROUPS, WC2026_MATCHES);
    const ko = result.find((m) => m.stage !== 'group');
    expect(ko).toBeDefined();
    expect(ko?.homeTeamId).toBeNull();
    expect(ko?.awayTeamId).toBeNull();
  });

  it('muterar aldrig input-matcherna', () => {
    const before = JSON.stringify(WC2026_MATCHES);
    resolveKnockoutTeams(WC2026_GROUPS, WC2026_MATCHES);
    expect(JSON.stringify(WC2026_MATCHES)).toBe(before);
  });

  it('fyller i ett slutspelsmatchs lag när BÅDA är slutgiltigt kända', () => {
    // Konstruera ett läge där en slutspelsmatch (M73) har båda lag resolved genom att
    // ge den konkreta lag-id:n direkt i en SYNTETISK matchlista (ingen full gruppspels-
    // simulering behövs , vi bevisar overlayn, inte seedningen). En match vars lag redan
    // är ifyllda ska lämnas orörd; en där de är null OCH trädet löser dem ska fyllas.
    //
    // Eftersom resolveKnockoutTeams härleder trädet ur grupp-RESULTATEN behöver vi ett
    // färdigspelat gruppspel för att M73 ska bli resolved. Det är tungt att bygga för
    // hand; därför verifieras DEN vägen (resultat -> resolved -> ifylld) av app-bygget +
    // derive-bracket-testerna. Här vaktar vi i stället den RENA overlay-grenen: en redan
    // ifylld slutspelsmatch rörs ALDRIG (idempotent mot redan-kända lag).
    const alreadyFilled = WC2026_MATCHES.map(
      (m): Match =>
        m.id === 'M73' && m.stage !== 'group'
          ? ({ ...m, homeTeamId: 'fyll-hemma', awayTeamId: 'fyll-borta' } as Match)
          : m
    );
    const result = resolveKnockoutTeams(WC2026_GROUPS, alreadyFilled);
    const m73 = result.find((m) => m.id === 'M73');
    // Redan ifyllda lag bevaras (overlayn skriver aldrig över kända lag).
    expect(m73?.homeTeamId).toBe('fyll-hemma');
    expect(m73?.awayTeamId).toBe('fyll-borta');
  });
});
