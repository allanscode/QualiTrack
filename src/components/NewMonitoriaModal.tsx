import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Search,
  Sparkles,
  Bot,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  User,
  Users,
  Building2,
  Tag,
  Hash,
  MessageSquare,
  Loader2,
  RefreshCw,
  Eye,
  Plus,
} from 'lucide-react';
import { Monitoria, User as UserType, Team, EvaluationForm, AIEvaluationResult } from '../types';
import Button from './ui/Button';
import Badge from './ui/Badge';
import { toast } from 'sonner';
import {
  lookupTicketFromHelpdesk,
  ZendeskTicketDetails,
  fetchTicketDialogue,
  evaluateTicketWithAI,
  resolveCustomerType,
  resolveFormAndGuidelineForCustomerType,
  normalizeChannel,
} from '../lib/helpdeskQueue';
import { fetchAIGuidelines } from '../lib/aiGuidelines';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';

interface NewMonitoriaModalProps {
  isOpen: boolean;
  onClose: () => void;
  monitorias: Monitoria[];
  users: UserType[];
  teams: Team[];
  forms: EvaluationForm[];
  currentUser: UserType | null;
  onStartAudit: (prefill: any) => void;
  onViewExistingMonitoria: (monitoriaId: string) => void;
  onOpenBlankForm: () => void;
}

export default function NewMonitoriaModal({
  isOpen,
  onClose,
  monitorias,
  users,
  teams,
  forms,
  currentUser,
  onStartAudit,
  onViewExistingMonitoria,
  onOpenBlankForm,
}: NewMonitoriaModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { dialogProps } = useDialogAccessibility({
    isOpen,
    onClose,
    dialogRef,
    initialFocusRef: inputRef,
    ariaLabelledBy: 'new-monitoria-modal-title',
    ariaDescribedBy: 'new-monitoria-modal-subtitle',
  });

  const [ticketInput, setTicketInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchedId, setSearchedId] = useState<string | null>(null);
  const [ticketDetails, setTicketDetails] = useState<ZendeskTicketDetails | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Controle de permissão para nova avaliação quando já existe
  const [forceAllowNew, setForceAllowNew] = useState(false);

  // Estado de avaliação por IA em andamento
  const [evaluatingAI, setEvaluatingAI] = useState(false);
  const [aiProgressStage, setAiProgressStage] = useState<string>('');

  // Resetar estados ao abrir/fechar
  useEffect(() => {
    if (isOpen) {
      setTicketInput('');
      setSearchedId(null);
      setTicketDetails(null);
      setNotFound(false);
      setErrorMessage(null);
      setForceAllowNew(false);
      setEvaluatingAI(false);
      setAiProgressStage('');
    }
  }, [isOpen]);

  // Busca monitorias existentes para o ticket pesquisado
  const existingMonitorias = useMemo(() => {
    if (!searchedId) return [];
    const clean = searchedId.trim().toLowerCase();
    return monitorias.filter(m => m.active !== false && String(m.ticket_id || '').trim().toLowerCase() === clean);
  }, [monitorias, searchedId]);

  // Função para executar a busca do ticket
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = ticketInput.trim();
    if (!raw) return;

    // Extrai os dígitos do número do chamado ou da URL digitada
    const cleanId = raw.replace(/\D/g, '');
    if (!cleanId) {
      toast.error('Informe um número válido de chamado.');
      return;
    }

    setSearching(true);
    setSearchedId(cleanId);
    setTicketDetails(null);
    setNotFound(false);
    setErrorMessage(null);
    setForceAllowNew(false);

    try {
      const res = await lookupTicketFromHelpdesk(cleanId);
      if (res.found && res.ticket) {
        setTicketDetails(res.ticket);
      } else {
        setNotFound(true);
        setErrorMessage(res.message || 'Chamado não encontrado no Zendesk.');
      }
    } catch (err: any) {
      setNotFound(true);
      setErrorMessage(err?.message || 'Erro ao consultar o helpdesk.');
    } finally {
      setSearching(false);
    }
  };

  // Helper para nome do atendente/avaliador anonimizado para suporte se necessário
  const getAuditorDisplayName = (evaluatorId?: string, evaluatorName?: string) => {
    if (currentUser?.role === 'suporte') return 'Equipe de Qualidade';
    if (evaluatorName) return evaluatorName;
    const u = users.find(x => x.id === evaluatorId);
    return u?.name || 'Avaliador';
  };

  // 1. Iniciar Avaliação Manual
  const handleStartManual = () => {
    if (!ticketDetails) return;

    // Resolver ID do atendente avaliado
    const matchedAgent = ticketDetails.matched_agent;
    const evaluatedId = matchedAgent?.id || undefined;
    const teamId = ticketDetails.matched_team_id || matchedAgent?.primary_team_id || undefined;

    // Resolver formulário baseado nas tags
    const customerType = resolveCustomerType(ticketDetails.tags, []);
    const { form: suggestedForm } = resolveFormAndGuidelineForCustomerType(customerType, forms, []);

    onStartAudit({
      ticket_id: ticketDetails.ticket_id,
      ticket_subject: ticketDetails.subject,
      form_id: suggestedForm?.id || forms[0]?.id,
      evaluated_id: evaluatedId,
      team_id: teamId,
      channel: normalizeChannel(ticketDetails.channel),
      ticket_date: ticketDetails.created_at ? ticketDetails.created_at.split('T')[0] : undefined,
      satisfaction_result: ticketDetails.satisfaction_result,
      satisfaction_has_record: Boolean(ticketDetails.satisfaction_rating?.comment),
      satisfaction_record_text: ticketDetails.satisfaction_rating?.comment || '',
      customerType,
      isAiLocked: false,
    });

    onClose();
  };

  // 2. Iniciar Avaliação com IA
  const handleStartAI = async () => {
    if (!ticketDetails || evaluatingAI) return;

    setEvaluatingAI(true);
    setAiProgressStage('Carregando transcrição e histórico do chamado...');

    try {
      // 1. Obter diálogo e contexto do ticket
      const dialogueResult = await fetchTicketDialogue(ticketDetails.ticket_id);
      const dialogue = dialogueResult.comments || [];

      setAiProgressStage('Identificando perfil de cliente e manuais de atendimento...');
      const customerType = resolveCustomerType(ticketDetails.tags, dialogueResult.organizationTags || []);
      const guidelines = await fetchAIGuidelines();
      const { form: formToUse, guideline: guidelineToUse } = resolveFormAndGuidelineForCustomerType(
        customerType,
        forms,
        guidelines
      );

      if (!formToUse) {
        throw new Error('Nenhum formulário de avaliação ativo encontrado no sistema.');
      }

      setAiProgressStage('Analisando critérios de qualidade com a Inteligência Artificial...');

      const matchedAgent = ticketDetails.matched_agent;
      const teamId = ticketDetails.matched_team_id || matchedAgent?.primary_team_id || undefined;
      const teamObj = teams.find(t => t.id === teamId);

      const aiResult = await evaluateTicketWithAI(
        ticketDetails.ticket_id,
        formToUse,
        dialogue,
        {
          name: matchedAgent?.name || ticketDetails.agent?.name,
          email: matchedAgent?.email || ticketDetails.agent?.email,
          team_name: teamObj?.name || ticketDetails.group_name || undefined,
          channel: normalizeChannel(ticketDetails.channel),
        },
        guidelineToUse ? [guidelineToUse.id] : undefined,
        dialogueResult.ticketFields
      );

      if ('queued' in aiResult) {
        toast.info('Avaliação com IA enfileirada no servidor.');
        onClose();
        return;
      }

      setAiProgressStage('Preparando formulário pré-avaliado...');

      onStartAudit({
        ticket_id: ticketDetails.ticket_id,
        ticket_subject: ticketDetails.subject,
        form_id: formToUse.id,
        evaluated_id: matchedAgent?.id,
        team_id: teamId,
        channel: normalizeChannel(ticketDetails.channel),
        ticket_date: ticketDetails.created_at ? ticketDetails.created_at.split('T')[0] : undefined,
        satisfaction_result: ticketDetails.satisfaction_result,
        satisfaction_has_record: Boolean(ticketDetails.satisfaction_rating?.comment),
        satisfaction_record_text: ticketDetails.satisfaction_rating?.comment || '',
        customerType,
        ticket_fields: dialogueResult.ticketFields,
        aiEvaluation: aiResult,
        dialogue,
        isAiLocked: false,
      });

      toast.success('Avaliação com IA concluída com sucesso! Revise os apontamentos.');
      onClose();
    } catch (err: any) {
      console.error('[NewMonitoriaModal] Erro na avaliação com IA:', err);
      toast.error(err?.message || 'Falha ao executar avaliação com IA. Você pode prosseguir manualmente.');
      setEvaluatingAI(false);
      setAiProgressStage('');
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div
        ref={dialogRef}
        {...dialogProps}
        className="w-full max-w-2xl bg-surface-card border border-surface-border rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
      >
        {/* Cabeçalho */}
        <div className="p-4 sm:p-5 border-b border-surface-border flex items-center justify-between bg-surface-subtle/30 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-accent/10 text-brand-accent flex items-center justify-center shrink-0">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h2 id="new-monitoria-modal-title" className="text-base sm:text-lg font-black text-brand-primary tracking-tight">
                Iniciar Nova Monitoria
              </h2>
              <p id="new-monitoria-modal-subtitle" className="text-xs text-brand-muted font-medium">
                Localize o chamado no Zendesk para auditar com a IA ou avaliação manual guiada.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-brand-muted hover:text-brand-primary rounded-lg hover:bg-surface-subtle transition-colors cursor-pointer"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com scroll */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Campo de Busca do Ticket */}
          <form onSubmit={handleSearch} className="space-y-2">
            <label className="block text-xs font-black uppercase tracking-wider text-brand-muted">
              Número ou Link do Chamado (Zendesk)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Hash className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-muted" />
                <input
                  ref={inputRef}
                  type="text"
                  value={ticketInput}
                  onChange={e => setTicketInput(e.target.value)}
                  placeholder="Ex: 123456 ou cole a URL do ticket..."
                  disabled={searching || evaluatingAI}
                  className="w-full bg-surface-card border border-surface-border rounded-xl pl-9 pr-3 py-2.5 text-xs font-bold text-brand-primary placeholder:text-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all shadow-xs"
                />
              </div>
              <Button
                type="submit"
                disabled={searching || !ticketInput.trim() || evaluatingAI}
                className="px-5 py-2.5 text-xs font-bold flex items-center gap-1.5 shrink-0"
              >
                {searching ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Localizando...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Buscar Chamado</span>
                  </>
                )}
              </Button>
            </div>
            <p className="text-[11px] text-brand-muted">
              Dica: Você pode digitar apenas os números ou colar diretamente o link completo do ticket copiado do Zendesk.
            </p>
          </form>

          {/* Loading da Avaliação com IA */}
          {evaluatingAI && (
            <div className="p-6 rounded-2xl bg-brand-accent/5 border border-brand-accent/20 text-center space-y-3 animate-fade-in">
              <div className="w-12 h-12 rounded-2xl bg-brand-accent/10 text-brand-accent flex items-center justify-center mx-auto animate-pulse">
                <Sparkles className="w-6 h-6 animate-spin" />
              </div>
              <div>
                <h4 className="text-sm font-black text-brand-primary">Processando Avaliação com Inteligência Artificial</h4>
                <p className="text-xs text-brand-muted font-medium mt-1">{aiProgressStage}</p>
              </div>
              <div className="w-48 h-1.5 bg-surface-subtle rounded-full mx-auto overflow-hidden">
                <div className="h-full bg-brand-accent rounded-full animate-indeterminate" />
              </div>
            </div>
          )}

          {/* Cenário 1: ALERTA DE MONITORIAS JÁ EXISTENTES */}
          {searchedId && existingMonitorias.length > 0 && !evaluatingAI && (
            <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-3 animate-fade-in">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs sm:text-sm font-black text-amber-900 dark:text-amber-200">
                      Chamado #{searchedId} já possui {existingMonitorias.length} monitoria{existingMonitorias.length !== 1 ? 's' : ''} cadastrada{existingMonitorias.length !== 1 ? 's' : ''}
                    </h3>
                    <Badge variant="warning" size="xs">
                      Já Auditado
                    </Badge>
                  </div>
                  <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1 font-medium">
                    Para evitar auditorias duplicadas acidentais, verifique a monitoria existente antes de abrir uma nova avaliação.
                  </p>
                </div>
              </div>

              {/* Lista das Monitorias Existentes */}
              <div className="space-y-2 pt-1">
                {existingMonitorias.map(m => {
                  const agentName = users.find(u => u.id === m.evaluated_id)?.name || 'Atendente';
                  const dateStr = new Date(m.created_at).toLocaleDateString('pt-BR');
                  const scoreColor = m.score >= 90 ? 'text-emerald-600' : m.score >= 75 ? 'text-amber-600' : 'text-rose-600';

                  return (
                    <div
                      key={m.id}
                      className="p-3 bg-surface-card rounded-xl border border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="font-bold text-brand-primary">Atendente: {agentName}</span>
                          <span className="text-brand-muted">•</span>
                          <span className="text-brand-muted">Data: {dateStr}</span>
                          <span className="text-brand-muted">•</span>
                          <span className="font-mono text-xs text-brand-muted">
                            Auditor: {getAuditorDisplayName(m.evaluator_id, m.evaluator_name)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="neutral" size="xs">
                            Status: {m.status}
                          </Badge>
                          <span className={`text-xs font-black ${scoreColor}`}>
                            Nota: {m.score}%
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onViewExistingMonitoria(m.id);
                          onClose();
                        }}
                        className="px-3.5 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Visualizar Monitoria</span>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Botão para Forçar Nova Avaliação se necessário */}
              {!forceAllowNew && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setForceAllowNew(true)}
                    className="text-xs font-bold text-brand-accent hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span>Deseja criar uma nova avaliação para este chamado mesmo assim?</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Cenário 2: TICKET NÃO ENCONTRADO NO ZENDESK */}
          {notFound && !evaluatingAI && (
            <div className="p-4 sm:p-5 rounded-2xl bg-surface-subtle/50 border border-surface-border text-center space-y-3 animate-fade-in">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-black text-brand-primary">
                  Chamado #{searchedId} não localizado no Zendesk
                </h4>
                <p className="text-xs text-brand-muted mt-1 max-w-md mx-auto">
                  {errorMessage || 'O chamado não foi encontrado na base de dados do helpdesk. Verifique se digitou os números corretamente.'}
                </p>
              </div>
              <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setSearchedId(null);
                    setNotFound(false);
                    setTicketInput('');
                    inputRef.current?.focus();
                  }}
                  className="px-3.5 py-1.5 text-xs font-bold text-brand-muted hover:text-brand-primary rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer"
                >
                  Tentar outro número
                </button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onOpenBlankForm();
                    onClose();
                  }}
                  className="text-xs font-bold"
                >
                  Abrir formulário manual em branco
                </Button>
              </div>
            </div>
          )}

          {/* Cenário 3: TICKET LOCALIZADO NO ZENDESK */}
          {ticketDetails && (existingMonitorias.length === 0 || forceAllowNew) && !evaluatingAI && (
            <div className="space-y-4 animate-fade-in">
              {/* Card de Resumo do Chamado */}
              <div className="p-4 sm:p-5 rounded-2xl bg-surface-card border border-surface-border shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-black bg-brand-primary/10 text-brand-primary">
                      #{ticketDetails.ticket_id}
                    </span>
                    <Badge variant="info" size="xs">
                      {ticketDetails.channel || 'Chat'}
                    </Badge>
                    <Badge variant={ticketDetails.status === 'solved' || ticketDetails.status === 'closed' ? 'success' : 'neutral'} size="xs">
                      Status: {ticketDetails.status}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-brand-muted font-medium">
                    Aberto em: {new Date(ticketDetails.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>

                <div>
                  <h3 className="text-xs sm:text-sm font-black text-brand-primary leading-snug">
                    {ticketDetails.subject}
                  </h3>
                  {ticketDetails.description && (
                    <p className="text-xs text-brand-muted line-clamp-2 mt-1 leading-relaxed">
                      {ticketDetails.description}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-surface-border/60 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-brand-muted block">Atendente Responsável</span>
                    <div className="font-semibold text-brand-primary flex items-center gap-1.5 mt-0.5">
                      <User className="w-3.5 h-3.5 text-brand-accent shrink-0" />
                      <span className="truncate">{ticketDetails.agent?.name || 'Não atribuído'}</span>
                      {ticketDetails.matched_agent ? (
                        <Badge variant="success" size="xs">Cadastrado</Badge>
                      ) : (
                        <Badge variant="neutral" size="xs">Provisório</Badge>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-brand-muted block">Equipe / Grupo</span>
                    <div className="font-semibold text-brand-primary flex items-center gap-1.5 mt-0.5">
                      <Users className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                      <span className="truncate">{ticketDetails.group_name || 'Sem equipe'}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-brand-muted block">Cliente / Posto</span>
                    <div className="font-semibold text-brand-primary flex items-center gap-1.5 mt-0.5">
                      <Building2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="truncate">{ticketDetails.organization_name || ticketDetails.requester?.name || 'Não identificado'}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-brand-muted block">Pesquisa de Satisfação</span>
                    <div className="mt-0.5">
                      <Badge
                        variant={
                          ticketDetails.satisfaction_result === 'Positiva'
                            ? 'success'
                            : ticketDetails.satisfaction_result === 'Negativa'
                            ? 'error'
                            : 'neutral'
                        }
                        size="xs"
                      >
                        CSAT: {ticketDetails.satisfaction_result}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Escolha da Modalidade de Avaliação */}
              <div className="pt-2 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-brand-muted">
                  Selecione a Modalidade de Avaliação
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Opção 1: Avaliar com IA */}
                  <div
                    onClick={handleStartAI}
                    className="p-4 rounded-2xl border-2 border-brand-accent/30 hover:border-brand-accent bg-surface-card hover:bg-brand-accent/5 transition-all cursor-pointer flex flex-col justify-between gap-3 shadow-xs group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-9 h-9 rounded-xl bg-brand-accent/10 text-brand-accent flex items-center justify-center group-hover:scale-105 transition-transform">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <Badge variant="success" size="xs">
                          Recomendado
                        </Badge>
                      </div>
                      <h5 className="text-sm font-black text-brand-primary group-hover:text-brand-accent transition-colors">
                        Avaliar com IA
                      </h5>
                      <p className="text-xs text-brand-muted font-medium mt-1 leading-relaxed">
                        A IA analisa a transcrição completa do diálogo no Zendesk e pré-preenche a ficha de critérios com notas e parecer fundamentado.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={evaluatingAI}
                      className="w-full py-2 px-3 text-xs font-bold text-white bg-brand-accent hover:bg-brand-accent/90 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Bot className="w-3.5 h-3.5" />
                      <span>Iniciar com IA</span>
                    </button>
                  </div>

                  {/* Opção 2: Avaliar Manualmente */}
                  <div
                    onClick={handleStartManual}
                    className="p-4 rounded-2xl border border-surface-border hover:border-brand-primary/40 bg-surface-card hover:bg-surface-subtle/50 transition-all cursor-pointer flex flex-col justify-between gap-3 shadow-xs group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-9 h-9 rounded-xl bg-surface-subtle text-brand-primary flex items-center justify-center group-hover:scale-105 transition-transform">
                          <FileText className="w-5 h-5" />
                        </div>
                        <Badge variant="neutral" size="xs">
                          Manual
                        </Badge>
                      </div>
                      <h5 className="text-sm font-black text-brand-primary group-hover:text-brand-accent transition-colors">
                        Avaliar Manualmente
                      </h5>
                      <p className="text-xs text-brand-muted font-medium mt-1 leading-relaxed">
                        Abre o formulário padrão com os dados do ticket, canal, equipe e atendente já pré-preenchidos para pontuação manual.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={evaluatingAI}
                      className="w-full py-2 px-3 text-xs font-bold text-brand-primary bg-surface-subtle hover:bg-surface-subtle/80 border border-surface-border rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span>Abrir Formulário</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="p-4 border-t border-surface-border flex items-center justify-between bg-surface-subtle/20 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              onOpenBlankForm();
              onClose();
            }}
            className="text-[11px] font-semibold text-brand-muted hover:text-brand-primary hover:underline transition-colors cursor-pointer"
          >
            Abrir formulário em branco sem vínculo ao helpdesk
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={evaluatingAI}
            className="px-4 py-1.5 text-xs font-bold text-brand-muted hover:text-brand-primary rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
