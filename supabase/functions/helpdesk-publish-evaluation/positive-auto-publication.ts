import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import type { HelpdeskProvider } from './types.ts';
import { buildEvaluationHtml } from './template.ts';

type Publication = { monitoria_id: string; ticket_id: string; lease_id: string };
type Monitoria = {
  id: string; ticket_id: string; active: boolean; status: string; score: number;
  evaluator_id: string; evaluator_note: string | null; satisfaction_result: string | null;
  satisfaction_has_record: boolean; satisfaction_record_text: string | null;
  form_snapshot: { automation?: string } | null;
};

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
  try {
    const { data, error } = await db.from('monitorias')
      .select('id,ticket_id,active,status,score,evaluator_id,evaluator_note,satisfaction_result,satisfaction_has_record,satisfaction_record_text,form_snapshot')
      .eq('id',work.monitoria_id).maybeSingle();
    if (error) throw error;
    const monitoria = data as Monitoria | null;
    if (!monitoria || !monitoria.active || monitoria.status !== 'concluida'
      || monitoria.score < 75 || monitoria.score > 100 || monitoria.satisfaction_result !== 'Positiva'
      || monitoria.form_snapshot?.automation !== 'positive_csat'
      || monitoria.ticket_id !== work.ticket_id) {
      await finish('skipped','A monitoria deixou de ser uma positiva concluída válida.');
      return { processed: 1, status: 'skipped', ticket_id: work.ticket_id };
    }
    const eligibility = await provider.checkPublicationEligibility(work.ticket_id);
    if (!eligibility.eligible) {
      await finish('skipped',eligibility.reason || 'Ticket indisponível para publicação no Zendesk.');
      return { processed: 1, status: 'skipped', ticket_id: work.ticket_id };
    }
    const claimed = await db.rpc('claim_helpdesk_publication', {
      p_monitoria: monitoria.id, p_caller: monitoria.evaluator_id, p_force: false,
    });
    if (claimed.error) {
      await finish('uncertain','Envio anterior ou concorrente: confira o ticket no Zendesk.');
      return { processed: 1, status: 'uncertain', ticket_id: work.ticket_id };
    }
    if (!claimed.data) {
      await finish('sent');
      return { processed: 1, status: 'sent', ticket_id: work.ticket_id };
    }
    publicationClaim = claimed.data as string;
    const htmlBody = buildEvaluationHtml({
      outcome: 'positiva', evaluatorNote: monitoria.evaluator_note,
      satisfactionRecordText: monitoria.satisfaction_has_record ? monitoria.satisfaction_record_text : null,
    });
    const { externalCommentId } = await provider.publishEvaluation({
      ticketId: work.ticket_id, outcome: 'positiva', htmlBody,
    });
    const receipt = await db.rpc('finish_helpdesk_publication', {
      p_monitoria: monitoria.id, p_claim: publicationClaim, p_provider: provider.name,
      p_ticket: work.ticket_id, p_outcome: 'positiva', p_comment: externalCommentId, p_success: true,
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
        p_ticket: work.ticket_id, p_outcome: 'positiva', p_comment: null, p_success: false,
      });
      await finish('uncertain',message);
      return { processed: 1, status: 'uncertain', ticket_id: work.ticket_id };
    }
    await finish('retry',message);
    return { processed: 1, status: 'retry', ticket_id: work.ticket_id };
  }
}
