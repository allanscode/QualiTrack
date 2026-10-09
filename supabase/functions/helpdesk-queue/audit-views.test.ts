import { describe, expect, it, vi } from 'vitest';
import { syncQueueViewAuditExclusions, viewConditionsWithAuditExclusion } from './audit-views';

const ids = ['101', '102', '103', '104', '105'];
const views = ids.map((id) => ({ id: Number(id), title: `View ${id}`, conditions: {
  all: [{ field: 'status', operator: 'is', value: 'solved' }],
  any: [{ field: 'satisfaction', operator: 'is', value: 'good' }],
} }));
const env = (key: string) => ({
  ZENDESK_SUBDOMAIN: 'example', ZENDESK_EMAIL: 'qa@example.test', ZENDESK_API_TOKEN: 'test',
  HELPDESK_NEGATIVE_VIEW_ID: '101', HELPDESK_POSITIVE_VIEW_ID: '102',
  HELPDESK_PROACTIVE_VIEW_ID: '103', HELPDESK_CHILD_VIEW_ID: '104',
  HELPDESK_INVALID_CHILD_VIEW_ID: '105',
} as Record<string, string>)[key];
const response = (view: unknown) => new Response(JSON.stringify({ view }), { status: 200 });

describe('Zendesk queue view audit exclusions', () => {
  it('preserves existing ALL and ANY conditions, and is idempotent', () => {
    const next = viewConditionsWithAuditExclusion(views[0], 'analisado_qa')!;
    expect(next).toEqual({
      all: [...views[0].conditions.all, { field: 'current_tags', operator: 'not_includes', value: 'analisado_qa' }],
      any: views[0].conditions.any,
    });
    expect(viewConditionsWithAuditExclusion({ ...views[0], conditions: next }, 'analisado_qa')).toBeNull();
    expect(() => viewConditionsWithAuditExclusion({ id: 1, conditions: { all: [] } }, 'analisado_qa')).toThrow('completas');
  });

  it('inspects all five queues without writing', async () => {
    const fetcher = vi.fn().mockImplementation((url: string) => response(views[ids.findIndex(id => url.includes(`/views/${id}.json`))]));
    const result = await syncQueueViewAuditExclusions(env, false, fetcher);
    expect(result.views.map(view => view.queue)).toEqual(['negativas', 'positivas', 'proativas', 'filhos', 'filhos_invalidos']);
    expect(result.views.map(view => view.tag)).toEqual(['analisado_qa', 'analisado_qa', 'analisado_qa', 'qwp_filho_avaliado', 'qwp_filho_avaliado']);
    expect(result.views.every(view => !view.exclusion_confirmed && !view.changed)).toBe(true);
    expect(fetcher.mock.calls.every(([, options]) => !options?.method)).toBe(true);
  });

  it('updates only missing exclusions and confirms saved conditions', async () => {
    const updated = views.map((view, index) => ({ ...view, conditions: viewConditionsWithAuditExclusion(view,
      index < 3 ? 'analisado_qa' : 'qwp_filho_avaliado')! }));
    // Simulate Zendesk persisting the PUT before the verification GET.
    const persisted = [...views];
    const fetcher = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      const index = ids.findIndex(id => url.includes(`/views/${id}.json`));
      if (options?.method === 'PUT') {
        persisted[index] = { ...views[index], conditions: JSON.parse(String(options.body)).view };
      }
      return response(index === 3 ? updated[3] : persisted[index]);
    });
    const result = await syncQueueViewAuditExclusions(env, true, fetcher);
    expect(result.views.map(view => view.changed)).toEqual([true, true, true, false, true]);
    expect(result.views.every(view => view.exclusion_confirmed)).toBe(true);
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(4);
  });

  it('refuses to change any view when a later view has incomplete conditions', async () => {
    const fetcher = vi.fn().mockImplementation((url: string) => {
      const index = ids.findIndex(id => url.includes(`/views/${id}.json`));
      return response(index === 4 ? { id: 105, conditions: { all: [] } } : views[index]);
    });
    await expect(syncQueueViewAuditExclusions(env, true, fetcher)).rejects.toThrow('completas');
    expect(fetcher.mock.calls.every(([, options]) => !options?.method)).toBe(true);
  });

  it('removes only a deleted group exclusion rejected by Zendesk', async () => {
    const stale = { ...views[1], conditions: {
      ...views[1].conditions,
      all: [...views[1].conditions.all, { field: 'group_id', operator: 'is_not', value: '41794798833428' }],
    } };
    const persisted = [...views];
    persisted[1] = stale;
    let rejected = false;
    const fetcher = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      const index = ids.findIndex(id => url.includes(`/views/${id}.json`));
      if (options?.method === 'PUT') {
        const next = JSON.parse(String(options.body)).view;
        if (index === 1 && !rejected) {
          rejected = true;
          return new Response(JSON.stringify({ error: 'RecordInvalid', details: { base: [
            { description: 'O grupo 41794798833428 foi apagado e não pode ser usado' },
          ] } }), { status: 422 });
        }
        persisted[index] = { ...persisted[index], conditions: next };
      }
      return response(persisted[index]);
    });
    const result = await syncQueueViewAuditExclusions(env, true, fetcher);
    expect(result.views[1].removed_deleted_groups).toEqual(['41794798833428']);
    expect(persisted[1].conditions.all).toEqual([
      views[1].conditions.all[0],
      { field: 'current_tags', operator: 'not_includes', value: 'analisado_qa' },
    ]);
    expect(persisted[1].conditions.any).toEqual(views[1].conditions.any);
  });
});
