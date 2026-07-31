import { useState } from 'react';
import { supabase, mockDb, isMockMode } from '../lib/supabase';
import { Monitoria, MonitoriaStatus, MonitoriaHistoryEntry, User } from '../types';
import { addBusinessHours } from '../lib/businessHours';
import { resolveContestationResult } from '../lib/contestation';
import { toast } from 'sonner';

export type ActionType = 'aceitar' | 'contestar' | 'manter' | 'aprovar' | 'escalar' | 'excluir' | 'reavaliar' | 'devolver' | 'editAdmin' | 'solicitar_reavaliacao' | 'recusar_agente' | 'reabrir';

const actionDescriptions: Record<string, string> = {
  // "pelo suporte" foi removido: aceitar/contestar passaram a ser exclusivos
  // do gestor_suporte, e o texto fixo ficaria incorreto. O nome de quem agiu
  // já aparece via by_name na linha do tempo — não se perde informação.
  // Mantidas as palavras-chave "aceita" e "Contestação": contestation.ts as
  // usa (isApprovalAction/isContestationAction) para derivar contestation_result.
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
  'reabrir': 'Monitoria reaberta pelo Administrador'
};

const getDeadlineHours = (status: MonitoriaStatus, actionDeadline: any): number => {
  switch (status) {
    case 'pendente_revisao':
    case 'contestacao_negada': return actionDeadline?.agent_review || 50;
    case 'em_contestacao':
    case 'reavaliacao_solicitada': return actionDeadline?.auditor_reevaluation || 25;
    case 'aguardando_gestor_suporte': return actionDeadline?.manager_support || 25;
    case 'aguardando_gestor_qualidade': return actionDeadline?.manager_quality || 25;
    default: return 25;
  }
};

export function useMonitoriaActions(
  user: User | null,
  monitorias: Monitoria[],
  qualityConfig: any,
  load: () => void
) {
  const [actionModal, setActionModal] = useState<{ id: string; type: ActionType } | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [reopenStatus, setReopenStatus] = useState<MonitoriaStatus>('pendente_revisao');
  const [submitting, setSubmitting] = useState(false);

  const handleAction = async () => {
    if (!actionModal || !user) return;
    setSubmitting(true);
    const { id, type } = actionModal;
    const monitoria = monitorias.find(m => m.id === id);
    if (!monitoria) return;

    const now = new Date().toISOString();

    const historyEntry: MonitoriaHistoryEntry = {
      action: actionDescriptions[type] || 'Ação realizada',
      by_id: user.id,
      by_name: user.name,
      at: now,
      note: actionNote || undefined
    };

    let nextStatus: MonitoriaStatus = monitoria.status;
    if (type === 'aceitar' || type === 'aprovar') nextStatus = 'concluida';
    else if (type === 'contestar' || type === 'devolver') nextStatus = 'em_contestacao';
    else if (type === 'manter') nextStatus = 'contestacao_negada';
    else if (type === 'recusar_agente') nextStatus = 'aguardando_gestor_suporte';
    else if (type === 'escalar') nextStatus = 'aguardando_gestor_qualidade';
    else if (type === 'solicitar_reavaliacao') nextStatus = 'reavaliacao_solicitada';
    else if (type === 'reabrir') nextStatus = reopenStatus;

    const update: any = type === 'excluir'
      ? { active: false, history: [...(monitoria.history || []), historyEntry], updated_at: now }
      : {
        status: nextStatus,
        updated_at: now,
        history: [...(monitoria.history || []), historyEntry],
        ...(nextStatus !== 'concluida' ? { action_deadline_at: addBusinessHours(new Date(), getDeadlineHours(nextStatus, qualityConfig.action_deadline), qualityConfig.businessHours).toISOString() } : {}),
        ...(nextStatus === 'concluida' ? { resolution_type: 'human' } : {}),
        ...(type === 'contestar' || type === 'solicitar_reavaliacao' ? { contestation_reason: actionNote } : {}),
        ...(resolveContestationResult(actionDescriptions[type] || '') ? { contestation_result: resolveContestationResult(actionDescriptions[type] || '') } : {}),
      };

    try {
      if (!supabase) {
        await mockDb.update('monitorias', id, update);
      } else {
        const { error } = await supabase.from('monitorias').update(update).eq('id', id);
        if (error) throw error;
      }
      toast.success('Ação registrada com sucesso!');
      setActionModal(null);
      setActionNote('');
      load();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally { setSubmitting(false); }
  };

  return {
    actionModal, setActionModal,
    actionNote, setActionNote,
    reopenStatus, setReopenStatus,
    submitting,
    handleAction,
  };
}

export { actionDescriptions, getDeadlineHours };
