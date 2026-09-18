import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  AuditingQueueType,
  AuditingQueueTicket,
  AgentQueueSummary,
  TicketCommentMessage,
  AIEvaluationResult,
  AIEvaluationGuideline,
  ChildTicketAiEvaluation,
  ChildTicketMacroType,
  User,
  Monitoria,
  EvaluationForm,
  Team,
} from '../types';
import {
  fetchQueueTickets,
  computeAgentQueuePriorities,
  evaluateTicketWithAI,
  evaluateChildTicketWithAI,
  fetchTicketDialogue,
  normalizeChannel,
  csatStatusToSatisfactionResult,
  resolveCustomerType,
  resolveFormAndGuidelineForCustomerType,
} from '../lib/helpdeskQueue';
import { fetchAIGuidelines, DEFAULT_CHILD_TICKET_GUIDELINE } from '../lib/aiGuidelines';
import { fetchAIDrafts, saveAIDraft, deleteAIDraft, AIEvaluationDraft } from '../lib/aiDrafts';
import {
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  User as UserIcon,
  Tag,
  ExternalLink,
  RefreshCw,
  Search,
  Bot,
  Zap,
  ArrowRight,
  ShieldCheck,
  Check,
  X,
  BookOpen,
  Rocket,
  ChevronLeft,
  ChevronRight,
  Lock,
  FileText,
  GitFork,
  AlertOctagon,
  ListChecks,
  CheckSquare,
  Eye
} from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';
import { toast } from 'sonner';

interface AuditingQueueViewProps {
  agents: User[];
  teams: Team[];
  forms: EvaluationForm[];
  monitorias: Monitoria[];
  currentUserId?: string;
  onStartAudit: (prefill: {
    ticket_id: string;
    ticket_subject?: string;
    form_id?: string;
    evaluated_id?: string;
    team_id?: string;
    channel?: string;
    satisfaction_result?: string;
    satisfaction_has_record?: boolean;
    satisfaction_record_text?: string;
    aiEvaluation?: AIEvaluationResult;
    ticket_fields?: { title: string; value: string }[];
    isAiLocked?: boolean;
    customerType?: string;
  }) => void;
  onModalStateChange?: (isOpen: boolean) => void;
}

// Gerenciador global de tickets atualmente em avaliação pela IA (persiste mesmo ao alternar abas/telas)
const globalEvaluatingTickets = new Set<string>();
const globalEvaluatingListeners = new Set<() => void>();

function notifyGlobalEvaluating() {
  globalEvaluatingListeners.forEach(fn => {
    try { fn(); } catch {}
  });
}

export default function AuditingQueueView({
  agents,
  teams,
  forms,
  monitorias,
  currentUserId,
  onStartAudit,
  onModalStateChange,
}: AuditingQueueViewProps) {
  const [activeQueue, setActiveQueue] = useState<AuditingQueueType>('negativas');
  const [loading, setLoading] = useState(false);
  const [tickets, setTickets] = useState<AuditingQueueTicket[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgentFilter, setSelectedAgentFilter] = useState('');

  // Estado para modal/visualização rápida de IA
  const [evaluatingTicketId, setEvaluatingTicketId] = useState<string | null>(null);

  // Escuta mudanças nas avaliações globais que continuam rodando ao trocar de aba
  const [, setGlobalEvalTick] = useState(0);
  useEffect(() => {
    const handleUpdate = () => setGlobalEvalTick(t => t + 1);
    globalEvaluatingListeners.add(handleUpdate);
    return () => {
      globalEvaluatingListeners.delete(handleUpdate);
    };
  }, []);

  const isEvaluatingTicket = (ticketId: string) => globalEvaluatingTickets.has(ticketId) || evaluatingTicketId === ticketId;

  // Estado para auditoria de conformidade de chamados filhos
  const [evaluatingChildTicketId, setEvaluatingChildTicketId] = useState<string | null>(null);
  const [childPreviewTicket, setChildPreviewTicket] = useState<AuditingQueueTicket | null>(null);
  const [childAiEvaluation, setChildAiEvaluation] = useState<ChildTicketAiEvaluation | null>(null);
  const [loadingChildAi, setLoadingChildAi] = useState(false);
  const [validatedChildTickets, setValidatedChildTickets] = useState<Set<string>>(new Set());

  // Popup de seleção do manual antes de avaliar com IA: deixa o monitor
  // escolher qual(is) manual(is) a IA deve ler para aquele ticket em vez de
  // sempre mandar todos os ativos — economiza tokens por chamada.
  const [guidelineOptions, setGuidelineOptions] = useState<AIEvaluationGuideline[]>([]);
  const [loadingGuidelines, setLoadingGuidelines] = useState(false);
  const [guidelinePickerTicket, setGuidelinePickerTicket] = useState<AuditingQueueTicket | null>(null);
  const [childGuidelineModalTicket, setChildGuidelineModalTicket] = useState<AuditingQueueTicket | null>(null);
  const [showFullChildManual, setShowFullChildManual] = useState(false);

  // Rascunhos de avaliação da IA já prontos (persistidos), por ticket_id —
  // evita rodar a IA de novo toda vez que o monitor volta na mesma fila.
  const [drafts, setDrafts] = useState<Record<string, AIEvaluationDraft>>({});

  // Avaliação em lote: processa todos os tickets da página atual sequencialmente.
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const batchCancelRef = useRef(false);

  // Notifica o container pai (App.tsx) se algum modal de prévia está aberto,
  // para que a barra lateral se recolha automaticamente liberando espaço total da tela.
  useEffect(() => {
    const isAnyModalOpen = Boolean(childPreviewTicket || guidelinePickerTicket || childGuidelineModalTicket);
    onModalStateChange?.(isAnyModalOpen);
  }, [childPreviewTicket, guidelinePickerTicket, childGuidelineModalTicket, onModalStateChange]);

  // Paginação: 25 tickets por página (definido no backend). Views grandes
  // (Proativas chega a ter centenas de CSAT vazio) não cabem numa carga só
  // sem arriscar o rate limit do Zendesk. `prevCursors` guarda o histórico
  // pra "Página Anterior" voltar sem precisar re-buscar do zero.
  const [cursor, setCursor] = useState<string | null>(null);
  const [prevCursors, setPrevCursors] = useState<(string | null)[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);

  const teamsMap = useMemo(() => {
    const map: Record<string, string> = {};
    teams.forEach(t => { map[t.id] = t.name; });
    return map;
  }, [teams]);

  // Fila balanceada de prioridade de agentes
  const agentQueue = useMemo(() => {
    return computeAgentQueuePriorities(agents, monitorias, teamsMap);
  }, [agents, monitorias, teamsMap]);

  // Sequência das chamadas a loadQueueData — se o auditor troca de fila
  // antes de uma busca anterior (mais lenta, ex.: Negativas com várias
  // páginas do Zendesk) terminar, essa resposta atrasada não pode
  // sobrescrever os tickets da fila mais nova já carregada na tela.
  const loadSeqRef = useRef(0);

  // targetCursor: null = primeira página. Passar explicitamente (mesmo
  // sendo null) evita reusar por engano o cursor de uma página anterior ao
  // trocar de fila ou dar refresh.
  const loadQueueData = async (targetCursor: string | null = null) => {
    const seq = ++loadSeqRef.current;
    const queueAtCallTime = activeQueue;

    setLoading(true);
    try {
      const { tickets: data, nextCursor, hasMore: more } = await fetchQueueTickets(queueAtCallTime, monitorias, targetCursor);
      // Descarta a resposta se já não for mais a busca mais recente — uma
      // troca de fila nesse meio tempo já disparou outra chamada, com seq
      // maior.
      if (seq !== loadSeqRef.current) return;
      setTickets(data);
      setCursor(nextCursor);
      setHasMore(more);
    } catch (err) {
      console.error('Erro ao carregar fila:', err);
      toast.error('Não foi possível carregar a fila de chamados.');
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  const goToNextPage = () => {
    if (!hasMore || !cursor) return;
    setPrevCursors(prev => [...prev, cursor]);
    setPageNumber(p => p + 1);
    setCurrentPage(1);
    loadQueueData(cursor);
  };

  const goToPrevPage = () => {
    if (prevCursors.length === 0) return;
    const stack = [...prevCursors];
    stack.pop(); // remove o cursor da página atual
    const target = stack.length > 0 ? stack[stack.length - 1] : null;
    setPrevCursors(stack);
    setPageNumber(p => Math.max(1, p - 1));
    setCurrentPage(1);
    loadQueueData(target);
  };

  // Ao trocar de fila (Negativas/Proativas/Positivas), limpa a lista e
  // reseta a paginação antes de buscar a nova — senão os tickets da fila
  // anterior ficam visíveis por alguns segundos enquanto a nova fila
  // carrega, parecendo que são da fila que acabou de ser selecionada. Não
  // limpa em refresh automático (mudança só em monitorias.length), pra não
  // piscar a tela à toa.
  const prevQueueRef = useRef(activeQueue);
  useEffect(() => {
    if (prevQueueRef.current !== activeQueue) {
      setTickets([]);
      setCursor(null);
      setPrevCursors([]);
      setHasMore(false);
      setPageNumber(1);
      setCurrentPage(1);
      prevQueueRef.current = activeQueue;
      loadQueueData(null);
    } else {
      loadQueueData(null);
    }
  }, [activeQueue, monitorias.length]);

  // Carrega os rascunhos de IA já prontos para os tickets da página atual —
  // agora ativo nas filas de Negativas, Positivas e Proativas.
  useEffect(() => {
    if ((activeQueue !== 'positivas' && activeQueue !== 'proativas' && activeQueue !== 'negativas') || tickets.length === 0) {
      setDrafts({});
      return;
    }
    fetchAIDrafts(tickets.map(t => t.ticket_id)).then(loaded => {
      const stillPending: Record<string, AIEvaluationDraft> = {};
      tickets.forEach(t => {
        const draft = loaded[t.ticket_id];
        if (!draft) return;
        if (t.already_audited) {
          // Ticket já virou monitoria de verdade — o rascunho não serve
          // mais pra nada, limpa pra não acumular lixo na tabela nem
          // mostrar "Lançar Monitoria" de novo num ticket já concluído.
          deleteAIDraft(t.ticket_id);
        } else {
          stillPending[t.ticket_id] = draft;
        }
      });
      setDrafts(stillPending);
    });
  }, [activeQueue, tickets]);

  // Contagem de negativas não auditadas
  const pendingNegativesCount = useMemo(() => {
    if (activeQueue === 'negativas') {
      return tickets.filter(t => !t.already_audited).length;
    }
    return 0;
  }, [tickets, activeQueue]);

  // Filtro de busca na lista de tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      const matchesSearch = !searchTerm ||
        t.ticket_id.includes(searchTerm) ||
        t.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.agent_name && t.agent_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.requester_name && t.requester_name.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesAgent = !selectedAgentFilter || t.agent_name?.toLowerCase().includes(selectedAgentFilter.toLowerCase());

      return matchesSearch && matchesAgent;
    });
  }, [tickets, searchTerm, selectedAgentFilter]);

  // Paginação configurável por página (5, 10, 15, 20) com padrão 5
  const [pageSize, setPageSize] = useState<number>(5);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Reseta para a primeira página quando muda a busca, filtro de agente, tamanho de página ou fila
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedAgentFilter, activeQueue, pageSize]);

  const totalItems = filteredTickets.length;
  const totalLocalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalLocalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  const paginatedTickets = useMemo(() => {
    return filteredTickets.slice(startIndex, endIndex);
  }, [filteredTickets, startIndex, endIndex]);


  // Abre o popup de confirmação da avaliação da IA com a seleção automática
  // de ficha e manual baseada no tipo de cliente (organização no Zendesk).
  const openGuidelinePicker = async (ticket: AuditingQueueTicket) => {
    const pendingInfo = getPendingFormInfo(ticket);
    if (pendingInfo.isPending) {
      toast.warning(`A ficha de monitoria da equipe ${pendingInfo.label} está em elaboração pela Qualidade.`);
      return;
    }
    if (ticket.positive_cap_reached) {
      toast.warning('Este atendente já atingiu o máximo de 2 avaliações positivas no mês.');
      return;
    }
    setGuidelinePickerTicket(ticket);
    setLoadingGuidelines(true);
    try {
      const all = await fetchAIGuidelines();
      setGuidelineOptions(all.filter(g => g.active));
    } catch (e) {
      console.error('Erro ao carregar manuais:', e);
      setGuidelineOptions([]);
    } finally {
      setLoadingGuidelines(false);
    }
  };

  // Ação de avaliar com IA — roda a IA com a ficha e manual auto-selecionados
  // e SALVA o resultado como rascunho persistido.
  const handleEvaluateWithAI = async (
    ticket: AuditingQueueTicket,
    formToUse: EvaluationForm,
    guidelineIds: string[],
    // quando chamado pelo lote, o toast de progresso não é criado aqui
    silent = false
  ) => {
    // Encontra o agente correspondente pelo e-mail (chave universal) ou nome
    const matchedAgent = agents.find(a =>
      (ticket.agent_email && a.email.toLowerCase() === ticket.agent_email.toLowerCase()) ||
      (ticket.agent_name && a.name.toLowerCase() === ticket.agent_name.toLowerCase())
    );
    const teamId = matchedAgent?.primary_team_id || matchedAgent?.team_ids?.[0] || ticket.team_id;
    const agentId = ticket.agent_id || matchedAgent?.id;

    globalEvaluatingTickets.add(ticket.ticket_id);
    notifyGlobalEvaluating();
    setEvaluatingTicketId(ticket.ticket_id);

    // Toast de progresso por etapas (apenas quando não está em modo silencioso/lote)
    const toastId = silent ? null : toast.loading(
      `⏳ Etapa 1/3 · Buscando diálogo do ticket #${ticket.ticket_id}...`,
      { duration: Infinity }
    );

    try {
      const { comments: dialogue, ticketFields, tags, organizationName, organizationTags } = await fetchTicketDialogue(ticket.ticket_id);

      // Atualiza tags e organização caso venham enriquecidos da busca individual
      if ((tags && tags.length > 0) || organizationName || (organizationTags && organizationTags.length > 0)) {
        ticket.tags = tags || ticket.tags;
        ticket.organization_name = organizationName || ticket.organization_name;
        ticket.organization_tags = organizationTags || ticket.organization_tags;
      }
      ticket.ticket_fields = ticketFields;

      if (toastId) toast.loading(
        `🤖 Etapa 2/3 · Analisando com IA (Gemini → OpenRouter como fallback)...`,
        { id: toastId, duration: Infinity }
      );

      const aiResult = await evaluateTicketWithAI(ticket.ticket_id, formToUse, dialogue, {
        name: matchedAgent?.name || ticket.agent_name,
        email: matchedAgent?.email || ticket.agent_email,
        team_name: teamId ? teamsMap[teamId] : undefined,
        channel: ticket.channel,
      }, guidelineIds, ticketFields);

      aiResult.ticket_fields = ticketFields;

      if (toastId) toast.loading(
        `💾 Etapa 3/3 · Salvando rascunho...`,
        { id: toastId, duration: Infinity }
      );

      await saveAIDraft({
        ticketId: ticket.ticket_id,
        formId: formToUse.id,
        agentName: matchedAgent?.name || ticket.agent_name,
        agentEmail: matchedAgent?.email || ticket.agent_email,
        agentId,
        teamId,
        channel: ticket.channel,
        satisfactionComment: ticket.csat_comment,
        result: aiResult,
        guidelineIds,
        createdBy: currentUserId,
      });

      setDrafts(prev => ({
        ...prev,
        [ticket.ticket_id]: {
          id: prev[ticket.ticket_id]?.id || ticket.ticket_id,
          ticket_id: ticket.ticket_id,
          form_id: formToUse.id,
          agent_name: matchedAgent?.name || ticket.agent_name,
          agent_email: matchedAgent?.email || ticket.agent_email,
          agent_id: agentId,
          team_id: teamId,
          channel: ticket.channel,
          satisfaction_comment: ticket.csat_comment,
          result: aiResult,
          guideline_ids: guidelineIds,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      }));

      if (toastId) toast.success(
        `✅ Ticket #${ticket.ticket_id} avaliado (${formToUse.title}) — clique em "Lançar Monitoria".`,
        { id: toastId, duration: 5000 }
      );
    } catch (err: any) {
      console.error('Erro na avaliação com IA:', err);
      if (toastId) {
        toast.error(`❌ Falha no ticket #${ticket.ticket_id}: ${err?.message || 'Erro desconhecido'}`, { id: toastId, duration: 6000 });
      }
      throw err; // relança para o batch capturar individualmente
    } finally {
      globalEvaluatingTickets.delete(ticket.ticket_id);
      notifyGlobalEvaluating();
      setEvaluatingTicketId(null);
    }
  };

  // Avaliação em LOTE — processa estritamente os tickets da página visível no momento (respeitando o pageSize: 5, 10, 15, 20...).
  // Pula: já avaliados, com cap atingido, já auditados ou equipes com ficha em elaboração.
  const handleBatchEvaluate = async () => {
    const pending = paginatedTickets.filter(t => {
      if (drafts[t.ticket_id] || t.already_audited || t.positive_cap_reached) return false;
      const pendingInfo = getPendingFormInfo(t);
      if (pendingInfo.isPending) return false;
      return true;
    });

    if (pending.length === 0) {
      toast.info('Todos os tickets visíveis desta página já possuem avaliação, foram auditados ou estão com ficha em elaboração.');
      return;
    }

    // Carregar manuais ativos uma única vez para o lote
    const allGuidelines = await fetchAIGuidelines().catch(() => [] as AIEvaluationGuideline[]);
    const activeGuidelineIds = allGuidelines.filter(g => g.active).map(g => g.id);

    setBatchRunning(true);
    batchCancelRef.current = false;
    setBatchProgress({ done: 0, total: pending.length, current: '' });

    const batchToastId = toast.loading(
      `🚀 Avaliação em lote iniciada — 0/${pending.length} tickets`,
      { duration: Infinity }
    );

    let done = 0;
    let errors = 0;

    for (const ticket of pending) {
      if (batchCancelRef.current) break;

      const customerType = resolveCustomerType(ticket.tags, ticket.organization_tags);
      const { form: autoForm, guideline: autoGuideline } = resolveFormAndGuidelineForCustomerType(
        customerType,
        forms,
        allGuidelines
      );
      if (!autoForm) { errors++; continue; }
      const guidelineIds = autoGuideline ? [autoGuideline.id] : activeGuidelineIds;

      setBatchProgress({ done, total: pending.length, current: ticket.ticket_id });
      toast.loading(
        `🤖 Lote: processando ticket #${ticket.ticket_id} (${done + 1}/${pending.length})...`,
        { id: batchToastId, duration: Infinity }
      );

      try {
        await handleEvaluateWithAI(ticket, autoForm, guidelineIds, true);
        done++;
      } catch {
        errors++;
      }

      setBatchProgress({ done, total: pending.length, current: '' });
    }

    setBatchRunning(false);
    batchCancelRef.current = false;
    setBatchProgress(null);

    const cancelled = batchCancelRef.current;
    if (cancelled) {
      toast.warning(`⏸ Lote interrompido — ${done}/${pending.length} tickets avaliados.`, { id: batchToastId, duration: 5000 });
    } else if (errors > 0) {
      toast.warning(`✅ Lote concluído — ${done} avaliados, ${errors} falharam. Verifique os tickets com erro.`, { id: batchToastId, duration: 8000 });
    } else {
      toast.success(`✅ Lote concluído — ${done}/${pending.length} tickets avaliados com sucesso!`, { id: batchToastId, duration: 6000 });
    }
  };

  // Avaliação de conformidade com IA para tickets filhos
  const handleEvaluateChildTicket = async (ticket: AuditingQueueTicket) => {
    setEvaluatingChildTicketId(ticket.ticket_id);
    setChildPreviewTicket(ticket);
    setLoadingChildAi(true);
    setChildAiEvaluation(ticket.child_evaluation || null);

    try {
      toast.info(`Auditando abertura do chamado filho #${ticket.ticket_id} com IA...`);
      const { comments, ticketFields, tags } = await fetchTicketDialogue(ticket.ticket_id);

      const result = await evaluateChildTicketWithAI(
        ticket.ticket_id,
        ticket.subject,
        comments,
        tags || ticket.tags,
        ticketFields,
        ticket.child_macro_type
      );

      setChildAiEvaluation(result);
      ticket.child_evaluation = result;
      toast.success(`Parecer de conformidade gerado para o chamado filho #${ticket.ticket_id}!`);
    } catch (err: any) {
      console.error('Erro ao auditar chamado filho:', err);
      toast.error(err?.message || 'Falha ao auditar chamado filho');
    } finally {
      setLoadingChildAi(false);
      setEvaluatingChildTicketId(null);
    }
  };

  // Abre a ficha de monitoria com o rascunho da IA já salvo pra esse
  // ticket — com o form_id bloqueado para alteração manual.
  const handleLaunchMonitoria = (ticket: AuditingQueueTicket) => {
    const draft = drafts[ticket.ticket_id];
    if (!draft) return;

    const customerType = resolveCustomerType(ticket.tags, ticket.organization_tags);

    onStartAudit({
      ticket_id: ticket.ticket_id,
      ticket_subject: ticket.subject,
      form_id: draft.form_id,
      evaluated_id: draft.agent_id,
      team_id: draft.team_id,
      channel: normalizeChannel(draft.channel),
      satisfaction_result: csatStatusToSatisfactionResult(ticket.csat_status),
      satisfaction_has_record: !!draft.satisfaction_comment,
      satisfaction_record_text: draft.satisfaction_comment,
      aiEvaluation: draft.result,
      ticket_fields: draft.result?.ticket_fields || ticket.ticket_fields,
      isAiLocked: true,
      customerType,
    });
  };

  // Inicia auditoria manual direta (sem IA prévia) abrindo o fluxo oficial 1-2-3-4
  const handleStartManualAudit = (ticket: AuditingQueueTicket) => {
    const pendingInfo = getPendingFormInfo(ticket);
    if (pendingInfo.isPending) {
      toast.warning(`A auditoria para a equipe ${pendingInfo.label} está temporariamente suspensa (ficha em elaboração).`);
      return;
    }
    const matchedAgent = agents.find(a =>
      (ticket.agent_email && a.email.toLowerCase() === ticket.agent_email.toLowerCase()) ||
      (ticket.agent_name && a.name.toLowerCase() === ticket.agent_name.toLowerCase())
    );
    const customerType = resolveCustomerType(ticket.tags, ticket.organization_tags);
    const { form: autoForm } = resolveFormAndGuidelineForCustomerType(customerType, forms, []);

    onStartAudit({
      ticket_id: ticket.ticket_id,
      ticket_subject: ticket.subject,
      form_id: autoForm?.id,
      evaluated_id: ticket.agent_id || matchedAgent?.id,
      team_id: ticket.team_id || matchedAgent?.primary_team_id || matchedAgent?.team_ids?.[0],
      channel: normalizeChannel(ticket.channel),
      satisfaction_result: csatStatusToSatisfactionResult(ticket.csat_status),
      satisfaction_has_record: !!ticket.csat_comment,
      satisfaction_record_text: ticket.csat_comment,
      ticket_fields: ticket.ticket_fields,
      customerType,
    });
  };

  // E-mails dos 5 agentes mais prioritários (mais tempo sem monitoria) —
  // usado só pra destacar visualmente esses tickets na fila Proativa, sem
  // depender de "sortear" um ticket específico (a fila agora é paginada;
  // um agente prioritário pode estar em qualquer página).
  const topPriorityEmails = useMemo(() => {
    return new Set(agentQueue.slice(0, 5).map(a => a.agent_email?.toLowerCase()).filter(Boolean));
  }, [agentQueue]);

  // Nota sugerida pela IA — mostrada em cima, ao lado do badge de CSAT
  // (Bom/Vazio), não mais colada na data lá embaixo. Maior que um Badge
  // "xs" comum pra ficar legível de relance no card.
  const renderScoreBadge = (ticket: AuditingQueueTicket) => {
    const draft = drafts[ticket.ticket_id];
    if (!draft) return null;

    return (
      <span
        title="Nota sugerida pela IA"
        className="inline-flex items-center px-2.5 py-1 rounded-lg bg-functional-success text-functional-success text-xs font-mono font-black flex-shrink-0"
      >
        {Math.round(draft.result.score)}%
      </span>
    );
  };

  // Largura mínima compartilhada pelos botões de ação de IA — sem ela,
  // "Reavaliar" e "Lançar Monitoria" ficavam com tamanhos bem diferentes
  // (cada Button só cresce até caber o próprio texto).
  const AI_ACTION_BUTTON_CLASS = 'justify-center min-w-[132px]';

  // Verifica se o atendente do ticket pertence a uma EQUIPE cujos critérios e manual ainda estão em elaboração (Contábil, Fiscal, TEF).
  // A verificação é ESTRITA à equipe do atendente (NUNCA tags ou assunto do chamado, permitindo que chamados sobre temas fiscais atendidos por outras equipes sigam normalmente).
  const getPendingFormInfo = (ticket: AuditingQueueTicket) => {
    const matchedAgent = agents.find(a =>
      (ticket.agent_email && a.email?.toLowerCase() === ticket.agent_email.toLowerCase()) ||
      (ticket.agent_name && a.name?.toLowerCase() === ticket.agent_name.toLowerCase()) ||
      (ticket.agent_id && a.id === ticket.agent_id)
    );

    const teamNames: string[] = [];
    if (ticket.team_id && teamsMap[ticket.team_id]) {
      teamNames.push(teamsMap[ticket.team_id]);
    }
    if (matchedAgent?.primary_team_id && teamsMap[matchedAgent.primary_team_id]) {
      teamNames.push(teamsMap[matchedAgent.primary_team_id]);
    }
    if (Array.isArray(matchedAgent?.team_ids)) {
      matchedAgent.team_ids.forEach(tid => {
        if (teamsMap[tid]) teamNames.push(teamsMap[tid]);
      });
    }

    const teamString = teamNames.join(' ').toLowerCase();

    if (/cont[aá]bil/i.test(teamString)) {
      return { isPending: true, label: 'Contábil' };
    }
    if (/fiscal/i.test(teamString)) {
      return { isPending: true, label: 'Fiscal' };
    }
    if (/\btef\b/i.test(teamString)) {
      return { isPending: true, label: 'TEF' };
    }

    return { isPending: false, label: '' };
  };

  // Exibição consistente e destacada do atendente: caso o ticket não possua atendente individual
  // atribuído (atribuído apenas a um grupo no Zendesk), exibe um badge visual de alerta.
  const renderAgentInfo = (ticket: AuditingQueueTicket) => {
    const rawName = (ticket.agent_name || '').trim();
    const hasAgent = rawName.length > 0 &&
      !/^não\s*atribu[ií]do$/i.test(rawName) &&
      !/^sem\s*atendente$/i.test(rawName) &&
      rawName.toLowerCase() !== 'agente' &&
      rawName.toLowerCase() !== 'n/d';

    if (!hasAgent) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 font-bold text-[10px]"
          title="Chamado atribuído apenas a Grupo de atendimento no Zendesk, sem analista específico atribuído."
        >
          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
          <span>Sem atendente atribuído (Apenas Grupo)</span>
        </span>
      );
    }

    return (
      <span className="flex items-center gap-1 text-brand-secondary font-semibold">
        <UserIcon className="w-3 h-3 text-brand-highlight shrink-0" />
        <span>{ticket.agent_name}</span>
      </span>
    );
  };

  // Bloco de botões de ação de IA (Avaliar com IA / Reavaliar / Verificar Avaliação)
  // Após avaliado com IA, o botão é "Verificar Avaliação" (em verde esmeralda) e abre
  // diretamente o formulário oficial no fluxo das 4 etapas (1-2-3-4) para ir batendo os dados.
  // Se ainda não avaliado, o botão principal é "Avaliar com IA" (índigo/roxo) ou "Auditar Manual".
  const renderAiActions = (ticket: AuditingQueueTicket, accentClass: string) => {
    const isEvaluating = isEvaluatingTicket(ticket.ticket_id);

    // Se o ticket está em processo de avaliação (mesmo que o usuário tenha mudado de tela/aba),
    // mantém o botão em loading ativo até concluir!
    if (isEvaluating) {
      return (
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <Button
            size="sm"
            variant="primary"
            disabled={true}
            className="flex items-center gap-1.5 bg-indigo-600/80 text-white font-semibold shadow-xs justify-center min-w-[145px] cursor-not-allowed"
          >
            <Bot className="w-3.5 h-3.5 animate-spin" />
            <span>Analisando com IA...</span>
          </Button>
        </div>
      );
    }

    const draft = drafts[ticket.ticket_id];

    if (draft) {
      return (
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <Button
            size="sm"
            variant="primary"
            onClick={() => handleLaunchMonitoria(ticket)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs justify-center min-w-[145px]"
            title="Abrir formulário oficial (fluxo 1-2-3-4) para conferir e bater as respostas da IA"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Verificar Avaliação</span>
          </Button>
          {!ticket.positive_cap_reached && (
            <Button
              size="sm"
              variant="outline"
              disabled={isEvaluating}
              onClick={() => openGuidelinePicker(ticket)}
              className="flex items-center gap-1 border-amber-400 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-[11px] font-medium"
              title="Roda a IA de novo e sobrescreve este rascunho"
            >
              <Bot className={`w-3 h-3 ${isEvaluating ? 'animate-spin' : ''}`} />
              <span>Reavaliar</span>
            </Button>
          )}
        </div>
      );
    }

    if (ticket.positive_cap_reached) {
      return (
        <span title="Este atendente já atingiu o máximo de 2 avaliações positivas no mês.">
          <Badge variant="warning" size="xs" className="font-bold text-[9px]">
            Máximo de 2 por agente atingido
          </Badge>
        </span>
      );
    }

    const pendingInfo = getPendingFormInfo(ticket);
    if (pendingInfo.isPending) {
      return (
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <span title={`A Ficha de Critérios e o Manual de Atendimento da equipe ${pendingInfo.label} ainda estão em elaboração pela equipe de Qualidade. Auditorias manual e com IA estão temporariamente suspensas para esta equipe.`}>
            <Button
              size="sm"
              variant="outline"
              disabled={true}
              className="flex items-center gap-1.5 opacity-75 cursor-not-allowed text-xs font-semibold border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 justify-center min-w-[175px]"
            >
              <Bot className="w-3.5 h-3.5 opacity-60 text-amber-500" />
              <span>Ficha em Elaboração ({pendingInfo.label})</span>
            </Button>
          </span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleStartManualAudit(ticket)}
          className="flex items-center gap-1 text-[11px] text-brand-muted hover:text-brand-primary"
          title="Abrir monitoria manual no fluxo oficial 1-2-3-4"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Auditar Manual</span>
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={isEvaluating}
          onClick={() => openGuidelinePicker(ticket)}
          className={`flex items-center gap-1.5 ${accentClass || 'bg-indigo-600 hover:bg-indigo-700'} text-white font-semibold shadow-xs justify-center min-w-[135px]`}
          title="Avaliar chamado com Inteligência Artificial"
        >
          <Bot className={`w-3.5 h-3.5 ${isEvaluating ? 'animate-spin' : ''}`} />
          <span>{isEvaluating ? 'Analisando...' : 'Avaliar com IA'}</span>
        </Button>
      </div>
    );
  };

  const getMacroBadge = (type?: ChildTicketMacroType) => {
    switch (type) {
      case 'nova_demanda':
        return <Badge variant="primary" size="xs" className="font-bold">Nova Demanda</Badge>;
      case 'analise_tecnica':
        return <Badge variant="info" size="xs" className="font-bold">Análise Técnica N2</Badge>;
      case 'apoio_tecnico':
        return <Badge variant="warning" size="xs" className="font-bold">Apoio Técnico N2</Badge>;
      case 'produtividade':
        return <Badge variant="success" size="xs" className="font-bold">Produtividade</Badge>;
      default:
        return <Badge variant="neutral" size="xs" className="font-bold">Filho Geral</Badge>;
    }
  };

  const getChildStatusBadge = (status?: 'conforme' | 'nao_conforme' | 'atencao') => {
    switch (status) {
      case 'conforme':
        return <Badge variant="success" size="xs" className="font-black uppercase tracking-wider">Conforme</Badge>;
      case 'nao_conforme':
        return <Badge variant="error" size="xs" className="font-black uppercase tracking-wider">Não Conforme</Badge>;
      case 'atencao':
        return <Badge variant="warning" size="xs" className="font-black uppercase tracking-wider">Atenção</Badge>;
      default:
        return null;
    }
  };

  const handleStartChildAudit = (ticket: AuditingQueueTicket) => {
    const matchedAgent = agents.find(a =>
      (ticket.agent_email && a.email.toLowerCase() === ticket.agent_email.toLowerCase()) ||
      (ticket.agent_name && a.name.toLowerCase() === ticket.agent_name.toLowerCase())
    );
    const customerType = resolveCustomerType(ticket.tags, ticket.organization_tags);
    const { form: autoForm } = resolveFormAndGuidelineForCustomerType(customerType, forms, []);

    onStartAudit({
      ticket_id: ticket.ticket_id,
      ticket_subject: ticket.subject,
      form_id: autoForm?.id,
      evaluated_id: ticket.agent_id || matchedAgent?.id,
      team_id: ticket.team_id || matchedAgent?.primary_team_id || matchedAgent?.team_ids?.[0],
      channel: normalizeChannel(ticket.channel),
      satisfaction_result: 'Sem pesquisa',
      isAiLocked: true,
      customerType,
    });
  };

  // Controles de paginação com seletor de itens por página (5, 10, 15, 20) — padrão 10
  const renderPagination = () => {
    if (totalItems === 0) return null;

    const canGoPrev = validCurrentPage > 1 || prevCursors.length > 0;
    const canGoNext = validCurrentPage < totalLocalPages || hasMore;

    const handlePrev = () => {
      if (validCurrentPage > 1) {
        setCurrentPage(p => Math.max(1, p - 1));
      } else if (prevCursors.length > 0) {
        goToPrevPage();
      }
    };

    const handleNext = () => {
      if (validCurrentPage < totalLocalPages) {
        setCurrentPage(p => p + 1);
      } else if (hasMore) {
        goToNextPage();
      }
    };

    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-surface-border mt-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-brand-muted">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-brand-muted">Exibir:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-surface border border-surface-border rounded-lg px-2 py-1 text-xs font-bold text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-highlight cursor-pointer hover:border-brand-highlight/50 transition-colors"
            >
              <option value={5}>5 por página</option>
              <option value={10}>10 por página</option>
              <option value={15}>15 por página</option>
              <option value={20}>20 por página</option>
            </select>
          </div>
          <span className="text-[11px] text-brand-muted">
            Mostrando <strong className="text-brand-primary font-bold">{startIndex + 1}–{endIndex}</strong> de <strong className="text-brand-primary font-bold">{totalItems}</strong> chamados
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-brand-muted mr-1">
            Página {validCurrentPage} de {totalLocalPages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={!canGoPrev || loading}
            onClick={handlePrev}
            className="flex items-center gap-1 text-[11px] h-8 px-2.5"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Anterior</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!canGoNext || loading}
            onClick={handleNext}
            className="flex items-center gap-1 text-[11px] h-8 px-2.5"
          >
            <span>Próxima</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Barra de Abas das Filas: Grid responsivo de 5 colunas sem scroll horizontal */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 p-1.5 bg-surface-subtle/40 rounded-2xl border border-surface-border">
        <button
          onClick={() => setActiveQueue('negativas')}
          className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeQueue === 'negativas'
              ? 'bg-functional-error/15 text-functional-error border border-functional-error/30 shadow-sm'
              : 'text-brand-muted hover:text-brand-primary hover:bg-surface-subtle'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">CSAT Negativas (+ IA)</span>
          {pendingNegativesCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-black bg-functional-error text-white rounded-full flex-shrink-0">
              {pendingNegativesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveQueue('proativas')}
          className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeQueue === 'proativas'
              ? 'bg-info/15 text-info border border-info/30 shadow-sm'
              : 'text-brand-muted hover:text-brand-primary hover:bg-surface-subtle'
          }`}
        >
          <Zap className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">Fila Proativa</span>
        </button>

        <button
          onClick={() => setActiveQueue('positivas')}
          className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeQueue === 'positivas'
              ? 'bg-functional-success/15 text-functional-success border border-functional-success/30 shadow-sm'
              : 'text-brand-muted hover:text-brand-primary hover:bg-surface-subtle'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">CSAT Positivas (+ IA)</span>
        </button>

        <button
          onClick={() => setActiveQueue('filhos')}
          className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeQueue === 'filhos'
              ? 'bg-brand-highlight/15 text-brand-highlight border border-brand-highlight/30 shadow-sm'
              : 'text-brand-muted hover:text-brand-primary hover:bg-surface-subtle'
          }`}
          title="Filtro Zendesk: 47405806430228"
        >
          <GitFork className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">Chamados Filhos</span>
        </button>

        <button
          onClick={() => setActiveQueue('filhos_invalidos')}
          className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeQueue === 'filhos_invalidos'
              ? 'bg-functional-error/15 text-functional-error border border-functional-error/30 shadow-sm'
              : 'text-brand-muted hover:text-brand-primary hover:bg-surface-subtle'
          }`}
          title="Filtro Zendesk: 47656856998292"
        >
          <AlertOctagon className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">Filhos Inválidos</span>
        </button>
      </div>

      {/* 2. Barra de Contexto Compacta & Ações (Filtros, Busca e Atualização) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-brand-primary truncate">
            {activeQueue === 'negativas' && 'Fila Prioritária de Insatisfação (Reversão CSAT)'}
            {activeQueue === 'proativas' && 'Fila de Equidade Proativa (Amostragem Justa de Atendentes)'}
            {activeQueue === 'positivas' && 'Fila de Elogios e Avaliação com IA Copilot'}
            {activeQueue === 'filhos' && 'Triagem de Chamados Filhos (View Zendesk #47405806430228)'}
            {activeQueue === 'filhos_invalidos' && 'Chamados Filhos Inválidos (View Zendesk #47656856998292)'}
          </span>
          <span className="text-[10px] text-brand-muted whitespace-nowrap hidden sm:inline">
            • {filteredTickets.length} chamado(s) encontrados
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
            <input
              type="text"
              placeholder="Buscar por ID, assunto ou agente..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-surface-subtle/50 border border-surface-border text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-brand-highlight transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-primary"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Botão Avaliar em Lote — nas filas com IA */}
          {(activeQueue === 'positivas' || activeQueue === 'proativas' || activeQueue === 'negativas') && (
            batchRunning ? (
              <div className="flex items-center gap-2 flex-shrink-0">
                {batchProgress && (
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-surface-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-highlight rounded-full transition-all duration-500"
                        style={{ width: `${Math.round((batchProgress.done / batchProgress.total) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-brand-muted whitespace-nowrap">
                      {batchProgress.done}/{batchProgress.total}
                    </span>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { batchCancelRef.current = true; }}
                  className="flex items-center gap-1.5 text-functional-error flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Cancelar Lote</span>
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBatchEvaluate}
                disabled={loading || paginatedTickets.length === 0}
                className={`flex items-center gap-1.5 flex-shrink-0 font-bold transition-all ${
                  activeQueue === 'negativas'
                    ? 'text-functional-error hover:text-functional-error hover:bg-functional-error/10 border border-functional-error/30'
                    : 'text-brand-highlight hover:text-brand-highlight'
                }`}
                title="Avaliar todos os tickets elegíveis visíveis desta página com IA de uma vez"
              >
                <Zap className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  Avaliar Página com IA ({paginatedTickets.filter(t => !drafts[t.ticket_id] && !t.already_audited && !t.positive_cap_reached && !getPendingFormInfo(t).isPending).length})
                </span>
              </Button>
            )
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPrevCursors([]);
              setPageNumber(1);
              loadQueueData(null);
            }}
            disabled={loading}
            className="flex items-center gap-1.5 flex-shrink-0"
            title="Recarregar fila do Zendesk"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Conteúdo da Fila: NEGATIVAS */}
      {activeQueue === 'negativas' && (
        <div className="space-y-4">

          {/* Lista de Tickets Negativos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paginatedTickets.map(ticket => (
              <Card key={ticket.ticket_id} className="p-4 space-y-3 hover:border-brand-highlight/40 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-black text-brand-primary">
                        #{ticket.ticket_id}
                      </span>
                      {getPendingFormInfo(ticket).isPending && (
                        <Badge variant="warning" size="xs" className="text-[9px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          Ficha em Elaboração ({getPendingFormInfo(ticket).label})
                        </Badge>
                      )}
                      <a
                        href={ticket.url || `https://webposto.zendesk.com/agent/tickets/${ticket.ticket_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-highlight hover:underline"
                        title="Abrir no Zendesk"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        <span>Zendesk</span>
                      </a>
                      {ticket.already_audited && (
                        <Badge variant="success" size="xs" className="text-[9px]">
                          Auditado
                        </Badge>
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-brand-primary mt-1 line-clamp-1">
                      {ticket.subject}
                    </h4>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {renderScoreBadge(ticket)}
                    <Badge variant="error" size="xs" className="uppercase font-black tracking-widest flex-shrink-0">
                      CSAT Ruim
                    </Badge>
                  </div>
                </div>

                {ticket.csat_comment && (
                  <div className="p-2.5 rounded-xl bg-functional-error/5 border border-functional-error/15 text-[11px] font-medium text-brand-primary italic">
                    "{ticket.csat_comment}"
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] font-bold text-brand-muted pt-2.5 border-t border-surface-border">
                  <div className="flex items-center gap-3">
                    {renderAgentInfo(ticket)}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 opacity-60" />
                      {new Date(ticket.ticket_date).toLocaleDateString('pt-BR')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {renderAiActions(ticket, 'bg-functional-error hover:bg-functional-error/90')}
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {renderPagination()}
        </div>
      )}

      {/* Conteúdo da Fila: PROATIVAS (Amostragem Justa) */}
      {activeQueue === 'proativas' && (
        <div className="space-y-4">

          {/* Ranking de prioridade — só informativo, ajuda a escolher qual
              ticket revisar primeiro entre os desta página. */}
          {agentQueue.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {agentQueue.slice(0, 5).map((agent, index) => (
                <div
                  key={agent.agent_id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-surface-border bg-surface-subtle/40 flex-shrink-0"
                  title={`${agent.days_since_last_audit >= 999 ? 'Nunca auditado' : `${agent.days_since_last_audit}d sem monitoria`}`}
                >
                  <span className="w-4 h-4 rounded-full bg-info text-white flex items-center justify-center text-[9px] font-black flex-shrink-0">
                    {index + 1}
                  </span>
                  <span className="text-[10px] font-bold text-brand-primary whitespace-nowrap">{agent.agent_name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Lista de Chamados com CSAT Vazio */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paginatedTickets.map(ticket => {
              const isPriority = ticket.agent_email && topPriorityEmails.has(ticket.agent_email.toLowerCase());
              return (
                <Card key={ticket.ticket_id} className="p-4 space-y-3 hover:border-info/40 transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-black text-brand-primary">
                          #{ticket.ticket_id}
                        </span>
                        {getPendingFormInfo(ticket).isPending && (
                          <Badge variant="warning" size="xs" className="text-[9px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            Ficha em Elaboração ({getPendingFormInfo(ticket).label})
                          </Badge>
                        )}
                        <a
                          href={ticket.url || `https://webposto.zendesk.com/agent/tickets/${ticket.ticket_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-info hover:underline"
                          title="Abrir no Zendesk"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          <span>Zendesk</span>
                        </a>
                        {ticket.already_audited && (
                          <Badge variant="success" size="xs" className="text-[9px]">
                            Auditado
                          </Badge>
                        )}
                        {isPriority && (
                          <Badge variant="warning" size="xs" className="text-[9px]">
                            Prioritário
                          </Badge>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-brand-primary mt-1 line-clamp-1">
                        {ticket.subject}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      {renderScoreBadge(ticket)}
                      <Badge variant="neutral" size="xs" className="uppercase font-black tracking-widest flex-shrink-0">
                        CSAT Vazio
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-bold text-brand-muted pt-2.5 border-t border-surface-border">
                    <div className="flex items-center gap-3">
                      {renderAgentInfo(ticket)}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 opacity-60" />
                        {new Date(ticket.ticket_date).toLocaleDateString('pt-BR')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {renderAiActions(ticket, 'bg-gradient-to-r from-info to-info/80')}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          {renderPagination()}
        </div>
      )}

      {/* Conteúdo da Fila: POSITIVAS (+ IA Copilot) */}
      {activeQueue === 'positivas' && (
        <div className="space-y-4">
          {/* Lista de Chamados Positivos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paginatedTickets.map(ticket => (
              <Card key={ticket.ticket_id} className="p-4 space-y-3 hover:border-functional-success/40 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-black text-brand-primary">
                        #{ticket.ticket_id}
                      </span>
                      {getPendingFormInfo(ticket).isPending && (
                        <Badge variant="warning" size="xs" className="text-[9px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          Ficha em Elaboração ({getPendingFormInfo(ticket).label})
                        </Badge>
                      )}
                      <a
                        href={ticket.url || `https://webposto.zendesk.com/agent/tickets/${ticket.ticket_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-highlight hover:underline"
                        title="Abrir no Zendesk"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        <span>Zendesk</span>
                      </a>
                      {ticket.already_audited && (
                        <Badge variant="success" size="xs" className="text-[9px]">
                          Auditado
                        </Badge>
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-brand-primary mt-1 line-clamp-1">
                      {ticket.subject}
                    </h4>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {renderScoreBadge(ticket)}
                    <Badge variant="success" size="xs" className="uppercase font-black tracking-widest flex-shrink-0">
                      CSAT Bom
                    </Badge>
                  </div>
                </div>

                {ticket.csat_comment && (
                  <div className="p-2.5 rounded-xl bg-functional-success/5 border border-functional-success/15 text-[11px] font-medium text-brand-primary italic">
                    "{ticket.csat_comment}"
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] font-bold text-brand-muted pt-2.5 border-t border-surface-border">
                  <div className="flex items-center gap-3">
                    {renderAgentInfo(ticket)}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 opacity-60" />
                      {new Date(ticket.ticket_date).toLocaleDateString('pt-BR')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {renderAiActions(ticket, 'bg-gradient-to-r from-emerald-600 to-teal-600')}
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {renderPagination()}
        </div>
      )}

      {/* Conteúdo da Fila: CHAMADOS FILHOS */}
      {activeQueue === 'filhos' && (
        <div className="space-y-4">

          {filteredTickets.length === 0 ? (
            <div className="p-8 text-center bg-surface-subtle/30 rounded-2xl border border-dashed border-surface-border">
              <GitFork className="w-8 h-8 mx-auto text-brand-muted/50 mb-2" />
              <p className="text-xs font-bold text-brand-muted">Nenhum chamado filho pendente nesta fila.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paginatedTickets.map(ticket => {
                const isValidated = validatedChildTickets.has(ticket.ticket_id) || ticket.already_audited;
                const evaluation = ticket.child_evaluation;

                return (
                  <Card key={ticket.ticket_id} className="p-4 space-y-3 hover:border-brand-highlight/40 transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs font-black text-brand-primary">
                            #{ticket.ticket_id}
                          </span>
                          {ticket.parent_ticket_id && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-surface-subtle border border-surface-border text-brand-muted" title="Chamado Pai">
                              Pai: #{ticket.parent_ticket_id}
                            </span>
                          )}
                          <a
                            href={ticket.url || `https://webposto.zendesk.com/agent/tickets/${ticket.ticket_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-highlight hover:underline"
                            title="Abrir no Zendesk"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                            <span>Zendesk</span>
                          </a>
                          {isValidated && (
                            <Badge variant="success" size="xs" className="text-[9px]">
                              Validado
                            </Badge>
                          )}
                        </div>
                        <h4 className="text-xs font-bold text-brand-primary mt-1 line-clamp-1">
                          {ticket.subject}
                        </h4>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {ticket.child_macro_type && getMacroBadge(ticket.child_macro_type)}
                        {evaluation && getChildStatusBadge(evaluation.status)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-bold text-brand-muted pt-2.5 border-t border-surface-border">
                      <div className="flex items-center gap-3">
                        {renderAgentInfo(ticket)}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 opacity-60" />
                          {new Date(ticket.ticket_date).toLocaleDateString('pt-BR')}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={isValidated ? "outline" : "primary"}
                          disabled={evaluatingChildTicketId === ticket.ticket_id}
                          onClick={() => {
                            if (evaluation) {
                              setChildPreviewTicket(ticket);
                              setChildAiEvaluation(evaluation);
                            } else {
                              setChildGuidelineModalTicket(ticket);
                            }
                          }}
                          className="flex items-center gap-1.5 text-xs font-bold"
                        >
                          <Bot className={`w-3.5 h-3.5 ${evaluatingChildTicketId === ticket.ticket_id ? 'animate-spin' : ''}`} />
                          <span>
                            {evaluatingChildTicketId === ticket.ticket_id
                              ? 'Auditando com IA...'
                              : evaluation
                              ? 'Ver Parecer IA'
                              : 'Conferir com IA'}
                          </span>
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
          {renderPagination()}
        </div>
      )}

      {/* Conteúdo da Fila: FILHOS INVÁLIDOS */}
      {activeQueue === 'filhos_invalidos' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-functional-error/10 border border-functional-error/25 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-functional-error text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <AlertOctagon className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-functional-error">
                  Fila de Chamados Filhos Inválidos
                </h3>
                <p className="text-[11px] font-semibold text-brand-primary/80">
                  Chamados abertos fora do padrão ou com inconsistências (falta de tags obrigatórias, destinatário incorreto, falta de detalhamento).
                </p>
              </div>
            </div>
            <Badge variant="error" size="sm" className="font-black font-mono">
              Inconformidade
            </Badge>
          </div>

          {filteredTickets.length === 0 ? (
            <div className="p-8 text-center bg-surface-subtle/30 rounded-2xl border border-dashed border-surface-border">
              <AlertOctagon className="w-8 h-8 mx-auto text-brand-muted/50 mb-2" />
              <p className="text-xs font-bold text-brand-muted">Nenhum chamado filho inválido pendente nesta fila.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paginatedTickets.map(ticket => {
                const isValidated = validatedChildTickets.has(ticket.ticket_id) || ticket.already_audited;
                const evaluation = ticket.child_evaluation;

                return (
                  <Card key={ticket.ticket_id} className="p-4 space-y-3 hover:border-functional-error/40 transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs font-black text-brand-primary">
                            #{ticket.ticket_id}
                          </span>
                          {ticket.parent_ticket_id && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-surface-subtle border border-surface-border text-brand-muted" title="Chamado Pai">
                              Pai: #{ticket.parent_ticket_id}
                            </span>
                          )}
                          <a
                            href={ticket.url || `https://webposto.zendesk.com/agent/tickets/${ticket.ticket_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-highlight hover:underline"
                            title="Abrir no Zendesk"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                            <span>Zendesk</span>
                          </a>
                          <Badge variant="error" size="xs" className="text-[9px]">
                            Inválido
                          </Badge>
                        </div>
                        <h4 className="text-xs font-bold text-brand-primary mt-1 line-clamp-1">
                          {ticket.subject}
                        </h4>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {ticket.child_macro_type && getMacroBadge(ticket.child_macro_type)}
                        {evaluation && getChildStatusBadge(evaluation.status)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-bold text-brand-muted pt-2.5 border-t border-surface-border">
                      <div className="flex items-center gap-3">
                        {renderAgentInfo(ticket)}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 opacity-60" />
                          {new Date(ticket.ticket_date).toLocaleDateString('pt-BR')}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={evaluatingChildTicketId === ticket.ticket_id}
                          onClick={() => {
                            if (evaluation) {
                              setChildPreviewTicket(ticket);
                              setChildAiEvaluation(evaluation);
                            } else {
                              setChildGuidelineModalTicket(ticket);
                            }
                          }}
                          className="flex items-center gap-1.5 text-xs font-bold"
                        >
                          <Bot className={`w-3.5 h-3.5 ${evaluatingChildTicketId === ticket.ticket_id ? 'animate-spin' : ''}`} />
                          <span>
                            {evaluatingChildTicketId === ticket.ticket_id
                              ? 'Auditando com IA...'
                              : evaluation
                              ? 'Ver Parecer IA'
                              : 'Conferir com IA'}
                          </span>
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
          {renderPagination()}
        </div>
      )}

      {/* Modal: Parecer de Conformidade do Chamado Filho com IA */}
      {childPreviewTicket && createPortal(
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-[9999] p-4 animate-fade-in"
          onClick={() => setChildPreviewTicket(null)}
        >
          <div onClick={(e: React.MouseEvent) => e.stopPropagation()} className="w-full max-w-2xl">
            <Card className="p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl border-surface-border">
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-surface-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-brand-highlight/10 text-brand-highlight flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black text-brand-primary">
                        Auditoria de Conformidade — Chamado Filho #{childPreviewTicket.ticket_id}
                      </h3>
                      {childPreviewTicket.child_macro_type && getMacroBadge(childPreviewTicket.child_macro_type)}
                    </div>
                    <p className="text-[10px] font-semibold text-brand-muted">
                      {childPreviewTicket.parent_ticket_id ? `Vinculado ao chamado pai #${childPreviewTicket.parent_ticket_id}` : 'Chamado Filho'} • Zendesk
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setChildPreviewTicket(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Informações Básicas do Chamado */}
              <div className="p-3.5 rounded-2xl bg-surface-subtle/80 border border-surface-border space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-brand-primary">
                    Assunto: {childPreviewTicket.subject}
                  </span>
                  <span className="text-[10px] text-brand-muted">
                    Atendente: {childPreviewTicket.agent_name || 'N/D'}
                  </span>
                </div>
                {childPreviewTicket.tags && childPreviewTicket.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[9px] font-bold text-brand-muted uppercase tracking-wider">Tags:</span>
                    {childPreviewTicket.tags.map((tag, idx) => (
                      <span key={idx} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-surface-card border border-surface-border text-brand-muted">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Loading State */}
              {loadingChildAi && (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
                  <RefreshCw className="w-8 h-8 text-brand-highlight animate-spin" />
                  <p className="text-xs font-bold text-brand-primary">Avaliando conformidade do chamado filho com IA...</p>
                  <p className="text-[10px] text-brand-muted">Verificando inalterabilidade do assunto, preservação do texto da macro, direcionamento ("Para") e tags estruturais.</p>
                </div>
              )}

              {/* Result State */}
              {!loadingChildAi && childAiEvaluation && (
                <div className="space-y-4">
                  {/* Status & Score Header Card */}
                  <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                    childAiEvaluation.status === 'conforme'
                      ? 'bg-functional-success/10 border-functional-success/30 text-functional-success'
                      : childAiEvaluation.status === 'nao_conforme'
                      ? 'bg-functional-error/10 border-functional-error/30 text-functional-error'
                      : 'bg-warning/10 border-warning/30 text-warning'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${
                        childAiEvaluation.status === 'conforme'
                          ? 'bg-functional-success'
                          : childAiEvaluation.status === 'nao_conforme'
                          ? 'bg-functional-error'
                          : 'bg-warning'
                      }`}>
                        {childAiEvaluation.status === 'conforme' ? (
                          <CheckCircle2 className="w-6 h-6" />
                        ) : childAiEvaluation.status === 'nao_conforme' ? (
                          <XCircle className="w-6 h-6" />
                        ) : (
                          <AlertTriangle className="w-6 h-6" />
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-black uppercase tracking-wider">
                          {childAiEvaluation.status === 'conforme'
                            ? 'Conforme (Abertura Regular)'
                            : childAiEvaluation.status === 'nao_conforme'
                            ? 'Não Conforme (Desvio de Padrão)'
                            : 'Atenção (Inconsistência Leve)'}
                        </div>
                        <div className="text-[11px] font-semibold text-brand-primary/90 mt-0.5">
                          Padrão: {childAiEvaluation.detected_type === 'nova_demanda' ? 'Nova Demanda' : childAiEvaluation.detected_type === 'analise_tecnica' ? 'Análise Técnica N2' : childAiEvaluation.detected_type === 'apoio_tecnico' ? 'Apoio Técnico N2' : childAiEvaluation.detected_type === 'produtividade' ? 'Produtividade' : 'Desconhecido / Fora do Padrão'}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-black font-mono">
                        {childAiEvaluation.score}%
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-brand-muted">
                        Conformidade
                      </span>
                    </div>
                  </div>

                  {/* Resumo do Parecer */}
                  <div className="p-3.5 rounded-xl bg-surface-subtle/80 border border-surface-border text-xs text-brand-primary/90 leading-relaxed">
                    <span className="font-bold text-brand-primary block mb-1">Resumo do Parecer:</span>
                    {childAiEvaluation.summary}
                  </div>

                  {/* Checklist de Regras */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-brand-muted">
                      Checklist Operacional de Regras
                    </span>
                    <div className="space-y-2">
                      {childAiEvaluation.checks?.map((chk, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                            chk.passed
                              ? 'bg-functional-success/5 border-functional-success/20'
                              : 'bg-functional-error/5 border-functional-error/20'
                          }`}
                        >
                          {chk.passed ? (
                            <CheckCircle2 className="w-4 h-4 text-functional-success flex-shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-4 h-4 text-functional-error flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-brand-primary">{chk.rule}</span>
                              <Badge variant={chk.passed ? 'success' : 'error'} size="xs" className="text-[9px] font-bold">
                                {chk.passed ? 'Atendido' : 'Pendente'}
                              </Badge>
                            </div>
                            {chk.details && (
                              <p className="text-[11px] text-brand-muted mt-1 bg-surface-card p-1.5 rounded border border-surface-border">
                                {chk.details}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recomendações */}
                  {childAiEvaluation.recommendations?.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-brand-muted">
                        Recomendações e Correções
                      </span>
                      <ul className="space-y-1 bg-surface-subtle/50 p-3 rounded-xl border border-surface-border">
                        {childAiEvaluation.recommendations.map((rec, idx) => (
                          <li key={idx} className="text-[11px] text-brand-primary/90 flex items-start gap-2">
                            <span className="text-brand-highlight font-bold">•</span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Modal Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-surface-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setChildPreviewTicket(null)}
                >
                  Fechar
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loadingChildAi}
                    onClick={() => handleEvaluateChildTicket(childPreviewTicket)}
                    className="flex items-center gap-1 text-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingChildAi ? 'animate-spin' : ''}`} />
                    <span>Reanalisar</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1 text-xs"
                    onClick={() => {
                      const t = childPreviewTicket;
                      setChildPreviewTicket(null);
                      handleStartChildAudit(t);
                    }}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Abrir Monitoria</span>
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    className="flex items-center gap-1.5 text-xs font-bold"
                    onClick={() => {
                      setValidatedChildTickets(prev => new Set(prev).add(childPreviewTicket.ticket_id));
                      toast.success(`Chamado filho #${childPreviewTicket.ticket_id} validado com sucesso!`);
                      setChildPreviewTicket(null);
                    }}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Validar Chamado</span>
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>,
        document.body
      )}

      {/* Popup: Confirmação da seleção automática da IA com base nas tags do Zendesk */}
      {guidelinePickerTicket && (() => {
        const detectedCustomerType = resolveCustomerType(
          guidelinePickerTicket.tags,
          guidelinePickerTicket.organization_tags
        );
        const { form: autoForm, guideline: autoGuideline } = resolveFormAndGuidelineForCustomerType(
          detectedCustomerType,
          forms,
          guidelineOptions
        );

        return createPortal(
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-[9999] p-4 animate-fade-in"
            onClick={() => setGuidelinePickerTicket(null)}
          >
            <div onClick={(e: React.MouseEvent) => e.stopPropagation()} className="w-full max-w-lg">
              <Card className="p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl border-surface-border">
                <div className="flex items-center justify-between pb-3 border-b border-surface-border">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-brand-highlight/10 text-brand-highlight flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-brand-primary">
                        Avaliação com IA — Seleção Automática
                      </h3>
                      <p className="text-[10px] font-semibold text-brand-muted">
                        Ticket #{guidelinePickerTicket.ticket_id} • Zendesk
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setGuidelinePickerTicket(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {/* Informações do Ticket & Cliente Detectado */}
                <div className="p-3.5 rounded-2xl bg-surface-subtle/80 border border-surface-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-brand-muted">
                      Classificação do Cliente
                    </span>
                    <Badge
                      variant={detectedCustomerType === 'cliente_final' ? 'success' : 'info'}
                      size="xs"
                      className="font-black text-[10px] uppercase tracking-wider"
                    >
                      {detectedCustomerType === 'cliente_final' ? 'Cliente Final' : detectedCustomerType === 'revenda' ? 'Revenda' : 'Padrão'}
                    </Badge>
                  </div>
                  <div className="text-xs font-bold text-brand-primary line-clamp-1">
                    {guidelinePickerTicket.subject}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {guidelinePickerTicket.organization_name && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-muted bg-surface-card px-2 py-0.5 rounded-lg border border-surface-border">
                        <Tag className="w-2.5 h-2.5" />
                        {guidelinePickerTicket.organization_name}
                      </span>
                    )}
                    {((guidelinePickerTicket.tags?.length || 0) > 0 || (guidelinePickerTicket.organization_tags?.length || 0) > 0) ? (
                      [...(guidelinePickerTicket.organization_tags || []), ...(guidelinePickerTicket.tags || [])]
                        .slice(0, 4)
                        .map((tag, idx) => (
                          <span key={idx} className="text-[9px] font-mono font-semibold text-brand-muted bg-surface-card px-1.5 py-0.5 rounded border border-surface-border">
                            #{tag}
                          </span>
                        ))
                    ) : (
                      <span className="text-[10px] font-semibold text-brand-muted italic">
                        Tag padrão: #cliente_final
                      </span>
                    )}
                  </div>
                </div>

                {/* Opções selecionadas pela IA (Travadas / Read-Only) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between ml-0.5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-brand-muted">
                      Critérios e Manual Vinculados (Bloqueados)
                    </span>
                    <span className="flex items-center gap-1 text-[9px] font-bold text-brand-highlight">
                      <Lock className="w-2.5 h-2.5" />
                      <span>Seleção Automática</span>
                    </span>
                  </div>

                  {/* Ficha Selecionada */}
                  <div className="p-3.5 rounded-xl border border-surface-border bg-surface-subtle/50 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-info/10 text-info flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wider text-brand-muted">
                          Ficha de Monitoria
                        </span>
                        <Badge variant="neutral" size="xs" className="text-[9px] font-bold">
                          Somente Leitura
                        </Badge>
                      </div>
                      <div className="text-xs font-black text-brand-primary mt-0.5">
                        {autoForm?.title || 'Ficha de Atendimento Geral'}
                      </div>
                      <p className="text-[10px] font-medium text-brand-muted mt-0.5">
                        Definida com base no tipo de cliente ({detectedCustomerType === 'cliente_final' ? 'Cliente Final' : 'Revenda'})
                      </p>
                    </div>
                  </div>

                  {/* Manual Selecionado */}
                  <div className="p-3.5 rounded-xl border border-surface-border bg-surface-subtle/50 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-brand-highlight/10 text-brand-highlight flex items-center justify-center flex-shrink-0 mt-0.5">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wider text-brand-muted">
                          Manual de Atendimento
                        </span>
                        <Badge variant="neutral" size="xs" className="text-[9px] font-bold">
                          Somente Leitura
                        </Badge>
                      </div>
                      <div className="text-xs font-black text-brand-primary mt-0.5">
                        {autoGuideline?.title || 'Critérios padrão da ficha'}
                      </div>
                      <p className="text-[10px] font-medium text-brand-muted mt-0.5 line-clamp-1">
                        {autoGuideline?.content ? autoGuideline.content.slice(0, 100) + '...' : 'Diretrizes operacionais alinhadas à organização do chamado.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Mensagem de trava */}
                <div className="p-3 rounded-xl bg-brand-highlight/5 border border-brand-highlight/15 text-[11px] font-medium text-brand-primary/80 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-brand-highlight flex-shrink-0" />
                  <span>
                    A ficha e o manual são definidos automaticamente pelo tipo de cliente ({detectedCustomerType === 'cliente_final' ? 'Cliente Final' : 'Revenda'}) e não podem ser alterados manualmente.
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setGuidelinePickerTicket(null)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex items-center gap-1.5"
                    disabled={!autoForm || evaluatingTicketId === guidelinePickerTicket.ticket_id}
                    onClick={() => {
                      const ticket = guidelinePickerTicket;
                      const formToUse = autoForm!;
                      const guidelineIds = autoGuideline ? [autoGuideline.id] : [];
                      setGuidelinePickerTicket(null);
                      handleEvaluateWithAI(ticket, formToUse, guidelineIds);
                    }}
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>Confirmar e Avaliar com IA</span>
                  </Button>
                </div>
              </Card>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Modal Prévio de Apresentação do Manual de Chamados Filhos */}
      {childGuidelineModalTicket && createPortal(
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-[9999] p-4 animate-fade-in"
          onClick={() => {
            setChildGuidelineModalTicket(null);
            setShowFullChildManual(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl animate-scale-up"
          >
            <Card className="p-6 space-y-4 shadow-2xl border border-surface-border">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-brand-highlight/10 text-brand-highlight flex items-center justify-center">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-brand-primary">
                      Auditoria de Chamado Filho com IA
                    </h3>
                    <p className="text-[11px] font-medium text-brand-muted">
                      Conferência de conformidade do Ticket #{childGuidelineModalTicket.ticket_id}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setChildGuidelineModalTicket(null);
                    setShowFullChildManual(false);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Informações do Chamado */}
              <div className="p-3 rounded-xl bg-surface-subtle border border-surface-border space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-brand-primary truncate max-w-[320px]">
                    {childGuidelineModalTicket.subject}
                  </span>
                  {childGuidelineModalTicket.child_macro_type && getMacroBadge(childGuidelineModalTicket.child_macro_type)}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-brand-muted">
                  <span>Atendente: <strong className="text-brand-primary">{childGuidelineModalTicket.agent_name || 'Não atribuído (Apenas Grupo)'}</strong></span>
                  <span>•</span>
                  <span>Data: {new Date(childGuidelineModalTicket.ticket_date).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>

              {/* Manual Vinculado com Destaque */}
              <div className="p-4 rounded-xl border border-brand-highlight/30 bg-brand-highlight/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-brand-highlight flex-shrink-0" />
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-wider text-brand-muted">Manual Vinculado Homologado</div>
                      <div className="text-xs font-black text-brand-primary">
                        Manual de Chamados Filhos — POP v1.1
                      </div>
                    </div>
                  </div>
                  <Badge variant="primary" size="xs" className="font-bold">
                    Padrão Ativo
                  </Badge>
                </div>

                <div className="text-[11px] font-semibold text-brand-primary/80">
                  A IA auditará a abertura deste chamado baseando-se estritamente nas 4 regras de conformidade:
                </div>

                {/* As 4 Regras de Ouro */}
                <div className="space-y-1.5 text-[10px]">
                  <div className="p-2 rounded-lg bg-surface-card border border-surface-border flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-brand-highlight/10 text-brand-highlight font-bold flex items-center justify-center shrink-0 text-[9px]">1</span>
                    <div>
                      <strong className="text-brand-primary">Preservação do Assunto:</strong> Inalterabilidade da macro base. Aceita identificador do chamado pai e prefixos (ex: <code>"Ticket Nova Demanda do #169238"</code>).
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-surface-card border border-surface-border flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-brand-highlight/10 text-brand-highlight font-bold flex items-center justify-center shrink-0 text-[9px]">2</span>
                    <div>
                      <strong className="text-brand-primary">Corpo da Mensagem e Enriquecimento:</strong> Manutenção da estrutura da macro com preenchimento dos dados técnicos (versão, logs, AnyDesk, testes realizados).
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-surface-card border border-surface-border flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-brand-highlight/10 text-brand-highlight font-bold flex items-center justify-center shrink-0 text-[9px]">3</span>
                    <div>
                      <strong className="text-brand-primary">Direcionamento ("Para"):</strong> Destinatário correto (Grupo para Análise Técnica; Próprio analista para Nova Demanda; Analista N2 nominal para Apoio Técnico).
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-surface-card border border-surface-border flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-brand-highlight/10 text-brand-highlight font-bold flex items-center justify-center shrink-0 text-[9px]">4</span>
                    <div>
                      <strong className="text-brand-primary">Governança de Tags:</strong> Preservação das tags nativas da macro (<code>existe_ticket_filho</code>, <code>transferencia_analise</code>, etc.).
                    </div>
                  </div>
                </div>

                {/* Opção para ler o manual completo */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowFullChildManual(!showFullChildManual)}
                    className="text-[10px] font-bold text-brand-highlight hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3 h-3" />
                    <span>{showFullChildManual ? 'Ocultar Texto Completo do Manual' : 'Ver Texto Completo do POP v1.1 na Íntegra'}</span>
                  </button>
                  {showFullChildManual && (
                    <div className="mt-2 p-3 max-h-48 overflow-y-auto rounded-lg bg-surface-card border border-surface-border text-[10px] text-brand-muted whitespace-pre-line font-mono leading-relaxed">
                      {DEFAULT_CHILD_TICKET_GUIDELINE.content}
                    </div>
                  )}
                </div>
              </div>

              {/* Ações do Modal */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setChildGuidelineModalTicket(null);
                    setShowFullChildManual(false);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                  onClick={() => {
                    const ticketToEvaluate = childGuidelineModalTicket;
                    setChildGuidelineModalTicket(null);
                    setShowFullChildManual(false);
                    handleEvaluateChildTicket(ticketToEvaluate);
                  }}
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>Iniciar Auditoria com IA</span>
                </Button>
              </div>
            </Card>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
