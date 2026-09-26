import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Paperclip, CheckCircle } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { Monitoria, User, Team } from '../types';
import { supabase, mockDb, isMockMode } from '../lib/supabase';
import { useQualityConfig } from '../lib/useQualityConfig';
import { getStatusConfig, VARIANT_ICON_CONTAINER } from '../lib/statusHelper';
import { useMonitoriaActions } from '../hooks/useMonitoriaActions';
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
          .single();
        if (error) throw error;
        setMonitoria(data);
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
    submitting,
    handleAction,
  } = useMonitoriaActions(user, monitoria ? [monitoria] : [], qualityConfig, () => {
    loadMonitoria();
  });

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
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-brand-primary/5 flex items-center justify-center text-brand-primary shrink-0">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-brand-primary uppercase tracking-tight">
                      Confirmar Ação
                    </h3>
                    <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">
                      Protocolo #{monitoria?.display_id || '---'}
                    </p>
                  </div>
                </div>

                <div className="mb-6 space-y-4">
                  <div className="p-4 rounded-xl bg-surface-subtle/50 border border-surface-border/50 text-xs">
                    <span className="text-brand-muted font-medium">Ação Selecionada: </span>
                    <strong className="text-brand-primary uppercase font-black">
                      {actionModal.type === 'aceitar' ? 'Aprovação/Aceite' :
                       actionModal.type === 'recusar_agente' ? 'Apelo ao Gestor' :
                       actionModal.type === 'excluir' ? 'Exclusão' :
                       actionModal.type === 'solicitar_reavaliacao' ? 'Solicitação de Reavaliação' :
                       actionModal.type === 'manter' ? 'Recusar Reavaliação' :
                       actionModal.type === 'escalar' ? 'Escalar para Qualidade' :
                       actionModal.type === 'reabrir' ? 'Reabertura de Monitoria' :
                       actionModal.type.toUpperCase()}
                    </strong>
                  </div>

                  {actionModal.type === 'reabrir' && (
                    <div>
                      <label className="block text-[10px] font-black uppercase text-brand-muted tracking-widest mb-1.5">
                        Novo Status Após Reabertura
                      </label>
                      <Select
                        value={reopenStatus}
                        onChange={e => setReopenStatus(e.target.value as any)}
                        options={[
                          { value: 'pendente_revisao', label: 'Pendente de Revisão' },
                          { value: 'em_contestacao', label: 'Em Contestação' },
                          { value: 'aguardando_gestor_suporte', label: 'Aguardando Gestor Suporte' },
                          { value: 'aguardando_gestor_qualidade', label: 'Aguardando Gestor Qualidade' }
                        ]}
                      />
                    </div>
                  )}

                  {(() => {
                    const isApproval = actionModal.type === 'aprovar' || actionModal.type === 'aceitar';
                    const isContestation = actionModal.type === 'contestar';
                    const isRequired = user?.role === 'gestor_suporte' && (isApproval || isContestation);

                    let label = 'Observações / Justificativa';
                    let placeholder = 'Descreva os detalhes desta ação...';

                    if (isApproval) {
                      label = 'Ação Corretiva';
                      placeholder = 'Descreva a ação corretiva aplicada ao colaborador...';
                    } else if (isContestation) {
                      label = 'Justificativa da Contestação';
                      placeholder = 'Explique o motivo da contestação...';
                    }

                    return (
                      <div>
                        <label className="block text-[10px] font-black uppercase text-brand-muted tracking-widest mb-1.5">
                          {label} {isRequired && <span className="text-danger">*</span>}
                        </label>
                        <textarea
                          value={actionNote}
                          onChange={e => setActionNote(e.target.value)}
                          placeholder={placeholder}
                          className="w-full h-24 p-3 bg-surface-bg border border-surface-border rounded-xl text-xs text-brand-primary placeholder:text-brand-muted/50 focus:border-brand-accent focus:outline-none resize-none transition-all font-medium"
                        />
                      </div>
                    );
                  })()}
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
                      await handleAction();
                    }}
                    disabled={submitting}
                  >
                    {submitting ? 'Processando...' : 'Confirmar Ação'}
                  </Button>
                </div>
              </Card>
            </m.div>
          </div>
        )}
      </AnimatePresence>
    </>,
    document.body
  );
}
