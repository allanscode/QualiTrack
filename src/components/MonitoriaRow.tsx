import React from 'react';
import { Monitoria, User, Team } from '../types';
import { ActionType } from '../hooks/useMonitoriaActions';
// getStatusConfig chega por prop (data), não importado — evita sombra.
import { getHistoryEventConfig, VARIANT_TEXT_CLASS, type StatusConfig } from '../lib/statusHelper';
import { formatTimelineDateTime, resolveTimelineActor } from '../lib/timeline';
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
  Search,
  ExternalLink
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
                {m.ticket_id ? (
                  <a
                    href={`https://webposto.zendesk.com/agent/tickets/${m.ticket_id.trim()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-1 font-mono text-xs font-black text-brand-primary hover:text-brand-highlight hover:underline tracking-tight transition-colors group/ticket"
                    title={`Abrir ticket #${m.ticket_id} no Zendesk`}
                  >
                    <span>{m.ticket_id}</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-40 group-hover/ticket:opacity-100 transition-opacity" />
                  </a>
                ) : (
                  <span className="font-mono text-xs font-black text-brand-muted/50 tracking-tight">S/N</span>
                )}
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
              {m.history?.length > 0 && (
                <div className="pb-4">
                  <p className="text-[9px] font-black uppercase text-brand-muted/60 tracking-[0.2em] mb-3 ml-1 flex items-center gap-2">
                    <History className="w-3 h-3" /> Linha do Tempo
                  </p>
                  <div className="overflow-x-auto -mx-1 px-1 pb-1">
                    <div className="flex items-start min-w-max">
                      {m.history.map((h, i) => {
                        const ev = getHistoryEventConfig(h.action);
                        const EvIcon = ev.icon;
                        const evColor = VARIANT_TEXT_CLASS[ev.variant];
                        const actorName = resolveTimelineActor(h.by_id, h.by_name, staticData.users, user?.role);
                        const eventDate = formatTimelineDateTime(h.at, m.created_at);
                        return (
                          <React.Fragment key={i}>
                            {i > 0 && <div className="w-8 md:w-12 h-0.5 bg-surface-border/60 mt-[9px] flex-shrink-0" />}
                            <div className="flex flex-col items-center text-center w-[150px] flex-shrink-0 px-1">
                              <div className={`w-3 h-3 rounded-full bg-current border-2 border-surface-bg shadow-sm flex-shrink-0 ${evColor}`} />
                              <span className="mt-2 text-[11px] font-bold text-brand-primary leading-tight flex items-center gap-1.5">
                                <EvIcon className={`w-3 h-3 shrink-0 ${evColor}`} /> {h.action}
                              </span>
                              <span className="text-[9px] font-bold text-brand-muted uppercase tracking-widest mt-1 opacity-70 leading-tight">
                                {actorName}
                              </span>
                              <span className="text-[9px] font-medium text-brand-muted/80 mt-0.5 leading-tight">
                                {eventDate}
                              </span>
                              {h.note && (
                                <div className="mt-2 text-[10px] text-brand-muted/80 bg-surface-subtle/50 p-2 rounded-xl border border-surface-border/30 leading-snug">
                                  {h.note}
                                </div>
                              )}
                            </div>
                          </React.Fragment>
                        );
                      })}

                      {/* Etapa atual — mesma regra do MonitoriaList */}
                      {!['concluida', 'finalizada_alterada'].includes(m.status) && (() => {
                        const cfg = getStatusConfig(m.status);
                        const StepIcon = cfg.icon;
                        const colorClass = VARIANT_TEXT_CLASS[cfg.variant];
                        const currentStepDate = formatTimelineDateTime(m.updated_at, m.created_at);
                        return (
                          <React.Fragment>
                            {m.history.length > 0 && <div className="w-8 md:w-12 h-0.5 bg-surface-border/60 mt-[9px] flex-shrink-0" />}
                            <div className={`flex flex-col items-center text-center w-[150px] flex-shrink-0 px-1 ${colorClass}`}>
                              <div className="w-3 h-3 rounded-full bg-surface-bg border-2 border-current animate-pulse flex-shrink-0" />
                              <span className="mt-2 text-[11px] font-black leading-tight flex items-center gap-1.5">
                                <StepIcon className="w-3 h-3 shrink-0" /> {cfg.label}
                              </span>
                              <span className="text-[9px] font-bold text-brand-muted uppercase tracking-widest mt-1">
                                Etapa atual
                              </span>
                              <span className="text-[9px] font-medium text-brand-muted/80 mt-0.5 leading-tight">
                                {currentStepDate}
                              </span>
                            </div>
                          </React.Fragment>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4 pb-2">
                <p className="text-[9px] font-black uppercase text-brand-muted/60 tracking-[0.2em] ml-1">Observações da Qualidade</p>
                <div className="relative text-sm text-brand-primary font-medium bg-surface-bg/50 py-3 pl-9 pr-5 rounded-2xl border border-surface-border/40 leading-relaxed italic break-words whitespace-pre-wrap">
                  <span className="absolute left-3 top-1.5 text-3xl font-black text-brand-muted/20 leading-none select-none">"</span>
                  {m.evaluator_note || 'Nenhuma observação registrada.'}
                </div>

                <div className="flex flex-wrap gap-2 items-center pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewingMonitoria(m)}
                    icon={<Eye className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                    className="border border-surface-border/50"
                  >
                    Visualizar Avaliação Completa
                  </Button>

                  {/* Aprovar/Contestar a tratativa passou a ser exclusivo do
                      gestor_suporte — o agente individual não decide mais
                      sozinho sobre a própria avaliação. Ver bloco
                      gestor_suporte + aguardando_gestor_suporte abaixo. */}
                  {user?.role === 'suporte' && m.status === 'contestacao_negada' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActionModal({ id: m.id, type: 'recusar_agente' })}
                      icon={<XCircle className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                    >
                      Apelar
                    </Button>
                  )}

                  {user?.role === 'gestor_suporte' && m.status === 'pendente_revisao' && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setActionModal({ id: m.id, type: 'aceitar' })}
                        icon={<CheckCircle2 className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                      >
                        Aprovar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActionModal({ id: m.id, type: 'contestar' })}
                        icon={<AlertTriangle className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                      >
                        Contestar
                      </Button>
                    </>
                  )}

                  {/* Aprovar/Contestar direto pelo Gestor de Qualidade ou Admin, mesmo
                      sem contestação — cobre o caso do Gestor de Atendimento ainda não
                      estar usando o sistema (ex.: piloto restrito à equipe de Qualidade),
                      sem deixar a monitoria travada em pendente_revisao esperando alguém
                      que não vai entrar. O nome de quem agiu fica registrado no histórico
                      (by_name), então não se perde rastreabilidade de que foi a Qualidade
                      substituindo a decisão do Gestor de Atendimento. */}
                  {(user?.role === 'gestor_qualidade' || user?.role === 'admin') && m.status === 'pendente_revisao' && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setActionModal({ id: m.id, type: 'aprovar' })}
                        icon={<CheckCircle2 className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                      >
                        Aprovar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActionModal({ id: m.id, type: 'contestar' })}
                        icon={<AlertTriangle className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                      >
                        Contestar
                      </Button>
                    </>
                  )}

                  {user?.role === 'gestor_suporte' && m.status === 'aguardando_gestor_suporte' && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setActionModal({ id: m.id, type: 'aprovar' })}
                        icon={<CheckCircle2 className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                      >
                        Aprovar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActionModal({ id: m.id, type: 'escalar' })}
                        icon={<AlertTriangle className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-y-0.5" />}
                      >
                        Escalar
                      </Button>
                    </>
                  )}

                  {(user?.role === 'qualidade' || user?.role === 'gestor_qualidade') && (m.status === 'em_contestacao' || m.status === 'reavaliacao_solicitada') && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setViewingMonitoria({ ...m, _reevaluate: true } as any)}
                        icon={<Pencil className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110" />}
                      >
                        Reavaliar
                      </Button>
                      {m.status === 'em_contestacao' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActionModal({ id: m.id, type: 'manter' })}
                          icon={<XCircle className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                        >
                          Recusar
                        </Button>
                      )}
                    </>
                  )}

                  {user?.role === 'gestor_qualidade' && m.status === 'aguardando_gestor_qualidade' && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setActionModal({ id: m.id, type: 'aprovar' })}
                        icon={<CheckCircle2 className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                      >
                        Aprovar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActionModal({ id: m.id, type: 'solicitar_reavaliacao' })}
                        icon={<Pencil className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110" />}
                      >
                        Solicitar
                      </Button>
                    </>
                  )}

                  {/* Excluir é soft-delete (active=false via UPDATE, não DELETE
                      real) — governado por monitorias_update_policy, que já
                      autoriza admin e gestor_qualidade. Alinhando a UI ao que
                      o banco já permitia. */}
                  {(user?.role === 'admin' || user?.role === 'gestor_qualidade') && m.active !== false && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActionModal({ id: m.id, type: 'reabrir' })}
                        icon={<RotateCcw className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-[-45deg]" />}
                      >
                        Reabrir
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActionModal({ id: m.id, type: 'excluir' })}
                        className="text-functional-error hover:bg-functional-error/10 dark:hover:bg-functional-error/20"
                        icon={<Trash2 className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                      >
                        Excluir
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
    </div>
    </div>
  );
}