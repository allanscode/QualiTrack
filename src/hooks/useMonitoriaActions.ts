import { useState } from 'react';
import { supabase, mockDb } from '../lib/supabase';
import { Monitoria, MonitoriaStatus, MonitoriaHistoryEntry, User, ActionAttachment, Team } from '../types';
import { addBusinessHours } from '../lib/businessHours';
import { getContestationOutcome, isContestationAction, resolveContestationResult } from '../lib/contestation';
import { toast } from 'sonner';

export type ActionType =
  | 'aceitar'
  | 'contestar'
  | 'manter'
  | 'aprovar'
  | 'escalar'
  | 'excluir'
  | 'reavaliar'
  | 'devolver'
  | 'editAdmin'
  | 'solicitar_reavaliacao'
  | 'recusar_agente'
  | 'reabrir'
  | 'alterar_etapa'
  | 'avancar_etapa'
  | 'retroceder_etapa';

const actionDescriptions: Record<string, string> = {
  'aceitar': 'Monitoria aceita',
  'contestar': 'Contestação realizada',
  'manter': 'Contestação negada pela Qualidade',
  'aprovar': 'Monitoria aprovada pelo Gestor',
  'escalar': 'Escalado para decisão da Qualidade',
  'excluir': 'Monitoria removida pelo Administrador',
  'reavaliar': 'Reavaliação aceita pelo Gestor Qual.',
  'solicitar_reavaliacao': 'Reavaliação solicitada pelo Gestor',
  'devolver': 'Devolvido para reanálise da Qualidade',
  'recusar_agente': 'Contestação mantida pelo Agente (enviado ao Gestor)',
  'reabrir': 'Monitoria reaberta pelo Administrador',
  'alterar_etapa': 'Etapa alterada administrativamente',
  'avancar_etapa': 'Etapa avançada administrativamente',
  'retroceder_etapa': 'Etapa revertida administrativamente',
};

export const STAGES_FLOW: { status: MonitoriaStatus; label: string; roleLabel: string }[] = [
  { status: 'pendente_revisao', label: 'Pendente Revisão', roleLabel: 'Agente de Suporte' },
  { status: 'em_contestacao', label: 'Em Contestação', roleLabel: 'Monitor de Qualidade' },
  { status: 'aguardando_gestor_suporte', label: 'Gestão Suporte', roleLabel: 'Gestor de Suporte' },
  { status: 'aguardando_gestor_qualidade', label: 'Gestão Qualidade', roleLabel: 'Gestor de Qualidade' },
  { status: 'reavaliacao_solicitada', label: 'Reavaliação Solicitada', roleLabel: 'Auditor de Qualidade' },
  { status: 'concluida', label: 'Concluída / Finalizada', roleLabel: 'Processo Finalizado' },
];

export function getPreviousStage(current: MonitoriaStatus): MonitoriaStatus | null {
  switch (current) {
    case 'concluida':
    case 'finalizada_alterada':
    case 'contestacao_aceita':
    case 'contestacao_negada':
      return 'aguardando_gestor_qualidade';
    case 'reavaliacao_solicitada':
    case 'aguardando_gestor_qualidade':
      return 'aguardando_gestor_suporte';
    case 'aguardando_revisao_pj':
      return 'aguardando_gestor_suporte';
    case 'aguardando_gestor_suporte':
      return 'em_contestacao';
    case 'em_contestacao':
      return 'pendente_revisao';
    default:
      return null;
  }
}

export function getNextStage(current: MonitoriaStatus): MonitoriaStatus | null {
  switch (current) {
    case 'pendente_revisao':
      return 'em_contestacao';
    case 'em_contestacao':
      return 'aguardando_gestor_suporte';
    case 'aguardando_gestor_suporte':
      return 'aguardando_gestor_qualidade';
    case 'aguardando_revisao_pj':
      return 'aguardando_gestor_qualidade';
    case 'aguardando_gestor_qualidade':
    case 'reavaliacao_solicitada':
      return 'concluida';
    default:
      return null;
  }
}

export function getStageLabel(status: MonitoriaStatus | null | undefined): string {
  if (!status) return '';
  const item = STAGES_FLOW.find(s => s.status === status);
  return item ? item.label : status;
}

const getDeadlineHours = (status: MonitoriaStatus, actionDeadline: any): number => {
  switch (status) {
    case 'pendente_revisao':
    case 'contestacao_negada': return actionDeadline?.agent_review || 50;
    case 'em_contestacao':
    case 'reavaliacao_solicitada': return actionDeadline?.auditor_reevaluation || 25;
    case 'aguardando_gestor_suporte': return actionDeadline?.manager_support || 25;
    case 'aguardando_revisao_pj': return actionDeadline?.manager_support || 25;
    case 'aguardando_gestor_qualidade': return actionDeadline?.manager_quality || 25;
    default: return 25;
  }
};

const STAGE_ORDER: Record<string, number> = {
  'pendente_revisao': 1,
  'em_contestacao': 2,
  'aguardando_gestor_suporte': 3,
  'aguardando_revisao_pj': 4,
  'aguardando_gestor_qualidade': 5,
  'reavaliacao_solicitada': 5,
  'concluida': 6,
};

export function useMonitoriaActions(
  user: User | null,
  monitorias: Monitoria[],
  qualityConfig: any,
  load: () => void,
  teams: Team[]
) {
  const [actionModal, setActionModalState] = useState<{ id: string; type: ActionType } | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [actionAttachments, setActionAttachments] = useState<ActionAttachment[]>([]);
  const [reopenStatus, setReopenStatus] = useState<MonitoriaStatus>('pendente_revisao');
  const [targetStatus, setTargetStatus] = useState<MonitoriaStatus>('pendente_revisao');
  const [submitting, setSubmitting] = useState(false);

  const setActionModal = (modal: { id: string; type: ActionType } | null) => {
    setActionModalState(modal);
    if (!modal) {
      setActionNote('');
      setActionAttachments([]);
    } else {
      const mon = monitorias.find(m => m.id === modal.id);
      if (mon) {
        if (modal.type === 'avancar_etapa') {
          const next = getNextStage(mon.status) || 'concluida';
          setTargetStatus(next);
        } else if (modal.type === 'retroceder_etapa') {
          const prev = getPreviousStage(mon.status) || 'pendente_revisao';
          setTargetStatus(prev);
        } else if (modal.type === 'alterar_etapa') {
          const next = getNextStage(mon.status) || getPreviousStage(mon.status) || 'pendente_revisao';
          setTargetStatus(next);
        } else if (modal.type === 'reabrir') {
          setReopenStatus('pendente_revisao');
        }
      }
    }
  };

  const handleAction = async (): Promise<boolean> => {
    if (!actionModal || !user) return false;
    setSubmitting(true);
    const { id, type } = actionModal;
    const monitoria = monitorias.find(m => m.id === id);
    if (!monitoria) {
      setSubmitting(false);
      return false;
    }

    const trimmedNote = actionNote.trim();
    const isPj = Boolean(monitoria.pj_review_required || monitoria.pj_review_kind);
    const isPjManagerAction = isPj && user.role === 'gestor_suporte'
      && ['aceitar', 'aprovar', 'contestar', 'escalar'].includes(type);

    const approvingTeam = teams.find(team => team.id === monitoria.team_id);
    if (user.role === 'gestor_suporte' && approvingTeam?.approval_manager_id
      && approvingTeam.approval_manager_id !== user.id
      && ['aceitar', 'aprovar', 'contestar', 'escalar'].includes(type)) {
      toast.error('Outro gestor foi designado para aprovar esta equipe.');
      setSubmitting(false);
      return false;
    }

    // Validações obrigatórias para o gestor de suporte (WQ-22)
    if (user.role === 'gestor_suporte') {
      if ((type === 'aprovar' || type === 'aceitar') && !trimmedNote) {
        toast.error('Ação Corretiva é obrigatória para aprovação pelo gestor de suporte.');
        setSubmitting(false);
        return false;
      }
      if (type === 'contestar' && !trimmedNote) {
        toast.error('Justificativa da Contestação é obrigatória para contestar.');
        setSubmitting(false);
        return false;
      }
    }

    // Validação para alteração de etapa administrativa
    const isStepChange = type === 'alterar_etapa' || type === 'avancar_etapa' || type === 'retroceder_etapa';
    if (isStepChange) {
      if (user.role !== 'admin' && user.role !== 'gestor_qualidade') {
        toast.error('Apenas Administrador e Gestor de Qualidade podem alterar a etapa.');
        setSubmitting(false);
        return false;
      }
      if (targetStatus === monitoria.status) {
        toast.error('Selecione uma etapa diferente da etapa atual para avançar ou retroceder.');
        setSubmitting(false);
        return false;
      }
    }

    const now = new Date().toISOString();

    let nextStatus: MonitoriaStatus = monitoria.status;
    if (type === 'aceitar' || type === 'aprovar') nextStatus = 'concluida';
    else if (type === 'contestar' || type === 'devolver') nextStatus = 'em_contestacao';
    else if (type === 'manter') nextStatus = 'contestacao_negada';
    else if (type === 'recusar_agente') nextStatus = 'aguardando_gestor_suporte';
    else if (type === 'escalar') nextStatus = 'aguardando_gestor_qualidade';
    else if (type === 'solicitar_reavaliacao') nextStatus = 'reavaliacao_solicitada';
    else if (type === 'reabrir') nextStatus = reopenStatus;
    else if (isStepChange) nextStatus = targetStatus;
    if (isPjManagerAction) nextStatus = 'aguardando_gestor_qualidade';

    const isAdvance = (STAGE_ORDER[nextStatus] ?? 0) >= (STAGE_ORDER[monitoria.status] ?? 0);

    // Se o gestor não digitou nota, assume justificativa descritiva padrão
    let finalNote = trimmedNote;
    if (!finalNote) {
      if (isStepChange) {
        finalNote = isAdvance
          ? `Avanço de etapa realizado pela gestão (${monitoria.status} ➔ ${nextStatus})`
          : `Reversão de etapa realizada pela gestão (${monitoria.status} ➔ ${nextStatus})`;
      } else if (type === 'reabrir') {
        finalNote = `Reabertura de monitoria realizada pela gestão para etapa ${nextStatus}`;
      }
    }

    const entryAction = isPjManagerAction
      ? (type === 'contestar' || type === 'escalar'
        ? 'Gestor PJ encaminhou contestação para a Gestão da Qualidade'
        : 'Gestor PJ encaminhou aprovação para a Gestão da Qualidade')
      : isStepChange
      ? (isAdvance ? `Etapa avançada administrativamente (${monitoria.status} ➔ ${nextStatus})` : `Etapa revertida administrativamente (${monitoria.status} ➔ ${nextStatus})`)
      : (actionDescriptions[type] || 'Ação realizada');

    const historyEntry: MonitoriaHistoryEntry = {
      action: entryAction,
      by_id: user.id,
      by_name: user.name,
      at: now,
      note: finalNote || undefined,
      attachments: actionAttachments.length > 0 ? actionAttachments : undefined,
    };

    const existingAttachments = monitoria.action_attachments || [];
    const combinedAttachments = actionAttachments.length > 0
      ? [...existingAttachments, ...actionAttachments]
      : existingAttachments;

    const finalQualityDecision = nextStatus === 'concluida'
      && monitoria.status === 'aguardando_gestor_qualidade'
      && (user.role === 'gestor_qualidade' || user.role === 'admin')
      && monitoria.history?.some(entry => isContestationAction(entry.action));
    const reevaluationOutcome = finalQualityDecision
      ? getContestationOutcome({ ...monitoria, status: 'concluida' })
      : null;

    const update: any = type === 'excluir'
      ? { active: false, history: [...(monitoria.history || []), historyEntry], updated_at: now }
      : {
        status: nextStatus,
        updated_at: now,
        history: [...(monitoria.history || []), historyEntry],
        ...(nextStatus !== 'concluida' ? { action_deadline_at: addBusinessHours(new Date(), getDeadlineHours(nextStatus, qualityConfig.action_deadline), qualityConfig.businessHours).toISOString() } : { action_deadline_at: null }),
        ...(nextStatus === 'concluida' ? { resolution_type: 'human' } : {}),
        ...((type === 'aprovar' || type === 'aceitar')
          && !(isPj && monitoria.status === 'aguardando_gestor_qualidade')
          ? { corrective_action: finalNote } : {}),
        ...(type === 'contestar' || type === 'solicitar_reavaliacao' ? { contestation_reason: finalNote } : {}),
        ...(combinedAttachments.length > 0 ? { action_attachments: combinedAttachments } : {}),
        ...(isPjManagerAction ? {
          pj_reviewer_id: null,
          pj_review_kind: type === 'contestar' || type === 'escalar' ? 'contestation' : 'approval',
          pj_review_decision: null,
          pj_review_note: null,
          pj_reviewed_at: null,
          ...(type === 'contestar' || type === 'escalar' ? { contestation_result: 'pending' } : {}),
        } : {}),
        ...(!isPjManagerAction && resolveContestationResult(actionDescriptions[type] || '')
          ? { contestation_result: resolveContestationResult(actionDescriptions[type] || '') } : {}),
        ...(isPj && monitoria.pj_review_kind === 'contestation' && type === 'aprovar'
          ? { contestation_result: 'approved' } : {}),
        ...(reevaluationOutcome ? { contestation_result: reevaluationOutcome } : {}),
      };

    try {
      if (!supabase) {
        await mockDb.update('monitorias', id, update);
      } else if (user.role === 'suporte' && type === 'recusar_agente') {
        const { error } = await supabase.rpc('appeal_monitoria', {
          p_monitoria_id: id,
          p_note: finalNote || '',
        });
        if (error) throw error;
      } else if (user.role === 'gestor_suporte') {
        const { error } = await supabase.rpc('act_on_monitoria_as_support_manager', {
          p_monitoria_id: id,
          p_action: type,
          p_note: finalNote || '',
          p_attachments: actionAttachments,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('monitorias').update(update).eq('id', id);
        if (error) throw error;
      }
      toast.success(isStepChange ? `Etapa da monitoria ${isAdvance ? 'avançada' : 'revertida'} com sucesso!` : 'Ação registrada com sucesso!');
      setActionModal(null);
      load();
      return true;
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
      return false;
    } finally { setSubmitting(false); }
  };

  return {
    actionModal, setActionModal,
    actionNote, setActionNote,
    actionAttachments, setActionAttachments,
    reopenStatus, setReopenStatus,
    targetStatus, setTargetStatus,
    submitting,
    handleAction,
  };
}

export { actionDescriptions, getDeadlineHours };
