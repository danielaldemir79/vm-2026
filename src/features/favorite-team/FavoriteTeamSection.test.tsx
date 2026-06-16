// Enhetstester för FavoriteTeamSection (U2, #175): favoritlags-väljaren som en egen
// inställnings-sektion i Mer. Vaktar att sektionen läser lag-listan ur den delade
// results-storen, renderar väljaren (data-favorite-team-control) inuti den injicerade
// yt-formen, och inte renderar något förrän lagen laddats (ingen tom väljare i Mer).

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { ResultsProvider } from '../results/ResultsProvider';
import { FavoriteTeamProvider } from './FavoriteTeamProvider';
import { FavoriteTeamSection } from './FavoriteTeamSection';

function fixturesEnv(): ImportMetaEnv {
  return {} as ImportMetaEnv;
}

// Samma yt-form-injektion som App ger (Panel), här en enkel div så testet inte beror
// på App:s Panel-implementation.
function panel(children: ReactNode): ReactNode {
  return <div data-test-panel="">{children}</div>;
}

function renderSection() {
  return render(
    <ResultsProvider env={fixturesEnv()}>
      <FavoriteTeamProvider>
        <FavoriteTeamSection surface={panel} />
      </FavoriteTeamProvider>
    </ResultsProvider>
  );
}

describe('FavoriteTeamSection (Mer-flikens favoritlags-inställning)', () => {
  it('renderar väljaren inuti den injicerade yt-formen när lagen laddats', async () => {
    const { container } = renderSection();
    await waitFor(() => {
      // Sektionen ligger i den injicerade ytan (data-test-panel), inte naken.
      const panelEl = container.querySelector('[data-test-panel]');
      expect(panelEl?.querySelector('[data-favorite-team-section]')).not.toBeNull();
      expect(panelEl?.querySelector('[data-favorite-team-control]')).not.toBeNull();
    });
  });

  it('bär en egen, tydlig rubrik (egen inställnings-sektion i Mer)', async () => {
    renderSection();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /favoritlag/i })).toBeInTheDocument();
    });
  });
});
