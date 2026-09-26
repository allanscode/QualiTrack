import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, Clock, Award, AlertCircle, CheckSquare, Calendar, User as UserIcon, ExternalLink, ShieldCheck, Lightbulb } from 'lucide-react';
import { AgentFeedback, User, Team, Monitoria } from '../../types';
import Badge from '../ui/Badge';
import Button from '../ui/Button';

interface FeedbackDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  feedback: AgentFeedback | null;
  currentUser: User | null;
  users: User[];
  teams: Team[];
  monitorias?: Monitoria[];
  onAcknowledge: (feedbackId: string, notes?: string) => Promise<boolean>;
  onComplete: (feedbackId: string) => Promise<boolean>;
}

export default function FeedbackDetailsModal({
  isOpen,
  onClose,
  feedback,
  currentUser,
  users,
  teams,
  monitorias = [],
  onAcknowledge,
  onComplete,
}: FeedbackDetailsModalProps) {
  const [agentNotes, setAgentNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !feedback) return null;

  const isAgent = currentUser?.id === feedback.agent_id;
  const isManager = ['gestor_suporte', 'gestor_qualidade', 'admin'].includes(currentUser?.role || '');

  const agentUser = users.find(u => u.id === feedback.agent_id);
  const managerUser = users.find(u => u.id === feedback.manager_id);
  const team = teams.find(t => t.id === feedback.team_id);
  const linkedMonitoria = monitorias.find(m => m.id === feedback.monitoria_id);

  const handleSign = async () => {
    setSubmitting(true);
    const ok = await onAcknowledge(feedback.id, agentNotes.trim() || undefined);
    setSubmitting(false);
    if (ok) onClose();
  };

  const handleFinishPlan = async () => {
    setSubmitting(true);
    const ok = await onComplete(feedback.id);
    setSubmitting(false);
    if (ok) onClose();
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'concluido':
        return <Badge variant="success" size="sm">Plano Concluído</Badge>;
      case 'ciente':
        return <Badge variant="info" size="sm">Ciente pelo Atendente</Badge>;
      default:
        return <Badge variant="warning" size="sm">Pendente de Ciência</Badge>;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-surface-bg border border-surface-border rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-surface-border flex items-center justify-between bg-surface-card flex-shrink-0">
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1">
              {getStatusBadge(feedback.status)}
              <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">
                {new Date(feedback.created_at).toLocaleDateString('pt-BR')}
              </span>
            </div>
            <h2 className="text-base font-black text-brand-primary truncate">
              {feedback.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-brand-muted hover:text-brand-primary hover:bg-surface-subtle transition-colors cursor-pointer flex-shrink-0"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo rolável */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs text-brand-primary">
          
          {/* Metadados: Atendente e Gestor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-surface-subtle/50 border border-surface-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-brand-accent/10 text-brand-accent flex items-center justify-center font-bold">
                <UserIcon className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-brand-muted block">Atendente</span>
                <span className="font-bold text-brand-primary">{agentUser?.name || 'Atendente'}</span>
                {team && <span className="text-[10px] text-brand-muted block">{team.name}</span>}
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-brand-muted block">Gestor Responsável</span>
                <span className="font-bold text-brand-primary">{managerUser?.name || 'Gestão'}</span>
                <span className="text-[10px] text-brand-muted block">Realizador do 1:1</span>
              </div>
            </div>
          </div>

          {/* Chamado Vinculado (se houver) */}
          {linkedMonitoria && (
            <div className="p-3 rounded-xl border border-surface-border bg-surface-card flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-brand-muted">Monitoria Vinculada:</span>
                <span className="font-mono font-bold text-brand-accent">#{linkedMonitoria.ticket_id}</span>
                <span className="text-brand-muted">•</span>
                <span className="font-semibold text-brand-primary">Nota: {linkedMonitoria.score ?? '—'}%</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('qualitrack:focus_monitoria', {
                      detail: { monitoriaId: linkedMonitoria.id, ticketId: linkedMonitoria.ticket_id },
                    })
                  );
                }}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-accent hover:underline cursor-pointer"
              >
                <span>Ver Chamado</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Pontos Fortes */}
          {feedback.strengths && (
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 mb-1.5">
                <Award className="w-3.5 h-3.5" /> Pontos Fortes & Reconhecimento
              </h3>
              <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                {feedback.strengths}
              </p>
            </div>
          )}

          {/* Oportunidades de Melhoria */}
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20">
            <h3 className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mb-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Oportunidades de Melhoria (Pontos a Desenvolver)
            </h3>
            <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
              {feedback.improvements}
            </p>
          </div>

          {/* Plano de Ação Combinado */}
          <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-50/50 dark:bg-blue-950/20">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5" /> Plano de Ação Combinado (PDI)
              </h3>
              {feedback.deadline_date && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                  <Calendar className="w-3 h-3" />
                  Meta: {new Date(feedback.deadline_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium whitespace-pre-wrap">
              {feedback.action_plan}
            </p>
            <div className="mt-2.5 pt-2 border-t border-blue-500/15 flex items-center gap-1.5 text-[10px] text-blue-700/80 dark:text-blue-300/80">
              <Lightbulb className="w-3 h-3 flex-shrink-0" />
              <span>Compromisso prático de evolução profissional combinado na sessão de 1:1.</span>
            </div>
          </div>

          {/* Status de Ciência / Assinatura do Atendente */}
          {feedback.agent_acknowledged_at ? (
            <div className="p-3.5 rounded-xl border border-surface-border bg-surface-subtle/60 flex items-start gap-3">
              <CheckCircle className="w-4 h-4 text-functional-success shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-brand-primary">
                  Ciência confirmada pelo atendente em {new Date(feedback.agent_acknowledged_at).toLocaleDateString('pt-BR')} às {new Date(feedback.agent_acknowledged_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
                {feedback.agent_notes && (
                  <div className="mt-1 text-[11px] text-brand-muted italic">
                    "{feedback.agent_notes}"
                  </div>
                )}
              </div>
            </div>
          ) : isAgent && feedback.status === 'pendente_ciencia' ? (
            <div className="p-4 rounded-xl border-2 border-brand-accent/40 bg-brand-accent/5 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-brand-accent" />
                <span className="text-xs font-black uppercase tracking-wider text-brand-accent">
                  Confirmação de Ciência Obrigatória
                </span>
              </div>
              <p className="text-[11px] text-brand-muted leading-relaxed">
                Ao confirmar, você atesta que participou desta sessão de 1:1, leu os direcionamentos e se compromete com o plano de ação acordado.
              </p>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-muted mb-1">
                  Comentários ou Observações do Atendente (Opcional):
                </label>
                <textarea
                  rows={2}
                  value={agentNotes}
                  onChange={e => setAgentNotes(e.target.value)}
                  placeholder="Espaço para suas considerações..."
                  className="w-full bg-surface-card border border-surface-border rounded-xl p-2.5 text-xs text-brand-primary focus:outline-none focus:border-brand-accent resize-none font-medium"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleSign}
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold"
                >
                  {submitting ? 'Confirmando...' : 'Confirmar Ciência do Feedback'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl border border-surface-border bg-surface-subtle/30 flex items-center gap-2 text-brand-muted text-xs">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>O atendente ainda não confirmou a leitura deste feedback.</span>
            </div>
          )}

        </div>

        {/* Rodapé */}
        <div className="p-4 border-t border-surface-border flex items-center justify-between bg-surface-card flex-shrink-0">
          <div className="text-[10px] text-brand-muted font-medium">
            Registro confidencial de desenvolvimento individual
          </div>
          <div className="flex items-center gap-2">
            {isManager && feedback.status === 'ciente' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleFinishPlan}
                disabled={submitting}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
              >
                Concluir Plano de Ação
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-bold text-brand-muted hover:text-brand-primary rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}
