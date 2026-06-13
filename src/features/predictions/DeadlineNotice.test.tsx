import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeadlineNotice } from './DeadlineNotice';
import { POOL_EXTENDED_DEADLINE_ISO } from '../../data/predictions';

// DeadlineNotice (T35 #63 AC#3): säger NÄR tippningen låses, korrekt + tydligt.
// Testerna låser kontraktet: rätt svensk tid, maskinläsbar <time>, ledande ord,
// relativ etikett, och null-fail-safe (ingen tom rad utan deadline).

describe('DeadlineNotice', () => {
  it('null deadline -> renderar ingenting (ingen tom rad)', () => {
    const { container } = render(
      <DeadlineNotice deadlineIso={null} now={new Date('2026-06-10T00:00:00Z')} />
    );
    expect(container.querySelector('[data-deadline-notice]')).toBeNull();
  });

  it('visar den EXAKTA svenska tiden + relativ närhet, och <time> bär UTC-instanten', () => {
    const iso = '2026-06-13T19:00:00.000Z';
    const { container } = render(
      <DeadlineNotice deadlineIso={iso} now={new Date('2026-06-10T08:00:00Z')} />
    );
    // Den yttre raden bär data-haken; den inre spannen bär "Låses"-texten.
    const notice = container.querySelector('[data-deadline-notice]') as HTMLElement;
    expect(notice).not.toBeNull();
    expect(notice).toHaveTextContent(/Låses/);
    // Den synliga texten är svensk tid (21:00), inte UTC (19:00), och relativ "om 3 dagar".
    expect(notice).toHaveTextContent(/13 juni kl 21:00/);
    expect(notice).toHaveTextContent(/om 3 dagar/);
    // <time> bär den maskinläsbara UTC-instanten , en sanning, samma ISO som låset.
    const timeEl = notice.querySelector('time');
    expect(timeEl).not.toBeNull();
    expect(timeEl!.getAttribute('datetime')).toBe(iso);
    // data-deadline-iso bär samma ISO (design/test-hake).
    expect(notice.getAttribute('data-deadline-iso')).toBe(iso);
  });

  it('T72: grupp/champion-deadlinen (platt pool-ISO) visas som ONSDAG 17 juni kl 22:00', () => {
    // När selektorn ger den PLATTA pool-deadlinen (POOL_EXTENDED_DEADLINE_ISO) ska raden
    // säga onsdagen då omgång 1 är spelad , härlett ur SAMMA ISO som driver låset (en
    // sanning). T72 gjorde tiden platt (17/6 20:00Z), ersatte 21/6 från T67.
    const { container } = render(
      <DeadlineNotice
        deadlineIso={POOL_EXTENDED_DEADLINE_ISO}
        now={new Date('2026-06-15T08:00:00Z')}
        lead="Tippningen låses"
      />
    );
    const notice = container.querySelector('[data-deadline-notice]') as HTMLElement;
    // 20:00Z = 22:00 svensk sommartid, onsdag 17 juni.
    expect(notice).toHaveTextContent(/onsdag 17 juni kl 22:00/);
    // <time> bär exakt den platta UTC-instanten (en sanning med låset + RLS).
    expect(notice.querySelector('time')!.getAttribute('datetime')).toBe(POOL_EXTENDED_DEADLINE_ISO);
  });

  it('respekterar ett eget ledande ord (grupp: "Tippningen låses")', () => {
    render(
      <DeadlineNotice
        deadlineIso="2026-06-11T19:00:00.000Z"
        now={new Date('2026-06-11T06:00:00Z')}
        lead="Tippningen låses"
      />
    );
    expect(screen.getByText(/Tippningen låses/)).toBeInTheDocument();
    // Deadline är idag (svensk dag) -> "idag".
    expect(screen.getByText(/Tippningen låses/)).toHaveTextContent(/idag/);
  });
});
