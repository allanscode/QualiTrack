import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { childMacroCustomFields, missingCustomFields } from './child-macro-fields.ts';

interface Work {
  id:string;monitoria_id:string;ticket_id:string;lease_id:string;attempts:number;
}
interface ZendeskTicket { id?:number;status?:string;updated_at?:string;custom_fields?:unknown }
type ResultState='applied'|'pending'|'blocked'|'skipped';

class SyncFailure extends Error {
  constructor(message:string,readonly state:ResultState) {super(message);}
}
function checkHTTP(response:Response,operation:string):void {
  if (response.ok) return;
  const retry=response.status===409 || response.status===429 || response.status>=500;
  throw new SyncFailure(`Zendesk retornou ${response.status} ao ${operation}.`,retry?'pending':'blocked');
}
function verifyTicket(ticket:ZendeskTicket|undefined,ticketId:string):asserts ticket is ZendeskTicket {
  if (!ticket || String(ticket.id)!==ticketId || typeof ticket.status!=='string'
    || !ticket.updated_at || !Number.isFinite(Date.parse(ticket.updated_at))) {
    throw new SyncFailure('Zendesk retornou um ticket incompleto; não é seguro atualizar seus campos.','blocked');
  }
}

/** Updates only the three official invalidation macro fields after a final
 * internal decision. This worker never publishes comments or executes a macro. */
export async function processFinalPositiveInvalidation(
  db:SupabaseClient,env:(key:string)=>string|undefined,fetcher:typeof fetch=fetch,
):Promise<Record<string,unknown>> {
  if (env('ZENDESK_FINAL_SYNC_ENABLED')!=='true') return {enabled:false,processed:0};
  const subdomain=env('ZENDESK_SUBDOMAIN');const email=env('ZENDESK_EMAIL');const token=env('ZENDESK_API_TOKEN');
  if (!subdomain || !/^[a-z0-9-]+$/i.test(subdomain) || !email || !token) {
    return {enabled:true,processed:0,blocked:'missing_credentials'};
  }
  const {data,error}=await db.rpc('claim_final_positive_invalidation');
  if (error) throw new Error(`Falha ao reservar sincronização final: ${error.message}`);
  const work=(data || [])[0] as Work|undefined;
  if (!work) return {enabled:true,processed:0};
  const finish=async(state:ResultState,message?:string,stamp?:string)=>{
    const result=await db.rpc('finish_final_positive_invalidation',{
      p_id:work.id,p_lease_id:work.lease_id,p_status:state,p_error:message || null,p_zendesk_updated_at:stamp || null,
    });
    if (result.error) throw new Error(`Falha ao registrar sincronização final: ${result.error.message}`);
    return {enabled:true,processed:1,ticket_id:work.ticket_id,status:result.data===true?state:'superseded'};
  };
  try {
    if (!/^\d+$/.test(work.ticket_id)) throw new SyncFailure('Número de ticket inválido.','blocked');
    const url=`https://${subdomain}.zendesk.com/api/v2/tickets/${work.ticket_id}.json`;
    const headers={Authorization:`Basic ${btoa(`${email}/token:${token}`)}`,'Content-Type':'application/json',Accept:'application/json'};
    const read=await fetcher(url,{headers,signal:AbortSignal.timeout(15000)});
    checkHTTP(read,'consultar o ticket');
    const readBody=await read.json() as {ticket?:ZendeskTicket};
    const ticket=readBody.ticket;
    verifyTicket(ticket,work.ticket_id);
    if (['closed','archived'].includes(ticket.status!.toLowerCase())) {
      return await finish('blocked','Ticket fechado/arquivado no Zendesk: os campos não foram alterados. A decisão final permanece salva.');
    }
    if (!['new','open','pending','hold','solved'].includes(ticket.status!.toLowerCase())) {
      return await finish('blocked','Status do ticket não reconhecido; confira o Zendesk antes de atualizar.');
    }
    // The database verifies final status/score, active row, latest monitoria for
    // the ticket, generation/lease and feature switch immediately before PUT.
    const authorization=await db.rpc('authorize_final_positive_invalidation',{p_id:work.id,p_lease_id:work.lease_id});
    if (authorization.error) throw new Error('Não foi possível conferir a decisão final vigente.');
    if (authorization.data!==true) return await finish('skipped','A monitoria deixou de ser a decisão final vigente; nenhuma alteração enviada.');
    const fields=childMacroCustomFields('nao_conforme');
    if (missingCustomFields(ticket.custom_fields,fields).length===0) {
      return await finish('applied',undefined,ticket.updated_at);
    }
    const update=await fetcher(url,{
      method:'PUT',headers,signal:AbortSignal.timeout(20000),
      body:JSON.stringify({ticket:{custom_fields:fields,safe_update:true,updated_stamp:ticket.updated_at}}),
    });
    checkHTTP(update,'atualizar os campos da decisão final');
    const updatedBody=await update.json() as {ticket?:ZendeskTicket};
    const updated=updatedBody.ticket;
    verifyTicket(updated,work.ticket_id);
    if (missingCustomFields(updated.custom_fields,fields).length) {
      return await finish('pending','Zendesk não confirmou todos os campos da macro; nova conferência agendada.',updated.updated_at);
    }
    return await finish('applied',undefined,updated.updated_at);
  } catch (error) {
    const state=error instanceof SyncFailure?error.state:'pending';
    const message=error instanceof Error?error.message:'Falha na sincronização final com o Zendesk.';
    return await finish(state,message);
  }
}
