import { supabase, isMockMode, requireAccessToken } from './supabase';
import { EvaluationOutcome, HelpdeskSubmission, PublishResult } from '../types';

export interface PublishHelpdeskOptions {
  outcome?: EvaluationOutcome;
  force?: boolean;
}

/**
 * Chama a Edge Function `helpdesk-publish-evaluation` com `dry_run: false`.
 *
 * Não tem efeito automático: só publica quando algo explicitamente chama esta
 * função (hoje, só `HelpdeskSendModal` ao confirmar o envio). Não conectar a
 * nenhum gatilho de mudança de status sem preview/confirmação prévios — foi
 * decisão explícita do dono do produto que a publicação sempre passe por um
 * preview revisado antes de sair.
 */
export async function publishEvaluationToHelpdesk(
  monitoriaId: string,
  options: PublishHelpdeskOptions = {}
): Promise<PublishResult | null> {
  if (isMockMode || !supabase) {
    console.log('[Helpdesk] Modo Mock/Demo ativo, envio ignorado.');
    return null;
  }

  try {
    const accessToken = await requireAccessToken();
    const { data, error } = await supabase.functions.invoke('helpdesk-publish-evaluation', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        monitoria_id: monitoriaId,
        outcome: options.outcome,
        force: options.force ?? false,
        dry_run: false,
      },
    });

    if (error) {
      console.error('[Helpdesk Publish] Erro na Edge Function:', error);
      return { success: false, error: error.message, stage: 'provider' };
    }

    return data as PublishResult;
  } catch (err: any) {
    console.error('[Helpdesk Publish] Falha na chamada da Edge Function:', err);
    return {
      success: false,
      error: err?.message || 'Falha ao conectar com o serviço de helpdesk',
      stage: 'provider',
    };
  }
}

/**
 * Obtém a última submissão enviada com sucesso para a monitoria informada —
 * usado só para o aviso de reenvio no modal (ver HelpdeskSendModal).
 */
export async function getLatestHelpdeskSubmission(
  monitoriaId: string
): Promise<HelpdeskSubmission | null> {
  if (isMockMode || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from('helpdesk_submissions')
      .select('*')
      .eq('monitoria_id', monitoriaId)
      .eq('status', 'sent')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    return (data?.[0] as HelpdeskSubmission) || null;
  } catch (err) {
    console.error('[Helpdesk] Erro ao buscar histórico de submissões:', err);
    return null;
  }
}
