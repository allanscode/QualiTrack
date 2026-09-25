import React from 'react';
import { Monitoria, User } from '../types';
import { ActionType } from '../hooks/useMonitoriaActions';
import { getStatusConfig, getHistoryEventConfig, VARIANT_TEXT_CLASS } from '../lib/statusHelper';
import { formatTimelineDateTime, resolveTimelineActor } from '../lib/timeline';
import { CheckCircle2, XCircle, RotateCcw, Trash2, Pencil, AlertTriangle, Eye, History, Paperclip } from 'lucide-react';
import ActionAttachmentsViewer from './ActionAttachmentsViewer';
import Button from './ui/Button';

type Props = {
  monitoria: Monitoria;
  user: User | null;
  users: User[];
  onView: (m: Monitoria) => void;
  onAction: (modal: { id: string; type: ActionType }) => void;
};

export default function MonitoriaDetails({ monitoria: m, user, users, onView, onAction }: Props) {
  const staticData = { users };
  const setViewingMonitoria = onView;
  const setActionModal = onAction;
  return (
    <div className="space-y-5">
              {m.history?.length > 0 && (
                <div className="pb-4">
                  <p className="text-xs font-black uppercase text-brand-primary tracking-wider mb-3 ml-1 flex items-center gap-2">
                    <History className="w-3.5 h-3.5 text-brand-highlight" /> Linha do Tempo
                  </p>
                  <div className="overflow-x-auto -mx-1 px-1 pb-1">
                    <div className="flex items-start min-w-max">
                      {m.history.map((h, i) => {
                        const ev = getHistoryEventConfig(h.action);
                        const EvIcon = ev.icon;
                        const evColor = VARIANT_TEXT_CLASS[ev.variant];
                        const actorName = (user?.role === 'suporte' || user?.role === 'gestor_suporte') && !staticData.users.some(actor => actor.id === h.by_id)
                          ? 'Equipe de Qualidade'
                          : resolveTimelineActor(h.by_id, h.by_name, staticData.users, user?.role);
                        const eventDate = formatTimelineDateTime(h.at, m.created_at);
                        return (
                          <React.Fragment key={i}>
                            {i > 0 && <div className="w-8 md:w-12 h-0.5 bg-surface-border/60 mt-[9px] flex-shrink-0" />}
                            <div className="flex flex-col items-center text-center w-[150px] flex-shrink-0 px-1">
                              <div className={`w-3 h-3 rounded-full bg-current border-2 border-surface-bg shadow-sm flex-shrink-0 ${evColor}`} />
                              <span className="mt-2 text-[11px] font-bold text-brand-primary leading-tight flex items-center gap-1.5">
                                <EvIcon className={`w-3 h-3 shrink-0 ${evColor}`} /> {h.action}
                              </span>
                              <span className="text-[9px] font-bold text-brand-primary/80 uppercase tracking-widest mt-1 opacity-70 leading-tight">
                                {actorName}
                              </span>
                              <span className="text-[9px] font-medium text-brand-primary/80 mt-0.5 leading-tight">
                                {eventDate}
                              </span>
                              {h.note && (
                                <div className="mt-2 text-[10px] text-brand-primary/80 bg-surface-subtle/50 p-2 rounded-xl border border-surface-border/30 leading-snug">
                                  {h.note}
                                </div>
                              )}
                              {h.attachments && h.attachments.length > 0 && (
                                <div className="mt-2 w-full">
                                  <ActionAttachmentsViewer attachments={h.attachments} compact />
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
                              <span className="text-[9px] font-bold text-brand-primary/80 uppercase tracking-widest mt-1">
                                Etapa atual
                              </span>
                              <span className="text-[9px] font-medium text-brand-primary/80 mt-0.5 leading-tight">
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
                <p className="text-xs font-black uppercase text-brand-primary tracking-wider ml-1">Observações da Qualidade</p>
                <div className="relative text-sm text-brand-primary font-medium bg-surface-bg/50 py-3 pl-9 pr-5 rounded-2xl border border-surface-border/40 leading-relaxed italic break-words whitespace-pre-wrap">
                  <span className="absolute left-3 top-1.5 text-3xl font-black text-brand-primary/30 leading-none select-none">"</span>
                  {m.evaluator_note || 'Nenhuma observação registrada.'}
                </div>

                {m.corrective_action && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-black uppercase text-brand-primary tracking-wider ml-1">Ação Corretiva do Gestor</p>
                    <div className="text-xs text-brand-primary font-medium bg-surface-subtle/60 p-3 rounded-xl border border-surface-border/40 whitespace-pre-wrap leading-relaxed">
                      {m.corrective_action}
                    </div>
                  </div>
                )}

                {m.action_attachments && m.action_attachments.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-black uppercase text-brand-primary tracking-wider ml-1 flex items-center gap-1.5">
                      <Paperclip className="w-3 h-3 text-brand-muted" /> Anexos e Evidências ({m.action_attachments.length})
                    </p>
                    <ActionAttachmentsViewer attachments={m.action_attachments} />
                  </div>
                )}

                <div className="flex flex-wrap justify-center gap-2 items-center border-t border-surface-border pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewingMonitoria(m)}
                    icon={<Eye className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
                    className="font-bold text-brand-primary border-surface-border shadow-sm hover:bg-surface-subtle"
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
    </div>
  );
}
