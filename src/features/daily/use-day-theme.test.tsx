import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Match, Team } from '../../domain/types';
import { useDayTheme } from './use-day-theme';
import { hueFromCode } from './team-hue';

function team(id: string, code: string): Team {
  return { id, name: id, code, group: 'A' };
}

function match(id: string, homeTeamId: string | null, awayTeamId: string | null): Match {
  return {
    id,
    stage: 'group',
    groupId: 'A',
    homeTeamId,
    awayTeamId,
    kickoff: '2026-06-11T16:00:00.000Z',
    venue: 'Arena',
    status: 'scheduled',
    result: null,
  };
}

function teamsMap(...teams: Team[]): ReadonlyMap<string, Team> {
  return new Map(teams.map((t) => [t.id, t]));
}

describe('useDayTheme: seam mellan härledning och dekor-yta', () => {
  it('aktiv dag -> data-day-theme="active" + --vm-day-hue satt till hue:n', () => {
    const teams = teamsMap(team('bra', 'BRA'), team('swe', 'SWE'));
    const { result } = renderHook(() => useDayTheme([match('m1', 'bra', 'swe')], teams));

    const { theme, dayThemeProps } = result.current;
    expect(theme.source).toBe('teams');
    expect(dayThemeProps['data-day-theme']).toBe('active');
    expect(dayThemeProps['data-day-theme-source']).toBe('teams');
    expect((dayThemeProps.style as Record<string, string>)['--vm-day-hue']).toBe(String(theme.hue));
  });

  it('VILODAG -> data-day-theme="default" och INGEN --vm-day-hue (faller på T2:s ton)', () => {
    const { result } = renderHook(() => useDayTheme([], teamsMap(), '2026-06-20'));

    const { dayThemeProps } = result.current;
    expect(dayThemeProps['data-day-theme']).toBe('default');
    expect(dayThemeProps['data-day-theme-source']).toBe('default');
    expect((dayThemeProps.style as Record<string, string>)['--vm-day-hue']).toBeUndefined();
  });

  it('slutspelsdag (okända lag) + datum -> source "date", hue ur datum-nyckeln', () => {
    const knockout: Match = {
      id: 'M89',
      stage: 'round-of-32',
      groupId: null,
      homeTeamId: null,
      awayTeamId: null,
      kickoff: '2026-07-01T18:00:00.000Z',
      venue: 'Arena',
      status: 'scheduled',
      result: null,
    };
    const { result } = renderHook(() => useDayTheme([knockout], teamsMap(), '2026-07-01'));

    const { dayThemeProps } = result.current;
    expect(dayThemeProps['data-day-theme']).toBe('active');
    expect(dayThemeProps['data-day-theme-source']).toBe('date');
    expect((dayThemeProps.style as Record<string, string>)['--vm-day-hue']).toBe(
      String(hueFromCode('2026-07-01'))
    );
  });

  it('memoiserar: oförändrad indata ger samma seam-objekt (ingen onödig re-render)', () => {
    const teams = teamsMap(team('bra', 'BRA'), team('swe', 'SWE'));
    const matches = [match('m1', 'bra', 'swe')];
    const { result, rerender } = renderHook(() => useDayTheme(matches, teams));
    const first = result.current.dayThemeProps;
    rerender();
    expect(result.current.dayThemeProps).toBe(first);
  });
});
