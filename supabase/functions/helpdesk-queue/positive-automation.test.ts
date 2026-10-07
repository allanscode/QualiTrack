import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { positiveChannel, positiveCursor, processPositiveAI, selectPositiveAIForm } from './positive-automation';

const forms = [
  { id: 'final', title: 'Cliente Final', active: true, sections: [{ weight: 100, questions: [{ id: 'q1', text: 'Atendeu?' }] }] },
  { id: 'revenda', title: 'Revenda', active: true, sections: [{ weight: 100, questions: [{ id: 'q2', text: 'Atendeu?' }] }] },
];
const guidelines = [{ id: 'manual-final', title: 'Manual Cliente Final', active: true }, { id: 'manual-revenda', title: 'Manual Revenda', active: true }];

describe('automatic positive form selection', () => {
  it('uses customer tags and excludes inactive duplicate forms', () => {
    expect(selectPositiveAIForm(['cliente_final'], [...forms, { ...forms[0], id: 'old', active: false }], guidelines).form.id).toBe('final');
    expect(selectPositiveAIForm(['revenda'], forms, guidelines).guideline.id).toBe('manual-revenda');
  });
  it('requires manual review when identity of the form/manual is ambiguous', () => {
    expect(() => selectPositiveAIForm([], forms, guidelines)).toThrow('Tipo de cliente');
    expect(() => selectPositiveAIForm(['revenda','cliente_final'], forms, guidelines)).toThrow('ambíguo');
    expect(() => selectPositiveAIForm(['revenda'], forms, [guidelines[0]])).toThrow('ausente/ambíguo');
    expect(() => selectPositiveAIForm(['cliente_final'], [...forms, { ...forms[0], id: 'duplicate' }], guidelines)).toThrow('ausente/ambíguo');
  });
  it('does not accept zero-weight or empty forms for automatic completion', () => {
    expect(() => selectPositiveAIForm(['cliente_final'], [{ ...forms[0], sections: [] }], guidelines)).toThrow('pesos');
    expect(() => selectPositiveAIForm(['cliente_final'], [{ ...forms[0], sections: [{ weight: 0, questions: forms[0].sections[0].questions }] }], guidelines)).toThrow('pesos');
  });
});

describe('positive intake security and durability', () => {
  const origin = 'https://example.zendesk.com';
  const path = '/api/v2/views/123/tickets.json';
  it('never forwards Zendesk credentials to an untrusted cursor endpoint', () => {
    expect(positiveCursor(`${origin}${path}?page=2`, origin, path)).toContain('page=2');
    for (const cursor of [`https://evil.test${path}`, `${origin}/api/v2/users.json`, `https://user:pass@example.zendesk.com${path}`, `${origin}${path}#x`]) {
      expect(() => positiveCursor(cursor, origin, path)).toThrow('inválida');
    }
  });
  it('normalizes known channels and refuses to guess an unknown one', () => {
    expect(positiveChannel('native_messaging')).toBe('Chat');
    expect(positiveChannel('voice')).toBe('Telefone');
    expect(positiveChannel('whatsapp')).toBe('WhatsApp');
    expect(positiveChannel('email')).toBe('Email');
    expect(() => positiveChannel('api')).toThrow('não identificado');
  });

  const envValues: Record<string,string> = { ZENDESK_SUBDOMAIN:'example',ZENDESK_EMAIL:'worker@example.test',ZENDESK_API_TOKEN:'fake',OPENROUTER_API_KEY:'fake',HELPDESK_POSITIVE_VIEW_ID:'123' };
  function database(enabled: boolean) {
    const writes: Array<{ table: string; value: unknown }> = [];
    const from = vi.fn((table: string) => {
      const builder = {
        select: () => builder, eq: () => builder,
        maybeSingle: async () => ({data:{enabled,auditor_id:'auditor'},error:null}),
        update: (value: unknown) => { writes.push({table,value});return builder; },
        upsert: (value: unknown) => { writes.push({table,value});return builder; },
        then: (resolve: (value: {error:null}) => unknown) => Promise.resolve({error:null}).then(resolve),
      };
      return builder;
    });
    const rpc = vi.fn(async (name: string) => ({error:null,data:name==='claim_positive_ai_scan'
      ? [{id:true,enabled:true,auditor_id:'auditor',capture_cursor:null,capture_lease_id:'lease'}] : []}));
    return { db: {from,rpc} as unknown as SupabaseClient, writes, rpc };
  }
  it('does not contact Zendesk or AI when disabled or missing credentials', async () => {
    const fetcher = vi.fn();const execute=vi.fn();
    const disabled=database(false);
    expect(await processPositiveAI(disabled.db,key=>envValues[key],execute,fetcher)).toEqual({enabled:false,processed:0});
    expect(disabled.rpc).not.toHaveBeenCalled();
    const missing=database(true);
    expect(await processPositiveAI(missing.db,()=>undefined,execute,fetcher)).toMatchObject({blocked:'missing_credentials'});
    expect(fetcher).not.toHaveBeenCalled();expect(execute).not.toHaveBeenCalled();
  });
  it('captures closed positive tickets and persists the next page without a browser', async () => {
    const state=database(true);const execute=vi.fn();
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({tickets:[
      {id:123,status:'closed',subject:'Retido',satisfaction_rating:{score:'good'}},
      {id:124,status:'solved',satisfaction_rating:{score:'bad'}},
    ],meta:{has_more:true},links:{next:`${origin}${path}?page=2`}}),{status:200}));
    expect(await processPositiveAI(state.db,key=>envValues[key],execute,fetcher)).toMatchObject({captured:1,processed:0});
    const catalog=state.writes.find(write=>write.table==='queue_ticket_catalog');
    expect(catalog?.value).toEqual([expect.objectContaining({ticket_id:'123',ticket_snapshot:expect.objectContaining({status:'closed',csat_status:'good'})})]);
    expect(state.writes).toContainEqual({table:'positive_ai_config',value:expect.objectContaining({capture_cursor:`${origin}${path}?page=2`,capture_lease_until:null})});
    expect(execute).not.toHaveBeenCalled();
  });
  it('still attempts retained work if the current Zendesk view fails', async () => {
    const state=database(true);
    await processPositiveAI(state.db,key=>envValues[key],vi.fn(),vi.fn(async()=>new Response('failed',{status:503})));
    expect(state.rpc).toHaveBeenCalledWith('claim_positive_ai_work');
    expect(state.writes).toContainEqual({table:'positive_ai_config',value:expect.objectContaining({last_error:expect.stringContaining('503')})});
  });
});
