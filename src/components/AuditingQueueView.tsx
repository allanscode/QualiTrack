import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AuditingQueueType,
  AuditingQueueTicket,
  AgentQueueSummary,
  User,
  Monitoria,
  EvaluationForm,
  Team,
  AIEvaluationResult,
  AIEvaluationGuideline
} from '../types';
import {
  fetchQueueTickets,
  computeAgentQueuePriorities,
  evaluateTicketWithAI,
  fetchTicketDialogue,
  normalizeChannel,
  csatStatusToSatisfactionResult
} from '../lib/helpdeskQueue';
import { fetchAIGuidelines } from '../lib/aiGuidelines';
import { fetchAIDrafts, saveAIDraft, deleteAIDraft, AIEvaluationDraft } from '../lib/aiDrafts';
import {
  AlertTriangle,
  Sparkles,
  CheckCircle2,
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
  ChevronRight
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
  }) => void;
}

export default function AuditingQueueView({
  agents,
  teams,
  forms,
  monitorias,
  currentUserId,
  onStartAudit,
}: AuditingQueueViewProps) {
  const [activeQueue, setActiveQueue] = useState<AuditingQueueType>('negativas');
  const [loading, setLoading] = useState(false);
  const [tickets, setTickets] = useState<AuditingQueueTicket[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgentFilter, setSelectedAgentFilter] = useState('');

  // Estado para modal/visualização rápida de IA
  const [evaluatingTicketId, setEvaluatingTicketId] = useState<string | null>(null);

  // Popup de seleção do manual antes de avaliar com IA: deixa o monitor
  // escolher qual(is) manual(is) a IA deve ler para aquele ticket em vez de
  // sempre mandar todos os ativos — economiza tokens por chamada.
  const [guidelineOptions, setGuidelineOptions] = useState<AIEvaluationGuideline[]>([]);
  const [loadingGuidelines, setLoadingGuidelines] = useState(false);
  const [guidelinePickerTicket, setGuidelinePickerTicket] = useState<AuditingQueueTicket | null>(null);
  const [selectedGuidelineIds, setSelectedGuidelineIds] = useState<Set<string>>(new Set());

  // Rascunhos de avaliação da IA já prontos (persistidos), por ticket_id —
  // evita rodar a IA de novo toda vez que o monitor volta na mesma fila.
  const [drafts, setDrafts] = useState<Record<string, AIEvaluationDraft>>({});

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
    loadQueueData(cursor);
  };

  const goToPrevPage = () => {
    if (prevCursors.length === 0) return;
    const stack = [...prevCursors];
    stack.pop(); // remove o cursor da página atual
    const target = stack.length > 0 ? stack[stack.length - 1] : null;
    setPrevCursors(stack);
    setPageNumber(p => Math.max(1, p - 1));
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
      prevQueueRef.current = activeQueue;
      loadQueueData(null);
    } else {
      loadQueueData(null);
    }
  }, [activeQueue, monitorias.length]);

  // Carrega os rascunhos de IA já prontos para os tickets da página atual —
  // relevante nas filas de Positivas e Proativas, onde a avaliação com IA
  // acontece (Negativas ainda não tem IA).
  useEffect(() => {
    if ((activeQueue !== 'positivas' && activeQueue !== 'proativas') || tickets.length === 0) {
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

  // Abre o popup de seleção de manual antes de avaliar com IA — o monitor
  // escolhe qual(is) manual(is) essa avaliação deve usar como referência.
  const openGuidelinePicker = async (ticket: AuditingQueueTicket) => {
    if (ticket.positive_cap_reached) {
      toast.warning('Este atendente já atingiu o máximo de 2 avaliações positivas no mês.');
      return;
    }
    setGuidelinePickerTicket(ticket);
    setSelectedGuidelineIds(new Set());
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

  // Ação de avaliar com IA — chamada depois que o monitor confirma (ou pula)
  // a seleção de manual no popup. Só roda a IA e SALVA o resultado como
  // rascunho; não abre a ficha sozinha — isso fica pro botão "Lançar
  // Monitoria" (handleLaunchMonitoria), pra não obrigar o monitor a decidir
  // na hora e pra não precisar rodar a IA de novo se ele só quiser revisar
  // depois.
  const handleEvaluateWithAI = async (ticket: AuditingQueueTicket, guidelineIds: string[]) => {
    const defaultForm = forms.find(f => f.active !== false) || forms[0];
    if (!defaultForm) {
      toast.error('Nenhum formulário ativo encontrado para avaliação.');
      return;
    }

    // Encontra o agente correspondente pelo e-mail (chave universal) ou nome
    const matchedAgent = agents.find(a =>
      (ticket.agent_email && a.email.toLowerCase() === ticket.agent_email.toLowerCase()) ||
      (ticket.agent_name && a.name.toLowerCase() === ticket.agent_name.toLowerCase())
    );
    const teamId = matchedAgent?.primary_team_id || matchedAgent?.team_ids?.[0] || ticket.team_id;
    const agentId = ticket.agent_id || matchedAgent?.id;

    setEvaluatingTicketId(ticket.ticket_id);
    try {
      toast.info(`Buscando diálogo e analisando ticket #${ticket.ticket_id} com IA...`);
      const { comments: dialogue, ticketFields } = await fetchTicketDialogue(ticket.ticket_id);
      const aiResult = await evaluateTicketWithAI(ticket.ticket_id, defaultForm, dialogue, {
        name: matchedAgent?.name || ticket.agent_name,
        email: matchedAgent?.email || ticket.agent_email,
        team_name: teamId ? teamsMap[teamId] : undefined,
        channel: ticket.channel,
      }, guidelineIds, ticketFields);

      await saveAIDraft({
        ticketId: ticket.ticket_id,
        formId: defaultForm.id,
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
          form_id: defaultForm.id,
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

      toast.success(`Avaliação pronta para o ticket #${ticket.ticket_id} — confira e clique em "Lançar Monitoria".`);
    } catch (err: any) {
      console.error('Erro na avaliação com IA:', err);
      toast.error(err?.message || 'Falha ao processar avaliação com IA');
    } finally {
      setEvaluatingTicketId(null);
    }
  };

  // Abre a ficha de monitoria com o rascunho da IA já salvo pra esse
  // ticket — sem rodar a IA de novo.
  const handleLaunchMonitoria = (ticket: AuditingQueueTicket) => {
    const draft = drafts[ticket.ticket_id];
    if (!draft) return;

    onStartAudit({
      ticket_id: ticket.ticket_id,
      ticket_subject: ticket.subject,
      form_id: draft.form_id,
      evaluated_id: draft.agent_id,
      team_id: draft.team_id,
      channel: normalizeChannel(draft.channel),
      // A IA agora avalia Positivas e Proativas — o resultado da pesquisa
      // precisa refletir o CSAT real do ticket, não ficar fixo em
      // 'Positiva' (Proativas normalmente é 'Sem pesquisa').
      satisfaction_result: csatStatusToSatisfactionResult(ticket.csat_status),
      satisfaction_has_record: !!draft.satisfaction_comment,
      satisfaction_record_text: draft.satisfaction_comment,
      aiEvaluation: draft.result
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

  // Bloco de botões de ação de IA (Avaliar com IA / Reavaliar / Lançar
  // Monitoria) — igual pra Positivas e Proativas, só muda a cor de
  // destaque. Extraído pra não duplicar a mesma lógica duas vezes.
  const renderAiActions = (ticket: AuditingQueueTicket, accentClass: string) => {
    const draft = drafts[ticket.ticket_id];

    if (draft) {
      return (
        <>
          {!ticket.positive_cap_reached && (
            <Button
              size="sm"
              variant="outline"
              disabled={evaluatingTicketId === ticket.ticket_id}
              onClick={() => openGuidelinePicker(ticket)}
              className={`flex items-center gap-1 text-[10px] ${AI_ACTION_BUTTON_CLASS}`}
              title="Roda a IA de novo e sobrescreve este rascunho"
            >
              <Bot className={`w-3 h-3 ${evaluatingTicketId === ticket.ticket_id ? 'animate-spin' : ''}`} />
              <span>Reavaliar</span>
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            onClick={() => handleLaunchMonitoria(ticket)}
            className={`flex items-center gap-1 ${accentClass} text-white font-bold ${AI_ACTION_BUTTON_CLASS}`}
          >
            <Rocket className="w-3 h-3" />
            <span>Lançar Monitoria</span>
          </Button>
        </>
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

    return (
      <Button
        size="sm"
        variant="primary"
        disabled={evaluatingTicketId === ticket.ticket_id}
        onClick={() => openGuidelinePicker(ticket)}
        className={`flex items-center gap-1 ${accentClass} text-white font-bold ${AI_ACTION_BUTTON_CLASS}`}
      >
        <Bot className={`w-3 h-3 ${evaluatingTicketId === ticket.ticket_id ? 'animate-spin' : ''}`} />
        <span>{evaluatingTicketId === ticket.ticket_id ? 'Analisando...' : 'Avaliar com IA'}</span>
      </Button>
    );
  };

  // Controles de paginação (25 tickets por página) — reaproveitados em
  // Negativas, Proativas e Positivas.
  const renderPagination = () => (
    <div className="flex items-center justify-between pt-2">
      <span className="text-[10px] font-bold text-brand-muted">Página {pageNumber}</span>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={prevCursors.length === 0 || loading}
          onClick={goToPrevPage}
          className="flex items-center gap-1 text-[10px]"
        >
          <ChevronLeft className="w-3 h-3" />
          <span>Anterior</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!hasMore || loading}
          onClick={goToNextPage}
          className="flex items-center gap-1 text-[10px]"
        >
          <span>Próxima</span>
          <ChevronRight className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-surface-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-brand-primary tracking-tight">
              Central de Filas & Triagem
            </h1>
            <Badge variant="primary" size="xs" className="uppercase font-bold tracking-wider">
              Zendesk Sync
            </Badge>
          </div>
          <p className="text-xs font-semibold text-brand-muted mt-0.5">
            Triagem automatizada de chamados por pesquisa de satisfação (CSAT) e amostragem justa de atendentes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPrevCursors([]);
              setPageNumber(1);
              loadQueueData(null);
            }}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar Filas</span>
          </Button>
        </div>
      </div>

      {/* Tabs de Navegação das Filas */}
      <div className="flex items-center gap-2 p-1 bg-surface-subtle/60 rounded-2xl border border-surface-border w-fit max-w-full overflow-x-auto">
        <button
          onClick={() => setActiveQueue('negativas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeQueue === 'negativas'
              ? 'bg-functional-error/15 text-functional-error border border-functional-error/30 shadow-sm'
              : 'text-brand-muted hover:text-brand-primary hover:bg-surface-subtle'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>CSAT Negativas</span>
          {pendingNegativesCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-black bg-functional-error text-white rounded-full">
              {pendingNegativesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveQueue('proativas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeQueue === 'proativas'
              ? 'bg-info/15 text-info border border-info/30 shadow-sm'
              : 'text-brand-muted hover:text-brand-primary hover:bg-surface-subtle'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Fila Proativa (Amostragem Justa)</span>
        </button>

        <button
          onClick={() => setActiveQueue('positivas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeQueue === 'positivas'
              ? 'bg-functional-success/15 text-functional-success border border-functional-success/30 shadow-sm'
              : 'text-brand-muted hover:text-brand-primary hover:bg-surface-subtle'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>CSAT Positivas (+ IA Copilot)</span>
        </button>
      </div>

      {/* Conteúdo da Fila: NEGATIVAS */}
      {activeQueue === 'negativas' && (
        <div className="space-y-4">
          {/* Banner de Alerta */}
          <div className="p-4 rounded-2xl bg-functional-error/10 border border-functional-error/25 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-functional-error text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-functional-error">
                  Fila Prioritária de Insatisfação
                </h3>
                <p className="text-[11px] font-semibold text-brand-primary/80">
                  Estes chamados receberam avaliação negativa do cliente no Zendesk e requerem monitoria para apuração e contato de reversão.
                </p>
              </div>
            </div>
            <Badge variant="error" size="sm" className="font-black font-mono">
              Alta Prioridade
            </Badge>
          </div>

          {/* Lista de Tickets Negativos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTickets.map(ticket => (
              <Card key={ticket.ticket_id} className="p-4 space-y-3 hover:border-brand-highlight/40 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-brand-primary">
                        #{ticket.ticket_id}
                      </span>
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
                  <Badge variant="error" size="xs" className="uppercase font-black tracking-widest flex-shrink-0">
                    CSAT Ruim
                  </Badge>
                </div>

                {ticket.csat_comment && (
                  <div className="p-2.5 rounded-xl bg-functional-error/5 border border-functional-error/15 text-[11px] font-medium text-brand-primary italic">
                    "{ticket.csat_comment}"
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] font-bold text-brand-muted pt-1 border-t border-surface-border">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <UserIcon className="w-3 h-3 text-brand-highlight" />
                      {ticket.agent_name || 'Agente'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 opacity-60" />
                      {new Date(ticket.ticket_date).toLocaleDateString('pt-BR')}
                    </span>
                  </div>

                  <Button
                    size="sm"
                    variant={ticket.already_audited ? 'outline' : 'primary'}
                    onClick={() => {
                      const matchedAgent = agents.find(a =>
                        (ticket.agent_email && a.email.toLowerCase() === ticket.agent_email.toLowerCase()) ||
                        (ticket.agent_name && a.name.toLowerCase() === ticket.agent_name.toLowerCase())
                      );
                      // ticket.agent_id vem resolvido pela Edge Function (que já
                      // garante o vínculo/conta provisória pelo e-mail) — mais
                      // confiável que o match local, que depende do cache de
                      // agentes estar atualizado.
                      onStartAudit({
                        ticket_id: ticket.ticket_id,
                        ticket_subject: ticket.subject,
                        evaluated_id: ticket.agent_id || matchedAgent?.id,
                        team_id: ticket.team_id || matchedAgent?.primary_team_id || matchedAgent?.team_ids?.[0],
                        channel: normalizeChannel(ticket.channel),
                        satisfaction_result: 'Negativa'
                      });
                    }}
                    className="flex items-center gap-1"
                  >
                    <span>{ticket.already_audited ? 'Reavaliar' : 'Auditar Chamado'}</span>
                    <ArrowRight className="w-3 h-3" />
                  </Button>
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
          <div className="p-4 rounded-2xl bg-info/10 border border-info/25 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-info text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-info">
                Fila de Equidade Proativa
              </h3>
              <p className="text-[11px] font-semibold text-brand-primary/80">
                Chamados com CSAT vazio/não avaliado no Zendesk — a mesma IA da fila de Positivas avalia e
                sugere a monitoria, que você revisa antes de lançar. Cards de agentes com <Badge variant="warning" size="xs" className="text-[9px] align-middle">prioritário</Badge> pertencem a quem está há mais tempo sem monitoria.
              </p>
            </div>
          </div>

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
            {filteredTickets.map(ticket => {
              const isPriority = ticket.agent_email && topPriorityEmails.has(ticket.agent_email.toLowerCase());
              return (
                <Card key={ticket.ticket_id} className="p-4 space-y-3 hover:border-info/40 transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-brand-primary">
                          #{ticket.ticket_id}
                        </span>
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
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {renderScoreBadge(ticket)}
                      <Badge variant="neutral" size="xs" className="uppercase font-black tracking-widest flex-shrink-0">
                        CSAT Vazio
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-bold text-brand-muted pt-1 border-t border-surface-border">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <UserIcon className="w-3 h-3 text-info" />
                        {ticket.agent_name || 'Agente'}
                      </span>
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
          <div className="p-4 rounded-2xl bg-functional-success/10 border border-functional-success/25 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-functional-success text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-functional-success">
                Fila de Elogios e Avaliação com IA
              </h3>
              <p className="text-[11px] font-semibold text-brand-primary/80">
                Chamados com CSAT Positivo no Zendesk. A IA lê o diálogo, avalia os critérios operacionais e pré-preenche a monitoria com sugestão de elogios.
              </p>
            </div>
          </div>

          {/* Lista de Chamados Positivos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTickets.map(ticket => (
              <Card key={ticket.ticket_id} className="p-4 space-y-3 hover:border-functional-success/40 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-brand-primary">
                        #{ticket.ticket_id}
                      </span>
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

                <div className="flex items-center justify-between text-[10px] font-bold text-brand-muted pt-1 border-t border-surface-border">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <UserIcon className="w-3 h-3 text-brand-highlight" />
                      {ticket.agent_name || 'Agente'}
                    </span>
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

      {/* Popup: escolha do manual antes de avaliar com IA */}
      {guidelinePickerTicket && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setGuidelinePickerTicket(null)}
        >
          <div onClick={(e: React.MouseEvent) => e.stopPropagation()} className="w-full max-w-lg">
            <Card className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-brand-highlight" />
                  <h3 className="text-sm font-black text-brand-primary">
                    Qual manual a IA deve usar?
                  </h3>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setGuidelinePickerTicket(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[11px] font-semibold text-brand-muted">
                Ticket #{guidelinePickerTicket.ticket_id} — escolha só os manuais relevantes para esse
                atendimento. Menos manuais = resposta mais rápida e mais barata (menos tokens enviados à IA).
              </p>

              {loadingGuidelines ? (
                <div className="flex items-center justify-center py-6">
                  <RefreshCw className="w-5 h-5 animate-spin text-brand-muted" />
                </div>
              ) : guidelineOptions.length === 0 ? (
                <div className="p-4 rounded-xl bg-surface-subtle text-xs font-semibold text-brand-muted text-center">
                  Nenhum manual cadastrado ainda (Admin &gt; Manual da IA). A IA vai avaliar só com os
                  critérios da própria ficha.
                </div>
              ) : (
                <div className="space-y-2">
                  {guidelineOptions.map(g => {
                    const checked = selectedGuidelineIds.has(g.id);
                    return (
                      <label
                        key={g.id}
                        className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                          checked ? 'border-brand-highlight bg-brand-highlight/5' : 'border-surface-border hover:bg-surface-subtle'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedGuidelineIds(prev => {
                              const next = new Set(prev);
                              if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                              return next;
                            });
                          }}
                          className="mt-0.5 w-4 h-4 rounded text-brand-highlight focus:ring-brand-highlight"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-black text-brand-primary">{g.title}</div>
                          <div className="text-[10px] font-medium text-brand-muted line-clamp-2">{g.content}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const ticket = guidelinePickerTicket;
                    setGuidelinePickerTicket(null);
                    if (ticket) handleEvaluateWithAI(ticket, []);
                  }}
                >
                  Avaliar sem manual
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="flex items-center gap-1.5"
                  onClick={() => {
                    const ticket = guidelinePickerTicket;
                    const ids = Array.from(selectedGuidelineIds);
                    setGuidelinePickerTicket(null);
                    if (ticket) handleEvaluateWithAI(ticket, ids);
                  }}
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>Avaliar com IA{selectedGuidelineIds.size > 0 ? ` (${selectedGuidelineIds.size} manual${selectedGuidelineIds.size > 1 ? 'is' : ''})` : ''}</span>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
