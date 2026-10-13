import { describe, expect, it, vi } from 'vitest';
import { proactiveViewWithoutClosed, syncProactiveViewStatus } from './proactive-view';

const view = { id: 123, title: 'CSAT vazio', conditions: {
  all: [
    { field: 'satisfaction_score', operator: 'is', value: 'offered' },
    { field: 'CLOSED', operator: 'less_than', value: '72' },
    { field: 'status', operator: 'is', value: 'closed' },
    { field: 'current_tags', operator: 'not_includes', value: 'analisado_qa' },
  ],
  any: [{ field: 'via_id', operator: 'is', value: '74' }],
} };
const env = (key: string) => ({
  ZENDESK_SUBDOMAIN: 'example', ZENDESK_EMAIL: 'qa@example.test', ZENDESK_API_TOKEN: 'test',
  HELPDESK_PROACTIVE_VIEW_ID: '123',
} as Record<string, string>)[key];

describe('proactive Zendesk view', () => {
  it('removes closed-only rules while preserving the other conditions', () => {
    const next = proactiveViewWithoutClosed(view)!;
    expect(next.all).toEqual([
      view.conditions.all[0], view.conditions.all[3],
      { field: 'SOLVED', operator: 'less_than', value: '72' },
      { field: 'status', operator: 'is', value: 'solved' },
    ]);
    expect(next.any).toEqual(view.conditions.any);
    expect(proactiveViewWithoutClosed({ ...view, conditions: next })).toBeNull();
    expect(() => proactiveViewWithoutClosed({ ...view, conditions: { ...view.conditions,
      all: [{ field: 'status', operator: 'is', value: 'open' }],
    } })).toThrow('mudou');
  });

  it('previews without writing and verifies the applied view', async () => {
    let stored = view;
    const fetcher = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === 'PUT') stored = { ...stored, conditions: JSON.parse(String(options.body)).view };
      return new Response(JSON.stringify({ view: stored }), { status: 200 });
    });
    const preview = await syncProactiveViewStatus(env, false, fetcher);
    expect(preview.changed).toBe(false);
    expect(preview.after?.all?.some(condition => condition.field === 'status' && condition.value === 'solved')).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const applied = await syncProactiveViewStatus(env, true, fetcher);
    expect(applied.changed).toBe(true);
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1);
    expect((await syncProactiveViewStatus(env, true, fetcher)).changed).toBe(false);
  });
});
