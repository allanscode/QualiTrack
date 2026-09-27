import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  Search,
  UserCheck,
  ThumbsUp,
  Target,
  Smile,
  Shield,
  Layers,
  ArrowRight,
  Clock,
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
  initialType?: 'feedback' | 'one_on_one';
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
  initialType = 'feedback',
}: CreateFeedbackModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { dialogProps } = useDialogAccessibility({
    isOpen,
    onClose,
    dialogRef,
    initialFocusRef: searchInputRef,
    ariaLabelledBy: 'create-feedback-title',
    ariaDescribedBy: 'create-feedback-subtitle',
  });

  // Lista de agentes elegíveis (apenas suporte ativo, com escopo de equipe para gestor_suporte)
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

  // Estados principais
  const isOneOnOne = initialType === 'one_on_one';
  const [agentId, setAgentId] = useState(initialAgentId);
  const [agentSearch, setAgentSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedMonitoriaId, setSelectedMonitoriaId] = useState(initialMonitoriaId);

  // Modo de Feedback Operacional: Positivo vs Oportunidade de Melhoria
  const [feedbackTone, setFeedbackTone] = useState<'positive' | 'improvement'>('improvement');

  // Campos de Feedback Operacional
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [positiveStrengths, setPositiveStrengths] = useState('');
  const [positiveBestPractices, setPositiveBestPractices] = useState('');
  const [improvementPoints, setImprovementPoints] = useState('');
  const [improvementActionPlan, setImprovementActionPlan] = useState('');
  const [feedbackDeadline, setFeedbackDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14); // 14 dias para plano corretivo
    return d.toISOString().split('T')[0];
  });

  // Campos de Alinhamento 1:1 & PDI
  const [oneOnOneTitle, setOneOnOneTitle] = useState(() => {
    const month = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const capitalized = month.charAt(0).toUpperCase() + month.slice(1);
    return `Alinhamento Mensal & PDI - ${capitalized}`;
  });
  const [oneOnOneMood, setOneOnOneMood] = useState('');
  const [oneOnOneReview, setOneOnOneReview] = useState('');
  const [oneOnOneImprovements, setOneOnOneImprovements] = useState('');
  const [oneOnOnePdiGoals, setOneOnOnePdiGoals] = useState('');
  const [oneOnOneManagerCommitment, setOneOnOneManagerCommitment] = useState('');
  const [oneOnOneNextDate, setOneOnOneNextDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30); // 30 dias para o próximo 1:1
    return d.toISOString().split('T')[0];
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showActionPlanHelp, setShowActionPlanHelp] = useState(false);
  const [copiedExampleIndex, setCopiedExampleIndex] = useState<number | null>(null);

  // Fechar dropdown de busca ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Monitorias do atendente selecionado
  const agentMonitorias = useMemo(() => {
    return monitorias.filter(m => m.evaluated_id === agentId);
  }, [monitorias, agentId]);

  // Atendente e equipe selecionados
  const selectedAgent = useMemo(() => {
    return users.find(u => u.id === agentId);
  }, [users, agentId]);

  const detectedTeam = useMemo(() => {
    if (!selectedAgent) return null;
    const tid = selectedAgent.team_ids?.[0] || selectedAgent.primary_team_id;
    return teams.find(t => t.id === tid) || null;
  }, [selectedAgent, teams]);

  // Filtragem dos atendentes na digitação
  const filteredAgents = useMemo(() => {
    const q = agentSearch.trim().toLowerCase();
    if (!q) return supportAgents.slice(0, 10);
    return supportAgents.filter(a => {
      const matchName = a.name.toLowerCase().includes(q);
      const matchEmail = a.email.toLowerCase().includes(q);
      const userTeam = teams.find(t => t.id === (a.team_ids?.[0] || a.primary_team_id));
      const matchTeam = userTeam?.name.toLowerCase().includes(q) || false;
      return matchName || matchEmail || matchTeam;
    }).slice(0, 15);
  }, [supportAgents, agentSearch, teams]);

  const handleSelectAgent = (agent: User) => {
    setAgentId(agent.id);
    setSelectedMonitoriaId('');
    setIsSearchOpen(false);
    setAgentSearch('');
  };

  const handleClearAgent = () => {
    setAgentId('');
    setSelectedMonitoriaId('');
    setAgentSearch('');
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  };

  // Validação de submissão
  const isFormValid = useMemo(() => {
    if (!agentId) return false;

    if (isOneOnOne) {
      return (
        oneOnOneTitle.trim().length > 0 &&
        oneOnOneReview.trim().length > 0 &&
        oneOnOneImprovements.trim().length > 0 &&
        oneOnOnePdiGoals.trim().length > 0
      );
    } else {
      // Feedback Operacional
      if (!feedbackTitle.trim()) return false;
      if (feedbackTone === 'positive') {
        return positiveStrengths.trim().length > 0;
      } else {
        return improvementPoints.trim().length > 0 && improvementActionPlan.trim().length > 0;
      }
    }
  }, [
    agentId,
    isOneOnOne,
    oneOnOneTitle,
    oneOnOneReview,
    oneOnOneImprovements,
    oneOnOnePdiGoals,
    feedbackTitle,
    feedbackTone,
    positiveStrengths,
    improvementPoints,
    improvementActionPlan,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !isFormValid) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      let payloadTitle = '';
      let payloadStrengths: string | null = null;
      let payloadImprovements = '';
      let payloadActionPlan = '';
      let payloadDeadline: string | null = null;

      if (isOneOnOne) {
        // Formatar 1:1
        payloadTitle = oneOnOneTitle.trim().startsWith('[1:1]')
          ? oneOnOneTitle.trim()
          : `[1:1] ${oneOnOneTitle.trim()}`;

        const strengthsSection = [
          oneOnOneReview.trim() ? `• Balanço do Período & Reconhecimento:\n${oneOnOneReview.trim()}` : null,
          oneOnOneMood.trim() ? `• Clima & Motivação do Atendente:\n${oneOnOneMood.trim()}` : null,
        ].filter(Boolean).join('\n\n');

        payloadStrengths = strengthsSection || 'Alinhamento 1:1 realizado com foco no desenvolvimento contínuo.';
        payloadImprovements = oneOnOneImprovements.trim();

        const planSection = [
          `• Metas Combinadas de PDI:\n${oneOnOnePdiGoals.trim()}`,
          oneOnOneManagerCommitment.trim() ? `• Apoio da Liderança:\n${oneOnOneManagerCommitment.trim()}` : null,
        ].filter(Boolean).join('\n\n');

        payloadActionPlan = planSection;
        payloadDeadline = oneOnOneNextDate || null;
      } else {
        // Feedback Operacional
        if (feedbackTone === 'positive') {
          payloadTitle = feedbackTitle.trim().startsWith('[Feedback Positivo]')
            ? feedbackTitle.trim()
            : `[Feedback Positivo] ${feedbackTitle.trim()}`;

          const strengthsText = [
            `• Conduta Exemplar & Reconhecimento:\n${positiveStrengths.trim()}`,
            positiveBestPractices.trim() ? `• Boas Práticas a Manter:\n${positiveBestPractices.trim()}` : null,
          ].filter(Boolean).join('\n\n');

          payloadStrengths = strengthsText;
          // Preencher campos técnicos para satisfazer constraints NOT NULL sem penalizar o atendente
          payloadImprovements = 'Conduta exemplar registrada com sucesso — foco em manter a excelência demonstrada.';
          payloadActionPlan = positiveBestPractices.trim()
            ? `Manter as seguintes práticas observadas:\n${positiveBestPractices.trim()}`
            : 'Continuar aplicando os padrões de cordialidade, assertividade e agilidade demonstrados nos próximos atendimentos.';
          payloadDeadline = null;
        } else {
          payloadTitle = feedbackTitle.trim().startsWith('[Feedback Operacional]')
            ? feedbackTitle.trim()
            : `[Feedback Operacional] ${feedbackTitle.trim()}`;

          payloadStrengths = null;
          payloadImprovements = improvementPoints.trim();
          payloadActionPlan = improvementActionPlan.trim();
          payloadDeadline = feedbackDeadline || null;
        }
      }

      const success = await onSubmit({
        agent_id: agentId,
        team_id: detectedTeam?.id || null,
        monitoria_id: selectedMonitoriaId || null,
        title: payloadTitle,
        strengths: payloadStrengths,
        improvements: payloadImprovements,
        action_plan: payloadActionPlan,
        deadline_date: payloadDeadline,
      });

      if (success) {
        onClose();
      } else {
        setSubmitError('Não foi possível registrar o alinhamento. Por favor, verifique as informações e tente novamente.');
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Ocorreu um erro inesperado ao salvar.');
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
        className="relative w-full max-w-2xl bg-surface-bg border border-surface-border rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh] focus:outline-none"
      >
        {/* Header Específico por Aba */}
        <div className="p-4 sm:p-5 border-b border-surface-border flex items-center justify-between bg-surface-card flex-shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isOneOnOne
                  ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                  : feedbackTone === 'positive'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }`}
            >
              {isOneOnOne ? (
                <Award className="w-5 h-5" />
              ) : feedbackTone === 'positive' ? (
                <ThumbsUp className="w-5 h-5" />
              ) : (
                <MessageSquare className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <h2
                id="create-feedback-title"
                className="text-sm sm:text-base font-black text-brand-primary uppercase tracking-wider truncate"
              >
                {isOneOnOne ? 'Novo Alinhamento Mensal 1:1 & PDI' : 'Novo Feedback Operacional'}
              </h2>
              <p
                id="create-feedback-subtitle"
                className="text-xs text-brand-muted font-medium truncate"
              >
                {isOneOnOne
                  ? 'Reunião periódica individual com metas de PDI e ciência digital'
                  : 'Registro focado com ciência do atendente e orientações claras'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2.5 rounded-xl text-brand-muted hover:text-brand-primary hover:bg-surface-subtle transition-colors cursor-pointer shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent disabled:opacity-50"
            aria-label="Fechar formulário"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário com scroll */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs font-medium text-brand-primary">
          {/* Mensagem de Erro */}
          {submitError && (
            <div
              role="alert"
              className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-rose-700 dark:text-rose-400 text-xs font-semibold"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="break-words">{submitError}</span>
            </div>
          )}

          {/* SEÇÃO 1: Seleção de Atendente com Busca Digitável */}
          <div className="space-y-1.5" ref={dropdownRef}>
            <label className="block text-[10px] font-black uppercase tracking-wider text-brand-muted">
              Atendente Avaliado *
            </label>

            {selectedAgent ? (
              /* Card do Atendente Selecionado */
              <div className="p-3 rounded-xl border border-surface-border bg-surface-card flex items-center justify-between gap-3 animate-fade-in">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-brand-accent/10 text-brand-accent flex items-center justify-center font-bold text-sm shrink-0 uppercase">
                    {selectedAgent.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-brand-primary truncate">{selectedAgent.name}</span>
                      <UserCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-brand-muted truncate">
                      <span>{selectedAgent.email}</span>
                      {detectedTeam && (
                        <>
                          <span>•</span>
                          <span className="font-semibold text-brand-secondary">{detectedTeam.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleClearAgent}
                  disabled={submitting}
                  className="px-2.5 py-1 text-[11px] font-bold text-brand-muted hover:text-brand-primary bg-surface-subtle hover:bg-surface-border rounded-lg transition-colors cursor-pointer shrink-0 min-h-[36px]"
                >
                  Trocar
                </button>
              </div>
            ) : (
              /* Input de Busca Digitável */
              <div className="relative">
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-brand-muted absolute left-3.5 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={agentSearch}
                    onChange={e => {
                      setAgentSearch(e.target.value);
                      setIsSearchOpen(true);
                    }}
                    onFocus={() => setIsSearchOpen(true)}
                    placeholder="Digite o nome, e-mail ou equipe para encontrar o atendente..."
                    className="w-full pl-10 pr-4 py-2.5 bg-surface-card border border-surface-border rounded-xl text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-brand-accent min-h-[44px]"
                  />
                </div>

                {/* Dropdown de Sugestões em Tempo Real */}
                {isSearchOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-surface-card border border-surface-border rounded-xl shadow-2xl max-h-56 overflow-y-auto z-50 py-1 divide-y divide-surface-border/50">
                    {filteredAgents.length === 0 ? (
                      <div className="p-3 text-center text-[11px] text-brand-muted">
                        Nenhum atendente de suporte encontrado para &ldquo;{agentSearch}&rdquo;.
                      </div>
                    ) : (
                      filteredAgents.map(agent => {
                        const agentTeam = teams.find(t => t.id === (agent.team_ids?.[0] || agent.primary_team_id));
                        return (
                          <button
                            key={agent.id}
                            type="button"
                            onClick={() => handleSelectAgent(agent)}
                            className="w-full text-left px-3.5 py-2.5 hover:bg-surface-subtle transition-colors flex items-center justify-between gap-2 cursor-pointer group"
                          >
                            <div className="min-w-0">
                              <span className="font-bold text-xs text-brand-primary group-hover:text-brand-accent transition-colors block truncate">
                                {agent.name}
                              </span>
                              <span className="text-[10px] text-brand-muted block truncate">
                                {agent.email} {agentTeam ? `• ${agentTeam.name}` : ''}
                              </span>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-brand-muted group-hover:text-brand-accent transition-colors shrink-0" />
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Se for FEEDBACK OPERACIONAL: Seletor Positivo vs Melhoria */}
          {!isOneOnOne && (
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5">
                  Tom do Feedback Operacional *
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-surface-subtle border border-surface-border rounded-xl">
                  <button
                    type="button"
                    onClick={() => setFeedbackTone('positive')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      feedbackTone === 'positive'
                        ? 'bg-emerald-600 text-white shadow-xs font-black'
                        : 'text-brand-muted hover:text-emerald-600 dark:hover:text-emerald-400'
                    }`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                    <span>Feedback Positivo / Reconhecimento</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedbackTone('improvement')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      feedbackTone === 'improvement'
                        ? 'bg-amber-600 text-white shadow-xs font-black'
                        : 'text-brand-muted hover:text-amber-600 dark:hover:text-amber-400'
                    }`}
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Oportunidade de Melhoria</span>
                  </button>
                </div>
              </div>

              {/* Título do Feedback */}
              <div>
                <label
                  htmlFor="feedback-title-input"
                  className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5"
                >
                  Assunto do Feedback *
                </label>
                <input
                  id="feedback-title-input"
                  type="text"
                  required
                  value={feedbackTitle}
                  onChange={e => setFeedbackTitle(e.target.value)}
                  placeholder={
                    feedbackTone === 'positive'
                      ? 'Ex.: Elogio de Cliente no Chamado / Postura Exemplar na Condução'
                      : 'Ex.: Assertividade na Triagem Técnica do N1'
                  }
                  className="w-full bg-surface-card border border-surface-border rounded-xl px-3.5 py-2.5 text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-brand-accent font-semibold min-h-[44px]"
                />
              </div>

              {/* Monitoria Vinculada (opcional) */}
              <div>
                <label
                  htmlFor="feedback-monitoria-select"
                  className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5"
                >
                  Monitoria Vinculada (Opcional)
                </label>
                <select
                  id="feedback-monitoria-select"
                  value={selectedMonitoriaId}
                  onChange={e => setSelectedMonitoriaId(e.target.value)}
                  disabled={!agentId}
                  className="w-full bg-surface-card border border-surface-border rounded-xl px-3 py-2.5 text-xs font-semibold text-brand-primary focus:outline-none focus:border-brand-accent disabled:opacity-50 min-h-[44px]"
                >
                  <option value="">Nenhuma (Alinhamento Geral / Sem chamado específico)</option>
                  {agentMonitorias.map(m => (
                    <option key={m.id} value={m.id}>
                      Ticket #{m.ticket_id} — Nota: {m.score ?? '—'}% ({new Date(m.created_at).toLocaleDateString('pt-BR')})
                    </option>
                  ))}
                </select>
              </div>

              {/* CAMPOS SE FOR FEEDBACK POSITIVO */}
              {feedbackTone === 'positive' ? (
                <div className="space-y-4 animate-fade-in">
                  <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-2">
                    <label
                      htmlFor="positive-strengths-input"
                      className="block text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"
                    >
                      <Award className="w-4 h-4 shrink-0" />
                      Pontos Positivos, Elogios & Conduta Exemplar *
                    </label>
                    <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 leading-relaxed">
                      Descreva detalhadamente o que o atendente realizou com maestria. Este registro valoriza a postura profissional e motiva a equipe.
                    </p>
                    <textarea
                      id="positive-strengths-input"
                      required
                      rows={4}
                      value={positiveStrengths}
                      onChange={e => setPositiveStrengths(e.target.value)}
                      placeholder="Ex.: O atendente demonstrou altíssima empatia e escuta ativa durante todo o contato. O cliente expressou elogio nominal pela rapidez e clareza na resolução do chamado..."
                      className="w-full bg-surface-card border border-emerald-500/30 rounded-xl p-3 text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-emerald-500 resize-none font-medium"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="positive-practices-input"
                      className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5 flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      Boas Práticas a Manter (Opcional)
                    </label>
                    <textarea
                      id="positive-practices-input"
                      rows={2}
                      value={positiveBestPractices}
                      onChange={e => setPositiveBestPractices(e.target.value)}
                      placeholder="Ex.: Continuar utilizando a saudação cordial e a confirmação ativa antes do encerramento..."
                      className="w-full bg-surface-card border border-surface-border rounded-xl p-3 text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-brand-accent resize-none font-medium"
                    />
                  </div>
                </div>
              ) : (
                /* CAMPOS SE FOR FEEDBACK DE OPORTUNIDADE DE MELHORIA */
                <div className="space-y-4 animate-fade-in">
                  <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 space-y-2">
                    <label
                      htmlFor="improvement-points-input"
                      className="block text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Pontos de Oportunidades de Melhoria & Desvios Observados *
                    </label>
                    <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
                      Explique com clareza o comportamento ou procedimento que necessita de correção, sem tom punitivo.
                    </p>
                    <textarea
                      id="improvement-points-input"
                      required
                      rows={3}
                      value={improvementPoints}
                      onChange={e => setImprovementPoints(e.target.value)}
                      placeholder="Ex.: Foi identificado que o chamado foi escalado para o N2 sem os testes prévios de conectividade descritos no checklist padrão..."
                      className="w-full bg-surface-card border border-amber-500/30 rounded-xl p-3 text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-amber-500 resize-none font-medium"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <label
                        htmlFor="improvement-action-plan-input"
                        className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        Plano de Ação Corretivo Imediato *
                      </label>

                      <button
                        type="button"
                        onClick={() => setShowActionPlanHelp(prev => !prev)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        <Lightbulb className="w-3.5 h-3.5" />
                        <span>Ver modelos prontos</span>
                        {showActionPlanHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>

                    {showActionPlanHelp && (
                      <div className="p-3 rounded-xl border border-blue-500/30 bg-blue-50/70 dark:bg-blue-950/30 space-y-2 text-xs animate-fade-in">
                        <span className="text-[10px] font-black uppercase tracking-wider text-brand-muted block">
                          Clique em um modelo para aplicar:
                        </span>
                        <div className="grid grid-cols-1 gap-2">
                          {ACTION_PLAN_EXAMPLES.map((ex, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 rounded-lg bg-surface-card border border-surface-border hover:border-blue-500/50 transition-all flex flex-col gap-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-[11px] text-brand-primary">{ex.category}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setImprovementActionPlan(ex.template);
                                    setCopiedExampleIndex(idx);
                                    setTimeout(() => setCopiedExampleIndex(null), 2500);
                                  }}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-1 rounded cursor-pointer"
                                >
                                  {copiedExampleIndex === idx ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-500" />
                                      <span>Aplicado!</span>
                                    </>
                                  ) : (
                                    <>
                                      <span>Usar</span>
                                      <ChevronRight className="w-3 h-3" />
                                    </>
                                  )}
                                </button>
                              </div>
                              <p className="text-[10px] text-brand-muted italic">{ex.context}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <textarea
                      id="improvement-action-plan-input"
                      required
                      rows={3}
                      value={improvementActionPlan}
                      onChange={e => setImprovementActionPlan(e.target.value)}
                      placeholder="Ex.: Nos próximos 15 dias, anexar o print do teste de ping no chamado antes de transferir ao N2 e revisar o artigo #402..."
                      className="w-full bg-surface-card border border-surface-border rounded-xl p-3 text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-blue-500 resize-none font-medium"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="feedback-deadline-input"
                      className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5 flex items-center gap-1.5"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      Data de Acompanhamento / Revisão do Plano
                    </label>
                    <input
                      id="feedback-deadline-input"
                      type="date"
                      value={feedbackDeadline}
                      onChange={e => setFeedbackDeadline(e.target.value)}
                      className="w-full sm:w-60 bg-surface-card border border-surface-border rounded-xl px-3 py-2 text-xs font-semibold text-brand-primary focus:outline-none focus:border-brand-accent min-h-[44px]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Se for 1:1 & PDI: Ficha de Reunião Periódica de Desenvolvimento */}
          {isOneOnOne && (
            <div className="space-y-4 animate-fade-in">
              {/* Título do 1:1 */}
              <div>
                <label
                  htmlFor="oneonone-title-input"
                  className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5"
                >
                  Título do Alinhamento 1:1 *
                </label>
                <input
                  id="oneonone-title-input"
                  type="text"
                  required
                  value={oneOnOneTitle}
                  onChange={e => setOneOnOneTitle(e.target.value)}
                  placeholder="Ex.: Alinhamento Mensal - Outubro/2026 - PDI & Qualidade"
                  className="w-full bg-surface-card border border-surface-border rounded-xl px-3.5 py-2.5 text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-purple-500 font-semibold min-h-[44px]"
                />
              </div>

              {/* 1. Clima & Motivação */}
              <div className="p-3.5 rounded-xl border border-surface-border bg-surface-subtle/50 space-y-1.5">
                <label
                  htmlFor="oneonone-mood-input"
                  className="block text-[10px] font-black uppercase tracking-wider text-brand-muted flex items-center gap-1.5"
                >
                  <Smile className="w-3.5 h-3.5 text-purple-500" />
                  1. Pauta da Reunião / Clima & Motivação (Opcional)
                </label>
                <textarea
                  id="oneonone-mood-input"
                  rows={2}
                  value={oneOnOneMood}
                  onChange={e => setOneOnOneMood(e.target.value)}
                  placeholder="Como o liderado está se sentindo na equipe? Desafios na rotina, engajamento e autopercepção..."
                  className="w-full bg-surface-card border border-surface-border rounded-xl p-2.5 text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-purple-500 resize-none font-medium"
                />
              </div>

              {/* 2. Balanço do Período & Reconhecimento */}
              <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-950/10 space-y-1.5">
                <label
                  htmlFor="oneonone-review-input"
                  className="block text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"
                >
                  <Award className="w-3.5 h-3.5" />
                  2. Balanço do Período (Revisão da Qualidade & Pontos Fortes) *
                </label>
                <textarea
                  id="oneonone-review-input"
                  required
                  rows={2}
                  value={oneOnOneReview}
                  onChange={e => setOneOnOneReview(e.target.value)}
                  placeholder="O que funcionou muito bem no último ciclo? Conquistas, evolução em notas de qualidade e elogios..."
                  className="w-full bg-surface-card border border-emerald-500/30 rounded-xl p-2.5 text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-emerald-500 resize-none font-medium"
                />
              </div>

              {/* 3. Focos de Desenvolvimento */}
              <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-50/30 dark:bg-amber-950/10 space-y-1.5">
                <label
                  htmlFor="oneonone-improvements-input"
                  className="block text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  3. Oportunidades & Focos de Desenvolvimento no Próximo Ciclo *
                </label>
                <textarea
                  id="oneonone-improvements-input"
                  required
                  rows={2}
                  value={oneOnOneImprovements}
                  onChange={e => setOneOnOneImprovements(e.target.value)}
                  placeholder="Quais competências técnicas, comportamentais ou procedimentais o atendente precisa desenvolver?"
                  className="w-full bg-surface-card border border-amber-500/30 rounded-xl p-2.5 text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-amber-500 resize-none font-medium"
                />
              </div>

              {/* 4. Metas Combinadas de PDI */}
              <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-50/30 dark:bg-blue-950/10 space-y-1.5">
                <label
                  htmlFor="oneonone-pdi-input"
                  className="block text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1.5"
                >
                  <Target className="w-3.5 h-3.5" />
                  4. Plano de Desenvolvimento Individual (PDI) & Metas Combinadas *
                </label>
                <textarea
                  id="oneonone-pdi-input"
                  required
                  rows={3}
                  value={oneOnOnePdiGoals}
                  onChange={e => setOneOnOnePdiGoals(e.target.value)}
                  placeholder="Quais são as metas práticas acordadas? Ex.: 1. Atingir média >= 85% em monitorias; 2. Fazer o curso interno de rotinas fiscais; 3. Zerar reincidência de testes..."
                  className="w-full bg-surface-card border border-blue-500/30 rounded-xl p-2.5 text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-blue-500 resize-none font-medium"
                />
              </div>

              {/* 5. Compromissos do Gestor & Próxima Sessão */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="oneonone-manager-commitment"
                    className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5 flex items-center gap-1.5"
                  >
                    <Shield className="w-3.5 h-3.5 text-brand-accent" />
                    5. Apoio e Ações da Liderança (Opcional)
                  </label>
                  <textarea
                    id="oneonone-manager-commitment"
                    rows={2}
                    value={oneOnOneManagerCommitment}
                    onChange={e => setOneOnOneManagerCommitment(e.target.value)}
                    placeholder="O que o gestor se compromete a fornecer (mentorias, ferramentas, suporte)..."
                    className="w-full bg-surface-card border border-surface-border rounded-xl p-2.5 text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-brand-accent resize-none font-medium"
                  />
                </div>

                <div>
                  <label
                    htmlFor="oneonone-next-date"
                    className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5 flex items-center gap-1.5"
                  >
                    <Clock className="w-3.5 h-3.5 text-purple-500" />
                    Data da Próxima Sessão de 1:1
                  </label>
                  <input
                    id="oneonone-next-date"
                    type="date"
                    value={oneOnOneNextDate}
                    onChange={e => setOneOnOneNextDate(e.target.value)}
                    className="w-full bg-surface-card border border-surface-border rounded-xl px-3 py-2.5 text-xs font-semibold text-brand-primary focus:outline-none focus:border-purple-500 min-h-[44px]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Rodapé / Botões */}
          <div className="pt-4 border-t border-surface-border flex items-center justify-end gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-bold text-brand-muted hover:text-brand-primary rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer min-h-[44px] disabled:opacity-50"
            >
              Cancelar
            </button>
            <Button
              type="submit"
              disabled={submitting || !isFormValid}
              className={`px-5 py-2 text-xs font-bold min-h-[44px] flex items-center justify-center ${
                isOneOnOne
                  ? 'bg-purple-600 hover:bg-purple-700 text-white'
                  : feedbackTone === 'positive'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-brand-accent hover:bg-brand-accent/90 text-white'
              }`}
            >
              {submitting
                ? 'Salvando...'
                : isOneOnOne
                ? 'Salvar Alinhamento 1:1 & PDI'
                : feedbackTone === 'positive'
                ? 'Registrar Feedback Positivo'
                : 'Registrar Feedback Operacional'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
