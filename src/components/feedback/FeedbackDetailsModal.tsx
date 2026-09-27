import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  CheckCircle,
  Clock,
  Award,
  AlertCircle,
  CheckSquare,
  Calendar,
  User as UserIcon,
  ExternalLink,
  ShieldCheck,
  Lightbulb,
} from 'lucide-react';
import { AgentFeedback, User, Team, Monitoria } from '../../types';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const [agentNotes, setAgentNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { dialogProps } = useDialogAccessibility({
    isOpen: isOpen && !!feedback,
    onClose,
    dialogRef,
    ariaLabelledBy: 'feedback-details-title',
  });

  if (!isOpen || !feedback) return null;

  const isAgent = currentUser?.id === feedback.agent_id;
  const isManager = ['gestor_suporte', 'gestor_qualidade', 'admin'].includes(currentUser?.role || '');

  const agentUser = users.find(u => u.id === feedback.agent_id);
  const managerUser = users.find(u => u.id === feedback.manager_id);
  const team = teams.find(t => t.id === feedback.team_id);
  const linkedMonitoria = monitorias.find(m => m.id === feedback.monitoria_id);

  const handleSign = async () => {
    if (submitting) return;
    setSubmitting(true);
    setActionError(null);

    try {
      const ok = await onAcknowledge(feedback.id, agentNotes.trim() || undefined);
      if (ok) {
        onClose();
      } else {
        setActionError('Não foi possível confirmar a ciência. Por favor, tente novamente.');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Erro ao registrar confirmação de ciência.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinishPlan = async () => {
    if (submitting) return;
    setSubmitting(true);
    setActionError(null);

    try {
      const ok = await onComplete(feedback.id);
      if (ok) {
        onClose();
      } else {
        setActionError('Não foi possível concluir o plano de ação. Por favor, tente novamente.');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Erro ao concluir o plano de ação.');
    } finally {
      setSubmitting(false);
    }
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
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto"
      onClick={e => {
        if (e.target === e.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        {...dialogProps}
        className="relative w-full max-w-2xl bg-surface-bg border border-surface-border rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh] focus:outline-none"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-surface-border flex items-center justify-between bg-surface-card flex-shrink-0 gap-3">
          <div className="min-w-0 pr-3 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {getStatusBadge(feedback.status)}
              <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">
                {new Date(feedback.created_at).toLocaleDateString('pt-BR')}
              </span>
            </div>
            <h2
              id="feedback-details-title"
              className="text-sm sm:text-base font-black text-brand-primary truncate"
            >
              {feedback.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2.5 rounded-xl text-brand-muted hover:text-brand-primary hover:bg-surface-subtle transition-colors cursor-pointer shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent disabled:opacity-50"
            aria-label="Fechar detalhes do feedback"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo rolável */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs text-brand-primary">
          {/* Mensagem de Erro Visível */}
          {actionError && (
            <div
              role="alert"
              className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-rose-700 dark:text-rose-400 text-xs font-semibold"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="break-words">{actionError}</span>
            </div>
          )}

          {/* Metadados: Atendente e Gestor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-surface-subtle/50 border border-surface-border">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-brand-accent/10 text-brand-accent flex items-center justify-center font-bold shrink-0">
                <UserIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-brand-muted block">Atendente</span>
                <span className="font-bold text-brand-primary block truncate">{agentUser?.name || 'Atendente'}</span>
                {team && <span className="text-[10px] text-brand-muted block truncate">{team.name}</span>}
              </div>
            </div>

            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-brand-muted block">Gestor Responsável</span>
                <span className="font-bold text-brand-primary block truncate">{managerUser?.name || 'Gestão'}</span>
                <span className="text-[10px] text-brand-muted block truncate">Realizador do 1:1</span>
              </div>
            </div>
          </div>

          {/* Chamado Vinculado (se houver) */}
          {linkedMonitoria && (
            <div className="p-3 rounded-xl border border-surface-border bg-surface-card flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
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
                className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-accent hover:underline cursor-pointer min-h-[44px] sm:min-h-0 py-1"
                aria-label={`Ver chamado #${linkedMonitoria.ticket_id}`}
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
                <Award className="w-3.5 h-3.5 shrink-0" /> Pontos Fortes & Reconhecimento
              </h3>
              <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium break-words whitespace-pre-wrap">
                {feedback.strengths}
              </p>
            </div>
          )}

          {/* Oportunidades de Melhoria */}
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20">
            <h3 className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mb-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Oportunidades de Melhoria (Pontos a Desenvolver)
            </h3>
            <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium break-words whitespace-pre-wrap">
              {feedback.improvements}
            </p>
          </div>

          {/* Plano de Ação Combinado */}
          <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-50/50 dark:bg-blue-950/20">
            <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 shrink-0" /> Plano de Ação Combinado (PDI)
              </h3>
              {feedback.deadline_date && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                  <Calendar className="w-3 h-3 shrink-0" />
                  Meta: {new Date(feedback.deadline_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium whitespace-pre-wrap break-words">
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
                  <div className="mt-1 text-[11px] text-brand-muted italic break-words">
                    &ldquo;{feedback.agent_notes}&rdquo;
                  </div>
                )}
              </div>
            </div>
          ) : isAgent && feedback.status === 'pendente_ciencia' ? (
            <div className="p-4 rounded-xl border-2 border-brand-accent/40 bg-brand-accent/5 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-brand-accent shrink-0" />
                <span className="text-xs font-black uppercase tracking-wider text-brand-accent">
                  Confirmação de Ciência Obrigatória
                </span>
              </div>
              <p className="text-[11px] text-brand-muted leading-relaxed">
                Ao confirmar, você atesta que participou desta sessão de 1:1, leu os direcionamentos e se compromete com o plano de ação acordado.
              </p>
              <div>
                <label
                  htmlFor="feedback-details-agent-notes"
                  className="block text-[10px] font-bold uppercase tracking-wider text-brand-muted mb-1"
                >
                  Comentários ou Observações do Atendente (Opcional):
                </label>
                <textarea
                  id="feedback-details-agent-notes"
                  rows={2}
                  value={agentNotes}
                  onChange={e => setAgentNotes(e.target.value)}
                  placeholder="Espaço para suas considerações..."
                  className="w-full bg-surface-card border border-surface-border rounded-xl p-2.5 text-base sm:text-xs text-brand-primary focus:outline-none focus:border-brand-accent resize-none font-medium"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleSign}
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold min-h-[44px] sm:min-h-0 flex items-center justify-center"
                >
                  {submitting ? 'Confirmando...' : 'Confirmar Ciência do Feedback'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl border border-surface-border bg-surface-subtle/30 flex items-center gap-2 text-brand-muted text-xs">
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
              <span>O atendente ainda não confirmou a leitura deste feedback.</span>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="p-4 border-t border-surface-border flex items-center justify-between bg-surface-card flex-shrink-0 gap-3">
          <div className="text-[10px] text-brand-muted font-medium truncate">
            Registro confidencial de desenvolvimento individual
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isManager && feedback.status === 'ciente' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleFinishPlan}
                disabled={submitting}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 min-h-[44px] sm:min-h-0"
              >
                Concluir Plano de Ação
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-bold text-brand-muted hover:text-brand-primary rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer min-h-[44px] sm:min-h-0 disabled:opacity-50"
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
