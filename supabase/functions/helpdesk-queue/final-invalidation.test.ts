import {describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import {processFinalPositiveInvalidation} from './final-invalidation';
import {childMacroCustomFields} from './child-macro-fields';

const envValues:Record<string,string>={ZENDESK_FINAL_SYNC_ENABLED:'true',ZENDESK_SUBDOMAIN:'example',ZENDESK_EMAIL:'worker@example.invalid',ZENDESK_API_TOKEN:'fake'};
const env=(key:string)=>envValues[key];
const fields=childMacroCustomFields('nao_conforme');
const ticket={id:123,status:'solved',updated_at:'2026-10-07T12:00:00Z',custom_fields:[]};
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
function database(authorized=true){
  const rpc=vi.fn(async(name:string)=>({error:null,data:name==='claim_final_positive_invalidation'
    ?[{id:'work',monitoria_id:'monitoria',ticket_id:'123',lease_id:'lease',attempts:1}]
    :name==='authorize_final_positive_invalidation'?authorized:true}));
  return {db:{rpc} as unknown as SupabaseClient,rpc};
}

describe('final positive invalidation worker',()=>{
  it('defaults off and cannot perform requests or claim work without explicit external-write switch',async()=>{
    const {db,rpc}=database();const fetcher=vi.fn();
    expect(await processFinalPositiveInvalidation(db,()=>undefined,fetcher)).toEqual({enabled:false,processed:0});
    expect(rpc).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
  });
  it('updates only official fields using Zendesk optimistic concurrency, without comments/tags/status changes',async()=>{
    const {db,rpc}=database();
    const fetcher=vi.fn().mockResolvedValueOnce(response({ticket})).mockResolvedValueOnce(response({ticket:{...ticket,custom_fields:fields}}));
    expect(await processFinalPositiveInvalidation(db,env,fetcher)).toMatchObject({status:'applied'});
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ticket:{custom_fields:fields,safe_update:true,updated_stamp:ticket.updated_at}});
    expect(rpc).toHaveBeenCalledWith('authorize_final_positive_invalidation',{p_id:'work',p_lease_id:'lease'});
  });
  it('does not PUT when a monitoria reopened or a newer/current decision no longer authorizes invalidation',async()=>{
    const {db}=database(false);const fetcher=vi.fn().mockResolvedValue(response({ticket}));
    expect(await processFinalPositiveInvalidation(db,env,fetcher)).toMatchObject({status:'skipped'});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(['closed','archived'])('blocks immutable %s tickets explicitly',async(status)=>{
    const {db,rpc}=database();const fetcher=vi.fn().mockResolvedValue(response({ticket:{...ticket,status}}));
    expect(await processFinalPositiveInvalidation(db,env,fetcher)).toMatchObject({status:'blocked'});
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenLastCalledWith('finish_final_positive_invalidation',expect.objectContaining({p_error:expect.stringContaining('fechado/arquivado')}));
  });
  it('recovers a prior successful but unacknowledged PUT without applying twice',async()=>{
    const {db}=database();const fetcher=vi.fn().mockResolvedValue(response({ticket:{...ticket,custom_fields:fields}}));
    expect(await processFinalPositiveInvalidation(db,env,fetcher)).toMatchObject({status:'applied'});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retries a concurrent Zendesk edit and never claims success for fields not confirmed',async()=>{
    const first=database();const conflict=vi.fn().mockResolvedValueOnce(response({ticket})).mockResolvedValueOnce(response({},409));
    expect(await processFinalPositiveInvalidation(first.db,env,conflict)).toMatchObject({status:'pending'});
    const second=database();const ignored=vi.fn().mockResolvedValueOnce(response({ticket})).mockResolvedValueOnce(response({ticket}));
    expect(await processFinalPositiveInvalidation(second.db,env,ignored)).toMatchObject({status:'pending'});
  });
});
