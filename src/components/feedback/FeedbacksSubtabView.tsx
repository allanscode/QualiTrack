import React, { useState, useMemo } from 'react';
import {
  MessageSquare,
  Award,
  Plus,
  Calendar,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  UserCheck,
  CheckSquare,
  Sparkles,
} from 'lucide-react';
import { AgentFeedback, User, Team, Monitoria } from '../../types';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import CreateFeedbackModal from './CreateFeedbackModal';
import FeedbackDetailsModal from './FeedbackDetailsModal';

interface FeedbacksSubtabViewProps {
  currentUser: User | null;
  users: User[];
  teams: Team[];
  monitorias: Monitoria[];
  feedbacks: AgentFeedback[];
  loading: boolean;
  refreshing?: boolean;
  error?: string | null;
  onRefresh: () => void;
  onCreateFeedback: (payload: any) => Promise<boolean>;
  onAcknowledgeFeedback: (feedbackId: string, notes?: string) => Promise<boolean>;
  onCompleteFeedback: (feedbackId: string) => Promise<boolean>;
  mode: 'feedback' | 'one_on_one';
}

export default function FeedbacksSubtabView({
  currentUser,
  users,
  teams,
  monitorias,
  feedbacks,
  loading,
  refreshing = false,
  error = null,
  onRefresh,
  onCreateFeedback,
  onAcknowledgeFeedback,
  onCompleteFeedback,
  mode,
}: FeedbacksSubtabViewProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<AgentFeedback | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pendente_ciencia' | 'ciente' | 'concluido'>('all');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');

  const isAgent = currentUser?.role === 'suporte';
  const isManager = ['gestor_suporte', 'gestor_qualidade', 'admin'].includes(currentUser?.role || '');

  // Filtrar os registros que correspondem a este modo ('feedback' vs 'one_on_one')
  const modeFeedbacks = useMemo(() => {
    return feedbacks.filter(f => {
      const isOneOnOne = f.title.startsWith('[1:1]') || f.title.toLowerCase().includes('1:1');
      return mode === 'one_on_one' ? isOneOnOne : !isOneOnOne;
    });
  }, [feedbacks, mode]);

  // Contadores de métricas
  const totalCount = modeFeedbacks.length;
  const pendingCount = modeFeedbacks.filter(f => f.status === 'pendente_ciencia').length;
  const signedCount = modeFeedbacks.filter(f => f.status === 'ciente').length;
  const completedCount = modeFeedbacks.filter(f => f.status === 'concluido').length;

  // Filtragem ativa por busca, status e atendente
  const filteredList = useMemo(() => {
    return modeFeedbacks.filter(f => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      if (selectedAgentId && f.agent_id !== selectedAgentId) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const agent = users.find(u => u.id === f.agent_id);
        const manager = users.find(u => u.id === f.manager_id);
        const matchTitle = f.title.toLowerCase().includes(q);
        const matchAgent = agent?.name.toLowerCase().includes(q) || false;
        const matchManager = manager?.name.toLowerCase().includes(q) || false;
        const matchPlan = f.action_plan.toLowerCase().includes(q);
        if (!matchTitle && !matchAgent && !matchManager && !matchPlan) return false;
      }

      return true;
    });
  }, [modeFeedbacks, statusFilter, selectedAgentId, search, users]);

  const supportAgents = useMemo(() => {
    return users.filter(u => u.role === 'suporte' && u.active !== false);
  }, [users]);

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'concluido':
        return <Badge variant="success" size="xs">Concluído</Badge>;
      case 'ciente':
        return <Badge variant="info" size="xs">Ciente</Badge>;
      default:
        return <Badge variant="warning" size="xs">Pendente Ciência</Badge>;
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Top Banner & Ações */}
      <Card padding="none" className="p-4 sm:p-5 border border-surface-border shadow-premium bg-surface-card rounded-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              mode === 'one_on_one'
                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                : 'bg-brand-accent/10 text-brand-accent'
            }`}>
              {mode === 'one_on_one' ? (
                <Award className="w-5 h-5" />
              ) : (
                <MessageSquare className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-brand-primary tracking-tight">
                  {mode === 'one_on_one' ? 'Alinhamentos Mensais 1:1 & PDI' : 'Feedbacks Operacionais'}
                </h2>
                {pendingCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    {pendingCount} pendente{pendingCount !== 1 ? 's' : ''} de ciência
                  </span>
                )}
                {refreshing && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-brand-accent bg-brand-accent/10 border border-brand-accent/20 animate-pulse">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    <span>Atualizando</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-brand-muted font-medium mt-0.5">
                {mode === 'one_on_one'
                  ? 'Retorno mensal de desempenho, metas acordadas e Plano de Ação Combinado com assinatura digital do atendente'
                  : 'Registros pontuais de orientação, qualidade de atendimento e ciência digital do colaborador'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading || refreshing}
              className="p-2 rounded-xl text-brand-muted hover:text-brand-primary hover:bg-surface-subtle transition-colors cursor-pointer"
              title="Recarregar registros"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            {isManager && (
              <Button
                size="sm"
                onClick={() => setIsCreateOpen(true)}
                icon={<Plus className="w-4 h-4" />}
                className="text-xs font-bold shrink-0"
              >
                {mode === 'one_on_one' ? 'Novo Alinhamento 1:1' : 'Novo Feedback'}
              </Button>
            )}
          </div>
        </div>

        {/* Alerta Chamativo para o Atendente se houver pendências de assinatura */}
        {isAgent && pendingCount > 0 && (
          <div className="mt-4 p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-300 font-semibold min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                Você possui {pendingCount} {mode === 'one_on_one' ? 'alinhamento 1:1' : 'feedback'} aguardando sua leitura e confirmação de ciência digital.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                const first = modeFeedbacks.find(f => f.status === 'pendente_ciencia');
                if (first) setSelectedFeedback(first);
              }}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shrink-0 transition-colors cursor-pointer shadow-xs"
            >
              Assinar Agora
            </button>
          </div>
        )}
      </Card>

      {/* Cards de Métricas Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl border border-surface-border bg-surface-card">
          <span className="text-[10px] uppercase font-bold text-brand-muted block">Total de Registros</span>
          <span className="text-xl font-black text-brand-primary mt-0.5 block">{totalCount}</span>
          <span className="text-[10px] text-brand-muted">Histórico cadastrado</span>
        </div>

        <div className="p-3.5 rounded-2xl border border-amber-500/20 bg-amber-500/5">
          <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400 block">Pendente Ciência</span>
          <span className="text-xl font-black text-amber-600 dark:text-amber-400 mt-0.5 block">{pendingCount}</span>
          <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80">Aguardando atendente</span>
        </div>

        <div className="p-3.5 rounded-2xl border border-blue-500/20 bg-blue-500/5">
          <span className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-400 block">Ciente / Em Execução</span>
          <span className="text-xl font-black text-blue-600 dark:text-blue-400 mt-0.5 block">{signedCount}</span>
          <span className="text-[10px] text-blue-700/80 dark:text-blue-400/80">Plano em andamento</span>
        </div>

        <div className="p-3.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
          <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block">Concluídos</span>
          <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">{completedCount}</span>
          <span className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80">Atingiram o objetivo</span>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <Card padding="none" className="p-3.5 border border-surface-border bg-surface-card rounded-2xl">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Campo de Busca */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-brand-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={mode === 'one_on_one' ? 'Buscar alinhamento 1:1 por título, atendente ou plano de ação...' : 'Buscar feedback por assunto, colaborador ou orientações...'}
              className="w-full pl-9 pr-4 py-2 bg-surface-subtle border border-surface-border rounded-xl text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-brand-accent transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0">
            {/* Filtro por Atendente para gestores */}
            {isManager && (
              <select
                value={selectedAgentId}
                onChange={e => setSelectedAgentId(e.target.value)}
                className="text-xs py-2 px-3 bg-surface-subtle border border-surface-border rounded-xl text-brand-primary focus:outline-none focus:border-brand-accent shrink-0"
              >
                <option value="">Todos os Atendentes</option>
                {supportAgents.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}

            {/* Filtro de Status */}
            <div className="inline-flex items-center bg-surface-subtle p-0.5 rounded-xl border border-surface-border shrink-0">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-brand-primary text-brand-on-primary'
                    : 'text-brand-muted hover:text-brand-primary'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('pendente_ciencia')}
                className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'pendente_ciencia'
                    ? 'bg-amber-600 text-white'
                    : 'text-brand-muted hover:text-brand-primary'
                }`}
              >
                Pendente
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('ciente')}
                className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'ciente'
                    ? 'bg-blue-600 text-white'
                    : 'text-brand-muted hover:text-brand-primary'
                }`}
              >
                Ciente
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('concluido')}
                className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'concluido'
                    ? 'bg-emerald-600 text-white'
                    : 'text-brand-muted hover:text-brand-primary'
                }`}
              >
                Concluído
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Lista de Registros */}
      <Card padding="none" className="border border-surface-border shadow-premium bg-surface-card rounded-2xl overflow-hidden">
        {loading && modeFeedbacks.length === 0 ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse space-y-2 pb-4 border-b border-surface-border last:border-0">
                <div className="h-4 bg-surface-subtle rounded w-1/3" />
                <div className="h-3 bg-surface-subtle rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : filteredList.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-14 h-14 rounded-3xl bg-surface-subtle flex items-center justify-center mx-auto mb-3 text-brand-muted">
              {mode === 'one_on_one' ? <Award className="w-7 h-7 opacity-40" /> : <MessageSquare className="w-7 h-7 opacity-40" />}
            </div>
            <p className="text-xs font-black uppercase tracking-wider text-brand-primary">
              Nenhum {mode === 'one_on_one' ? 'alinhamento 1:1' : 'feedback'} encontrado
            </p>
            <p className="text-[11px] text-brand-muted mt-1 max-w-sm mx-auto">
              {isAgent
                ? 'Quando sua gestão registrar novos alinhamentos ou feedbacks, eles serão exibidos aqui para sua leitura e assinatura de ciência.'
                : 'Clique no botão acima para registrar um novo alinhamento com um colaborador da sua equipe.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-surface-border">
            {filteredList.map(item => {
              const agent = users.find(u => u.id === item.agent_id);
              const manager = users.find(u => u.id === item.manager_id);
              const team = teams.find(t => t.id === item.team_id);
              const linkedMonitoria = monitorias.find(m => m.id === item.monitoria_id);
              const cleanTitle = item.title.replace(/^\[(1:1|Feedback)\]\s*/i, '');

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedFeedback(item)}
                  className="p-4 sm:p-5 hover:bg-surface-subtle/50 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getStatusBadge(item.status)}
                      <span className="text-xs sm:text-sm font-black text-brand-primary group-hover:text-brand-accent transition-colors truncate">
                        {cleanTitle}
                      </span>
                      {linkedMonitoria && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-brand-primary/5 text-brand-muted">
                          Ticket #{linkedMonitoria.ticket_id}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-x-3 gap-y-1 text-xs text-brand-muted font-medium flex-wrap">
                      <span className="text-brand-primary font-semibold">
                        {isAgent ? `Gestor: ${manager?.name || 'Gestão'}` : `Atendente: ${agent?.name || 'Atendente'}`}
                      </span>
                      {team && <span>• Equipe: {team.name}</span>}
                      <span>• Data: {new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                      {item.deadline_date && (
                        <span className="inline-flex items-center gap-1 font-semibold text-brand-primary">
                          <Calendar className="w-3 h-3 text-brand-accent shrink-0" />
                          <span>Prazo do PDI: {new Date(item.deadline_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                        </span>
                      )}
                    </div>

                    {/* Resumo do Plano de Ação Combinado */}
                    {item.action_plan && (
                      <p className="text-xs text-brand-muted line-clamp-2 pt-0.5">
                        <strong className="text-brand-primary font-bold">Plano de Ação: </strong>
                        {item.action_plan}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    {isAgent && item.status === 'pendente_ciencia' ? (
                      <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 text-white shadow-xs group-hover:bg-amber-700 transition-colors">
                        Assinar Ciência Digital
                      </span>
                    ) : (
                      <div className="flex items-center gap-1 text-xs font-bold text-brand-muted group-hover:text-brand-accent transition-colors">
                        <span>Ver Detalhes</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Modal de Criação */}
      {isCreateOpen && (
        <CreateFeedbackModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSubmit={onCreateFeedback}
          currentUser={currentUser}
          users={users}
          teams={teams}
          monitorias={monitorias}
          initialType={mode}
        />
      )}

      {/* Modal de Detalhes / Assinatura de Ciência Digital */}
      {selectedFeedback && (
        <FeedbackDetailsModal
          isOpen={!!selectedFeedback}
          onClose={() => setSelectedFeedback(null)}
          feedback={selectedFeedback}
          currentUser={currentUser}
          users={users}
          teams={teams}
          monitorias={monitorias}
          onAcknowledge={onAcknowledgeFeedback}
          onComplete={onCompleteFeedback}
        />
      )}
    </div>
  );
}
