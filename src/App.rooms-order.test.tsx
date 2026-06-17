import {
  fireEvent,
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import App from './App.tsx';
import { ThemeProvider, THEME_ATTRIBUTE } from './theme';
import { MotionProvider } from './motion';
import { SettingsProvider, ONBOARDING_DONE_KEY } from './features/app-settings';

// T96 (#193): bevisar att RoomSection ligger ÖVERST i Tips-fliken (inte sist), END-TO-END
// genom hela app-trädet. ALLA tips-sektioner (RoomSection OCH PredictionSection m.fl.) gatar
// på rooms.enabled och renderar NULL i fixtures-läge, så vi kan inte mäta deras position via
// riktigt innehåll där. Därför MOCKAR vi de TVÅ sektioner vars inbördes ordning T96 ändrade
// (RoomSection + PredictionSection) så de blir lätta stand-ins med STABILA markörer vi kan
// ordnings-jämföra. Mocken ligger i en EGEN testfil (inte App.test.tsx) eftersom vi.mock
// hissas till hela filen.
//
// Vi spridar de FAKTISKA modulerna (importOriginal) så alla andra exporter (useRoomsSync,
// RoomsProvider, PredictionsProvider, ...) är oförändrade och resten av App monterar precis
// som vanligt , vi överstyr BARA de två sektionernas render + RoomPill (no-op här, testas
// separat). Markörerna placeras via surface-wrappern, så de sitter EXAKT där App monterar
// sektionerna i Tips-panelens flöde , ordnings-mätningen är den RIKTIGA App-källans ordning.
vi.mock('./features/rooms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./features/rooms')>();
  return {
    ...actual,
    RoomPill: () => null,
    RoomSection: ({ surface }: { surface: (children: ReactNode) => ReactNode }) =>
      surface(<div data-rooms-section-marker="">RUM</div>),
  };
});

vi.mock('./features/predictions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./features/predictions')>();
  return {
    ...actual,
    PredictionSection: ({ surface }: { surface: (children: ReactNode) => ReactNode }) =>
      surface(<div data-predictions-section-marker="">TIPS</div>),
  };
});

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  window.history.replaceState(null, '', '/');
  window.localStorage.setItem(ONBOARDING_DONE_KEY, '1');
});

function renderApp() {
  return render(
    <ThemeProvider>
      <SettingsProvider>
        <MotionProvider>
          <App />
        </MotionProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

async function waitForAppSettled() {
  await waitForElementToBeRemoved(() => {
    const loading = screen.queryAllByText(/Laddar/i);
    return loading.length > 0 ? loading : null;
  });
}

describe('App-skalet, RoomSection överst i Tips (T96, #193)', () => {
  it('renderar RoomSection FÖRE prediction-vyn i Tips-panelen (rum-valet är primärt)', async () => {
    renderApp();
    await waitForAppSettled();

    // Byt till Tips-fliken (samma väg en användare tar).
    fireEvent.click(screen.getByRole('tab', { name: 'Tips' }));

    // Båda sektions-markörerna bor i Tips-panelen (våra mockar). Vänta in att BÅDA finns,
    // läs dem sedan och jämför dokument-ordningen.
    await waitFor(() => {
      expect(document.querySelector('[data-rooms-section-marker]')).not.toBeNull();
      expect(document.querySelector('[data-predictions-section-marker]')).not.toBeNull();
    });

    const tipsPanel = document.querySelector('[data-tab-panel="tips"]');
    expect(tipsPanel).not.toBeNull();
    const roomMarker = document.querySelector('[data-rooms-section-marker]')!;
    const predictionMarker = document.querySelector('[data-predictions-section-marker]')!;
    // Båda ska ligga i Tips-panelen (bevisar att rum-sektionen faktiskt bor i Tips).
    expect(tipsPanel!.contains(roomMarker)).toBe(true);
    expect(tipsPanel!.contains(predictionMarker)).toBe(true);

    // ORDNINGS-GARANTIN (taskens kärna): RoomSection ligger FÖRE prediction-sektionen i DOM.
    // compareDocumentPosition: DOCUMENT_POSITION_FOLLOWING (4) betyder predictionMarker
    // kommer EFTER roomMarker i dokument-ordning, dvs rummet är överst , kravet.
    const relation = roomMarker.compareDocumentPosition(predictionMarker);
    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
