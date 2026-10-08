export interface ZendeskDemotionEvent {
  eventId: string;
  userId: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function parseZendeskDemotionEvent(value: unknown): ZendeskDemotionEvent | null {
  const body = record(value);
  const detail = record(body?.detail);
  const event = record(body?.event);
  if (body?.type !== 'zen:event-type:user.role_changed'
    || event?.current !== 'end-user'
    || !['agent', 'admin'].includes(String(event?.previous))
    || typeof detail.id !== 'string'
    || !/^\d+$/.test(detail.id)
    || body.subject !== `zen:user:${detail.id}`
    || typeof body.id !== 'string'
    || !/^[A-Za-z0-9-]{1,100}$/.test(body.id)) return null;
  return { eventId: body.id, userId: detail.id };
}

function decodeBase64(value: string): Uint8Array | null {
  try { return Uint8Array.from(atob(value), character => character.charCodeAt(0)); }
  catch { return null; }
}

export async function verifyZendeskSignature(
  secret: string,
  signature: string | null,
  timestamp: string | null,
  rawBody: string,
  now = Date.now(),
): Promise<boolean> {
  if (!secret || !signature || !timestamp || !Number.isFinite(Date.parse(timestamp))
    || Math.abs(now - Date.parse(timestamp)) > 24 * 60 * 60 * 1000) return false;
  const expected = decodeBase64(signature);
  if (!expected || expected.length !== 32) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, expected, new TextEncoder().encode(timestamp + rawBody));
}
