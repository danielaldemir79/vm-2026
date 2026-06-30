// Tester för den rena tidslinje-modellen (T86, #178). Fokus: enad kronologisk ordning över
// BLANDADE typer (mål/kort/byte/övrigt), korrekt sidning ur homeApiId (skarven), och att
// homeApiId null sidar konsekvent (ingen falsk hemma-roll utan känt id).

import { describe, expect, it } from 'vitest';
import { buildTimeline } from './match-timeline-model';
import type { LiveEvent } from '../../data/livescore';

const HOME = 10;
const AWAY = 22;

function ev(over: Partial<LiveEvent> = {}): LiveEvent {
  return {
    minute: 10,
    extra: null,
    kind: 'goal',
    rawType: 'Goal',
    detail: 'Normal Goal',
    teamApiId: HOME,
    teamName: 'England',
    playerId: 1,
    playerName: 'Skytt',
    assistId: null,
    assistName: null,
    cardColor: null,
    comments: null,
    ...over,
  };
}

describe('buildTimeline', () => {
  it('slår ihop alla typer i kronologisk ordning (minut, sedan tillägg)', () => {
    const events: LiveEvent[] = [
      ev({
        kind: 'subst',
        detail: 'Substitution 1',
        minute: 60,
        playerName: 'In',
        assistName: 'Ut',
      }),
      ev({ kind: 'goal', minute: 23, playerName: 'Tidigt mål' }),
      ev({
        kind: 'card',
        cardColor: 'yellow',
        detail: 'Yellow Card',
        minute: 45,
        extra: 2,
        playerName: 'Kort',
      }),
      ev({ kind: 'var', rawType: 'Var', detail: 'Goal cancelled', minute: 45, extra: 1 }),
      ev({ kind: 'goal', minute: 90, extra: 3, playerName: 'Sent mål' }),
    ];
    const tl = buildTimeline(events, HOME);
    expect(tl.map((e) => e.minute + (e.extra ? `+${e.extra}` : ''))).toEqual([
      '23',
      '45+1',
      '45+2',
      '60',
      '90+3',
    ]);
    expect(tl.map((e) => e.entryKind)).toEqual(['goal', 'other', 'card', 'subst', 'goal']);
  });

  it('sidar hemma/borta ur homeApiId (skarven)', () => {
    const events: LiveEvent[] = [
      ev({ teamApiId: HOME, playerName: 'H', minute: 10 }),
      ev({ teamApiId: AWAY, playerName: 'B', minute: 20 }),
    ];
    const tl = buildTimeline(events, HOME);
    expect(tl[0].side).toBe('home');
    expect(tl[1].side).toBe('away');
  });

  it('homeApiId null -> allt blir away (ingen falsk hemma-roll utan känt id)', () => {
    const tl = buildTimeline([ev({ teamApiId: HOME })], null);
    expect(tl[0].side).toBe('away');
  });

  it('tom händelse-lista -> tom tidslinje', () => {
    expect(buildTimeline([], HOME)).toEqual([]);
  });

  it('en VAR-post får entryKind "other" (inte "var"): wrapper-diskriminanten krockas inte', () => {
    // REGRESSION: MatchOtherEvent bär ett eget kind 'var', och en spread får inte skriva
    // över wrapper-diskriminanten. entryKind ska vara 'other' (wrappen), medan den inre
    // neutrala etiketten `kind` får vara 'var'. Vore diskriminanten döpt 'kind' rödnar detta.
    const tl = buildTimeline([ev({ kind: 'var', rawType: 'Var', detail: 'VAR' })], HOME);
    expect(tl[0].entryKind).toBe('other');
    expect(tl[0].entryKind === 'other' && tl[0].kind).toBe('var');
  });

  it('EXKLUDERAR straffläggnings-sparkar ur tidslinjen (de är inte mål i förloppet)', () => {
    // REGRESSION (Daniels feedback): en straffserie-spark (comments "Penalty Shootout") räknas
    // INTE som mål och ska därför aldrig dyka upp i den kronologiska tidslinjen , den ritas i en
    // egen straffsektion i stället. En MISSAD spark (detail "Missed Penalty") ska inte heller in.
    const tl = buildTimeline(
      [
        ev({ kind: 'goal', minute: 72, playerName: 'Riktigt mål' }),
        ev({
          minute: 120,
          extra: 1,
          detail: 'Penalty',
          playerName: 'Seriestraff',
          comments: 'Penalty Shootout',
        }),
        ev({
          minute: 120,
          extra: 2,
          detail: 'Missed Penalty',
          playerName: 'Missad seriestraff',
          comments: 'Penalty Shootout',
        }),
      ],
      HOME
    );
    expect(tl).toHaveLength(1);
    expect(tl[0].entryKind === 'goal' && tl[0].scorerName).toBe('Riktigt mål');
  });

  it('bevarar typ-specifika fält per post (mål: scorer, byte: in/ut)', () => {
    const events: LiveEvent[] = [
      ev({ kind: 'goal', minute: 5, playerName: 'Målis', detail: 'Penalty' }),
      ev({ kind: 'subst', minute: 70, playerName: 'In', assistName: 'Ut' }),
    ];
    const tl = buildTimeline(events, HOME);
    const goal = tl.find((e) => e.entryKind === 'goal');
    const sub = tl.find((e) => e.entryKind === 'subst');
    // Narrowa på entryKind (uttömmande union) så typ-specifika fält är åtkomliga.
    expect(goal?.entryKind === 'goal' && goal.scorerName).toBe('Målis');
    expect(goal?.entryKind === 'goal' && goal.isPenalty).toBe(true);
    expect(sub?.entryKind === 'subst' && sub.playerInName).toBe('In');
    expect(sub?.entryKind === 'subst' && sub.playerOutName).toBe('Ut');
  });
});
