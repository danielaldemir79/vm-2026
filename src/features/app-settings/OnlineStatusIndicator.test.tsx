import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnlineStatusIndicator } from './OnlineStatusIndicator';

function setOnLine(value: boolean) {
  return vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OnlineStatusIndicator', () => {
  it('visar ett lugnt "Online" som status (role=status) i online-läge', () => {
    setOnLine(true);
    render(<OnlineStatusIndicator />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('data-online-status', 'online');
    expect(status).toHaveTextContent('Online');
  });

  it('visar ett ärligt offline-meddelande (appen fungerar ändå) i offline-läge', () => {
    setOnLine(false);
    render(<OnlineStatusIndicator />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('data-online-status', 'offline');
    expect(status).toHaveTextContent(/Offline.*fungerar ändå/);
  });

  it('uppdaterar texten när nät-läget växlar (event-driven)', () => {
    setOnLine(true);
    render(<OnlineStatusIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent('Online');

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status')).toHaveAttribute('data-online-status', 'offline');
  });

  // SYNK-STATUS (T14): med ett aktivt live-rum (live=true) speglar indikatorn
  // synk-läget ärligt, eftersom det nu FINNS delad server-data att synka.
  it('visar "synkad" i online-läge när ett live-rum är aktivt (live=true)', () => {
    setOnLine(true);
    render(<OnlineStatusIndicator live />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('data-sync-live', 'true');
    expect(status).toHaveTextContent(/Online, synkad/);
  });

  it('lovar synk vid återuppkoppling i offline-läge när ett live-rum är aktivt', () => {
    setOnLine(false);
    render(<OnlineStatusIndicator live />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('data-online-status', 'offline');
    // Ärligt löfte: ändringarna synkas NÄR man är online igen (T14 refetchar då).
    expect(status).toHaveTextContent(/synkas när du är online igen/);
  });

  it('faller till T13:s "fungerar ändå" utan aktivt rum (live=false), inget falskt synk-löfte', () => {
    setOnLine(false);
    render(<OnlineStatusIndicator live={false} />);
    // Utan delad data finns inget att synka, så vi lovar ingen synk-mekanik.
    expect(screen.getByRole('status')).toHaveTextContent(/fungerar ändå/);
  });
});
