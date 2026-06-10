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
});
