import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { useRegisterSection } from './use-register-section';
import { SECTIONS } from './section-labels';

// Bevisar TOLERANSEN: en sektion-vy kan anropa useRegisterSection UTAN en
// SectionNavProvider (precis som vyerna renderas i isolerade tester). Då blir hooken en
// no-op och kraschar aldrig, samma kontrakt som useRoomsSync utan provider.
function ConsumerWithoutProvider() {
  useRegisterSection(SECTIONS.daily);
  return <p>renderad</p>;
}

describe('useRegisterSection, tolerant utan provider', () => {
  it('är en no-op (kraschar inte) när ingen SectionNavProvider finns', () => {
    expect(() => render(<ConsumerWithoutProvider />)).not.toThrow();
  });
});
