import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  MessageSquare,
  Award,
  AlertCircle,
  CheckSquare,
  Calendar,
  ChevronRight,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Lightbulb,
  Check,
} from 'lucide-react';
import { User, Team, Monitoria } from '../../types';
import Button from '../ui/Button';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';

interface CreateFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    agent_id: string;
    team_id?: string | null;
    monitoria_id?: string | null;
    title: string;
    strengths?: string | null;
    improvements: string;
    action_plan: string;
    deadline_date?: string | null;
  }) => Promise<boolean>;
  currentUser?: User | null;
  users: User[];
  teams: Team[];
  monitorias?: Monitoria[];
  initialAgentId?: string;
  initialMonitoriaId?: string;
}

const ACTION_PLAN_EXAMPLES = [
  {
    category: 'Procedimento & Triagem Técnica',
    context: 'Quando há escalonamento para N2 sem testes prévios ou coleta de evidências.',
    template: 'Em todos os chamados de lentidão ou indisponibilidade dos próximos 15 dias, seguir o checklist padrão anexando prints dos testes de ping e traceroute antes de transferir para o N2.',
  },
  {
    category: 'Comunicação & Postura (CSAT)',
    context: 'Quando a nota cai por linguagem fria, impaciente ou excessivamente técnica.',
    template: 'Revisar o Guia de Atendimento Humanizado até sexta-feira e aplicar saudações empáticas e confirmação ativa de resolução antes de encerrar chamados no chat.',
  },
  {
    category: 'Regras de Negócio & Base de Conhecimento',
    context: 'Quando ocorrem falhas em fluxos operacionais, políticas de estorno ou trocas.',
    template: 'Revisar o artigo #402 da Base de Conhecimento sobre a nova política de estornos/reembolsos e alinhar dúvidas pendentes com o monitor de qualidade até o final desta semana.',
  },
];

export default function CreateFeedbackModal({
  isOpen,
  onClose,
  onSubmit,
  currentUser,
  users,
  teams,
  monitorias = [],
  initialAgentId = '',
  initialMonitoriaId = '',
}: CreateFeedbackModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLSelectElement>(null);

  const { dialogProps } = useDialogAccessibility({
    isOpen,
    onClose,
    dialogRef,
    initialFocusRef,
    ariaLabelledBy: 'create-feedback-title',
    ariaDescribedBy: 'create-feedback-subtitle',
  });

  const supportAgents: User[] = useMemo(() => {
    return users.filter(u => {
      if (u.role !== 'suporte' || !u.active) return false;
      if (currentUser?.role === 'gestor_suporte') {
        const myTeams = currentUser.team_ids || (currentUser.primary_team_id ? [currentUser.primary_team_id] : []);
        const agentTeams = u.team_ids || (u.primary_team_id ? [u.primary_team_id] : []);
        if (myTeams.length > 0) {
          return agentTeams.some(tid => myTeams.includes(tid));
        }
      }
      return true;
    });
  }, [users, currentUser]);

  const [agentId, setAgentId] = useState(initialAgentId);
  const [selectedMonitoriaId, setSelectedMonitoriaId] = useState(initialMonitoriaId);
  const [title, setTitle] = useState('');
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');
  const [actionPlan, setActionPlan] = useState('');
  const [deadlineDate, setDeadlineDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14); // 14 dias por padrão
    return d.toISOString().split('T')[0];
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showActionPlanHelp, setShowActionPlanHelp] = useState(false);
  const [copiedExampleIndex, setCopiedExampleIndex] = useState<number | null>(null);

  // Monitorias do atendente selecionado
  const agentMonitorias = monitorias.filter(m => m.evaluated_id === agentId);

  // Determinar a equipe do atendente
  const selectedAgent = users.find(u => u.id === agentId);
  const detectedTeamId = selectedAgent?.team_ids?.[0] || selectedAgent?.primary_team_id || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!agentId || !title.trim() || !improvements.trim() || !actionPlan.trim()) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const success = await onSubmit({
        agent_id: agentId,
        team_id: detectedTeamId,
        monitoria_id: selectedMonitoriaId || null,
        title: title.trim(),
        strengths: strengths.trim() || null,
        improvements: improvements.trim(),
        action_plan: actionPlan.trim(),
        deadline_date: deadlineDate || null,
      });

      if (success) {
        onClose();
      } else {
        setSubmitError('Não foi possível registrar o feedback. Por favor, verifique as informações e tente novamente.');
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Ocorreu um erro inesperado ao salvar o feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

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
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-accent/10 text-brand-accent flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="create-feedback-title"
                className="text-sm sm:text-base font-black text-brand-primary uppercase tracking-wider truncate"
              >
                Novo Registro de Feedback & 1:1
              </h2>
              <p
                id="create-feedback-subtitle"
                className="text-xs text-brand-muted font-medium truncate"
              >
                Formalize alinhamentos, reconhecimento e planos de ação para desenvolvimento contínuo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2.5 rounded-xl text-brand-muted hover:text-brand-primary hover:bg-surface-subtle transition-colors cursor-pointer shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent disabled:opacity-50"
            aria-label="Fechar formulário de novo feedback"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário com scroll */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs font-medium text-brand-primary">
          {/* Mensagem de Erro Visível */}
          {submitError && (
            <div
              role="alert"
              className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-rose-700 dark:text-rose-400 text-xs font-semibold"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="break-words">{submitError}</span>
            </div>
          )}

          {/* Linha 1: Atendente & Monitoria Vinculada */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="create-feedback-agent-select"
                className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5"
              >
                Atendente Avaliado *
              </label>
              <select
                id="create-feedback-agent-select"
                ref={initialFocusRef}
                required
                value={agentId}
                onChange={e => {
                  setAgentId(e.target.value);
                  setSelectedMonitoriaId('');
                }}
                className="w-full bg-surface-card border border-surface-border rounded-xl px-3 py-2.5 text-base sm:text-xs font-semibold text-brand-primary focus:outline-none focus:border-brand-accent min-h-[44px] sm:min-h-0"
              >
                <option value="">Selecione o atendente...</option>
                {supportAgents.map((a: User) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="create-feedback-monitoria-select"
                className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5"
              >
                Monitoria Vinculada (Opcional)
              </label>
              <select
                id="create-feedback-monitoria-select"
                value={selectedMonitoriaId}
                onChange={e => setSelectedMonitoriaId(e.target.value)}
                disabled={!agentId}
                className="w-full bg-surface-card border border-surface-border rounded-xl px-3 py-2.5 text-base sm:text-xs font-semibold text-brand-primary focus:outline-none focus:border-brand-accent disabled:opacity-50 min-h-[44px] sm:min-h-0"
              >
                <option value="">Nenhuma (1:1 Periódico Geral)</option>
                {agentMonitorias.map(m => (
                  <option key={m.id} value={m.id}>
                    Ticket #{m.ticket_id} — Nota: {m.score ?? '—'}% ({new Date(m.created_at).toLocaleDateString('pt-BR')})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Linha 2: Título do Feedback */}
          <div>
            <label
              htmlFor="create-feedback-title-input"
              className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5"
            >
              Assunto / Título do 1:1 *
            </label>
            <input
              id="create-feedback-title-input"
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex.: 1:1 Quinzenal - Alinhamento de Postura e FCR no Chat"
              className="w-full bg-surface-card border border-surface-border rounded-xl px-3.5 py-2.5 text-base sm:text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-brand-accent font-semibold min-h-[44px] sm:min-h-0"
            />
          </div>

          {/* Linha 3: Pontos Fortes (Reconhecimento) */}
          <div>
            <label
              htmlFor="create-feedback-strengths-input"
              className="block text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1.5 flex items-center gap-1.5"
            >
              <Award className="w-3.5 h-3.5" /> Pontos Fortes & Reconhecimento
            </label>
            <textarea
              id="create-feedback-strengths-input"
              rows={2}
              value={strengths}
              onChange={e => setStrengths(e.target.value)}
              placeholder="O que o atendente executou com excelência neste ciclo? Ex.: Cordialidade, rapidez no retorno e empatia com o cliente..."
              className="w-full bg-surface-card border border-surface-border rounded-xl p-3 text-base sm:text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-emerald-500 resize-none font-medium"
            />
          </div>

          {/* Linha 4: Oportunidades de Melhoria */}
          <div>
            <label
              htmlFor="create-feedback-improvements-input"
              className="block text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1.5 flex items-center gap-1.5"
            >
              <AlertCircle className="w-3.5 h-3.5" /> Oportunidades de Melhoria (Pontos a Desenvolver) *
            </label>
            <textarea
              id="create-feedback-improvements-input"
              required
              rows={3}
              value={improvements}
              onChange={e => setImprovements(e.target.value)}
              placeholder="Quais desvios ou comportamentos demandam ajuste? Ex.: Confirmação cadastral de segurança antes de alterar dados sensíveis..."
              className="w-full bg-surface-card border border-surface-border rounded-xl p-3 text-base sm:text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-amber-500 resize-none font-medium"
            />
          </div>

          {/* Linha 5: Plano de Ação Combinado */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label
                htmlFor="create-feedback-action-plan-input"
                className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5"
              >
                <CheckSquare className="w-3.5 h-3.5" /> Plano de Ação Combinado (PDI) *
              </label>

              <button
                type="button"
                onClick={() => setShowActionPlanHelp(prev => !prev)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline cursor-pointer transition-colors min-h-[44px] sm:min-h-0 py-1"
                aria-expanded={showActionPlanHelp}
                aria-controls="action-plan-help-container"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>O que é o Plano de Ação?</span>
                {showActionPlanHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            {/* Guia Didático e Exemplos Práticos de Helpdesk */}
            {showActionPlanHelp && (
              <div
                id="action-plan-help-container"
                className="p-3.5 sm:p-4 rounded-xl border border-blue-500/30 bg-blue-50/70 dark:bg-blue-950/30 space-y-3 animate-fade-in text-xs"
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Lightbulb className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-brand-primary text-xs">
                      O que é o Plano de Ação Combinado?
                    </h4>
                    <p className="text-[11px] text-brand-muted mt-1 leading-relaxed">
                      É o <strong>compromisso prático de curto prazo</strong> alinhado entre gestor e atendente durante o 1:1. Ele responde: <em>O que fazer</em>, <em>Como fazer</em> e <em>Até quando</em> para que a oportunidade de melhoria seja superada e o erro não se repita.
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-surface-card border border-surface-border text-[11px] text-brand-muted">
                  <span className="font-bold text-brand-primary">💡 Regra de Ouro:</span> Em vez de apenas registrar o erro (&ldquo;você errou nisso&rdquo;), combine uma ação prática e mensurável (&ldquo;vamos seguir este procedimento pelos próximos 15 dias&rdquo;).
                </div>

                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-brand-muted mb-2">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Exemplos Práticos para Suporte / Helpdesk (clique para usar):</span>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {ACTION_PLAN_EXAMPLES.map((ex, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-surface-card border border-surface-border hover:border-blue-500/50 transition-all flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-bold text-[11px] text-brand-primary">{ex.category}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setActionPlan(ex.template);
                              setCopiedExampleIndex(idx);
                              setTimeout(() => setCopiedExampleIndex(null), 2500);
                            }}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 bg-blue-500/10 px-2 py-1.5 rounded cursor-pointer transition-colors min-h-[44px] sm:min-h-0"
                            aria-label={`Usar modelo ${ex.category}`}
                          >
                            {copiedExampleIndex === idx ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-500" />
                                <span className="text-emerald-600 dark:text-emerald-400">Aplicado!</span>
                              </>
                            ) : (
                              <>
                                <span>Usar modelo</span>
                                <ChevronRight className="w-3 h-3" />
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-[10px] text-brand-muted italic">{ex.context}</p>
                        <p className="text-[11px] text-brand-secondary bg-surface-subtle p-1.5 rounded font-mono select-all break-words">
                          &ldquo;{ex.template}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <textarea
              id="create-feedback-action-plan-input"
              required
              rows={3}
              value={actionPlan}
              onChange={e => setActionPlan(e.target.value)}
              placeholder="Ex.: Em todos os chamados de lentidão dos próximos 15 dias, seguir o checklist padrão anexando prints de testes de ping/tracert antes de escalar ao N2, e revisar o artigo #402 da Base de Conhecimento..."
              className="w-full bg-surface-card border border-surface-border rounded-xl p-3 text-base sm:text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-blue-500 resize-none font-medium"
            />
          </div>

          {/* Linha 6: Prazo para Revisão do Plano */}
          <div>
            <label
              htmlFor="create-feedback-deadline-input"
              className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5 flex items-center gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5" /> Data de Acompanhamento / Revisão do Plano
            </label>
            <input
              id="create-feedback-deadline-input"
              type="date"
              value={deadlineDate}
              onChange={e => setDeadlineDate(e.target.value)}
              className="w-full sm:w-60 bg-surface-card border border-surface-border rounded-xl px-3 py-2 text-base sm:text-xs font-semibold text-brand-primary focus:outline-none focus:border-brand-accent min-h-[44px] sm:min-h-0"
            />
          </div>

          {/* Rodapé / Botões */}
          <div className="pt-4 border-t border-surface-border flex items-center justify-end gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-bold text-brand-muted hover:text-brand-primary rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer min-h-[44px] sm:min-h-0 disabled:opacity-50"
            >
              Cancelar
            </button>
            <Button
              type="submit"
              disabled={submitting || !agentId || !title.trim() || !improvements.trim() || !actionPlan.trim()}
              className="px-5 py-2 text-xs font-bold min-h-[44px] sm:min-h-0 flex items-center justify-center"
            >
              {submitting ? 'Registrando...' : 'Registrar Feedback 1:1'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
