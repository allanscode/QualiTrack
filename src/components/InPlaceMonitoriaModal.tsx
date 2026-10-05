import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Paperclip, CheckCircle, ArrowLeft, ArrowRight, ArrowLeftRight, RotateCcw, ChevronDown } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { Monitoria, User, Team } from '../types';
import { supabase, mockDb, isMockMode } from '../lib/supabase';
import { useQualityConfig } from '../lib/useQualityConfig';
import { getStatusConfig, VARIANT_ICON_CONTAINER } from '../lib/statusHelper';
import { useMonitoriaActions, getPreviousStage, getNextStage, getStageLabel, STAGES_FLOW } from '../hooks/useMonitoriaActions';
import MonitoriaDetails from './MonitoriaDetails';
import MonitoriaForm from './MonitoriaForm';
import Badge from './ui/Badge';
import Card from './ui/Card';
import Button from './ui/Button';
import Select from './ui/Select';

interface InPlaceMonitoriaModalProps {
  monitoriaId: string;
  user: User | null;
  users: User[];
  teams: Team[];
  onClose: () => void;
}

export default function InPlaceMonitoriaModal({
  monitoriaId,
  user,
  users,
  teams,
  onClose,
}: InPlaceMonitoriaModalProps) {
  const [monitoria, setMonitoria] = useState<Monitoria | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingMonitoria, setViewingMonitoria] = useState<Monitoria | null>(null);
  const { config: qualityConfig } = useQualityConfig();

  const loadMonitoria = useCallback(async () => {
    if (!monitoriaId) return;
    try {
      if (isMockMode || !supabase) {
        const { data } = await mockDb.get('monitorias');
        const item = (data || []).find((m: any) => m.id === monitoriaId);
        setMonitoria(item || null);
      } else {
        const sourceTable = user?.role === 'suporte' ? 'vw_monitorias_suporte' : 'monitorias';
        const { data, error } = await supabase
          .from(sourceTable)
          .select('*')
          .eq('id', monitoriaId)
          .maybeSingle();
        if (error) throw error;
        if (!data && (user?.role === 'suporte' || user?.role === 'gestor_suporte')) {
          const reviewerResult = await supabase.from('vw_monitorias_pj_reviewer')
            .select('*').eq('id', monitoriaId).maybeSingle();
          if (reviewerResult.error) throw reviewerResult.error;
          setMonitoria(reviewerResult.data);
        } else {
          setMonitoria(data);
        }
      }
    } catch (e) {
      console.error('Erro ao carregar monitoria in-place:', e);
    } finally {
      setLoading(false);
    }
  }, [monitoriaId, user?.role]);

  useEffect(() => {
    loadMonitoria();
  }, [loadMonitoria]);

  const {
    actionModal,
    setActionModal,
    actionNote,
    setActionNote,
    actionAttachments,
    setActionAttachments,
    reopenStatus,
    setReopenStatus,
    targetStatus,
    setTargetStatus,
    submitting,
    handleAction,
  } = useMonitoriaActions(user, monitoria ? [monitoria] : [], qualityConfig, () => {
    loadMonitoria();
  }, teams);

  // Fecha com tecla ESC quando nenhum modal interno estiver aberto
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewingMonitoria) {
          setViewingMonitoria(null);
        } else if (actionModal) {
          setActionModal(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewingMonitoria, actionModal, setActionModal, onClose]);

  const getName = (id: string, isEvaluator = false, snapshotName?: string) => {
    if (snapshotName) return snapshotName;
    if (isEvaluator && user?.role === 'suporte') return 'Auditor da Qualidade';
    const found = users.find(u => u.id === id);
    return found ? found.name : isEvaluator ? 'Auditor da Qualidade' : 'Atendente';
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <div className="w-8 h-8 border-3 border-brand-accent border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-xs font-bold text-brand-muted">Carregando detalhes da monitoria...</p>
        </div>
      );
    }

    if (!monitoria) {
      return (
        <div className="p-8 text-center">
          <p className="text-sm font-black text-brand-primary">Monitoria não encontrada ou indisponível.</p>
          <Button variant="outline" size="sm" onClick={onClose} className="mt-4">
            Fechar
          </Button>
        </div>
      );
    }

    const cfg = getStatusConfig(monitoria.status);

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="flex items-start gap-3 border-b border-surface-border p-4 sm:items-center sm:p-6 bg-surface-card shrink-0">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${VARIANT_ICON_CONTAINER[cfg.variant]}`}>
            <cfg.icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black text-brand-primary">
              Monitoria #{monitoria.display_id || monitoria.id.slice(0, 4)} · Ticket {monitoria.ticket_id || 'S/N'}
            </h2>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-brand-primary/80">
              <span>Agente: {getName(monitoria.evaluated_id, false, monitoria.evaluated_name)}</span>
              <span>Equipe: {monitoria.team_name || teams.find(t => t.id === monitoria.team_id)?.name || 'N/A'}</span>
              <span>Auditor: {getName(monitoria.evaluator_id, true, monitoria.evaluator_name)}</span>
            </p>
          </div>
          <Badge variant={cfg.variant} size="xs" className="hidden shrink-0 sm:inline-flex">
            {cfg.shortLabel}
          </Badge>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes"
            className="shrink-0 rounded-xl p-2 text-brand-primary hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-brand-accent cursor-pointer transition-colors"
          >
            <X className="size-5" />
          </button>
        </header>

        {/* Body */}
        <div className="min-h-0 overflow-y-auto p-4 sm:p-6 pb-safe">
          <MonitoriaDetails
            monitoria={monitoria}
            user={user}
            users={users}
            teams={teams}
            onView={item => setViewingMonitoria(item)}
            onAction={modal => setActionModal(modal)}
          />
        </div>
      </div>
    );
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/25 dark:bg-black/40 p-0 sm:p-6 backdrop-blur-md animate-fade-in"
        onMouseDown={e => {
          if (e.target === e.currentTarget && !viewingMonitoria && !actionModal) {
            onClose();
          }
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          className="flex h-[92vh] sm:h-auto sm:max-h-[calc(100dvh-3rem)] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border-t sm:border border-surface-border bg-surface-card shadow-2xl"
        >
          {renderContent()}
        </section>
      </div>

      {/* Visualização Completa ou Edição de Avaliação in-place */}
      {viewingMonitoria && (
        <MonitoriaForm
          user={user}
          initialData={viewingMonitoria}
          onCancel={() => setViewingMonitoria(null)}
          onSaved={() => {
            setViewingMonitoria(null);
            loadMonitoria();
          }}
        />
      )}

      {/* Modal de Ação da Monitoria (Aprovar / Contestar / Reabrir / Excluir) */}
      <AnimatePresence>
        {actionModal && (
          <div
            className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center overflow-y-auto bg-black/30 dark:bg-black/50 p-0 sm:p-6 backdrop-blur-md"
            onMouseDown={event => {
              if (event.target === event.currentTarget) setActionModal(null);
            }}
          >
            <m.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-md overflow-y-auto rounded-t-3xl sm:rounded-3xl max-h-[92dvh] sm:max-h-[calc(100dvh-3rem)]"
            >
              <Card className="w-full shadow-2xl border-t sm:border border-surface-border bg-surface-card rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 pb-safe">
                {(() => {
                  const currentSt = monitoria?.status || 'pendente_revisao';
                  const isPjAction = Boolean(monitoria?.pj_review_required || monitoria?.pj_review_kind);
                  const isStepChange = actionModal.type === 'alterar_etapa' || actionModal.type === 'avancar_etapa' || actionModal.type === 'retroceder_etapa';
                  const prev = getPreviousStage(currentSt);
                  const next = getNextStage(currentSt);

                  const modalTitle =
                    actionModal.type === 'avancar_etapa' ? 'Avançar Etapa' :
                    actionModal.type === 'retroceder_etapa' ? 'Retroceder Etapa' :
                    actionModal.type === 'alterar_etapa' ? 'Alterar Etapa da Monitoria' :
                    actionModal.type === 'reabrir' ? 'Reabrir Monitoria' :
                    actionModal.type === 'aceitar' ? 'Aprovação e Aceite' :
                    actionModal.type === 'aprovar' ? 'Aprovar Monitoria' :
                    actionModal.type === 'contestar' ? 'Contestar Avaliação' :
                    actionModal.type === 'solicitar_reavaliacao' ? 'Solicitar Reavaliação' :
                    actionModal.type === 'manter' ? 'Recusar Reavaliação' :
                    actionModal.type === 'escalar' ? (isPjAction ? 'Enviar contestação à Qualidade' : 'Escalar para Gestão Qualidade') :
                    actionModal.type === 'recusar_agente' ? 'Apelo ao Gestor' :
                    actionModal.type === 'excluir' ? 'Excluir Monitoria' :
                    'Confirmar Ação';

                  const isApproval = actionModal.type === 'aprovar' || actionModal.type === 'aceitar';
                  const isContestation = actionModal.type === 'contestar';
                  const isSupportManager = user?.role === 'gestor_suporte';
                  const isRequired = isSupportManager && (isApproval || isContestation);

                  let noteLabel = 'Observações / Justificativa';
                  let notePlaceholder = 'Descreva os detalhes desta ação...';

                  if (isApproval) {
                    noteLabel = 'Ação Corretiva';
                    notePlaceholder = 'Descreva a ação corretiva aplicada ao colaborador...';
                  } else if (isContestation) {
                    noteLabel = 'Justificativa da Contestação';
                    notePlaceholder = 'Explique o motivo da contestação...';
                  } else if (isStepChange) {
                    noteLabel = 'Observação da Gestão (Opcional)';
                    notePlaceholder = 'Opcional: Caso deixe em branco, será registrado automaticamente um log padrão no histórico.';
                  } else if (actionModal.type === 'reabrir') {
                    noteLabel = 'Motivo da Reabertura (Opcional)';
                    notePlaceholder = 'Opcional: Caso deixe em branco, o sistema registrará a justificativa padrão no histórico.';
                  }

                  const isSameStage = isStepChange && monitoria && targetStatus === currentSt;

                  return (
                    <>
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-brand-primary/5 flex items-center justify-center text-brand-primary shrink-0">
                          {actionModal.type === 'reabrir' ? (
                            <RotateCcw className="w-6 h-6 text-amber-500" />
                          ) : isStepChange ? (
                            <ArrowLeftRight className="w-6 h-6 text-brand-highlight" />
                          ) : (
                            <AlertTriangle className="w-6 h-6" />
                          )}
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-brand-primary uppercase tracking-tight">
                            {modalTitle}
                          </h3>
                          <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">
                            Monitoria #{monitoria?.display_id || monitoria?.id.slice(0, 8) || 'S/N'} · Ticket #{monitoria?.ticket_id || 'S/N'}
                          </p>
                        </div>
                      </div>

                      <div className="mb-6 space-y-4">
                        <p className="text-xs text-brand-muted font-medium leading-relaxed">
                          {isStepChange
                            ? 'Defina a nova etapa para a qual deseja mover esta monitoria. A transição e seu autor ficarão gravados no histórico.'
                            : actionModal.type === 'reabrir'
                            ? 'A monitoria será reativada no fluxo de trabalho e retornará para a etapa indicada.'
                            : `Você está prestes a realizar a ação de ${modalTitle.toLowerCase()} nesta monitoria. Esta operação ficará registrada no histórico.`}
                        </p>

                        {/* Bloco de Reabertura */}
                        {actionModal.type === 'reabrir' && (
                          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider text-[10px]">
                                Reabertura Operacional:
                              </span>
                              <Badge variant="warning" size="xs">Reabrir</Badge>
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-amber-800 dark:text-amber-300 uppercase tracking-widest ml-1 mb-1.5 block">
                                Retornar para qual etapa?
                              </label>
                              <div className="relative">
                                <select
                                  value={reopenStatus}
                                  onChange={e => setReopenStatus(e.target.value as any)}
                                  className="w-full appearance-none bg-surface-card border border-surface-border rounded-xl p-2.5 pr-10 text-xs font-bold text-brand-primary focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/50 transition-all cursor-pointer"
                                >
                                  <option value="pendente_revisao">Pendente Revisão (Agente de Suporte)</option>
                                  <option value="em_contestacao">Em Contestação (Monitor de Qualidade)</option>
                                  <option value="aguardando_gestor_suporte">Gestão Suporte (Gestor de Suporte)</option>
                                  <option value="aguardando_gestor_qualidade">Gestão Qualidade (Gestor de Qualidade)</option>
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-brand-muted">
                                  <ChevronDown className="h-4 w-4" />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Bloco de Mudança de Etapa (Avançar / Retroceder / Alterar) */}
                        {isStepChange && (
                          <div className="p-4 rounded-2xl bg-surface-subtle border border-surface-border space-y-3">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-brand-muted uppercase tracking-wider text-[10px]">Etapa Atual:</span>
                              <Badge variant={getStatusConfig(currentSt).variant} size="xs">
                                {getStatusConfig(currentSt).shortLabel}
                              </Badge>
                            </div>

                            {/* Atalhos Rápidos com 1 clique */}
                            <div className="flex items-center gap-2 pt-1">
                              {prev && (
                                <button
                                  type="button"
                                  onClick={() => setTargetStatus(prev)}
                                  className={`flex-1 py-2 px-2.5 rounded-xl border text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                    targetStatus === prev
                                      ? 'bg-purple-500/15 border-purple-500/40 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/20 shadow-xs'
                                      : 'bg-surface-card border-surface-border text-brand-muted hover:text-brand-primary hover:border-brand-primary/30'
                                  }`}
                                >
                                  <ArrowLeft className="w-3.5 h-3.5" />
                                  <span>Retroceder: {getStageLabel(prev)}</span>
                                </button>
                              )}
                              {next && (
                                <button
                                  type="button"
                                  onClick={() => setTargetStatus(next)}
                                  className={`flex-1 py-2 px-2.5 rounded-xl border text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                    targetStatus === next
                                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20 shadow-xs'
                                      : 'bg-surface-card border-surface-border text-brand-muted hover:text-brand-primary hover:border-brand-primary/30'
                                  }`}
                                >
                                  <span>Avançar: {getStageLabel(next)}</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            <div>
                              <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1 mb-1.5 block">
                                Ou escolha outra etapa de destino:
                              </label>
                              <div className="relative">
                                <select
                                  value={targetStatus}
                                  onChange={e => setTargetStatus(e.target.value as any)}
                                  className="w-full appearance-none bg-surface-card border border-surface-border rounded-xl p-2.5 pr-10 text-xs font-bold text-brand-primary focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/50 transition-all cursor-pointer"
                                >
                                  {STAGES_FLOW.map(stage => (
                                    <option key={stage.status} value={stage.status}>
                                      {stage.label} ({stage.roleLabel})
                                    </option>
                                  ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-brand-muted">
                                  <ChevronDown className="h-4 w-4" />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="block text-[10px] font-black uppercase text-brand-muted tracking-widest mb-1.5">
                            {noteLabel} {isRequired ? <span className="text-danger">*</span> : <span className="text-brand-muted font-normal lowercase">(opcional)</span>}
                          </label>
                          <textarea
                            value={actionNote}
                            onChange={e => setActionNote(e.target.value)}
                            placeholder={notePlaceholder}
                            className="w-full h-24 p-3 bg-surface-bg border border-surface-border rounded-xl text-xs text-brand-primary placeholder:text-brand-muted/50 focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/30 focus:outline-none resize-none transition-all font-medium"
                          />
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          className="flex-1 h-11 font-black uppercase text-[10px] tracking-widest"
                          onClick={() => setActionModal(null)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          variant="primary"
                          className="flex-1 h-11 font-black uppercase text-[10px] tracking-widest"
                          onClick={async () => {
                            const success = await handleAction();
                            if (success) {
                              setActionModal(null);
                            }
                          }}
                          disabled={submitting || Boolean(isSameStage)}
                        >
                          {submitting ? 'Processando...' : isSameStage ? 'Selecione outra etapa' : 'Confirmar Ação'}
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </Card>

            </m.div>
          </div>
        )}
      </AnimatePresence>
    </>,
    document.body
  );
}
