// Tester för MatchComments (T77, #161): den HOPFÄLLDA per-match kommentar-affordansen.
// UI-beteendet: hopfälld default, aria-expanded/-controls, fäll ut/in, "Kommentarer (N)"
// vs "Kommentera", skriv/radera, säker rendering (escape), inaktivt lager döljs.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MatchComments } from './MatchComments';
import type { MatchCommentsStore } from './match-comments-context';
import type { MatchCommentThread } from './match-comments-aggregate';
import type { RoomComment } from '../../data/rooms';

// Driv komponenten via en mockad store (vi testar UI:t, inte providern). useMatchComments-
// Store returnerar vår fejk-store; threadForMatch är ren och körs mot fejkens byMatch.
const store = vi.hoisted(() => ({ current: null as MatchCommentsStore | null }));
vi.mock('./match-comments-context', () => ({
  useMatchCommentsStore: () => store.current,
}));

function comment(over: Partial<RoomComment> = {}): RoomComment {
  return {
    id: 'm1',
    userId: 'u1',
    body: 'Vilken match!',
    createdAt: '2026-06-12T20:00:00Z',
    matchId: 'g-A-1',
    ...over,
  };
}

function makeStore(over: Partial<MatchCommentsStore> = {}): MatchCommentsStore {
  return {
    enabled: true,
    status: 'ready',
    error: null,
    byMatch: new Map<string, MatchCommentThread>(),
    userId: 'me',
    nameByUser: new Map([['u1', 'Alice']]),
    addComment: vi.fn().mockResolvedValue(undefined),
    deleteComment: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

/** En byMatch-karta med EN tråd för g-A-1 ur de givna kommentarerna. */
function byMatch(comments: RoomComment[]): Map<string, MatchCommentThread> {
  return new Map([['g-A-1', { matchId: 'g-A-1', comments, count: comments.length }]]);
}

beforeEach(() => {
  vi.clearAllMocks();
  store.current = null;
});

describe('MatchComments , synlighet', () => {
  it('renderar INGET när kommentar-lagret är inaktivt (inget rum)', () => {
    store.current = makeStore({ enabled: false });
    const { container } = render(<MatchComments matchId="g-A-1" />);
    expect(container.querySelector('[data-match-comments]')).toBeNull();
  });
});

describe('MatchComments , hopfälld affordans', () => {
  it('är HOPFÄLLD default: knappen syns, tråd-panelen gör det INTE', () => {
    store.current = makeStore();
    render(<MatchComments matchId="g-A-1" />);
    const toggle = screen.getByRole('button', { name: /kommentera/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Panelen (aria-controls-målet) är inte i DOM:en när hopfälld (KISS, ej alltid-monterad).
    expect(document.querySelector('[data-match-comments-panel]')).toBeNull();
  });

  it('visar "Kommentera" vid 0 kommentarer och "Kommentarer (N)" annars', () => {
    store.current = makeStore({ byMatch: byMatch([comment(), comment({ id: 'm2' })]) });
    render(<MatchComments matchId="g-A-1" />);
    expect(screen.getByRole('button', { name: /kommentarer \(2\)/i })).toBeInTheDocument();
  });

  it('fäller UT tråden vid klick (aria-expanded true, panelen renderas, aria-controls matchar)', () => {
    store.current = makeStore({ byMatch: byMatch([comment()]) });
    render(<MatchComments matchId="g-A-1" />);
    const toggle = screen.getByRole('button', { name: /kommentarer \(1\)/i });
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = document.querySelector('[data-match-comments-panel]');
    expect(panel).not.toBeNull();
    // aria-controls knyter knappen till panelens id (WCAG 4.1.2).
    expect(toggle.getAttribute('aria-controls')).toBe(panel!.id);
  });

  it('fäller IHOP igen vid ett andra klick (panelen försvinner)', () => {
    store.current = makeStore({ byMatch: byMatch([comment()]) });
    render(<MatchComments matchId="g-A-1" />);
    const toggle = screen.getByRole('button', { name: /kommentarer \(1\)/i });
    fireEvent.click(toggle); // ut
    expect(document.querySelector('[data-match-comments-panel]')).not.toBeNull();
    fireEvent.click(toggle); // in
    expect(document.querySelector('[data-match-comments-panel]')).toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('MatchComments , tråden (utfälld)', () => {
  it('renderar matchens kommentarer med författarnamn ur medlemslistan', () => {
    store.current = makeStore({ byMatch: byMatch([comment({ body: 'Straff!' })]) });
    render(<MatchComments matchId="g-A-1" />);
    fireEvent.click(screen.getByRole('button', { name: /kommentarer/i }));
    expect(screen.getByText('Straff!')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('visar tom-hint när tråden är tom (efter utfällning)', () => {
    store.current = makeStore();
    render(<MatchComments matchId="g-A-1" />);
    fireEvent.click(screen.getByRole('button', { name: /kommentera/i }));
    expect(screen.getByText(/Var först med att snacka/i)).toBeInTheDocument();
  });

  it('en kommentar med taggig text renderas som BOKSTAVLIG text (säker rendering, ingen HTML)', () => {
    const xss = '<img src=x onerror=alert(1)>';
    store.current = makeStore({ byMatch: byMatch([comment({ body: xss })]) });
    const { container } = render(<MatchComments matchId="g-A-1" />);
    fireEvent.click(screen.getByRole('button', { name: /kommentarer/i }));
    const body = container.querySelector('[data-match-comments-body]');
    // Texten visas bokstavligt; ingen <img> injicerad i DOM:en.
    expect(body?.textContent).toBe(xss);
    expect(container.querySelector('img')).toBeNull();
  });

  it('Radera-knappen visas BARA på MINA rader och anropar deleteComment med id', () => {
    const del = vi.fn().mockResolvedValue(undefined);
    store.current = makeStore({
      deleteComment: del,
      byMatch: byMatch([
        comment({ id: 'mine', userId: 'me', body: 'Min rad' }),
        comment({ id: 'other', userId: 'u1', body: 'Annans rad' }),
      ]),
    });
    render(<MatchComments matchId="g-A-1" />);
    fireEvent.click(screen.getByRole('button', { name: /kommentarer/i }));

    // Exakt EN radera-knapp (bara min rad bär den).
    const deletes = screen.getAllByRole('button', { name: 'Radera min kommentar' });
    expect(deletes).toHaveLength(1);
    fireEvent.click(deletes[0]);
    expect(del).toHaveBeenCalledWith('mine');
  });
});

describe('MatchComments , skriv', () => {
  it('skickar en kommentar i RÄTT match-tråd och tömmer fältet', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    store.current = makeStore({ addComment: add });
    render(<MatchComments matchId="g-A-1" />);
    fireEvent.click(screen.getByRole('button', { name: /kommentera/i }));

    const input = document.querySelector('[data-match-comments-input]') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Heja!' } });
    await act(async () => {
      fireEvent.submit(input.closest('form')!);
    });
    expect(add).toHaveBeenCalledWith('g-A-1', 'Heja!');
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('skicka-knappen är disabled på tom/whitespace-text', () => {
    store.current = makeStore();
    render(<MatchComments matchId="g-A-1" />);
    fireEvent.click(screen.getByRole('button', { name: /kommentera/i }));
    const send = document.querySelector('[data-match-comments-send]') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    const input = document.querySelector('[data-match-comments-input]') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '   ' } });
    expect(send.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'ok' } });
    expect(send.disabled).toBe(false);
  });

  it('visar ett fel-meddelande om skickningen kastar (fail loud i UI)', async () => {
    const add = vi.fn().mockRejectedValue(new Error('RLS nekade'));
    store.current = makeStore({ addComment: add });
    render(<MatchComments matchId="g-A-1" />);
    fireEvent.click(screen.getByRole('button', { name: /kommentera/i }));
    const input = document.querySelector('[data-match-comments-input]') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Heja!' } });
    await act(async () => {
      fireEvent.submit(input.closest('form')!);
    });
    expect(screen.getByText('RLS nekade')).toBeInTheDocument();
  });
});
