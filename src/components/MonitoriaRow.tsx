import React from 'react';
import { Monitoria, User, Team } from '../types';
import { ActionType } from '../hooks/useMonitoriaActions';
// getStatusConfig chega por prop (data), não importado — evita sombra.
import { getHistoryEventConfig, VARIANT_TEXT_CLASS, type StatusConfig } from '../lib/statusHelper';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  RotateCcw,
  Trash2,
  Pencil,
  Tag,
  User as UserIcon,
  AlertTriangle,
  Shield,
  X,
  Eye,
  History,
  ChevronUp,
  ChevronDown,
  Search
} from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Card from './ui/Card';
import Badge from './ui/Badge';
import Button from './ui/Button';
import ActionDeadlineClock from './ui/ActionDeadlineClock';

interface MonitoriaRowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    monitorias: Monitoria[];
    expandedId: string | null;
    setExpandedId: (id: string | null) => void;
    setViewingMonitoria: (m: Monitoria | null) => void;
    setActionModal: (modal: { id: string; type: ActionType } | null) => void;
    user: User | null;
    staticData: any;
    qualityConfig: any;
    getLevelForScore: (score: number) => any;
    getStatusConfig: (status: string) => StatusConfig;
    getName: (id: string, isEvaluator?: boolean, snapshotName?: string) => string;
    format: any;
    ptBR: any;
  };
}

export function MonitoriaRow({ index, style, data }: MonitoriaRowProps) {
  const {
    monitorias,
    expandedId,
    setExpandedId,
    setViewingMonitoria,
    setActionModal,
    user,
    staticData,
    qualityConfig,
    getLevelForScore,
    getStatusConfig,
    getName,
    format,
    ptBR,
  } = data;

  const m = monitorias[index];
  const config = getStatusConfig(m.status);
  const isExpanded = expandedId === m.id;
  const level = getLevelForScore(m.score || 0);
  const scoreColor = m.score !== undefined ? level.color : 'text-brand-muted';

  return (
    <div style={style} className="divide-y divide-surface-subtle">
      <div className={`p-4 hover:bg-surface-bg/30 transition-all ${isExpanded ? 'bg-surface-bg/20' : ''}`}>
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : m.id)}>
          <div className={`w-11 h-11 rounded-[1.25rem] flex items-center justify-center flex-shrink-0 bg-surface-bg text-brand-muted shadow-sm`}>
            <config.icon className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-black text-brand-muted/70 uppercase tracking-widest">#{m.display_id || m.id.slice(0,4)}</span>
                <span className="text-brand-muted/30">•</span>
                <span className="font-mono text-xs font-black text-brand-primary tracking-tight">{m.ticket_id}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-brand-muted uppercase tracking-tight flex-wrap">
                <span className="flex items-center gap-1"><UserIcon className="w-3 h-3 text-brand-highlight" />{getName(m.evaluated_id, false, m.evaluated_name)}</span>
                <span className="text-brand-muted/20">•</span>
                <span className="flex items-center gap-1"><Tag className="w-3 h-3 text-brand-highlight" />{m.team_name || staticData.teams.find((t: Team) => t.id === m.team_id)?.name || 'N/A'}</span>
                <span className="text-brand-muted/20">•</span>
                <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-brand-highlight" />{getName(m.evaluator_id, true, m.evaluator_name)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="min-w-[140px] flex justify-center">
              {m.active !== false && <ActionDeadlineClock actionDeadlineAt={m.action_deadline_at} status={m.status} />}
            </div>

            <div className="min-w-[120px] flex justify-center">
              {(() => {
                const isDeadlineExpired = m.status === 'concluida' && m.resolution_type === 'automatic';
                return (
                  <Badge variant={config.variant} size="xs" className="uppercase font-black tracking-widest px-2">
                    {isDeadlineExpired ? 'Concluída Sist.' : config.shortLabel}
                  </Badge>
                );
              })()}
            </div>

            <div className="min-w-[70px] text-right">
              <p className={`text-xl font-black ${scoreColor} tracking-tighter`}>{m.score !== undefined ? `${m.score}%` : '—'}</p>
              <p className="text-[9px] font-black text-brand-muted uppercase tracking-widest opacity-60 mt-0.5">{format(new Date(m.created_at), 'dd MMM yyyy', { locale: ptBR })}</p>
            </div>

            <div className={`p-2 rounded-xl transition-colors ${isExpanded ? 'bg-brand-primary/5 text-brand-primary' : 'text-brand-highlight'}`}>
              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-4 pt-4 border-t border-surface-border/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-2">
                <div className="space-y-6 flex flex-col justify-between h-full">
                  <div className="space-y-6">
                    <div>
                      <p className="text-[9px] font-black uppercase text-brand-muted/60 tracking-[0.2em] mb-2 ml-1">Observações da Qualidade</p>
                      <p className="text-sm text-brand-primary font-medium bg-surface-bg/50 p-4 rounded-3xl border border-surface-border/40 min-h-[80px] leading-relaxed italic">
                        "{m.evaluator_note || 'Nenhuma observação registrada.'}"
                      </p>
                    </div>

                    {m.history?.length > 0 && (
                      <div>
                        <p className="text-[9px] font-black uppercase text-brand-muted/60 tracking-[0.2em] mb-3 ml-1 flex items-center gap-2">
                          <History className="w-3 h-3" /> Linha do Tempo
                        </p>
                        <div className="space-y-4 ml-2 border-l-2 border-surface-border/60 pl-6 py-1">
                          {m.history.map((h, i) => {
                            const ev = getHistoryEventConfig(h.action);
                            const EvIcon = ev.icon;
                            const evColor = VARIANT_TEXT_CLASS[ev.variant];
                            return (
                            <div key={i} className="relative">
                              <div className={`absolute -left-[32px] top-1 w-3 h-3 rounded-full bg-current border-2 border-surface-bg shadow-sm ${evColor}`} />
                              <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-brand-primary leading-none flex items-center gap-1.5">
                                  <EvIcon className={`w-3 h-3 shrink-0 ${evColor}`} /> {h.action}
                                </span>
                                <span className="text-[9px] font-bold text-brand-muted uppercase tracking-widest mt-1 opacity-70">
                                  {(() => {
                                    const actor = staticData.users.find((u: User) => u.id === h.by_id);
                                    const isSupportView = user?.role === 'suporte' || user?.role === 'gestor_suporte';
                                    const isQualityActor = actor && ['qualidade', 'gestor_qualidade'].includes(actor.role);
                                    return (isSupportView && isQualityActor) ? 'Equipe de Qualidade' : h.by_name;
                                  })()} <span className="mx-1">•</span> {format(new Date(h.at), 'HH:mm')}
                                </span>
                                {h.note && (
                                  <div className="mt-2 text-[11px] text-brand-muted/80 bg-surface-subtle/50 p-2 rounded-xl border border-surface-border/30">
                                    {h.note}
                                  </div>
                                )}
                              </div>
                            </div>
                            );
                          })}

                          {/* Etapa atual — mesma regra do MonitoriaList */}
                          {!['concluida', 'finalizada_alterada'].includes(m.status) && (() => {
                            const cfg = getStatusConfig(m.status);
                            const StepIcon = cfg.icon;
                            const colorClass = VARIANT_TEXT_CLASS[cfg.variant];
                            return (
                              <div className={`relative ${colorClass}`}>
                                <div className="absolute -left-[32px] top-1 w-3 h-3 rounded-full bg-surface-bg border-2 border-current animate-pulse" />
                                <div className="flex flex-col">
                                  <span className="text-[11px] font-black leading-none flex items-center gap-1.5">
                                    <StepIcon className="w-3 h-3 shrink-0" /> {cfg.label}
                                  </span>
                                  <span className="text-[9px] font-bold text-brand-muted uppercase tracking-widest mt-1">
                                    Etapa atual
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 mt-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewingMonitoria(m)}
                      icon={<Eye className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />}
                      className="w-full md:w-auto shadow-sm border border-surface-border/50"
                    >
                      Visualizar Avaliação Completa
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col justify-between h-full min-h-[220px] items-end space-y-6">
                  <div className="flex flex-wrap gap-3 justify-end items-start w-full">
                    {user?.role === 'suporte' && (m.status === 'pendente_revisao' || m.status === 'contestacao_negada') && (
                      <div className="flex gap-3 items-center flex-wrap justify-end">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setActionModal({ id: m.id, type: 'aceitar' })}
                          icon={<CheckCircle2 className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                          className="w-[130px] h-10 font-black uppercase text-[10px] tracking-widest shadow-sm border border-brand-primary/10"
                        >
                          Aprovar
                        </Button>
                        {m.status === 'pendente_revisao' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActionModal({ id: m.id, type: 'contestar' })}
                            icon={<AlertTriangle className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                            className="w-[130px] h-10 font-black uppercase text-[10px] tracking-widest shadow-sm"
                          >
                            Contestar
                          </Button>
                        )}
                        {m.status === 'contestacao_negada' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActionModal({ id: m.id, type: 'recusar_agente' })}
                            icon={<XCircle className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                            className="w-[130px] h-10 font-black uppercase text-[10px] tracking-widest shadow-sm"
                          >
                            Apelar
                          </Button>
                        )}
                      </div>
                    )}

                    {user?.role === 'gestor_suporte' && m.status === 'aguardando_gestor_suporte' && (
                      <div className="flex gap-3 items-center flex-wrap justify-end">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setActionModal({ id: m.id, type: 'aprovar' })}
                          icon={<CheckCircle2 className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                          className="w-full md:w-auto px-4 h-10 font-black uppercase text-[10px] tracking-widest shadow-sm"
                        >
                          Aprovar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActionModal({ id: m.id, type: 'escalar' })}
                          icon={<AlertTriangle className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-y-0.5" />}
                          className="w-full md:w-auto px-4 h-10 font-black uppercase text-[10px] tracking-widest shadow-sm"
                        >
                          Escalar
                        </Button>
                      </div>
                    )}

                    {(user?.role === 'qualidade' || user?.role === 'gestor_qualidade') && (m.status === 'em_contestacao' || m.status === 'reavaliacao_solicitada') && (
                      <div className="flex flex-wrap gap-3 justify-end items-start w-full">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setViewingMonitoria({ ...m, _reevaluate: true } as any)}
                          icon={<Pencil className="w-4 h-4 transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110" />}
                          className="w-full md:w-auto px-4 h-10 font-black uppercase text-[10px] tracking-widest shadow-sm border border-brand-primary/10"
                        >
                          Reavaliar
                        </Button>
                        {m.status === 'em_contestacao' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActionModal({ id: m.id, type: 'manter' })}
                            icon={<XCircle className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />}
                            className="w-full md:w-auto px-4 h-10 font-black uppercase text-[10px] tracking-widest shadow-sm"
                          >
                            Recusar
                          </Button>
                        )}
                      </div>
                    )}

                    {user?.role === 'gestor_qualidade' && m.status === 'aguardando_gestor_qualidade' && (
                      <div className="flex gap-3 items-center flex-wrap justify-end">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setActionModal({ id: m.id, type: 'aprovar' })}
                          icon={<CheckCircle2 className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                          className="w-full md:w-auto px-4 h-10 font-black uppercase text-[10px] tracking-widest shadow-sm"
                        >
                          Aprovar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActionModal({ id: m.id, type: 'solicitar_reavaliacao' })}
                          icon={<Pencil className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110" />}
                          className="w-full md:w-auto px-4 h-10 font-black uppercase text-[10px] tracking-widest shadow-sm"
                        >
                          Solicitar
                        </Button>
                      </div>
                    )}

                    {(user?.role === 'admin') && m.active !== false && (
                      <div className="w-full mt-auto flex justify-end gap-3 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActionModal({ id: m.id, type: 'reabrir' })}
                          className="w-full md:w-auto font-black uppercase text-[10px] tracking-widest h-10"
                          icon={<RotateCcw className="w-4 h-4 transition-transform duration-200 group-hover:rotate-[-45deg]" />}
                        >
                          Reabrir
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setActionModal({ id: m.id, type: 'excluir' })}
                          className="text-functional-error hover:bg-functional-error/10 dark:hover:bg-functional-error/20 w-full md:w-auto font-black uppercase text-[10px] tracking-widest h-10"
                          icon={<Trash2 className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />}
                        >
                          Excluir
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
    </div>
    </div>
  );
}