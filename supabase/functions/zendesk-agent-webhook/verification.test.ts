import { describe, expect, it } from 'vitest';
import { parseZendeskDemotionEvent, verifyZendeskSignature } from './verification';

const event = {
  type: 'zen:event-type:user.role_changed', id: 'event-123', subject: 'zen:user:12345',
  detail: { id: '12345', role: 'end-user' }, event: { previous: 'agent', current: 'end-user' },
};

describe('Zendesk agent demotion webhook', () => {
  it('accepts only agent/admin to end-user transitions for the same user', () => {
    expect(parseZendeskDemotionEvent(event)).toEqual({ eventId: 'event-123', userId: '12345' });
    expect(parseZendeskDemotionEvent({ ...event, event: { previous: 'end-user', current: 'agent' } })).toBeNull();
    expect(parseZendeskDemotionEvent({ ...event, subject: 'zen:user:99999' })).toBeNull();
    // Zendesk's documented sample has a detail.role that differs from event.current.
    expect(parseZendeskDemotionEvent({ ...event, detail: { id: '12345', role: 'agent' } })).toEqual({ eventId: 'event-123', userId: '12345' });
  });

  it('verifies the raw Zendesk HMAC and rejects modified or stale deliveries', async () => {
    const secret = 'test-signing-secret';
    const rawBody = JSON.stringify(event);
    const timestamp = '2026-10-08T12:00:00Z';
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key,
      new TextEncoder().encode(timestamp + rawBody)));
    const signature = btoa(String.fromCharCode(...digest));
    const now = Date.parse(timestamp);
    expect(await verifyZendeskSignature(secret, signature, timestamp, rawBody, now)).toBe(true);
    expect(await verifyZendeskSignature(secret, signature, timestamp, `${rawBody} `, now)).toBe(false);
    expect(await verifyZendeskSignature(secret, signature, timestamp, rawBody, now + 25 * 60 * 60 * 1000)).toBe(false);
  });
});
