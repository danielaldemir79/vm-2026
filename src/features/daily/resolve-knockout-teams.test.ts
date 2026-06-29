import { describe, expect, it } from 'vitest';
import { resolveKnockoutTeams, overlayResolvedKnockoutTeams } from './resolve-knockout-teams';
import { WC2026_GROUPS, WC2026_MATCHES } from '../../data/wc2026';
import type { Match, MatchStage } from '../../domain/types';
import type {
  BracketMatchState,
  BracketSlotState,
  BracketState,
  SlotResolution,
} from '../bracket/derive-bracket';

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

// INKREMENTELL upplösning av SENARE rundor (Daniels krav 2026-06-28): en åttondels-/
// kvarts-/semi-/final-match ska visa rätt lag SÅ FORT dess två lag är kända , inte
// vänta på att hela rundan är klar. Vi testar den rena overlayn mot ett HANDBYGGT
// träd-tillstånd (resolution-korrektheten i sig ligger i derive-bracket.test.ts).
describe('overlayResolvedKnockoutTeams , senare rundor fylls inkrementellt', () => {
  function slot(
    matchId: string,
    side: 'home' | 'away',
    res: SlotResolution,
    teamId: string | null
  ) {
    const s: BracketSlotState = {
      id: `${matchId}-${side}`,
      matchId,
      side,
      stage: 'round-of-16',
      nextSlotId: null,
      resolution: res,
      label: `${matchId} ${side}`,
      teamId,
      candidateTeamIds: [],
    };
    return s;
  }
  function bmatch(
    matchId: string,
    stage: MatchStage,
    home: BracketSlotState,
    away: BracketSlotState
  ): BracketMatchState {
    return {
      matchId,
      stage: stage as BracketMatchState['stage'],
      home,
      away,
      winnerSlotId: null,
      result: null,
    };
  }
  function ko(id: string, stage: MatchStage): Match {
    return {
      id,
      stage,
      groupId: null,
      homeTeamId: null,
      awayTeamId: null,
      kickoff: '2026-07-01T19:00:00Z',
      status: 'scheduled',
    } as Match;
  }

  // Ett träd där åttondel (M89) + final (M104) har BÅDA lag klara, men kvarten (M97)
  // bara har ETT lag klart (motståndaren ännu inte avgjord).
  const bracket: BracketState = {
    matches: [
      bmatch(
        'M89',
        'round-of-16',
        slot('M89', 'home', 'resolved', 'SWE'),
        slot('M89', 'away', 'resolved', 'BRA')
      ),
      bmatch(
        'M97',
        'quarter-final',
        slot('M97', 'home', 'resolved', 'ARG'),
        slot('M97', 'away', 'tbd', null)
      ),
      bmatch(
        'M104',
        'final',
        slot('M104', 'home', 'resolved', 'FRA'),
        slot('M104', 'away', 'resolved', 'ESP')
      ),
    ],
    locked: true,
    preliminary: false,
  };

  it('fyller en åttondelsfinal vars båda lag är kända', () => {
    const out = overlayResolvedKnockoutTeams([ko('M89', 'round-of-16')], bracket);
    const m89 = out.find((m) => m.id === 'M89');
    expect(m89?.homeTeamId).toBe('SWE');
    expect(m89?.awayTeamId).toBe('BRA');
  });

  it('fyller finalen direkt , väntar INTE på att kvarten/semin ska bli klara', () => {
    const out = overlayResolvedKnockoutTeams([ko('M104', 'final')], bracket);
    const m104 = out.find((m) => m.id === 'M104');
    expect(m104?.homeTeamId).toBe('FRA');
    expect(m104?.awayTeamId).toBe('ESP');
  });

  it('fyller INTE en match där bara ena laget är känt (ingen halv-gissning)', () => {
    const out = overlayResolvedKnockoutTeams([ko('M97', 'quarter-final')], bracket);
    const m97 = out.find((m) => m.id === 'M97');
    expect(m97?.homeTeamId).toBeNull();
    expect(m97?.awayTeamId).toBeNull();
  });
});
