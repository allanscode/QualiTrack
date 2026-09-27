import React, { useState, useMemo, useEffect } from 'react';
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
  ChevronDown,
  ChevronUp,
  Target,
  HelpCircle,
  Plus,
} from 'lucide-react';
import { Monitoria, AgentFeedback, EvaluationForm } from '../../../types';
import { analyzeRootCause, QuestionOffender } from '../../../utils/rootCauseAnalysis';
import Badge from '../../ui/Badge';
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

  // Gerador de diagnósticos humanizados e práticos para os ofensores
  const getOffenderPracticalGuide = (off: QuestionOffender) => {
    const text = off.questionText.toLowerCase();
    const section = (off.sectionTitle || '').toLowerCase();

    if (text.includes('encerra') || text.includes('sauda') || text.includes('postura') || section.includes('comport')) {
      return {
        whatItMeans: 'O chamado foi finalizado sem a confirmação ativa de resolução pelo cliente ou sem a saudação final padronizada.',
        probableCause: 'Pressa para liberar a fila em horários de pico ou hábito de encerrar imediatamente após o envio da última resposta técnica.',
        managerAction: 'Reforçar no próximo alinhamento a regra de ouro: "Sempre aguardar o cliente confirmar se ficou alguma dúvida antes de encerrar o ticket".',
        pdiCategory: 'Comportamental & Empatia',
      };
    }

    if (text.includes('valida') || text.includes('teste') || text.includes('triagem') || text.includes('n2') || text.includes('escalona')) {
      return {
        whatItMeans: 'O chamado foi transferido ou respondido sem os testes técnicos essenciais (ping, logs ou coleta de evidências).',
        probableCause: 'Insegurança na interpretação do erro ou falta de acompanhamento do checklist de triagem do N1.',
        managerAction: 'Acompanhar em conjunto com o atendente 2 chamados de lentidão nesta semana e alinhar o checklist de testes do artigo #402 da Base de Conhecimento.',
        pdiCategory: 'Procedimento & Triagem Técnica',
      };
    }

    if (text.includes('transpar') || text.includes('registro') || text.includes('causa') || text.includes('nota interna')) {
      return {
        whatItMeans: 'Ausência de detalhamento claro da causa raiz no encerramento ou falta de notas internas explicativas para o cliente e equipe.',
        probableCause: 'Falta de hábito no preenchimento de campos de registro ou desconhecimento do fluxo de documentação.',
        managerAction: 'Orientar o atendente a resumir em 2 linhas: 1) O que causou o problema; 2) Qual foi o ajuste exato realizado.',
        pdiCategory: 'Documentação & Transparência',
      };
    }

    // Genérico inteligente
    return {
      whatItMeans: `Desvio de conformidade recorrente detectado no critério "${off.questionText}".`,
      probableCause: 'Divergência entre o padrão de qualidade esperado e a execução prática observada nos chamados.',
      managerAction: 'Agendar um feedback pontual de 15 minutos com o atendente para alinhar as expectativas e verificar dúvidas conceituais.',
      pdiCategory: 'Qualidade Operacional',
    };
  };

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
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-black text-brand-primary uppercase tracking-wider truncate">
                  Diagnóstico de Falhas & Causa Raiz
                </h2>
                <Badge variant="info" size="sm">Cálculo Local em Tempo Real</Badge>
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
            <span>Maiores Ofensores da Qualidade</span>
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
            <span>Evolução da Equipe Pós-Feedback</span>
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
            <span>Recomendações Práticas</span>
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

          {/* Dica Didática para Gestão */}
          <div className="p-3.5 rounded-xl border border-purple-500/20 bg-purple-50/30 dark:bg-purple-950/20 flex items-start gap-2.5 text-[11px] text-brand-muted">
            <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Como interpretar este painel:</strong> Os critérios abaixo representam os pontos onde sua equipe mais perde notas nas monitorias. Clique em qualquer critério para visualizar o <strong>diagnóstico de causa provável</strong> e a <strong>ação prática recomendada</strong> para o seu time.
            </p>
          </div>

          {/* ABA 1: MAIORES OFENSORES */}
          {activeTab === 'ofensores' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-brand-primary mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    <span>Critérios com Maior Taxa de Reprovação (Top Ofensores)</span>
                  </div>
                  <span className="text-[10px] text-brand-muted font-normal lowercase">
                    (clique no card para expandir o plano de ação)
                  </span>
                </h3>
                
                {diagnosis.topQuestionOffenders.length === 0 ? (
                  <p className="text-xs text-brand-muted italic p-4 bg-surface-card rounded-xl border border-surface-border">
                    Nenhum ofensor reincidente detectado no período avaliado. Sua equipe está operando em alta conformidade!
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {diagnosis.topQuestionOffenders.map((off, idx) => {
                      const isExpanded = expandedOffenderId === off.questionId;
                      const guide = getOffenderPracticalGuide(off);

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
                              <span className="text-[9px] uppercase font-bold text-brand-muted">Taxa de Não Conformidade</span>
                            </div>
                          </div>

                          {/* Barra de Progresso Visual de Gravidade */}
                          <div className="w-full h-1 bg-surface-subtle overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-500"
                              style={{ width: `${Math.min(100, off.failureRate * 2.5)}%` }}
                            />
                          </div>

                          {/* Detalhes Expansíveis Interativos */}
                          {isExpanded && (
                            <div className="p-4 bg-surface-subtle/40 border-t border-surface-border space-y-3 animate-fade-in text-xs">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {/* O que significa */}
                                <div className="p-3 rounded-xl bg-surface-card border border-surface-border space-y-1">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-brand-muted flex items-center gap-1">
                                    <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
                                    O que significa este desvio?
                                  </span>
                                  <p className="text-[11px] text-brand-primary leading-relaxed">
                                    {guide.whatItMeans}
                                  </p>
                                </div>

                                {/* Causa Provável */}
                                <div className="p-3 rounded-xl bg-surface-card border border-surface-border space-y-1">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Causa Raiz Mais Comum
                                  </span>
                                  <p className="text-[11px] text-brand-primary leading-relaxed">
                                    {guide.probableCause}
                                  </p>
                                </div>
                              </div>

                              {/* Ação Prática Recomendada para o Gestor */}
                              <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-1.5">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                                    <Target className="w-3.5 h-3.5" />
                                    Ação Prática Imediata para a Gestão
                                  </span>
                                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                                    Pilar: {guide.pdiCategory}
                                  </span>
                                </div>
                                <p className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium leading-relaxed">
                                  {guide.managerAction}
                                </p>
                              </div>
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
                    Evolução do Desempenho Pós-Alinhamento (PDI)
                  </h4>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400/90 mt-1 leading-relaxed">
                    Compara a média de notas dos atendentes <strong>antes</strong> do alinhamento com as notas obtidas <strong>após</strong> a realização do feedback/1:1, comprovando se as ações combinadas geraram evolução prática no atendimento.
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
          <span className="text-[10px] text-brand-muted font-medium truncate pr-2">
            Diagnóstico interativo gerado automaticamente com base nos critérios de qualidade.
          </span>
          <Button onClick={onClose} className="px-5 py-2 text-xs font-bold shrink-0">
            Entendido
          </Button>
        </div>

      </div>
    </div>,
    document.body
  );
}
