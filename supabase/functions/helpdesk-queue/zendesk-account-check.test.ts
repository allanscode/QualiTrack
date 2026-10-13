import { describe, expect, it, vi } from 'vitest';
import { checkMissingZendeskAccount } from './zendesk-account-check';
describe('Missing membership does not prove a missing account', () => {
  const run = (request: typeof fetch) => checkMissingZendeskAccount('https://example.zendesk.com', {}, 'agent@example.com', 'Agent Name', request);
  it.each([['agent', false, 'active_agent'], ['admin', true, 'suspended_agent'], ['end-user', false, 'end_user']])(
    'distinguishes %s accounts from nonexistent accounts', async (role, suspended, status) => {
      const request = vi.fn().mockResolvedValue(Response.json({ users: [{ id: 123, email: 'agent@example.com', role, suspended }] }));
      expect(await run(request)).toEqual({ status, zendesk_user_id: 123 });
    });
  it('requires complete email and name searches before reporting absence', async () => {
    const request = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ users: [], next_page: null })));
    expect(await run(request)).toEqual({ status: 'not_found' });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('keeps possible changed-email identities for review', async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json({ users: [] }))
      .mockResolvedValueOnce(Response.json({ users: [{ id: 123, email: 'changed@example.com' }] }));
    expect(await run(request)).toEqual({ status: 'review' });
  });
  it('never treats HTTP or pagination errors as absent accounts', async () => {
    await expect(run(vi.fn().mockResolvedValue(new Response('', { status: 429 })))).rejects.toThrow();
    await expect(run(vi.fn().mockResolvedValue(Response.json({ users: [], next_page: 'next' })))).rejects.toThrow();
  });
});
