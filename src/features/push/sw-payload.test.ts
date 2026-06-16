import { describe, expect, it } from 'vitest';
import { DEFAULT_PUSH_NOTIFICATION, parsePushPayload } from './sw-payload';

describe('parsePushPayload (service-worker payload-parsning)', () => {
  it('parsar en komplett {title, body, url}-payload', () => {
    const raw = JSON.stringify({ title: 'Mål!', body: 'Sverige 1-0', url: '/match/M73' });
    expect(parsePushPayload(raw)).toEqual({
      title: 'Mål!',
      body: 'Sverige 1-0',
      url: '/match/M73',
    });
  });

  it('faller till default-notisen när payloaden är null/undefined/tom (push utan data)', () => {
    expect(parsePushPayload(null)).toEqual(DEFAULT_PUSH_NOTIFICATION);
    expect(parsePushPayload(undefined)).toEqual(DEFAULT_PUSH_NOTIFICATION);
    expect(parsePushPayload('')).toEqual(DEFAULT_PUSH_NOTIFICATION);
  });

  it('faller till default-notisen på icke-JSON (kraschar ALDRIG i SW:n)', () => {
    // En kasta-krasch här skulle tappa notisen HELT och bryta userVisibleOnly-kontraktet.
    expect(parsePushPayload('inte json {{{')).toEqual(DEFAULT_PUSH_NOTIFICATION);
  });

  it('faller till default på JSON som inte är ett objekt (t.ex. en array eller siffra)', () => {
    expect(parsePushPayload('[1,2,3]')).toEqual(DEFAULT_PUSH_NOTIFICATION);
    expect(parsePushPayload('42')).toEqual(DEFAULT_PUSH_NOTIFICATION);
    expect(parsePushPayload('null')).toEqual(DEFAULT_PUSH_NOTIFICATION);
  });

  it('fyller saknade fält ur default (en delvis payload visar ändå det den har)', () => {
    const parsed = parsePushPayload(JSON.stringify({ title: 'Bara titel' }));
    expect(parsed.title).toBe('Bara titel');
    expect(parsed.body).toBe(DEFAULT_PUSH_NOTIFICATION.body);
    expect(parsed.url).toBe(DEFAULT_PUSH_NOTIFICATION.url);
  });

  it('ignorerar fält av fel typ (title: number) och faller till default för just det fältet', () => {
    const parsed = parsePushPayload(JSON.stringify({ title: 123, body: 'ok', url: '/x' }));
    expect(parsed.title).toBe(DEFAULT_PUSH_NOTIFICATION.title);
    expect(parsed.body).toBe('ok');
    expect(parsed.url).toBe('/x');
  });
});
