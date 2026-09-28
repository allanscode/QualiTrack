import React, { useState } from 'react';
import {
  MessageSquare,
  Plus,
  Calendar,
  ArrowRight,
  UserCheck,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { AgentFeedback, User, Team, Monitoria, UserRole } from '../../types';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import CreateFeedbackModal from './CreateFeedbackModal';
import FeedbackDetailsModal from './FeedbackDetailsModal';

interface FeedbacksWidgetProps {
  feedbacks: AgentFeedback[];
  currentUser: User | null;
  viewRole?: UserRole;
  users: User[];
  teams: Team[];
  monitorias?: Monitoria[];
  onCreateFeedback: (payload: any) => Promise<boolean>;
  onAcknowledgeFeedback: (feedbackId: string, notes?: string) => Promise<boolean>;
  onCompleteFeedback: (feedbackId: string) => Promise<boolean>;
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export default function FeedbacksWidget({
  feedbacks,
  currentUser,
  viewRole,
  users,
  teams,
  monitorias = [],
  onCreateFeedback,
  onAcknowledgeFeedback,
  onCompleteFeedback,
  loading = false,
  refreshing = false,
  error = null,
  onRefresh,
}: FeedbacksWidgetProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<AgentFeedback | null>(null);

  const effectiveRole = viewRole ?? currentUser?.role;
  const isAgent = effectiveRole === 'suporte';
  const isManager = ['gestor_suporte', 'gestor_qualidade', 'admin'].includes(effectiveRole || '');

  // Métricas
  const pendingScienceCount = feedbacks.filter(f => f.status === 'pendente_ciencia').length;

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'concluido':
        return <Badge variant="success" size="xs">Concluído</Badge>;
      case 'ciente':
        return <Badge variant="info" size="xs">Ciente</Badge>;
      default:
        return <Badge variant="warning" size="xs">Pendente</Badge>;
    }
  };

  return (
    <>
      <Card padding="none" className="overflow-hidden flex flex-col">
        {/* Header do Card */}
        <div className="p-4 sm:p-5 border-b border-surface-border flex items-center justify-between bg-surface-card flex-shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-brand-accent/10 text-brand-accent flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5 fill-current fill-opacity-15" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest truncate">
                  {isAgent ? 'Meus Feedbacks & Planos 1:1' : 'Feedbacks & Gestão de 1:1'}
                </h3>
                {pendingScienceCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse shrink-0">
                    {pendingScienceCount} pendente{pendingScienceCount !== 1 ? 's' : ''}
                  </span>
                )}
                {refreshing && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-brand-accent bg-brand-accent/10 border border-brand-accent/20 animate-pulse shrink-0">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    <span>Atualizando</span>
                  </span>
                )}
              </div>
              <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mt-0.5 truncate">
                {isAgent 
                  ? 'Acompanhamento do seu desenvolvimento e acordos com a gestão' 
                  : 'Registros de alinhamento individual, PDI e ciência de desempenho'}
              </p>
            </div>
          </div>

          {isManager && (
            <Button
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              icon={<Plus className="w-3.5 h-3.5" />}
              className="text-xs font-bold shrink-0 min-h-[44px] sm:min-h-0"
              aria-label="Registrar novo feedback 1:1"
            >
              Novo Feedback 1:1
            </Button>
          )}
        </div>

        {/* Banner de Erro com Ação de Retry */}
        {error && (
          <div
            role="alert"
            className="p-3.5 bg-rose-500/10 border-b border-rose-500/20 flex items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-300"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span className="truncate font-medium">Erro ao carregar feedbacks: {error}</span>
            </div>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shrink-0 transition-colors cursor-pointer min-h-[44px] sm:min-h-0 inline-flex items-center"
              >
                Tentar novamente
              </button>
            )}
          </div>
        )}

        {/* Alerta Chamativo para o Atendente se houver pendência */}
        {isAgent && pendingScienceCount > 0 && (
          <div className="p-3.5 bg-amber-500/10 border-b border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="break-words">
                Você possui {pendingScienceCount} feedback{pendingScienceCount !== 1 ? 's' : ''} aguardando sua leitura e confirmação de ciência.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                const firstPending = feedbacks.find(f => f.status === 'pendente_ciencia');
                if (firstPending) setSelectedFeedback(firstPending);
              }}
              className="px-3 py-2 sm:py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shrink-0 transition-colors cursor-pointer shadow-xs min-h-[44px] sm:min-h-0 flex items-center justify-center"
              aria-label="Assinar primeiro feedback pendente de ciência"
            >
              Assinar Agora
            </button>
          </div>
        )}

        {/* Lista de Feedbacks */}
        <div
          role="region"
          aria-label="Lista de alinhamentos e feedbacks 1:1"
          className="overflow-y-auto max-h-[360px] divide-y divide-surface-border custom-scrollbar"
        >
          {loading && feedbacks.length === 0 ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse flex flex-col gap-2">
                  <div className="h-4 bg-surface-subtle rounded w-1/3" />
                  <div className="h-3 bg-surface-subtle rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : feedbacks.length === 0 ? (
            <div className="py-12 px-4 text-center text-brand-muted">
              <UserCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs font-bold uppercase tracking-wider">Nenhum registro de feedback cadastrado</p>
              <p className="text-[11px] mt-1 opacity-70 max-w-sm mx-auto">
                {isAgent 
                  ? 'Quando seus gestores realizarem sessões de 1:1, os alinhamentos aparecerão aqui.' 
                  : 'Clique no botão acima para registrar a primeira sessão de 1:1 com um atendente.'}
              </p>
            </div>
          ) : (
            feedbacks.map(f => {
              const agent = users.find(u => u.id === f.agent_id);
              const manager = users.find(u => u.id === f.manager_id);

              return (
                <div
                  key={f.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Ver detalhes do feedback: ${f.title}`}
                  onClick={() => setSelectedFeedback(f)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedFeedback(f);
                    }
                  }}
                  className="p-4 hover:bg-surface-subtle/60 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-inset min-h-[44px]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {getStatusBadge(f.status)}
                      <span className="text-xs font-black text-brand-primary group-hover:text-brand-accent transition-colors truncate max-w-full">
                        {f.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-x-3 gap-y-1 text-[11px] text-brand-muted font-medium flex-wrap">
                      <span className="truncate max-w-[180px]">
                        {isAgent ? `Gestor: ${manager?.name || 'Gestão'}` : `Atendente: ${agent?.name || 'Atendente'}`}
                      </span>
                      <span>•</span>
                      <span>{new Date(f.created_at).toLocaleDateString('pt-BR')}</span>
                      {f.deadline_date && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-brand-primary font-semibold">
                            <Calendar className="w-3 h-3 text-brand-accent shrink-0" />
                            <span>Prazo: {new Date(f.deadline_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <span className="text-[11px] font-bold text-brand-muted group-hover:text-brand-accent transition-colors">
                      Ver Detalhes
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-brand-muted group-hover:translate-x-0.5 group-hover:text-brand-accent transition-all" />
                  </div>
                </div>
              );
            })
          )}
        </div>
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
        />
      )}

      {/* Modal de Detalhes / Assinatura */}
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
    </>
  );
}
