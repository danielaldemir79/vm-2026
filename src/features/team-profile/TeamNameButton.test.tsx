import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TeamNameButton } from './TeamNameButton';
import { TeamProfileStub } from '../../test/team-profile-stub';

describe('TeamNameButton, klickbart lagnamn (öppnar profilen)', () => {
  it('renderar en knapp med ett tydligt aria-label och öppnar rätt lag vid klick', () => {
    const openProfile = vi.fn();
    render(
      <TeamProfileStub openProfile={openProfile}>
        <TeamNameButton teamId="swe" name="Sverige" />
      </TeamProfileStub>
    );
    const button = screen.getByRole('button', { name: /Visa lagprofil för Sverige/i });
    expect(button).toHaveAttribute('data-team-id', 'swe');
    fireEvent.click(button);
    expect(openProfile).toHaveBeenCalledWith('swe');
  });

  it('är INTE en knapp för ett okänt slutspelslag (teamId null) -> ren text', () => {
    const openProfile = vi.fn();
    render(
      <TeamProfileStub openProfile={openProfile}>
        <TeamNameButton teamId={null} name="Ej klart" />
      </TeamProfileStub>
    );
    // Ingen knapp (inget att öppna), bara texten.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Ej klart')).toBeInTheDocument();
  });

  it('renderar eget children-innehåll om sådant ges (t.ex. namn + chip)', () => {
    render(
      <TeamProfileStub>
        <TeamNameButton teamId="swe" name="Sverige">
          <span>Sverige-anpassat</span>
        </TeamNameButton>
      </TeamProfileStub>
    );
    expect(screen.getByText('Sverige-anpassat')).toBeInTheDocument();
  });
});
