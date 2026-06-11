import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VersionStamp } from './VersionStamp';
import { appCommitSha } from '../pwa/app-version';

// VIKTIGT: Vite-`define` är aktiv även i Vitest, så VersionStamp visar den RIKTIGT
// injicerade SHA:n (eller "dev"-fallbacken om inget bygge-värde fanns). Vi binder
// därför testet till appCommitSha() (samma sanning) i stället för en hårdkodad
// förväntan, så det inte blir falskt rött när SHA:n ändras mellan commits.
describe('VersionStamp', () => {
  it('renderar en version-rad med "v·"-prefix följt av bygg-SHA:n', () => {
    render(<VersionStamp />);
    expect(screen.getByText(`v·${appCommitSha()}`)).toBeInTheDocument();
  });

  it('exponerar data-app-version = den injicerade SHA:n som stabil verifierings-krok', () => {
    const { container } = render(<VersionStamp />);
    const stamp = container.querySelector('[data-app-version]');
    expect(stamp).not.toBeNull();
    expect(stamp?.getAttribute('data-app-version')).toBe(appCommitSha());
  });

  it('vidarebefordrar className så footern kan styra spacing', () => {
    const { container } = render(<VersionStamp className="mt-1" />);
    expect(container.querySelector('.mt-1')).not.toBeNull();
  });
});
