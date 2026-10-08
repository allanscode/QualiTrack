import { describe, expect, it, vi } from 'vitest';
import { guardedExternalFetch, isProductionProject } from './external-environment';

describe('staging external action guard', () => {
  const production = 'https://vpytvgpsqdapgouyjowc.supabase.co';
  const staging = 'https://njzrnwfjbmyfhemejvby.supabase.co';

  it('fails closed for any project other than production', () => {
    expect(isProductionProject(production)).toBe(true);
    expect(isProductionProject(staging)).toBe(false);
    expect(isProductionProject(undefined)).toBe(false);
    expect(isProductionProject(`${production}.evil.test`)).toBe(false);
  });

  it('allows Zendesk reads and OpenRouter requests in staging but blocks Zendesk writes', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}')) as unknown as typeof fetch;
    const guarded = guardedExternalFetch(fetcher, staging);
    await guarded('https://example.zendesk.com/api/v2/tickets/1.json');
    await guarded('https://openrouter.ai/api/v1/chat/completions', { method: 'POST' });
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(() => guarded('https://example.zendesk.com/api/v2/tickets/1.json', { method }))
        .toThrow(/bloqueada/);
    }
    expect(() => guarded('http://example.zendesk.com/api/v2/tickets/1.json', { method: 'PUT' }))
      .toThrow(/bloqueada/);
    expect(() => guarded(new Request('https://example.zendesk.com/api/v2/tickets/1.json', { method: 'POST' })))
      .toThrow(/bloqueada/);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('allows production Zendesk writes', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}')) as unknown as typeof fetch;
    await guardedExternalFetch(fetcher, production)('https://example.zendesk.com/api/v2/tickets/1.json', { method: 'PUT' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
