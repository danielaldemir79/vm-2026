// Tester för "LIVE NU"-fältet (Bit 3c): topp-fältets primära block när en match pågår.
// Bevisar:
//   - tom lista -> renderar INGET (vyn behåller sitt vanliga topp-fält),
//   - en live-match -> ett fokus-livekort + en status-räknare, i en etiketterad region,
//   - flera live -> fokus-kortet + kompakta "fler live"-rader, klick byter fokus-match,
//   - klockan i fokus-kortet TICKAR (now nära sync, så live-känslan faktiskt syns),
//   - a11y: region-namn "Live nu", raderna är riktiga knappar.
//
// `now` injiceras så klock-grenen är deterministisk (samma princip som LiveMatchCard-
// testerna), och så att fokus-kortet bevisas TICKA i stället för att slå i halvleks-taket.

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Match, Team } from '../../domain/types';
import type { LiveData } from '../../data/livescore';
import { LiveNowSection } from './LiveNowSection';
import type { LiveFeedEntry } from './live-feed';

const SYNC = '2026-06-15T18:00:00.000Z';
const SYNC_MS = Date.parse(SYNC);

const teams: Team[] = [
  { id: 'ned', name: 'Nederländerna', code: 'NED', group: 'F' } as Team,
  { id: 'jpn', name: 'Japan', code: 'JPN', group: 'F' } as Team,
  { id: 'bra', name: 'Brasilien', code: 'BRA', group: 'G' } as Team,
  { id: 'srb', name: 'Serbien', code: 'SRB', group: 'G' } as Team,
];
const teamsById = new Map(teams.map((t) => [t.id, t]));

function match(id: string, home: string, away: string): Match {
  return {
    id,
    stage: 'group',
    groupId: 'F',
    homeTeamId: home,
    awayTeamId: away,
    kickoff: '2026-06-15T17:00:00.000Z',
    venue: 'Arena',
    tvChannel: 'TV4',
    result: null,
    status: 'live',
  } as Match;
}

function live(matchId: string, over: Partial<LiveData> = {}): LiveData {
  return {
    matchId,
    apiFixtureId: 1,
    status: 'live',
    elapsedMinute: 30,
    homeGoals: 1,
    awayGoals: 0,
    events: [],
    statistics: [],
    lineups: [],
    frozen: false,
    lastSyncedAt: SYNC,
    ...over,
  };
}

function entry(
  id: string,
  home: string,
  away: string,
  over: Partial<LiveData> = {}
): LiveFeedEntry {
  const m = match(id, home, away);
  return {
    match: m,
    live: live(id, over),
    homeName: teamsById.get(home)?.name ?? '',
    awayName: teamsById.get(away)?.name ?? '',
  };
}

describe('LiveNowSection, tomt läge', () => {
  it('renderar INGET när inga matcher pågår', () => {
    const { container } = render(<LiveNowSection entries={[]} now={SYNC_MS} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('LiveNowSection, en pågående match', () => {
  it('leder med ett fokus-livekort i en etiketterad "Live nu"-region', () => {
    render(<LiveNowSection entries={[entry('g-F-1', 'ned', 'jpn')]} now={SYNC_MS} />);

    const region = screen.getByRole('region', { name: /live nu/i });
    expect(region).toBeInTheDocument();
    // Fokus-kortet (LiveMatchCard) renderas inuti, med rätt lagnamn.
    const card = within(region).getByRole('region', { name: /nederländerna/i });
    expect(card).toBeInTheDocument();
  });

  it('annonserar att EN match pågår (status-räknare)', () => {
    render(<LiveNowSection entries={[entry('g-F-1', 'ned', 'jpn')]} now={SYNC_MS} />);
    expect(screen.getByText(/en match pågår just nu/i)).toBeInTheDocument();
  });

  it('visar INGA "fler live"-rader när bara en match pågår', () => {
    const { container } = render(
      <LiveNowSection entries={[entry('g-F-1', 'ned', 'jpn')]} now={SYNC_MS} />
    );
    expect(container.querySelector('[data-live-now-others]')).toBeNull();
  });

  it('fokus-kortets klocka TICKAR (now nära sync, live-känslan syns)', () => {
    const { container } = render(
      <LiveNowSection
        entries={[entry('g-F-1', 'ned', 'jpn', { elapsedMinute: 30 })]}
        now={SYNC_MS + 60_000}
      />
    );
    // data-live-ticking sätts av LiveMatchCard bara när klockan faktiskt tickar (live +
    // inte vid halvleks-taket). 30 + 1 min sedan sync = 31' < 45 -> tickar.
    const card = container.querySelector('[data-live-card][data-live-ticking]');
    expect(card).not.toBeNull();
  });
});

describe('LiveNowSection, flera pågående matcher', () => {
  const entries = [
    entry('g-F-1', 'ned', 'jpn'), // live, kickoff lika -> id-ordning, först
    entry('g-G-1', 'bra', 'srb', { status: 'paused' }), // paus -> efter
  ];

  it('visar fokus-kortet + kompakta "fler live"-rader för övriga', () => {
    const { container } = render(<LiveNowSection entries={entries} now={SYNC_MS} />);

    // Räknaren säger 2 matcher.
    expect(screen.getByText(/2 matcher pågår just nu/i)).toBeInTheDocument();
    // En "fler live"-sektion finns, med EN rad-knapp (den icke-fokuserade matchen).
    const others = container.querySelector('[data-live-now-others]');
    expect(others).not.toBeNull();
    const rows = container.querySelectorAll('[data-live-now-row]');
    expect(rows).toHaveLength(1);
  });

  it('klick på en "fler live"-rad lyfter dess match till fokus-platsen', () => {
    const { container } = render(<LiveNowSection entries={entries} now={SYNC_MS} />);

    // Fokus är default den mest relevanta (ned-jpn, live). Den andra matchen (Brasilien)
    // står som en rad-knapp.
    const rowButton = screen.getByRole('button', { name: /brasilien/i });
    fireEvent.click(rowButton);

    // Efter klick: fokus-kortet visar Brasilien-matchen, och ned-jpn flyttas till en rad.
    const focusCard = container.querySelector(
      '[data-live-now] > div > [data-live-card], [data-live-now] [data-live-card]'
    );
    expect(focusCard).not.toBeNull();
    // Den nu fokuserade matchens kort har Brasilien som tillgängligt namn.
    expect(screen.getByRole('region', { name: /brasilien/i })).toBeInTheDocument();
    // ned-jpn finns nu som en rad-knapp i stället.
    expect(screen.getByRole('button', { name: /nederländerna/i })).toBeInTheDocument();
  });

  it('rad-knapparna är riktiga knappar (tangentbord/fokus)', () => {
    render(<LiveNowSection entries={entries} now={SYNC_MS} />);
    const rowButton = screen.getByRole('button', { name: /brasilien/i });
    expect(rowButton.tagName).toBe('BUTTON');
    expect(rowButton).toHaveAttribute('aria-pressed', 'false');
  });
});
