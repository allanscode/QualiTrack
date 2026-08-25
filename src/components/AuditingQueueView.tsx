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
  normalizeChannel
} from '../lib/helpdeskQueue';
import { fetchAIGuidelines } from '../lib/aiGuidelines';
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
  BookOpen
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
  onStartAudit: (prefill: {
    ticket_id: string;
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

  const teamsMap = useMemo(() => {
    const map: Record<string, string> = {};
    teams.forEach(t => { map[t.id] = t.name; });
    return map;
  }, [teams]);

  // Fila balanceada de prioridade de agentes
  const agentQueue = useMemo(() => {
    return computeAgentQueuePriorities(agents, monitorias, teamsMap);
  }, [agents, monitorias, teamsMap]);

  const loadQueueData = async () => {
    setLoading(true);
    try {
      const data = await fetchQueueTickets(activeQueue, monitorias);
      setTickets(data);
    } catch (err) {
      console.error('Erro ao carregar fila:', err);
      toast.error('Não foi possível carregar a fila de chamados.');
    } finally {
      setLoading(false);
    }
  };

  // Ao trocar de fila (Negativas/Proativas/Positivas), limpa a lista antes
  // de buscar a nova — senão os tickets da fila anterior ficam visíveis por
  // alguns segundos enquanto a nova fila carrega, parecendo que são da fila
  // que acabou de ser selecionada. Não limpa em refresh automático (mudança
  // só em monitorias.length), pra não piscar a tela à toa.
  const prevQueueRef = useRef(activeQueue);
  useEffect(() => {
    if (prevQueueRef.current !== activeQueue) {
      setTickets([]);
      prevQueueRef.current = activeQueue;
    }
    loadQueueData();
  }, [activeQueue, monitorias.length]);

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
  // a seleção de manual no popup.
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

    setEvaluatingTicketId(ticket.ticket_id);
    try {
      toast.info(`Buscando diálogo e analisando ticket #${ticket.ticket_id} com IA...`);
      const dialogue = await fetchTicketDialogue(ticket.ticket_id);
      const teamId = matchedAgent?.primary_team_id || matchedAgent?.team_ids?.[0] || ticket.team_id;
      const aiResult = await evaluateTicketWithAI(ticket.ticket_id, defaultForm, dialogue, {
        name: matchedAgent?.name || ticket.agent_name,
        email: matchedAgent?.email || ticket.agent_email,
        team_name: teamId ? teamsMap[teamId] : undefined,
        channel: ticket.channel,
      }, guidelineIds);

      toast.success(`Avaliação da IA gerada com sucesso para o ticket #${ticket.ticket_id}!`);

      // ticket.agent_id vem resolvido pela Edge Function (garante o vínculo/
      // conta provisória pelo e-mail) — usado como fonte primária do agente,
      // com o match local como reforço apenas para nome/equipe de exibição.
      onStartAudit({
        ticket_id: ticket.ticket_id,
        form_id: defaultForm.id,
        evaluated_id: ticket.agent_id || matchedAgent?.id,
        team_id: teamId,
        channel: normalizeChannel(ticket.channel),
        satisfaction_result: 'Positiva',
        // Elogio do cliente no CSAT já vem preenchido na Etapa 2 (Pesquisa),
        // marcado como "possui registro" automaticamente.
        satisfaction_has_record: !!ticket.csat_comment,
        satisfaction_record_text: ticket.csat_comment,
        aiEvaluation: aiResult
      });
    } catch (err: any) {
      console.error('Erro na avaliação com IA:', err);
      toast.error(err?.message || 'Falha ao processar avaliação com IA');
    } finally {
      setEvaluatingTicketId(null);
    }
  };

  // Sorteio proativo para o agente prioritário
  const handleProactiveDraw = (agent: AgentQueueSummary) => {
    const sampleTicketId = `154${Math.floor(100 + Math.random() * 899)}`;
    toast.success(`Chamado #${sampleTicketId} selecionado para ${agent.agent_name}!`);

    onStartAudit({
      ticket_id: sampleTicketId,
      evaluated_id: agent.agent_id,
      team_id: agent.team_id,
      channel: 'Chat',
      satisfaction_result: 'Sem pesquisa'
    });
  };

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
            onClick={loadQueueData}
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
              ? 'bg-brand-highlight/15 text-brand-highlight border border-brand-highlight/30 shadow-sm'
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
        </div>
      )}

      {/* Conteúdo da Fila: PROATIVAS (Amostragem Justa) */}
      {activeQueue === 'proativas' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-brand-highlight/10 border border-brand-highlight/25 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-highlight text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-brand-highlight">
                  Fila de Equidade Proativa
                </h3>
                <p className="text-[11px] font-semibold text-brand-primary/80">
                  Substitui a planilha antiga: ordena automaticamente todos os atendentes por tempo sem monitoria, garantindo 100% de cobertura da equipe.
                </p>
              </div>
            </div>
            {agentQueue.length > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleProactiveDraw(agentQueue[0])}
                className="flex items-center gap-1.5 font-bold flex-shrink-0"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Sortear Top 1 da Fila</span>
              </Button>
            )}
          </div>

          {/* Grid de Atendentes Ordenados por Prioridade */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {agentQueue.map((agent, index) => {
              const isUrgent = agent.days_since_last_audit > 14 || agent.total_audits_month === 0;

              return (
                <Card
                  key={agent.agent_id}
                  className={`p-3.5 space-y-2.5 transition-all ${
                    index === 0
                      ? 'border-brand-highlight ring-1 ring-brand-highlight/30 bg-surface-subtle/30'
                      : 'hover:border-surface-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                        index === 0
                          ? 'bg-brand-highlight text-white'
                          : 'bg-surface-subtle text-brand-muted'
                      }`}>
                        {index + 1}
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-brand-primary line-clamp-1">
                          {agent.agent_name}
                        </h4>
                        <span className="text-[10px] font-bold text-brand-muted flex items-center gap-1">
                          <Tag className="w-2.5 h-2.5 opacity-60" />
                          {agent.team_name}
                        </span>
                      </div>
                    </div>

                    <Badge
                      variant={isUrgent ? 'warning' : 'neutral'}
                      size="xs"
                      className="font-bold text-[9px] flex-shrink-0"
                    >
                      {agent.days_since_last_audit >= 999
                        ? 'Nunca auditado'
                        : `${agent.days_since_last_audit}d sem monitoria`}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-bold text-brand-muted pt-2 border-t border-surface-border">
                    <span>
                      {agent.total_audits_month} {agent.total_audits_month === 1 ? 'monitoria' : 'monitorias'} no mês
                    </span>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleProactiveDraw(agent)}
                      className="flex items-center gap-1 text-[10px]"
                    >
                      <span>Auditar Agente</span>
                      <ArrowRight className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
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
                  <Badge variant="success" size="xs" className="uppercase font-black tracking-widest flex-shrink-0">
                    CSAT Bom
                  </Badge>
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
                    {ticket.positive_cap_reached ? (
                      <span title="Este atendente já atingiu o máximo de 2 avaliações positivas no mês.">
                        <Badge variant="warning" size="xs" className="font-bold text-[9px]">
                          Máximo de 2 por agente atingido
                        </Badge>
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={evaluatingTicketId === ticket.ticket_id}
                        onClick={() => openGuidelinePicker(ticket)}
                        className="flex items-center gap-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold"
                      >
                        <Bot className={`w-3 h-3 ${evaluatingTicketId === ticket.ticket_id ? 'animate-spin' : ''}`} />
                        <span>{evaluatingTicketId === ticket.ticket_id ? 'Analisando...' : 'Avaliar com IA'}</span>
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
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
