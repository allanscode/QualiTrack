import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { buildEvaluationHtml } from '../helpdesk-publish-evaluation/template.ts';
import { childMacroCustomFields, missingCustomFields } from './child-macro-fields.ts';

type Work = { id: string; monitoria_id: string; ticket_id: string; lease_id: string };
type Ticket = { id?: number; status?: string; updated_at?: string; custom_fields?: unknown };
type Monitoria = {
  id: string; ticket_id: string; active: boolean; status: string; score: number;
  evaluator_id: string;
  satisfaction_result: string; evaluator_note: string | null;
  satisfaction_has_record: boolean; satisfaction_record_text: string | null;
};
type State = 'applied' | 'pending' | 'blocked' | 'skipped';
class SyncFailure extends Error {
  constructor(message: string, readonly state: State) { super(message); }
}
function verifyTicket(ticket: Ticket | undefined, ticketId: string): asserts ticket is Ticket {
  if (!ticket || String(ticket.id) !== ticketId || typeof ticket.status !== 'string'
    || !ticket.updated_at || !Number.isFinite(Date.parse(ticket.updated_at))) {
    throw new SyncFailure('Zendesk retornou um ticket incompleto; atualização interrompida.', 'blocked');
  }
}
function checkRead(response: Response, operation: string): void {
  if (response.ok) return;
  throw new SyncFailure(`Zendesk retornou ${response.status} ao ${operation}.`,
    response.status === 429 || response.status >= 500 ? 'pending' : 'blocked');
}

/** Publishes the auditor record after the final decision; uncertain writes stop for review. */
export async function processFinalPositiveInvalidation(
  db: SupabaseClient, env: (key: string) => string | undefined, fetcher: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  if (env('ZENDESK_FINAL_SYNC_ENABLED') !== 'true') return { enabled: false, processed: 0 };
  const subdomain = env('ZENDESK_SUBDOMAIN');
  const email = env('ZENDESK_EMAIL');
  const token = env('ZENDESK_API_TOKEN');
  if (!subdomain || !/^[a-z0-9-]+$/i.test(subdomain) || !email || !token) {
    return { enabled: true, processed: 0, blocked: 'missing_credentials' };
  }
  const { data, error } = await db.rpc('claim_final_positive_invalidation');
  if (error) throw new Error(`Falha ao reservar sincronização final: ${error.message}`);
  const work = (data || [])[0] as Work | undefined;
  if (!work) return { enabled: true, processed: 0 };
  const finish = async (state: State, message?: string, stamp?: string) => {
    const result = await db.rpc('finish_final_positive_invalidation', {
      p_id: work.id, p_lease_id: work.lease_id, p_status: state,
      p_error: message || null, p_zendesk_updated_at: stamp || null,
    });
    if (result.error) throw new Error(`Falha ao registrar sincronização final: ${result.error.message}`);
    return { enabled: true, processed: 1, ticket_id: work.ticket_id, status: result.data === true ? state : 'superseded' };
  };
  let writeStarted = false;
  let publicationClaim: string | null = null;
  try {
    if (!/^\d+$/.test(work.ticket_id)) throw new SyncFailure('Número de ticket inválido.', 'blocked');
    const { data: row, error: rowError } = await db.from('monitorias')
      .select('id,ticket_id,active,status,score,evaluator_id,satisfaction_result,evaluator_note,satisfaction_has_record,satisfaction_record_text')
      .eq('id', work.monitoria_id).maybeSingle();
    if (rowError) throw new SyncFailure('Não foi possível consultar a monitoria final.', 'pending');
    const monitoria = row as Monitoria | null;
    if (!monitoria || monitoria.id !== work.monitoria_id || monitoria.ticket_id !== work.ticket_id
      || !monitoria.active || monitoria.status !== 'concluida' || monitoria.score >= 75
      || monitoria.satisfaction_result !== 'Positiva') {
      return await finish('skipped', 'A monitoria não é mais uma invalidação final vigente.');
    }
    if (!monitoria.evaluator_note?.trim()) {
      return await finish('blocked', 'Registro do Auditor ausente na ficha.');
    }
    const { data: manualReceipt, error: receiptError } = await db.from('helpdesk_submissions')
      .select('id').eq('monitoria_id', work.monitoria_id)
      .eq('status', 'sent').limit(1).maybeSingle();
    if (receiptError) throw new SyncFailure('Não foi possível conferir publicações anteriores.', 'pending');
    const base = `https://${subdomain}.zendesk.com/api/v2/tickets/${work.ticket_id}`;
    const ticketUrl = `${base}.json`;
    const headers = {
      Authorization: `Basic ${btoa(`${email}/token:${token}`)}`,
      'Content-Type': 'application/json', Accept: 'application/json',
    };
    const read = await fetcher(ticketUrl, { headers, signal: AbortSignal.timeout(15000) });
    checkRead(read, 'consultar o ticket');
    const ticket = (await read.json() as { ticket?: Ticket }).ticket;
    verifyTicket(ticket, work.ticket_id);
    const isClosed = ticket.status!.toLowerCase() === 'closed';
    if (ticket.status!.toLowerCase() === 'archived') {
      return await finish('blocked', 'Ticket arquivado no Zendesk: a decisão final permanece salva.');
    }
    if (!['new', 'open', 'pending', 'hold', 'solved', 'closed'].includes(ticket.status!.toLowerCase())) {
      return await finish('blocked', 'Status do ticket não reconhecido.');
    }
    const marker = `Registro do Auditor da monitoria #${work.monitoria_id}`;
    const commentPath = `/api/v2/tickets/${work.ticket_id}/comments.json`;
    let nextCommentPage: string | null = `https://${subdomain}.zendesk.com${commentPath}?sort_order=desc&per_page=100`;
    // Closed Zendesk tickets can receive field-only updates, not new comments.
    // Reconcile their final evaluation fields without attempting comment writes.
    let alreadyPublished = Boolean(manualReceipt) || isClosed;
    for (let pageNumber = 0; !alreadyPublished && nextCommentPage && pageNumber < 10; pageNumber++) {
      const url = new URL(nextCommentPage);
      if (url.origin !== `https://${subdomain}.zendesk.com` || url.pathname !== commentPath) {
        throw new SyncFailure('Paginação de comentários fora do ticket esperado.', 'blocked');
      }
      const commentsResponse = await fetcher(url.toString(), {
        headers, signal: AbortSignal.timeout(15000),
      });
      checkRead(commentsResponse, 'consultar comentários');
      const page = await commentsResponse.json() as {
        comments?: Array<{ body?: string; html_body?: string }>;
        next_page?: string | null; meta?: { has_more?: boolean };
        links?: { next?: string | null };
      };
      if (!Array.isArray(page.comments)) {
        throw new SyncFailure('Zendesk não retornou os comentários anteriores.', 'blocked');
      }
      alreadyPublished = page.comments.some(comment =>
        (comment.body || '').includes(marker) || (comment.html_body || '').includes(marker));
      if (alreadyPublished) break;
      const candidate = page.meta?.has_more ? page.links?.next : page.next_page;
      if (page.meta?.has_more && !candidate) {
        throw new SyncFailure('Paginação de comentários incompleta.', 'blocked');
      }
      nextCommentPage = candidate || null;
    }
    if (!alreadyPublished && nextCommentPage) {
      throw new SyncFailure('Histórico extenso; confira se o Registro do Auditor já foi publicado.', 'blocked');
    }
    const authorization = await db.rpc('authorize_final_positive_invalidation', {
      p_id: work.id, p_lease_id: work.lease_id,
    });
    if (authorization.error) throw new SyncFailure('Não foi possível conferir a decisão final vigente.', 'pending');
    if (authorization.data !== true) {
      return await finish('skipped', 'A decisão final deixou de ser vigente; nada foi enviado.');
    }
    const fields = childMacroCustomFields('nao_conforme');
    if (alreadyPublished && missingCustomFields(ticket.custom_fields, fields).length === 0) {
      return await finish('applied', undefined, ticket.updated_at);
    }
    if (!alreadyPublished) {
      const claim = await db.rpc('claim_helpdesk_publication', {
        p_monitoria: monitoria.id, p_caller: monitoria.evaluator_id, p_force: false,
      });
      if (claim.error) throw new SyncFailure('Outra publicação está em andamento; a conferência será repetida.', 'pending');
      publicationClaim = typeof claim.data === 'string' ? claim.data : null;
      if (!publicationClaim) alreadyPublished = true;
    }
    const htmlBody = buildEvaluationHtml({
      outcome: 'negativa', evaluatorNote: monitoria.evaluator_note,
      satisfactionRecordText: monitoria.satisfaction_has_record ? monitoria.satisfaction_record_text : null,
    });
    writeStarted = true;
    const update = await fetcher(ticketUrl, {
      method: 'PUT', headers, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ ticket: {
        ...(!alreadyPublished ? { comment: { html_body: `<p>${marker}</p>${htmlBody}`, public: false } } : {}),
        custom_fields: fields, safe_update: true, updated_stamp: ticket.updated_at,
      } }),
    });
    if (update.status === 409) {
      writeStarted = false;
      if (publicationClaim) {
        const released = await db.rpc('release_helpdesk_publication_claim', {
          p_monitoria: monitoria.id, p_claim: publicationClaim,
        });
        if (released.error || released.data !== true) {
          throw new SyncFailure('Zendesk recusou a versão; a reserva não pôde ser liberada com segurança.', 'blocked');
        }
        publicationClaim = null;
      }
      throw new SyncFailure('Ticket alterado ao publicar; nova conferência agendada.', 'pending');
    }
    if (!update.ok) throw new SyncFailure(`Zendesk recusou a decisão final (${update.status}).`, 'blocked');
    const updated = (await update.json() as { ticket?: Ticket }).ticket;
    verifyTicket(updated, work.ticket_id);
    if (missingCustomFields(updated.custom_fields, fields).length) {
      if (publicationClaim) {
        await db.rpc('finish_helpdesk_publication', {
          p_monitoria: monitoria.id, p_claim: publicationClaim, p_ticket: work.ticket_id,
          p_provider: 'zendesk', p_outcome: 'negativa', p_comment: null, p_success: false,
        });
        publicationClaim = null;
      }
      return await finish('blocked', 'Comentário aceito, mas os campos da macro não foram confirmados.', updated.updated_at);
    }
    if (publicationClaim) {
      const receipt = await db.rpc('finish_helpdesk_publication', {
        p_monitoria: monitoria.id, p_claim: publicationClaim, p_ticket: work.ticket_id,
        p_provider: 'zendesk', p_outcome: 'negativa',
        p_comment: !alreadyPublished && !isClosed ? marker : `closed-fields:${work.ticket_id}`,
        p_success: true,
      });
      if (receipt.error) throw new SyncFailure('Zendesk atualizado, mas o recibo não foi confirmado.', 'blocked');
    }
    return await finish('applied', undefined, updated.updated_at);
  } catch (error) {
    if (publicationClaim) {
      await db.rpc('finish_helpdesk_publication', {
        p_monitoria: work.monitoria_id, p_claim: publicationClaim, p_ticket: work.ticket_id,
        p_provider: 'zendesk', p_outcome: 'negativa', p_comment: null, p_success: false,
      });
    }
    const state = publicationClaim ? 'blocked' : error instanceof SyncFailure ? error.state : writeStarted ? 'blocked' : 'pending';
    const message = error instanceof Error ? error.message : 'Falha na sincronização final.';
    return await finish(state, message);
  }
}
