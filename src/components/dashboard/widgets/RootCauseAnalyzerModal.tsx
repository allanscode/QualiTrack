import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  BrainCircuit,
  MessageSquare,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Lightbulb,
  Filter,
} from 'lucide-react';
import { Monitoria, AgentFeedback, EvaluationForm } from '../../../types';
import { analyzeRootCause } from '../../../utils/rootCauseAnalysis';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';

interface RootCauseAnalyzerModalProps {
  isOpen: boolean;
  onClose: () => void;
  monitorias: Monitoria[];
  forms?: EvaluationForm[];
  feedbacks?: AgentFeedback[];
  teamName?: string;
}

export default function RootCauseAnalyzerModal({
  isOpen,
  onClose,
  monitorias,
  forms = [],
  feedbacks = [],
  teamName = 'Operação Global',
}: RootCauseAnalyzerModalProps) {
  const [activeTab, setActiveTab] = useState<'ofensores' | 'roi' | 'recomendacoes'>('ofensores');

  const diagnosis = useMemo(() => {
    return analyzeRootCause(monitorias, forms, feedbacks);
  }, [monitorias, forms, feedbacks]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-surface-bg border border-surface-border rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        
        {/* Header Executivo */}
        <div className="p-5 border-b border-surface-border flex items-center justify-between bg-surface-card flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-brand-primary uppercase tracking-wider">
                  Diagnóstico de Falhas & Causa Raiz
                </h2>
                <Badge variant="info" size="sm">Análise Local em Memória</Badge>
              </div>
              <p className="text-xs text-brand-muted font-medium mt-0.5">
                {teamName} • Amostra de {diagnosis.totalAudits} avaliações analisadas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-brand-muted hover:text-brand-primary hover:bg-surface-subtle transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas Superiores */}
        <div className="px-5 border-b border-surface-border bg-surface-card/60 flex items-center gap-2 overflow-x-auto no-scrollbar flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('ofensores')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'ofensores'
                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-brand-muted hover:text-brand-primary'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Maiores Ofensores</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('roi')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'roi'
                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-brand-muted hover:text-brand-primary'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Evolução Pós-Feedback</span>
            {diagnosis.feedbackROI.totalAgentsWith1on1 > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black rounded-full">
                +{diagnosis.feedbackROI.overallDelta}%
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('recomendacoes')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'recomendacoes'
                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-brand-muted hover:text-brand-primary'
            }`}
          >
            <Lightbulb className="w-3.5 h-3.5" />
            <span>Recomendações Práticas</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-purple-500/10 text-purple-600 dark:text-purple-400 font-black rounded-full">
              {diagnosis.recommendations.length}
            </span>
          </button>
        </div>

        {/* Conteúdo Rolável */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs text-brand-primary">
          
          {/* Cartões Rápidos de Resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-surface-border bg-surface-card">
              <span className="text-[10px] uppercase font-bold text-brand-muted block">Média de Qualidade</span>
              <span className="text-xl font-black text-brand-primary mt-0.5 block">{diagnosis.avgScore}%</span>
              <span className="text-[10px] text-brand-muted">Amostra representativa</span>
            </div>

            <div className="p-3.5 rounded-xl border border-surface-border bg-surface-card">
              <span className="text-[10px] uppercase font-bold text-brand-muted block">Erros Críticos</span>
              <span className="text-xl font-black text-rose-500 mt-0.5 block">{diagnosis.criticalErrorsCount}</span>
              <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">{diagnosis.criticalRate}% de incidência</span>
            </div>

            <div className="p-3.5 rounded-xl border border-surface-border bg-surface-card">
              <span className="text-[10px] uppercase font-bold text-brand-muted block">Gargalos Mapeados</span>
              <span className="text-xl font-black text-amber-500 mt-0.5 block">{diagnosis.topQuestionOffenders.length}</span>
              <span className="text-[10px] text-brand-muted">Critérios com reincidência</span>
            </div>

            <div className="p-3.5 rounded-xl border border-surface-border bg-surface-card">
              <span className="text-[10px] uppercase font-bold text-brand-muted block">Evolução Pós-1:1</span>
              <span className={`text-xl font-black mt-0.5 block ${diagnosis.feedbackROI.overallDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {diagnosis.feedbackROI.overallDelta > 0 ? `+${diagnosis.feedbackROI.overallDelta}%` : `${diagnosis.feedbackROI.overallDelta}%`}
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                {diagnosis.feedbackROI.improvedAgentsCount}/{diagnosis.feedbackROI.totalAgentsWith1on1} atendentes evoluíram
              </span>
            </div>
          </div>

          {/* ABA 1: MAIORES OFENSORES */}
          {activeTab === 'ofensores' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-brand-primary mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  Critérios com Maior Taxa de Reprovação (Top Ofensores)
                </h3>
                
                {diagnosis.topQuestionOffenders.length === 0 ? (
                  <p className="text-xs text-brand-muted italic p-4 bg-surface-card rounded-xl border border-surface-border">
                    Nenhum ofensor reincidente detectado no período avaliado.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {diagnosis.topQuestionOffenders.map((off, idx) => (
                      <div
                        key={off.questionId}
                        className="p-3.5 rounded-xl border border-surface-border bg-surface-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-purple-500/40 transition-all"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-5 h-5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-black flex items-center justify-center">
                              #{idx + 1}
                            </span>
                            <span className="text-xs font-bold text-brand-primary truncate">{off.questionText}</span>
                            {off.sectionTitle && (
                              <span className="text-[10px] text-brand-muted bg-surface-subtle px-1.5 py-0.5 rounded">
                                {off.sectionTitle}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-brand-muted">
                            <span>Falhas registradas: <strong>{off.failureCount}</strong></span>
                            <span>•</span>
                            <span>Amostra avaliada: <strong>{off.totalEvaluated}</strong></span>
                          </div>
                        </div>

                        <div className="sm:text-right flex sm:flex-col items-center sm:items-end justify-between gap-1">
                          <span className="text-sm font-black text-rose-500">{off.failureRate}%</span>
                          <span className="text-[9px] uppercase font-bold text-brand-muted">Taxa de Não Conformidade</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Erros Críticos & Desempenho por Canal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-surface-border bg-surface-card">
                  <h4 className="text-xs font-bold text-brand-primary mb-2 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                    Erros Críticos de Conformidade
                  </h4>
                  {diagnosis.topCriticalErrors.length === 0 ? (
                    <p className="text-[11px] text-brand-muted italic">Nenhum erro crítico registrado na amostra.</p>
                  ) : (
                    <div className="space-y-2">
                      {diagnosis.topCriticalErrors.map((err, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-surface-border/40 last:border-0">
                          <span className="text-brand-muted truncate max-w-[200px]">{err.name}</span>
                          <span className="font-bold text-rose-600 dark:text-rose-400">{err.count} ({err.percentage}%)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-xl border border-surface-border bg-surface-card">
                  <h4 className="text-xs font-bold text-brand-primary mb-2 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-500" />
                    Média de Qualidade por Canal
                  </h4>
                  {diagnosis.channelBreakdown.length === 0 ? (
                    <p className="text-[11px] text-brand-muted italic">Sem dados de canais disponíveis.</p>
                  ) : (
                    <div className="space-y-2">
                      {diagnosis.channelBreakdown.map((ch, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-surface-border/40 last:border-0">
                          <span className="text-brand-primary font-medium">{ch.channel} ({ch.count} audits)</span>
                          <span className="font-black text-brand-primary">{ch.avgScore}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ABA 2: EVOLUÇÃO PÓS-FEEDBACK 1:1 */}
          {activeTab === 'roi' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/20 flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-black text-emerald-800 dark:text-emerald-300">
                    Evolução do Desempenho Pós-Feedback (PDI)
                  </h4>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400/90 mt-1 leading-relaxed">
                    Compara a média de notas dos atendentes <strong>antes</strong> do alinhamento com as notas obtidas <strong>após</strong> a realização do feedback/1:1, comprovando se as ações combinadas geraram evolução prática.
                  </p>
                </div>
              </div>

              {/* Box explicativo sobre processamento em memória / sem custos de API */}
              <div className="p-3.5 rounded-xl border border-purple-500/20 bg-purple-50/30 dark:bg-purple-950/20 flex items-center gap-2.5 text-[11px] text-brand-muted">
                <BrainCircuit className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                <span>
                  <strong>Como funciona esta análise:</strong> O cálculo de correlação estatística é realizado 100% localmente no navegador em tempo real, sem envio de dados a APIs de inteligência artificial de terceiros e com custo zero de processamento.
                </span>
              </div>

              {diagnosis.feedbackROI.agentDetails.length === 0 ? (
                <div className="p-8 text-center bg-surface-card rounded-xl border border-surface-border text-brand-muted">
                  <MessageSquare className="w-8 h-8 opacity-30 mx-auto mb-2" />
                  <p className="text-xs font-bold text-brand-primary">Dados insuficientes para cálculo de evolução pós-feedback</p>
                  <p className="text-[11px] mt-1">
                    É necessário ter monitorias realizadas antes e depois da data do feedback registrado para traçar o comparativo de evolução.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {diagnosis.feedbackROI.agentDetails.map(agent => (
                    <div
                      key={agent.agentId}
                      className="p-3.5 rounded-xl border border-surface-border bg-surface-card flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-brand-primary">{agent.agentName}</span>
                          <span className="text-[10px] text-brand-muted">
                            1:1 em {new Date(agent.feedbackDate).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <p className="text-[11px] text-brand-muted italic mt-0.5">&ldquo;{agent.feedbackTitle}&rdquo;</p>
                      </div>

                      <div className="flex items-center gap-4 sm:gap-6">
                        <div className="text-center">
                          <span className="text-[9px] uppercase font-bold text-brand-muted block">Antes (N={agent.countBefore})</span>
                          <span className="font-bold text-xs text-brand-secondary">{agent.scoreBefore}%</span>
                        </div>

                        <span className="text-brand-muted font-bold">→</span>

                        <div className="text-center">
                          <span className="text-[9px] uppercase font-bold text-brand-muted block">Depois (N={agent.countAfter})</span>
                          <span className="font-bold text-xs text-brand-primary">{agent.scoreAfter}%</span>
                        </div>

                        <div className={`px-2.5 py-1 rounded-lg flex items-center gap-1 font-black text-xs ${
                          agent.delta >= 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        }`}>
                          {agent.delta >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          <span>{agent.delta > 0 ? `+${agent.delta}%` : `${agent.delta}%`}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ABA 3: RECOMENDAÇÕES ACIONÁVEIS */}
          {activeTab === 'recomendacoes' && (
            <div className="space-y-3">
              {diagnosis.recommendations.map((rec, i) => (
                <div
                  key={i}
                  className="p-4 rounded-xl border border-surface-border bg-surface-card hover:border-purple-500/30 transition-all flex items-start gap-3.5"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    rec.priority === 'alta'
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      : rec.priority === 'media'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  }`}>
                    <Lightbulb className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-xs font-black text-brand-primary">{rec.title}</h4>
                      <Badge
                        variant={rec.priority === 'alta' ? 'error' : rec.priority === 'media' ? 'warning' : 'success'}
                        size="sm"
                      >
                        Prioridade {rec.priority.toUpperCase()}
                      </Badge>
                      <span className="text-[10px] uppercase font-bold text-brand-muted">
                        Categoria: {rec.category}
                      </span>
                    </div>
                    <p className="text-xs text-brand-muted leading-relaxed font-medium">
                      {rec.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Rodapé */}
        <div className="p-4 border-t border-surface-border bg-surface-card/60 flex items-center justify-between flex-shrink-0">
          <span className="text-[10px] text-brand-muted font-medium">
            Diagnóstico gerado automaticamente com base nos critérios de qualidade e histórico operacional.
          </span>
          <Button onClick={onClose} className="px-5 py-2 text-xs font-bold">
            Entendido
          </Button>
        </div>

      </div>
    </div>,
    document.body
  );
}
