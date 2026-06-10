import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildInviteText, copyText, shareInvite } from './share-room';

describe('buildInviteText', () => {
  it('bär rummets namn och koden tydligt + länk till appen', () => {
    // jsdom ger window.location (origin http://localhost:3000 / pathname /).
    const text = buildInviteText('Vänner', 'kanin7');
    expect(text).toContain('"Vänner"');
    expect(text).toContain('Rumskod: kanin7');
    expect(text).toContain('Öppna appen:');
  });

  it('citerar rumsnamnet (så en kompis ser vilket rum det gäller)', () => {
    expect(buildInviteText('Jobbet', 'abc12')).toMatch(/Jobbet/);
  });
});

describe('copyText', () => {
  const originalClipboard = navigator.clipboard;
  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    });
  });

  it('skriver till urklipp och returnerar true vid lyckat', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await expect(copyText('hej')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hej');
  });

  it('returnerar false (inget kast) när urklipp saknas', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    await expect(copyText('hej')).resolves.toBe(false);
  });

  it('returnerar false (inget kast) när urklipp nekar behörighet', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await expect(copyText('hej')).resolves.toBe(false);
  });
});

describe('shareInvite', () => {
  const proto = Object.getPrototypeOf(navigator);
  let originalShare: unknown;
  beforeEach(() => {
    originalShare = (navigator as unknown as { share?: unknown }).share;
  });
  afterEach(() => {
    if (originalShare === undefined) {
      delete (navigator as unknown as { share?: unknown }).share;
    } else {
      Object.defineProperty(proto, 'share', { value: originalShare, configurable: true });
    }
    vi.restoreAllMocks();
  });

  it('returnerar "unsupported" när Web Share API saknas', async () => {
    delete (navigator as unknown as { share?: unknown }).share;
    await expect(shareInvite('Vänner', 'text')).resolves.toBe('unsupported');
  });

  it('returnerar "shared" när delningen lyckas', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    await expect(shareInvite('Vänner', 'text')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ text: 'text' }));
  });

  it('returnerar "failed" när användaren avbryter (AbortError) eller fel uppstår', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError'));
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    await expect(shareInvite('Vänner', 'text')).resolves.toBe('failed');
  });
});
