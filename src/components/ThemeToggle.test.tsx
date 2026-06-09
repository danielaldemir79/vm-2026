// Tester för tema-toggle-UI:t. Fokus: tillgänglighet + att den faktiskt växlar
// temat via motorn (useTheme), inte utseende-detaljer.
//
// Vi använder fireEvent (redan tillgängligt via @testing-library/react) i stället
// för att dra in @testing-library/user-event som extra beroende, en native
// <button> ger tangentbords-aktivering gratis (Enter/Space triggar click), så
// click-eventet täcker både mus- och tangentbordsvägen.

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '../theme';
import { ThemeToggle } from './ThemeToggle';

// Nollställ delat globalt tillstånd mellan tester: providern persistar valet i
// localStorage och sätter data-theme på <html>, så utan rensning skulle ett
// tidigare test läcka in och göra DEFAULT_THEME-antagandet falskt.
beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  );
}

describe('ThemeToggle', () => {
  it('renderas som en knapp med tillgängligt namn', () => {
    renderToggle();
    // En riktig button-roll = tangentbord + skärmläsare gratis.
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('startar i mörkt läge (aria-pressed=false) enligt DEFAULT_THEME', () => {
    renderToggle();
    const button = screen.getByRole('button');
    // aria-pressed speglar "ljust läge på/av". Default-temat är mörkt.
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAccessibleName('Byt till ljust läge');
  });

  it('växlar tema och uppdaterar aria-pressed + etikett vid klick', () => {
    renderToggle();
    const button = screen.getByRole('button');

    fireEvent.click(button);

    // Efter ett klick: ljust läge aktivt, etiketten beskriver nästa byte,
    // och motorn har speglat valet till data-theme på <html>.
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAccessibleName('Byt till mörkt läge');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it('växlar tillbaka till mörkt vid ett andra klick (idempotent toggle)', () => {
    renderToggle();
    const button = screen.getByRole('button');

    fireEvent.click(button);
    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });
});
