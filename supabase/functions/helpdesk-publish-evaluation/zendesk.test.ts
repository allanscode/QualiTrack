import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZendeskProvider } from './zendesk';

afterEach(() => vi.unstubAllGlobals());

describe('Zendesk publication eligibility', () => {
  it('rejects a closed ticket before attempting to publish', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ticket: { status: 'closed' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new ZendeskProvider({ subdomain: 'example', email: 'agent@example.com', apiToken: 'test' });

    const result = await provider.checkPublicationEligibility('123');

    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/fechado/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/tickets/123.json');
  });

  it('allows a solved ticket to continue to publication', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ticket: { status: 'solved' } }), { status: 200 })));
    const provider = new ZendeskProvider({ subdomain: 'example', email: 'agent@example.com', apiToken: 'test' });

    expect(await provider.checkPublicationEligibility('456')).toEqual({ eligible: true });
  });
});
