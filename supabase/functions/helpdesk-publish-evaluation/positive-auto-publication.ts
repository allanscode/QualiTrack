import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import type { HelpdeskProvider } from './types.ts';
import { buildEvaluationHtml } from './template.ts';

type Publication = { monitoria_id: string; ticket_id: string; lease_id: string; source: 'positive_csat' | 'final_decision' | 'final_verdict' };
type Monitoria = {
  id: string; ticket_id: string; active: boolean; status: string; score: number;
  form_id: string; form_snapshot: { automation?: string; ticket_kind?: string } | null;
  evaluator_id: string; evaluator_note: string | null; satisfaction_result: string | null;
  satisfaction_has_record: boolean; satisfaction_record_text: string | null;
};
const CHILD_FORM_IDS = new Set([
  '6c7d1e88-841b-4da9-9a66-9f1464ce896f',
  '6c7d1e88-841b-4da9-9a66-9f1464ce8970',
  '6c7d1e88-841b-4da9-9a66-9f1464ce8971',
  '6c7d1e88-841b-4da9-9a66-9f1464ce8972',
  '6c7d1e88-841b-4da9-9a66-9f1464ce8973',
]);

/** Processes one durable publication. An uncertain Zendesk write is never retried automatically. */
export async function processPositiveAutoPublication(db: SupabaseClient, provider: HelpdeskProvider) {
  const { data: rows, error: claimError } = await db.rpc('claim_positive_auto_publication');
  if (claimError) throw claimError;
  const work = (rows || [])[0] as Publication | undefined;
  if (!work) return { processed: 0 };
  const finish = async (status: 'sent' | 'retry' | 'skipped' | 'uncertain', error?: string) => {
    const result = await db.rpc('finish_positive_auto_publication', {
      p_monitoria_id: work.monitoria_id, p_lease_id: work.lease_id,
      p_status: status, p_error: error || null,
    });
    if (result.error) throw result.error;
  };
  let publicationClaim: string | null = null;
  let outcome: 'positiva' | 'negativa' = 'positiva';
  try {
    const { data, error } = await db.from('monitorias')
      .select('id,ticket_id,active,status,score,form_id,evaluator_id,evaluator_note,satisfaction_result,satisfaction_has_record,satisfaction_record_text,form_snapshot')
      .eq('id',work.monitoria_id).maybeSingle();
    if (error) throw error;
    const monitoria = data as Monitoria | null;
    if (!monitoria || !monitoria.active || !['concluida','finalizada_alterada'].includes(monitoria.status)
      || !Number.isFinite(monitoria.score) || monitoria.score < 0 || monitoria.score > 100
      || CHILD_FORM_IDS.has(monitoria.form_id)
      || monitoria.form_snapshot?.ticket_kind === 'chamado_filho'
      || monitoria.form_snapshot?.automation === 'child_ticket'
      || monitoria.ticket_id?.trim() !== work.ticket_id) {
      await finish('skipped','A monitoria deixou de ser uma decisão final válida.');
      return { processed: 1, status: 'skipped', ticket_id: work.ticket_id };
    }
    const latest = await db.from('monitorias').select('id').eq('ticket_id',work.ticket_id)
      .eq('active',true).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if (latest.error) throw latest.error;
    if (latest.data?.id !== monitoria.id) {
      await finish('skipped','Existe monitoria ativa mais recente para este ticket.');
      return { processed: 1, status: 'skipped', ticket_id: work.ticket_id };
    }
    outcome = monitoria.score >= 75 ? 'positiva' : 'negativa';
    const eligibility = await provider.checkPublicationEligibility(work.ticket_id,{allowFollowUp:true});
    if (!eligibility.eligible) {
      await finish('skipped',eligibility.reason || 'Ticket indisponível para publicação no Zendesk.');
      return { processed: 1, status: 'skipped', ticket_id: work.ticket_id };
    }
    const { data: lastSent, error: receiptError } = await db.from('helpdesk_submissions')
      .select('outcome').eq('monitoria_id',monitoria.id).eq('status','sent')
      .order('created_at',{ ascending: false }).limit(1).maybeSingle();
    if (receiptError) throw receiptError;
    if (lastSent?.outcome === outcome) {
      await finish('sent');
      return { processed: 1, status: 'sent', ticket_id: work.ticket_id };
    }
    const claimed = await db.rpc('claim_helpdesk_publication', {
      p_monitoria: monitoria.id, p_caller: monitoria.evaluator_id,
      p_force: !!lastSent && lastSent.outcome !== outcome,
    });
    if (claimed.error) {
      await finish('uncertain','Envio anterior ou concorrente: confira o ticket no Zendesk.');
      return { processed: 1, status: 'uncertain', ticket_id: work.ticket_id };
    }
    if (!claimed.data) {
      await finish('uncertain','Claim encerrado sem recibo para o veredito atual. Confira o Zendesk.');
      return { processed: 1, status: 'uncertain', ticket_id: work.ticket_id };
    }
    publicationClaim = claimed.data as string;
    const finalDecision = work.source !== 'positive_csat';
    const htmlBody = buildEvaluationHtml({
      outcome, evaluatorNote: monitoria.evaluator_note,
      satisfactionRecordText: monitoria.satisfaction_has_record ? monitoria.satisfaction_record_text : null,
    });
    const { externalCommentId, externalTicketId } = await provider.publishEvaluation({
      ticketId: work.ticket_id, outcome,
      htmlBody: `${htmlBody}<p>Monitoria QWP #${monitoria.id}</p>`,
      clearPreviousInvalid: outcome === 'positiva' && (finalDecision || lastSent?.outcome === 'negativa'),
      allowFollowUp: true,
    });
    const receipt = await db.rpc('finish_helpdesk_publication', {
      p_monitoria: monitoria.id, p_claim: publicationClaim, p_provider: provider.name,
      p_ticket: externalTicketId || work.ticket_id, p_outcome: outcome, p_comment: externalCommentId, p_success: true,
    });
    if (receipt.error) {
      await finish('uncertain','Zendesk atualizado, mas o recibo não foi confirmado. Confira o ticket antes de reenviar.');
      return { processed: 1, status: 'uncertain', ticket_id: work.ticket_id };
    }
    await finish('sent');
    return { processed: 1, status: 'sent', ticket_id: work.ticket_id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (publicationClaim) {
      await db.rpc('finish_helpdesk_publication', {
        p_monitoria: work.monitoria_id, p_claim: publicationClaim, p_provider: provider.name,
        p_ticket: work.ticket_id, p_outcome: outcome, p_comment: null, p_success: false,
      });
      await finish('uncertain',message);
      return { processed: 1, status: 'uncertain', ticket_id: work.ticket_id };
    }
    await finish('retry',message);
    return { processed: 1, status: 'retry', ticket_id: work.ticket_id };
  }
}
