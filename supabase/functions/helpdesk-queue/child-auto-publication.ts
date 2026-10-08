import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { childPublicationText, CHILD_TICKET_FORM_ID, type ChildPublicationMonitoria } from './child-publication.ts';
import { childMacroCustomFields, hasCriticalChildField, missingCustomFields } from './child-macro-fields.ts';
import { childViewConditionsWithAuditExclusion, hasPublishedChildMacroForMonitoria, hasPublishedInvalidChildMacro } from './child-view.ts';
import { CHILD_AUDITED_TAG } from './queue-search.ts';

type Work = { monitoria_id: string; ticket_id: string; lease_id: string };
type Monitoria = ChildPublicationMonitoria & { form_snapshot: { automation?: string; child_ai_evaluation?: {status?: string} } | null };
type Ticket = { status?: string; tags?: string[]; updated_at?: string; custom_fields?: Array<{ id: number; value: unknown }> };
type ZendeskBody = { ticket?: Ticket; comments?: Array<{ body?: string }>; view?: { conditions?: { all?: Array<{field:string;operator:string;value?:string}>; any?: Array<{field:string;operator:string;value?:string}> } } };

/** Uses the official child-ticket fields and exit tag. Ambiguous writes stop for review. */
export async function processChildAutoPublication(
  db: SupabaseClient, env: (key: string) => string | undefined, fetcher: typeof fetch = fetch,
) {
  const { data: rows, error: claimError } = await db.rpc('claim_child_auto_publication');
  if (claimError) throw claimError;
  const work = (rows || [])[0] as Work | undefined;
  if (!work) return { processed: 0 };
  const finish = async (status: 'sent' | 'retry' | 'skipped' | 'uncertain', error?: string) => {
    const result = await db.rpc('finish_child_auto_publication', {
      p_monitoria_id: work.monitoria_id, p_lease_id: work.lease_id,
      p_status: status, p_error: error || null,
    });
    if (result.error) throw result.error;
  };
  let ticketWriteStarted = false;
  try {
    const subdomain = env('ZENDESK_SUBDOMAIN');
    const email = env('ZENDESK_EMAIL');
    const token = env('ZENDESK_API_TOKEN');
    if (!subdomain || !/^[a-z0-9-]+$/i.test(subdomain) || !email || !token) {
      throw new Error('Credenciais Zendesk indisponíveis para publicação do chamado filho.');
    }
    const base = `https://${subdomain}.zendesk.com/api/v2`;
    const headers = { Authorization: `Basic ${btoa(`${email}/token:${token}`)}`, 'Content-Type': 'application/json', Accept: 'application/json' };
    const read = async (url: string): Promise<ZendeskBody> => {
      const response = await fetcher(url, { headers, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Zendesk retornou ${response.status} ao consultar o chamado filho.`);
      return await response.json();
    };
    const { data, error } = await db.from('monitorias')
      .select('id,ticket_id,form_id,score,status,active,evaluator_id,evaluator_note,form_snapshot')
      .eq('id',work.monitoria_id).maybeSingle();
    if (error) throw error;
    const monitoria = data as Monitoria | null;
    if (!monitoria || !monitoria.active || monitoria.status !== 'concluida'
      || monitoria.form_id !== CHILD_TICKET_FORM_ID || !Number.isFinite(monitoria.score)
      || monitoria.score < 0 || monitoria.score > 100
      || monitoria.form_snapshot?.automation !== 'child_ticket'
      || monitoria.form_snapshot?.child_ai_evaluation?.status !== 'conforme'
      || monitoria.ticket_id !== work.ticket_id || !monitoria.evaluator_note?.trim()) {
      await finish('skipped','Monitoria automática de chamado filho inválida ou sem Registro do Auditor.');
      return { processed: 1, status: 'skipped', ticket_id: work.ticket_id };
    }
    const latest = await db.from('monitorias').select('id').eq('ticket_id',work.ticket_id).eq('active',true)
      .order('created_at',{ascending:false}).limit(1).maybeSingle();
    if (latest.error) throw latest.error;
    if (latest.data?.id !== monitoria.id) {
      await finish('skipped','Existe uma monitoria mais recente para este ticket.');
      return { processed: 1, status: 'skipped', ticket_id: work.ticket_id };
    }
    const catalog = await db.from('queue_ticket_catalog').select('queue_type,ticket_snapshot')
      .eq('ticket_id',work.ticket_id).in('queue_type',['filhos','filhos_invalidos']);
    if (catalog.error) throw catalog.error;
    if (!catalog.data?.length) {
      await finish('skipped','Chamado filho ausente do catálogo verificado.');
      return { processed: 1, status: 'skipped', ticket_id: work.ticket_id };
    }
    const ticketUrl = `${base}/tickets/${work.ticket_id}.json`;
    const ticket = (await read(ticketUrl)).ticket;
    if (!ticket || ['closed','archived'].includes(ticket.status?.toLowerCase() || '')) {
      await finish('skipped','Ticket fechado ou indisponível no Zendesk; monitoria permanece concluída.');
      return { processed: 1, status: 'skipped', ticket_id: work.ticket_id };
    }
    if (!Array.isArray(ticket.tags) || !ticket.updated_at) throw new Error('Zendesk não retornou tags ou versão do ticket.');

    for (const viewId of ticket.tags.includes(CHILD_AUDITED_TAG) ? []
      : new Set([env('HELPDESK_CHILD_VIEW_ID') || '47405806430228',env('HELPDESK_INVALID_CHILD_VIEW_ID') || '47656856998292'])) {
      if (!/^\d+$/.test(viewId)) throw new Error('View de chamados filhos inválida.');
      const viewUrl = `${base}/views/${viewId}.json`;
      const view = (await read(viewUrl)).view;
      const conditions = childViewConditionsWithAuditExclusion(view || {});
      if (!conditions) continue;
      const update = await fetcher(viewUrl, { method:'PUT',headers,body:JSON.stringify({view:conditions}),signal:AbortSignal.timeout(10000) });
      if (!update.ok) throw new Error(`Zendesk recusou a exclusão da view ${viewId} (${update.status}).`);
    }

    const comments = (await read(`${base}/tickets/${work.ticket_id}/comments.json?sort_order=desc&per_page=100`)).comments;
    if (!Array.isArray(comments)) throw new Error('Zendesk não retornou os comentários anteriores.');
    const alreadySent = hasPublishedChildMacroForMonitoria(comments,monitoria.id);
    const correctsPreviousInvalid = hasPublishedInvalidChildMacro(comments);
    const fields = childMacroCustomFields('conforme',hasCriticalChildField(ticket.custom_fields));
    let confirmed = ticket;
    if (!alreadySent || missingCustomFields(ticket.custom_fields,fields).length) {
      const commentText = childPublicationText(monitoria,correctsPreviousInvalid);
      ticketWriteStarted = true;
      const response = await fetcher(ticketUrl, { method:'PUT',headers,signal:AbortSignal.timeout(20000),
        body:JSON.stringify({ticket:{
          ...(alreadySent ? {} : {comment:{body:`[QualidadeWP · Chamado filho VÁLIDO]\n\n${commentText}`,public:false}}),
          custom_fields:fields,safe_update:true,updated_stamp:ticket.updated_at,
        }}),
      });
      if (!response.ok) throw new Error(`Zendesk recusou a macro do chamado filho (${response.status}).`);
      confirmed = (await response.json()).ticket;
      if (missingCustomFields(confirmed?.custom_fields,fields).length) {
        if (!confirmed?.updated_at) throw new Error('Comentário aceito, mas não foi possível conferir os campos da macro.');
        const repair = await fetcher(ticketUrl,{method:'PUT',headers,signal:AbortSignal.timeout(20000),
          body:JSON.stringify({ticket:{custom_fields:fields,safe_update:true,updated_stamp:confirmed.updated_at}})});
        if (!repair.ok) throw new Error(`Zendesk recusou o ajuste dos campos (${repair.status}).`);
        confirmed = (await repair.json()).ticket;
        if (missingCustomFields(confirmed?.custom_fields,fields).length) throw new Error('Zendesk não confirmou os campos da macro.');
      }
    }
    if (!confirmed?.updated_at || !Array.isArray(confirmed.tags)) throw new Error('Zendesk não confirmou a versão e as tags atuais.');
    if (!confirmed.tags.includes(CHILD_AUDITED_TAG)) {
      ticketWriteStarted = true;
      const tagged = await fetcher(ticketUrl,{method:'PUT',headers,signal:AbortSignal.timeout(20000),
        body:JSON.stringify({ticket:{tags:[...new Set([...confirmed.tags,CHILD_AUDITED_TAG])],
          safe_update:true,updated_stamp:confirmed.updated_at}})});
      if (!tagged.ok) throw new Error(`Zendesk recusou a tag de saída da fila (${tagged.status}).`);
      confirmed = (await tagged.json()).ticket;
      if (!Array.isArray(confirmed?.tags) || !confirmed.tags.includes(CHILD_AUDITED_TAG)) {
        throw new Error('Zendesk não confirmou a tag de saída da fila.');
      }
    }
    for (const row of catalog.data) {
      const snapshot = row.ticket_snapshot && typeof row.ticket_snapshot === 'object' ? row.ticket_snapshot : {};
      const updated = await db.from('queue_ticket_catalog').update({ticket_snapshot:{...snapshot,tags:confirmed.tags}})
        .eq('ticket_id',work.ticket_id).eq('queue_type',row.queue_type);
      if (updated.error) throw updated.error;
    }
    await finish('sent');
    return { processed: 1, status: 'sent', ticket_id: work.ticket_id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish(ticketWriteStarted ? 'uncertain' : 'retry',message);
    return { processed: 1, status: ticketWriteStarted ? 'uncertain' : 'retry', ticket_id: work.ticket_id };
  }
}
