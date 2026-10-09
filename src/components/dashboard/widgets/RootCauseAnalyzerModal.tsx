import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  AlertTriangle,
  TrendingUp,
  MessageSquare,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Lightbulb,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Monitoria, AgentFeedback, EvaluationForm } from '../../../types';
import { analyzeRootCause } from '../../../utils/rootCauseAnalysis';
import Button from '../../ui/Button';

interface RootCauseAnalyzerModalProps {
  isOpen: boolean;
  onClose: () => void;
  monitorias: Monitoria[];
  forms?: EvaluationForm[];
  feedbacks?: AgentFeedback[];
  teamName?: string;
  onOpenNewFeedback?: () => void;
}

export default function RootCauseAnalyzerModal({
  isOpen,
  onClose,
  monitorias,
  forms = [],
  feedbacks = [],
  teamName = 'Operação Global',
  onOpenNewFeedback,
}: RootCauseAnalyzerModalProps) {
  const [activeTab, setActiveTab] = useState<'ofensores' | 'roi' | 'recomendacoes'>('ofensores');
  const [expandedOffenderId, setExpandedOffenderId] = useState<string | null>(null);

  // Fechar ao pressionar Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const diagnosis = useMemo(() => {
    return analyzeRootCause(monitorias, forms, feedbacks);
  }, [monitorias, forms, feedbacks]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto"
      onClick={e => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-4xl bg-surface-bg border border-surface-border rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh] focus:outline-none"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Executivo */}
        <div className="p-4 sm:p-5 border-b border-surface-border flex items-center justify-between bg-surface-card flex-shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-black text-brand-primary uppercase tracking-wider truncate">
                  Análise das monitorias
                </h2>
              </div>
              <p className="text-xs text-brand-muted font-medium mt-0.5 truncate">
                {teamName} • Amostra de {diagnosis.totalAudits} avaliações analisadas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-brand-muted hover:text-brand-primary hover:bg-surface-subtle transition-colors cursor-pointer shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Fechar (ESC)"
            aria-label="Fechar diagnóstico"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas Superiores */}
        <div className="px-4 sm:px-5 border-b border-surface-border bg-surface-card/60 flex items-center gap-2 overflow-x-auto no-scrollbar flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('ofensores')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap min-h-[44px] ${
              activeTab === 'ofensores'
                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-brand-muted hover:text-brand-primary'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Critérios com falhas</span>
            {diagnosis.topQuestionOffenders.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-black rounded-full">
                {diagnosis.topQuestionOffenders.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('roi')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap min-h-[44px] ${
              activeTab === 'roi'
                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-brand-muted hover:text-brand-primary'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Notas antes e depois do feedback</span>
            {diagnosis.feedbackROI.totalAgentsWith1on1 > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black rounded-full">
                +{diagnosis.feedbackROI.overallDelta}%
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('recomendacoes')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap min-h-[44px] ${
              activeTab === 'recomendacoes'
                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-brand-muted hover:text-brand-primary'
            }`}
          >
            <Lightbulb className="w-3.5 h-3.5" />
            <span>Pontos para revisão</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 font-black rounded-full">
              {diagnosis.recommendations.length}
            </span>
          </button>
        </div>

        {/* Conteúdo Rolável */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs text-brand-primary">
          
          {/* Cartões Rápidos de Resumo Didáticos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-surface-border bg-surface-card">
              <span className="text-[10px] uppercase font-bold text-brand-muted block">Média de Qualidade</span>
              <span className="text-xl font-black text-brand-primary mt-0.5 block">{diagnosis.avgScore}%</span>
              <span className="text-[10px] text-brand-muted">Nas avaliações filtradas</span>
            </div>

            <div className="p-3.5 rounded-xl border border-surface-border bg-surface-card">
              <span className="text-[10px] uppercase font-bold text-brand-muted block">Erros Críticos</span>
              <span className="text-xl font-black text-rose-500 mt-0.5 block">{diagnosis.criticalErrorsCount}</span>
              <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">{diagnosis.criticalRate}% de incidência</span>
            </div>

            <div className="p-3.5 rounded-xl border border-surface-border bg-surface-card">
              <span className="text-[10px] uppercase font-bold text-brand-muted block">Critérios com falhas</span>
              <span className="text-xl font-black text-amber-500 mt-0.5 block">{diagnosis.topQuestionOffenders.length}</span>
              <span className="text-[10px] text-brand-muted">Critérios com reincidência</span>
            </div>

            <div className="p-3.5 rounded-xl border border-surface-border bg-surface-card">
              <span className="text-[10px] uppercase font-bold text-brand-muted block">Diferença após 1:1</span>
              <span className={`text-xl font-black mt-0.5 block ${diagnosis.feedbackROI.overallDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {diagnosis.feedbackROI.overallDelta > 0 ? `+${diagnosis.feedbackROI.overallDelta}%` : `${diagnosis.feedbackROI.overallDelta}%`}
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                {diagnosis.feedbackROI.improvedAgentsCount}/{diagnosis.feedbackROI.totalAgentsWith1on1} atendentes evoluíram
              </span>
            </div>
          </div>

          <p className="text-[11px] text-brand-muted">
            Dados das avaliações filtradas. As taxas mostram frequência de falhas; a causa deve ser verificada nas monitorias.
          </p>

          {/* ABA 1: MAIORES OFENSORES */}
          {activeTab === 'ofensores' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-brand-primary mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    <span>Critérios com mais respostas “Não”</span>
                  </div>
                  <span className="text-[10px] text-brand-muted font-normal lowercase">
                    (clique para ver o cálculo)
                  </span>
                </h3>
                
                {diagnosis.topQuestionOffenders.length === 0 ? (
                  <p className="text-xs text-brand-muted italic p-4 bg-surface-card rounded-xl border border-surface-border">
                    Nenhuma resposta “Não” registrada nos critérios das avaliações filtradas.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {diagnosis.topQuestionOffenders.map((off, idx) => {
                      const isExpanded = expandedOffenderId === off.questionId;

                      return (
                        <div
                          key={off.questionId}
                          className={`rounded-2xl border transition-all overflow-hidden ${
                            isExpanded
                              ? 'border-purple-500/60 bg-surface-card shadow-md ring-1 ring-purple-500/20'
                              : 'border-surface-border bg-surface-card hover:border-purple-500/40 cursor-pointer'
                          }`}
                        >
                          {/* Cabeçalho Clicável do Ofensor */}
                          <div
                            onClick={() => setExpandedOffenderId(isExpanded ? null : off.questionId)}
                            className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="w-5 h-5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-black flex items-center justify-center shrink-0">
                                  #{idx + 1}
                                </span>
                                <span className="text-xs font-bold text-brand-primary truncate">{off.questionText}</span>
                                {off.sectionTitle && (
                                  <span className="text-[10px] text-brand-muted bg-surface-subtle px-1.5 py-0.5 rounded font-semibold">
                                    {off.sectionTitle}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-brand-muted">
                                <span>Falhas registradas: <strong className="text-rose-500">{off.failureCount}</strong></span>
                                <span>•</span>
                                <span>Amostra avaliada: <strong>{off.totalEvaluated}</strong></span>
                              </div>
                            </div>

                            {/* Barra Visual & Porcentagem */}
                            <div className="flex items-center sm:flex-col sm:items-end justify-between gap-2 shrink-0">
                              <div className="flex items-center gap-2">
                                <span className="text-base font-black text-rose-500">{off.failureRate}%</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-brand-muted" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-brand-muted" />
                                )}
                              </div>
                          <span className="text-[9px] uppercase font-bold text-brand-muted">Respostas “Não”</span>
                            </div>
                          </div>

                          {/* Taxa de falha */}
                          <div className="w-full h-1 bg-surface-subtle overflow-hidden">
                            <div
                              className="h-full bg-rose-500"
                              style={{ width: `${off.failureRate}%` }}
                            />
                          </div>

                          {/* Detalhes do cálculo */}
                          {isExpanded && (
                            <div className="p-4 bg-surface-subtle/40 border-t border-surface-border text-xs text-brand-muted space-y-2">
                              <p><strong className="text-brand-primary">{off.failureCount} de {off.totalEvaluated}</strong> avaliações com resposta “Não” neste critério.</p>
                              <p>Para identificar o motivo, consulte as observações e os tickets dessas avaliações.</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Erros Críticos & Desempenho por Canal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-surface-border bg-surface-card">
                  <h4 className="text-xs font-bold text-brand-primary mb-2 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                    Erros críticos registrados
                  </h4>
                  {diagnosis.topCriticalErrors.length === 0 ? (
                    <p className="text-[11px] text-brand-muted italic">Nenhum erro crítico registrado na amostra.</p>
                  ) : (
                    <div className="space-y-2">
                      {diagnosis.topCriticalErrors.map(err => (
                        <div key={err.id} className="flex items-center justify-between gap-3 text-xs py-1 border-b border-surface-border/40 last:border-0">
                          <span className="text-brand-muted min-w-0" title={err.labelResolved ? err.name : `ID do critério: ${err.id}`}>
                            {err.name}
                            {!err.labelResolved && <span className="block text-[10px]">Descrição ausente na ficha salva</span>}
                          </span>
                          <span className="font-bold text-rose-600 dark:text-rose-400 shrink-0">{err.count} ({err.percentage}%)</span>
                        </div>
                      ))}
                      <p className="text-[10px] text-brand-muted">Percentual das {diagnosis.criticalErrorsCount} avaliações com erro crítico. Uma avaliação pode ter mais de um tipo.</p>
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
                          <span className="text-brand-primary font-medium">{ch.channel} ({ch.count} avaliações)</span>
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
                    Comparação de notas antes e depois do feedback
                  </h4>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400/90 mt-1 leading-relaxed">
                    Compara as médias das avaliações feitas antes e depois da data do feedback. A diferença não comprova, por si só, que o feedback causou a mudança.
                  </p>
                </div>
              </div>

              {diagnosis.feedbackROI.agentDetails.length === 0 ? (
                <div className="p-8 text-center bg-surface-card rounded-xl border border-surface-border text-brand-muted">
                  <MessageSquare className="w-8 h-8 opacity-30 mx-auto mb-2" />
                  <p className="text-xs font-bold text-brand-primary">Dados insuficientes para cálculo comparativo</p>
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
                  className="p-4 rounded-xl border border-surface-border bg-surface-card"
                >
                  <h4 className="text-xs font-semibold text-brand-primary mb-1">{rec.title}</h4>
                  <p className="text-xs text-brand-muted leading-relaxed">{rec.description}</p>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Rodapé */}
        <div className="p-4 border-t border-surface-border bg-surface-card/60 flex items-center justify-between flex-shrink-0">
          <span className="text-[10px] text-brand-muted font-medium truncate pr-2">
            Resumo das monitorias selecionadas. A análise da causa depende dos registros de cada avaliação.
          </span>
          <Button onClick={onClose} className="px-5 py-2 text-xs font-bold shrink-0">
            Fechar
          </Button>
        </div>

      </div>
    </div>,
    document.body
  );
}
