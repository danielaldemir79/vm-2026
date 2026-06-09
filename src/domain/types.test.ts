import { describe, expect, it } from 'vitest';
import type { FinishedMatch, LiveMatch, Match, MatchResult, ScheduledMatch } from './types';

// Typ-NIVÅ-vakt för Match-unionens kontrakt (Copilot C7/C8): kopplingen
// status mot resultat är en TYPGARANTI, inte bara en konvention. Vakterna nedan
// FAILAR bygget (tsc -b i `npm run build`) om typen någonsin luckras upp
// tillbaka till "result valfri oavsett status". De är medvetet inte
// runtime-asserts utan typ-assertions: de bevisar att varje variants `result`
// är EXAKT bunden av dess `status`, vilket är hela poängen med unionen.
//
// Mönstret är ett klassiskt typ-test: `Equal<A, B>` ger `true` bara om A och B
// är exakt samma typ. Vi skriver ett `true satisfies Equal<...>` per variant, så
// typerna faktiskt används (inga oanvända-fel) och ett brutet kontrakt blir ett
// kompileringsfel. Prettier-tåligt: inga rad-känsliga ts-expect-error-rader.

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// Ett villkor per variant: värdet `true` är bara tilldelningsbart till
// `Equal<...>` när kontraktet håller. Bryts en variants resultat-typ blir
// `Equal<...>` lika med `false`, och `true` går inte att tilldela -> build-fel.
// `satisfies` använder typerna (inga oanvända-fel) utan att skapa runtime-data.
true satisfies Equal<FinishedMatch['result'], MatchResult>;
true satisfies Equal<ScheduledMatch['result'], null>;
true satisfies Equal<LiveMatch['result'], null>;

describe('Match-unionen: status narrowar resultatet (typgaranti, inte konvention)', () => {
  it('narrowing på status === "finished" ger ett icke-null resultat', () => {
    // Runtime-spegling av typ-kontraktet: när status är 'finished' finns ett
    // resultat att läsa utan null-check. Detta är beteendet konsumenter
    // (computeStandings, UI) förlitar sig på.
    const match: Match = {
      id: 'm1',
      stage: 'group',
      groupId: 'A',
      homeTeamId: 'SWE',
      awayTeamId: 'BRA',
      kickoff: '2026-06-12T18:00:00Z',
      venue: 'Testarena',
      result: { homeGoals: 2, awayGoals: 1 },
      status: 'finished',
    };

    if (match.status === 'finished') {
      // TS vet här att result är MatchResult (icke-null), ingen ?. behövs.
      expect(match.result.homeGoals).toBe(2);
      expect(match.result.awayGoals).toBe(1);
    } else {
      throw new Error('förväntade en finished-match');
    }
  });

  it('en icke-spelad match (scheduled/live) har result === null', () => {
    const scheduled: Match = {
      id: 'm2',
      stage: 'group',
      groupId: 'A',
      homeTeamId: 'SWE',
      awayTeamId: 'BRA',
      kickoff: '2026-06-20T18:00:00Z',
      venue: 'Testarena',
      result: null,
      status: 'scheduled',
    };

    expect(scheduled.result).toBeNull();
  });
});
