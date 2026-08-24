import React, { useState, useEffect, useMemo, useTransition } from 'react';
import {
  AuditingQueueType,
  AuditingQueueTicket,
  AgentQueueSummary,
  User,
  Monitoria,
  EvaluationForm,
  Team,
  AIEvaluationResult
} from '../types';
import {
  fetchQueueTickets,
  computeAgentQueuePriorities,
  evaluateTicketWithAI,
  fetchTicketDialogue
} from '../lib/helpdeskQueue';
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
  Check
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
    evaluated_id?: string;
    team_id?: string;
    channel?: string;
    satisfaction_result?: string;
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
  const [, startTransition] = useTransition();

  // Estado para modal/visualização rápida de IA
  const [evaluatingTicketId, setEvaluatingTicketId] = useState<string | null>(null);

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

  useEffect(() => {
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

  // Ação de avaliar com IA
  const handleEvaluateWithAI = async (ticket: AuditingQueueTicket) => {
    const defaultForm = forms.find(f => f.active !== false) || forms[0];
    if (!defaultForm) {
      toast.error('Nenhum formulário ativo encontrado para avaliação.');
      return;
    }

    setEvaluatingTicketId(ticket.ticket_id);
    try {
      toast.info(`Buscando diálogo e analisando ticket #${ticket.ticket_id} com IA...`);
      const dialogue = await fetchTicketDialogue(ticket.ticket_id);
      const aiResult = await evaluateTicketWithAI(ticket.ticket_id, defaultForm, dialogue);

      toast.success(`Avaliação da IA gerada com sucesso para o ticket #${ticket.ticket_id}!`);

      // Encontra o agente correspondente pelo nome ou email
      const matchedAgent = agents.find(a =>
        (ticket.agent_email && a.email.toLowerCase() === ticket.agent_email.toLowerCase()) ||
        (ticket.agent_name && a.name.toLowerCase() === ticket.agent_name.toLowerCase())
      );

      onStartAudit({
        ticket_id: ticket.ticket_id,
        evaluated_id: matchedAgent?.id,
        team_id: matchedAgent?.primary_team_id || matchedAgent?.team_ids?.[0],
        channel: ticket.channel || 'Chat',
        satisfaction_result: 'Positiva',
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
          onClick={() => startTransition(() => setActiveQueue('negativas'))}
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
          onClick={() => startTransition(() => setActiveQueue('proativas'))}
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
          onClick={() => startTransition(() => setActiveQueue('positivas'))}
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
                      onStartAudit({
                        ticket_id: ticket.ticket_id,
                        evaluated_id: matchedAgent?.id,
                        team_id: matchedAgent?.primary_team_id || matchedAgent?.team_ids?.[0],
                        channel: ticket.channel || 'Chat',
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
          <div className="p-4 rounded-2xl bg-functional-success/10 border border-functional-success/25 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
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
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge variant="success" size="sm" className="font-mono font-black flex items-center gap-1">
                <Bot className="w-3 h-3" />
                <span>Rate Limit: Max 2/agente</span>
              </Badge>
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
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={evaluatingTicketId === ticket.ticket_id}
                      onClick={() => handleEvaluateWithAI(ticket)}
                      className="flex items-center gap-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold"
                    >
                      <Bot className={`w-3 h-3 ${evaluatingTicketId === ticket.ticket_id ? 'animate-spin' : ''}`} />
                      <span>{evaluatingTicketId === ticket.ticket_id ? 'Analisando...' : 'Avaliar com IA'}</span>
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
