import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { CHILD_AUTOMATION_FORM_ID, processChildAI } from './child-automation';
describe('child intake security and durability', () => {
  const origin = 'https://example.zendesk.com';
  const path = '/api/v2/views/123/tickets.json';
  const envValues: Record<string,string> = { ZENDESK_SUBDOMAIN:'example',ZENDESK_EMAIL:'worker@example.test',ZENDESK_API_TOKEN:'fake',OPENROUTER_API_KEY:'fake',HELPDESK_CHILD_VIEW_ID:'123' };
  function database(enabled: boolean, exhausted = false) {
    const writes: Array<{ table: string; value: unknown }> = [];
    const from = vi.fn((table: string) => {
      const builder = {
        select: () => builder, eq: () => builder,
        maybeSingle: async () => ({data:table==='positive_ai_config' ? {max_evaluations:5,executions_started:exhausted ? 5 : 0} : {enabled,auditor_id:'auditor'},error:null}),
        update: (value: unknown) => { writes.push({table,value});return builder; },
        upsert: (value: unknown) => { writes.push({table,value});return builder; },
        then: (resolve: (value: {error:null}) => unknown) => Promise.resolve({error:null}).then(resolve),
      };
      return builder;
    });
    const rpc = vi.fn(async (name: string) => ({error:null,data:name==='claim_child_ai_scan'
      ? [{id:true,enabled:true,auditor_id:'auditor',capture_cursor:null,capture_lease_id:'lease'}] : []}));
    return { db: {from,rpc} as unknown as SupabaseClient, writes, rpc };
  }
  it('does not contact Zendesk or AI when disabled or missing credentials', async () => {
    const fetcher = vi.fn();const execute=vi.fn();
    const disabled=database(false);
    expect(await processChildAI(disabled.db,key=>envValues[key],execute,fetcher)).toEqual({enabled:false,processed:0});
    expect(disabled.rpc).not.toHaveBeenCalled();
    const missing=database(true);
    expect(await processChildAI(missing.db,()=>undefined,execute,fetcher)).toMatchObject({blocked:'missing_credentials'});
    expect(fetcher).not.toHaveBeenCalled();expect(execute).not.toHaveBeenCalled();
  });
  it('captures closed child tickets independently of CSAT and persists the next page without a browser', async () => {
    const state=database(true);const execute=vi.fn();
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({tickets:[
      {id:123,status:'closed',subject:'Retido',satisfaction_rating:{score:'good'}},
      {id:124,status:'solved',satisfaction_rating:{score:'bad'}},
    ],meta:{has_more:true},links:{next:`${origin}${path}?page=2`}}),{status:200}));
    expect(await processChildAI(state.db,key=>envValues[key],execute,fetcher)).toMatchObject({captured:2,processed:0});
    const catalog=state.writes.find(write=>write.table==='queue_ticket_catalog');
    expect(catalog?.value).toEqual(expect.arrayContaining([expect.objectContaining({ticket_id:'123',queue_type:'filhos',ticket_snapshot:expect.objectContaining({status:'closed',automatic_child:true})})]));
    expect(state.writes).toContainEqual({table:'child_ai_config',value:expect.objectContaining({capture_cursor:`${origin}${path}?page=2`,capture_lease_until:null})});
    expect(execute).not.toHaveBeenCalled();
  });
  it('still attempts retained work if the current Zendesk view fails', async () => {
    const state=database(true);
    await processChildAI(state.db,key=>envValues[key],vi.fn(),vi.fn(async()=>new Response('failed',{status:503})));
    expect(state.rpc).toHaveBeenCalledWith('claim_child_ai_work');
    expect(state.writes).toContainEqual({table:'child_ai_config',value:expect.objectContaining({last_error:expect.stringContaining('503')})});
  });
  it('does not read Zendesk, claim work or call models when the shared five-item budget is exhausted', async () => {
    const state=database(true,true);const fetcher=vi.fn();const execute=vi.fn();
    expect(await processChildAI(state.db,key=>envValues[key],execute,fetcher)).toMatchObject({blocked:'environment_budget',processed:0});
    expect(fetcher).not.toHaveBeenCalled();expect(execute).not.toHaveBeenCalled();expect(state.rpc).not.toHaveBeenCalled();
  });

  it.each([true, false])('prepares the fixed child form and only executes after a durable reservation: %s', async reserved => {
    const payloads: Record<string, unknown>[] = [];
    const writes: Array<{ table: string; value: unknown }> = [];
    const rows: Record<string, unknown> = {
      child_ai_config: { enabled: true, auditor_id: 'auditor' },
      positive_ai_config: { max_evaluations: 5, executions_started: 4 },
      users: { id: 'agent', name: 'Agent', email: 'agent@example.test', primary_team_id: 'team' },
      forms: { id: CHILD_AUTOMATION_FORM_ID, title: 'Child form', sections: [] },
      teams: { name: 'Support' },
    };
    const db = {
      from: (table: string) => {
        const builder = {
          select: () => builder, eq: () => builder, ilike: () => builder,
          maybeSingle: async () => ({ data: rows[table], error: null }),
          single: async () => ({ data: rows[table], error: null }),
          update: (value: unknown) => { writes.push({ table, value }); return builder; },
          upsert: (value: unknown) => { writes.push({ table, value }); return builder; },
          then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
        };
        return builder;
      },
      rpc: async (name: string, args?: Record<string, unknown>) => {
        if (name === 'claim_child_ai_scan') return { data: [], error: null };
        if (name === 'claim_child_ai_work') return { data: [{ ticket_id: '42', ticket_snapshot: {}, auditor_id: 'auditor', lease_id: 'lease', attempts: 1 }], error: null };
        payloads.push(args!);
        return { data: reserved ? 'job' : null, error: null };
      },
    } as unknown as SupabaseClient;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method ?? 'GET').toBe('GET');
      const url = String(input);
      const body = url.includes('comments.json')
        ? { comments: [{ id: 1, author_id: 7, created_at: '2026-10-07T12:00:00Z', body: 'Opening macro evidence', public: false }] }
        : url.includes('ticket_fields.json') ? { ticket_fields: [] }
        : { ticket: { id: 42, subject: 'Technical analysis', status: 'closed', created_at: '2026-10-07T12:00:00Z', assignee_id: 7, group_id: 8, problem_id: 10, via: { channel: 'api' } },
          users: [{ id: 7, name: 'Agent', email: 'agent@example.test', role: 'agent' }], groups: [{ id: 8, name: 'N2' }] };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const execute = vi.fn(async () => new Response('{}', { status: 200 }));
    const result = await processChildAI(db, key => envValues[key], execute, fetcher);
    expect(result.processed).toBe(reserved ? 1 : 0);
    expect(execute).toHaveBeenCalledTimes(reserved ? 1 : 0);
    expect(payloads[0].p_payload).toMatchObject({
      action: 'evaluate_child_ticket', ticket_id: '42', ticket_subject: 'Technical analysis',
      draft_meta: { source_queue: 'filhos', form_id: CHILD_AUTOMATION_FORM_ID, agent_id: 'agent', team_id: 'team', channel: 'Chat' },
      ticket_fields: expect.arrayContaining([{ title: 'Chamado pai (problem_id)', value: '10' }]),
    });
    expect(writes).toContainEqual({ table: 'child_ai_queue', value: expect.objectContaining({ ticket_snapshot: expect.objectContaining({ dialogue: expect.any(Array) }) }) });
  });

});
