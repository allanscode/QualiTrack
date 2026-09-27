import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Copy, Check, FileText, TrendingUp, Users, Target, ShieldCheck, AlertTriangle, Mail } from 'lucide-react';
import { Monitoria, User, Team, EvaluationForm } from '../../../types';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { toast } from 'sonner';
import EmailReportModal from './EmailReportModal';

interface ExecutiveReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  monitorias: Monitoria[];
  users: User[];
  teams: Team[];
  forms: EvaluationForm[];
  initialTeamId?: string;
  initialStartDate?: string;
  initialEndDate?: string;
  currentUser?: User | null;
}

export default function ExecutiveReportModal({
  isOpen,
  onClose,
  monitorias,
  users,
  teams,
  forms,
  initialTeamId = '',
  initialStartDate = '',
  initialEndDate = '',
  currentUser,
}: ExecutiveReportModalProps) {
  const { config, getLevelForScore } = useQualityConfig();

  // Estados dos filtros internos do relatório
  const [selectedTeamId, setSelectedTeamId] = useState<string>(initialTeamId);
  const [periodPreset, setPeriodPreset] = useState<'current_month' | 'last_month' | 'last_30_days' | 'all'>('current_month');
  const [executiveNotes, setExecutiveNotes] = useState<string>(
    'No ciclo avaliado, a equipe manteve consistência técnica nos atendimentos. Recomenda-se reforço nos critérios ofensores mapeados neste relatório através de sessões individuais de 1:1 e treinamentos pontuais.'
  );
  const [copied, setCopied] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

  // Determinar datas conforme o preset
  const dateRange = useMemo(() => {
    const now = new Date();
    if (periodPreset === 'current_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        start: firstDay.toISOString().split('T')[0],
        end: now.toISOString().split('T')[0],
        label: `Mês Atual (${now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })})`,
      };
    }
    if (periodPreset === 'last_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        start: firstDay.toISOString().split('T')[0],
        end: lastDay.toISOString().split('T')[0],
        label: `Mês Anterior (${firstDay.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })})`,
      };
    }
    if (periodPreset === 'last_30_days') {
      const past = new Date(now.getTime() - 30 * 24 * 3600000);
      return {
        start: past.toISOString().split('T')[0],
        end: now.toISOString().split('T')[0],
        label: 'Últimos 30 Dias',
      };
    }
    return {
      start: initialStartDate || '2020-01-01',
      end: initialEndDate || now.toISOString().split('T')[0],
      label: 'Todo o Período Filtrado',
    };
  }, [periodPreset, initialStartDate, initialEndDate]);

  // Equipe e Gestor associado
  const selectedTeam = useMemo(() => {
    return teams.find(t => t.id === selectedTeamId) || null;
  }, [teams, selectedTeamId]);

  const teamManager = useMemo(() => {
    if (!selectedTeam) {
      // Se nenhuma equipe foi selecionada ou todas, procura o primeiro gestor_suporte
      return users.find(u => u.role === 'gestor_suporte') || null;
    }
    // Procura o gestor de suporte associado a esta equipe
    return users.find(u => 
      u.role === 'gestor_suporte' && 
      (u.team_ids?.includes(selectedTeam.id) || (u as any).team_id === selectedTeam.id)
    ) || users.find(u => u.role === 'gestor_suporte') || null;
  }, [selectedTeam, users]);

  // Monitorias filtradas para o relatório
  const reportMonitorias = useMemo(() => {
    return monitorias.filter(m => {
      const dateStr = (m.created_at || '').slice(0, 10);
      const inDate = (!dateRange.start || dateStr >= dateRange.start) && (!dateRange.end || dateStr <= dateRange.end);
      if (!inDate) return false;
      if (selectedTeamId && m.team_id !== selectedTeamId) return false;
      return true;
    });
  }, [monitorias, dateRange, selectedTeamId]);

  // Indicadores consolidados
  const totalVolume = reportMonitorias.length;
  const scoredMonitorias = useMemo(() => reportMonitorias.filter(m => m.score !== undefined && m.score !== null), [reportMonitorias]);
  const avgScore = useMemo(() => {
    if (scoredMonitorias.length === 0) return 0;
    const sum = scoredMonitorias.reduce((acc, m) => acc + (m.score || 0), 0);
    return sum / scoredMonitorias.length;
  }, [scoredMonitorias]);

  const targetDiff = avgScore - config.targetScore;
  const isTargetAchieved = avgScore >= config.targetScore;
  const scoreLevel = getLevelForScore(avgScore);

  // Falhas Críticas
  const criticalErrorsCount = useMemo(() => {
    return reportMonitorias.filter(m => 
      m.score === 0 || 
      (m.critical_error_observations && Object.keys(m.critical_error_observations).length > 0) ||
      ((m as any).critical_errors && Object.values((m as any).critical_errors).some((v: any) => v === true))
    ).length;
  }, [reportMonitorias]);

  // Contestações
  const contestedMonitorias = useMemo(() => {
    return reportMonitorias.filter(m => 
      ['em_contestacao', 'contestacao_aceita', 'contestacao_negada', 'finalizada_mantida', 'finalizada_alterada'].includes(m.status) ||
      m.history?.some((h: any) => h.action.toLowerCase().includes('contest'))
    );
  }, [reportMonitorias]);

  const approvedContestations = useMemo(() => {
    return contestedMonitorias.filter(m => 
      ['contestacao_aceita', 'finalizada_alterada'].includes(m.status) ||
      m.history?.some((h: any) => h.action.toLowerCase().includes('procedente') || h.action.toLowerCase().includes('aceita'))
    ).length;
  }, [contestedMonitorias]);

  const contestationRate = totalVolume > 0 ? (contestedMonitorias.length / totalVolume) * 100 : 0;
  const reversionRate = contestedMonitorias.length > 0 ? (approvedContestations / contestedMonitorias.length) * 100 : 0;

  // Curva de Qualidade (Distribuição por faixas)
  const gradeDistribution = useMemo(() => {
    const grades = config.levels || [
      { minScore: 91, maxScore: 100, label: 'Excelente', color: '#10B981', bgColor: 'bg-emerald-500' },
      { minScore: 80, maxScore: 90, label: 'Aceitável', color: '#3B82F6', bgColor: 'bg-blue-500' },
      { minScore: 60, maxScore: 79, label: 'Atenção', color: '#F59E0B', bgColor: 'bg-amber-500' },
      { minScore: 0, maxScore: 59, label: 'Crítico', color: '#EF4444', bgColor: 'bg-rose-500' },
    ];
    return grades.map((g: any) => {
      const count = scoredMonitorias.filter(m => {
        const sc = m.score || 0;
        return sc >= g.minScore && sc <= (g.maxScore + 0.001);
      }).length;
      const pct = scoredMonitorias.length > 0 ? (count / scoredMonitorias.length) * 100 : 0;
      return { ...g, count, pct };
    });
  }, [config.levels, scoredMonitorias]);

  // Maiores Ofensores da equipe
  const topOfensores = useMemo(() => {
    const map: Record<string, { text: string; errors: number; total: number }> = {};
    forms.forEach(f => {
      f.sections?.forEach(s => {
        s.questions?.forEach(q => {
          map[q.id] = { text: q.text, errors: 0, total: 0 };
        });
      });
    });

    reportMonitorias.forEach(m => {
      if (!m.answers) return;
      Object.entries(m.answers).forEach(([qId, ans]) => {
        if (!map[qId]) return;
        if (ans === 'NAO') map[qId].errors++;
        if (ans === 'SIM' || ans === 'NAO') map[qId].total++;
      });
    });

    return Object.values(map)
      .filter(item => item.total > 0 && item.errors > 0)
      .map(item => ({
        ...item,
        failRate: (item.errors / item.total) * 100,
      }))
      .sort((a, b) => b.failRate - a.failRate)
      .slice(0, 5);
  }, [forms, reportMonitorias]);

  // Desempenho individual por atendente
  const agentsPerformance = useMemo(() => {
    const map: Record<string, { name: string; count: number; scores: number[]; critical: number }> = {};
    reportMonitorias.forEach(m => {
      const id = m.evaluated_id;
      if (!id) return;
      if (!map[id]) {
        const u = users.find(x => x.id === id);
        map[id] = { name: u?.name || 'Atendente', count: 0, scores: [], critical: 0 };
      }
      map[id].count++;
      if (
        m.score === 0 || 
        (m.critical_error_observations && Object.keys(m.critical_error_observations).length > 0) ||
        ((m as any).critical_errors && Object.values((m as any).critical_errors).some((v: any) => v === true))
      ) {
        map[id].critical++;
      }
      if (typeof m.score === 'number' && !isNaN(m.score)) {
        map[id].scores.push(m.score);
      }
    });

    return Object.entries(map)
      .map(([id, d]) => {
        const avg = d.scores.length > 0 ? d.scores.reduce((a, b) => a + b, 0) / d.scores.length : 0;
        return {
          id,
          name: d.name,
          count: d.count,
          avg,
          critical: d.critical,
          achieved: avg >= config.targetScore,
        };
      })
      .sort((a, b) => b.avg - a.avg);
  }, [reportMonitorias, users, config.targetScore]);

  // Função para imprimir direto em folha A4
  const handlePrint = () => {
    window.print();
  };

  // Copiar resumo em Markdown para envio rápido (Slack/WhatsApp/Teams)
  const handleCopyMarkdown = () => {
    const teamTitle = selectedTeam ? selectedTeam.name : 'Todas as Equipes (Geral)';
    const managerName = teamManager ? teamManager.name : 'Gestão de Suporte';
    const text = `*📊 RELATÓRIO EXECUTIVO DE QUALIDADE · QUALIDADE WP*
*Equipe:* ${teamTitle}
*Gestor Responsável:* ${managerName}
*Período:* ${dateRange.label} (${dateRange.start} até ${dateRange.end})

*📈 Principais Indicadores:*
• Nota Média: *${avgScore.toFixed(2)}%* (Meta: ${config.targetScore}% - ${isTargetAchieved ? '✅ Atingida' : '⚠️ Abaixo da meta'})
• Volume Avaliado: *${totalVolume} tickets*
• Falhas Críticas: *${criticalErrorsCount}*
• Taxa de Contestações: *${contestationRate.toFixed(1)}%* (${approvedContestations} procedentes / taxa de reversão: ${reversionRate.toFixed(1)}%)

*🎯 Principais Ofensores da Equipe:*
${topOfensores.map((o, i) => `${i + 1}. ${o.text} (${o.failRate.toFixed(1)}% falha)`).join('\n') || 'Nenhum ofensor crítico mapeado.'}

*📝 Parecer da Qualidade:*
"${executiveNotes}"

_Relatório emitido em ${new Date().toLocaleDateString('pt-BR')} por ${currentUser?.name || 'Qualidade WP'}._`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Resumo executivo copiado para a área de transferência!');
    setTimeout(() => setCopied(false), 3000);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      {/* Estilos dedicados para impressão A4 sem cortes */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #executive-report-document, #executive-report-document * {
            visibility: visible !important;
          }
          #executive-report-document {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 15mm 20mm !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            color: #0f172a !important;
          }
          .print-hidden {
            display: none !important;
          }
          .page-break-inside-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Modal Container */}
      <div className="relative w-full max-w-4xl bg-surface-bg border border-surface-border rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto print:m-0 print:border-none print:shadow-none print:max-h-none print:overflow-visible">
        
        {/* Barra Superior de Controles (Oculta na Impressão) */}
        <div className="p-4 sm:px-6 bg-surface-card border-b border-surface-border flex flex-wrap items-center justify-between gap-3 print-hidden flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-accent/10 text-brand-accent flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-brand-primary uppercase tracking-wider">
                Relatório Executivo de Qualidade (PDF)
              </h2>
              <p className="text-[11px] text-brand-muted font-medium">
                Parametrize e gere o relatório consolidado pronto para envio a gestores e reuniões
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEmailModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-500/30 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/50 shadow-xs transition-colors cursor-pointer"
              title="Disparar relatório executivo individualizado por e-mail para liderança"
            >
              <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Enviar por E-mail</span>
            </button>
            <button
              type="button"
              onClick={handleCopyMarkdown}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-surface-border bg-surface-subtle text-xs font-bold text-brand-primary hover:bg-surface-border transition-colors cursor-pointer"
              title="Copiar resumo estruturado em Markdown"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-functional-success" /> : <Copy className="w-3.5 h-3.5 text-brand-muted" />}
              <span>{copied ? 'Copiado!' : 'Copiar Texto'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-accent text-white text-xs font-bold hover:bg-brand-accent/90 shadow-sm transition-colors cursor-pointer"
              title="Abrir diálogo de impressão e salvar como PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir / Salvar PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-brand-muted hover:text-brand-primary hover:bg-surface-subtle transition-colors cursor-pointer ml-1"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barra de Filtros Internos do Relatório (Oculta na Impressão) */}
        <div className="p-3 sm:px-6 bg-surface-subtle/50 border-b border-surface-border flex flex-wrap items-center gap-4 text-xs print-hidden flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-brand-muted uppercase text-[10px] tracking-wider">Equipe / Gestor:</span>
            <select
              value={selectedTeamId}
              onChange={e => setSelectedTeamId(e.target.value)}
              className="bg-surface-card border border-surface-border rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-primary focus:outline-none focus:border-brand-accent"
            >
              <option value="">Todas as Equipes (Visão Consolidada)</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-bold text-brand-muted uppercase text-[10px] tracking-wider">Período:</span>
            <div className="inline-flex p-0.5 rounded-lg bg-surface-card border border-surface-border">
              {(['current_month', 'last_month', 'last_30_days', 'all'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriodPreset(p)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                    periodPreset === p ? 'bg-brand-accent text-white shadow-xs' : 'text-brand-muted hover:text-brand-primary'
                  }`}
                >
                  {p === 'current_month' ? 'Mês Atual' : p === 'last_month' ? 'Mês Anterior' : p === 'last_30_days' ? '30 Dias' : 'Todos'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ÁREA ROLÁVEL DO DOCUMENTO (A4 Preview) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100 dark:bg-slate-950/50 print:p-0 print:bg-white">
          <div
            id="executive-report-document"
            className="w-full max-w-3xl mx-auto bg-white text-slate-900 rounded-xl shadow-lg border border-slate-200 p-8 sm:p-12 space-y-8 print:shadow-none print:border-none print:p-0 print:max-w-none"
          >
            {/* 1. CABEÇALHO INSTITUCIONAL */}
            <div className="border-b-2 border-slate-900 pb-5">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-blue-100 text-blue-800">
                      Qualidade WP System
                    </span>
                    <span className="text-xs font-bold text-slate-500">Documento Oficial</span>
                  </div>
                  <h1 className="text-2xl font-black tracking-tight text-slate-950 uppercase mt-1">
                    Relatório Executivo de Qualidade
                  </h1>
                  <p className="text-xs font-semibold text-slate-600 mt-0.5">
                    Diagnóstico de Performance, Conformidade e Oportunidades de Desenvolvimento
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Emissão</div>
                  <div className="text-xs font-black text-slate-900">
                    {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">Por: {currentUser?.name || 'Administração'}</div>
                </div>
              </div>

              {/* Tabela de Metadados do Alvo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Equipe Avaliada</span>
                  <span className="font-bold text-slate-900">{selectedTeam ? selectedTeam.name : 'Geral (Todas as Equipes)'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Gestor Responsável</span>
                  <span className="font-bold text-slate-900">{teamManager ? teamManager.name : 'Coordenação Geral'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Período de Referência</span>
                  <span className="font-bold text-slate-900">{dateRange.label}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Amostragem</span>
                  <span className="font-bold text-slate-900">{totalVolume} monitoria{totalVolume !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>

            {/* 2. PLACAR PRINCIPAL (KPIs EXECUTIVOS) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 page-break-inside-avoid">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Nota Média</span>
                <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">
                  {avgScore.toFixed(1)}%
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <span className={`inline-block w-2 h-2 rounded-full ${scoreLevel.bgColor}`} />
                  <span className="text-[11px] font-bold text-slate-700">{scoreLevel.label}</span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Meta Corporativa</span>
                <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">
                  {config.targetScore}%
                </div>
                <div className="mt-2 text-[11px] font-bold">
                  {isTargetAchieved ? (
                    <span className="text-emerald-700">✓ Atingida (+{targetDiff.toFixed(1)}%)</span>
                  ) : (
                    <span className="text-rose-700">✗ Abaixo ({targetDiff.toFixed(1)}%)</span>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Taxa de Reversão</span>
                <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">
                  {reversionRate.toFixed(1)}%
                </div>
                <div className="mt-2 text-[11px] font-semibold text-slate-600">
                  {approvedContestations} procedentes de {contestedMonitorias.length}
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Falhas Críticas</span>
                <div className={`text-3xl font-black tracking-tight leading-none ${criticalErrorsCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {criticalErrorsCount}
                </div>
                <div className="mt-2 text-[11px] font-semibold text-slate-600">
                  {criticalErrorsCount === 0 ? 'Nenhum desvio grave' : 'Atenção imediata'}
                </div>
              </div>
            </div>

            {/* 3. CURVA DE QUALIDADE (DISTRIBUIÇÃO) */}
            <div className="page-break-inside-avoid">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-2 mb-3">
                Distribuição por Faixa de Desempenho
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {gradeDistribution.map((g: any) => (
                  <div key={g.label} className="p-3 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                      <span>{g.label}</span>
                      <span className="font-mono text-slate-900">{g.pct.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${g.pct}%`, backgroundColor: g.color }} />
                    </div>
                    <div className="text-[10px] font-medium text-slate-500 mt-1">
                      {g.count} atendimento{g.count !== 1 ? 's' : ''} ({g.minScore}% - {g.maxScore}%)
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. PRINCIPAIS OFENSORES / OPORTUNIDADES DE DESENVOLVIMENTO */}
            <div className="page-break-inside-avoid">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-2 mb-3">
                Top 5 Oportunidades de Melhoria (Maiores Ofensores)
              </h3>
              {topOfensores.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-2">Nenhum critério com índice relevante de falhas registrado no período.</p>
              ) : (
                <div className="space-y-2">
                  {topOfensores.map((o, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50/40 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0 pr-4">
                        <span className="w-5 h-5 rounded-md bg-slate-200 text-slate-700 font-black text-[10px] flex items-center justify-center flex-shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="font-bold text-slate-800 truncate">{o.text}</span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-xs font-black text-rose-700">{o.failRate.toFixed(1)}% falhas</span>
                        <span className="text-[10px] text-slate-500 block">({o.errors} de {o.total} análises)</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 5. QUADRO DE DESEMPENHO INDIVIDUAL */}
            <div className="page-break-inside-avoid">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-2 mb-3">
                Desempenho por Atendente da Operação
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[9px] tracking-wider">
                    <tr>
                      <th className="p-2.5">Atendente</th>
                      <th className="p-2.5 text-center">Auditorias</th>
                      <th className="p-2.5 text-center">Score Médio</th>
                      <th className="p-2.5 text-center">Desvios Críticos</th>
                      <th className="p-2.5 text-right">Situação vs Meta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
                    {agentsPerformance.slice(0, 10).map((ag) => (
                      <tr key={ag.id} className="hover:bg-slate-50/60">
                        <td className="p-2.5 font-bold text-slate-900">{ag.name}</td>
                        <td className="p-2.5 text-center font-mono">{ag.count}</td>
                        <td className="p-2.5 text-center font-bold">
                          <span className={ag.avg >= config.targetScore ? 'text-emerald-700' : 'text-amber-700'}>
                            {ag.avg.toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-2.5 text-center">
                          {ag.critical > 0 ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                              {ag.critical}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-2.5 text-right">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                            ag.achieved ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {ag.achieved ? 'Dentro da Meta' : 'Abaixo da Meta'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {agentsPerformance.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-500 italic">
                          Nenhum dado individual disponível para o filtro selecionado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 6. PARECER EXECUTIVO DO GESTOR & PRÓXIMOS PASSOS */}
            <div className="page-break-inside-avoid">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-2 mb-2">
                Parecer da Qualidade & Próximos Passos
              </h3>
              <p className="text-[11px] text-slate-500 mb-2 print-hidden">
                Você pode editar este texto livremente antes de imprimir ou salvar o PDF:
              </p>
              <textarea
                value={executiveNotes}
                onChange={e => setExecutiveNotes(e.target.value)}
                rows={3}
                className="w-full text-xs p-3 rounded-lg border border-slate-300 bg-slate-50/50 text-slate-800 focus:outline-none focus:border-blue-600 resize-none font-medium leading-relaxed"
                placeholder="Insira aqui as observações executivas e recomendações para o gestor..."
              />
            </div>

            {/* 7. CHANCELA & AUTENTICAÇÃO DIGITAL DO SISTEMA (SEM ASSINATURA MANUAL) */}
            <div className="pt-6 border-t-2 border-slate-200 page-break-inside-avoid">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold shrink-0">
                    <ShieldCheck className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      Documento Autenticado Digitalmente
                    </p>
                    <p className="text-[11px] text-slate-600 font-medium">
                      Emitido pelo sistema <span className="font-bold text-blue-600">Qualidade WP</span> · Válido sem assinatura manual
                    </p>
                  </div>
                </div>

                <div className="text-right text-[10px] text-slate-500 font-mono">
                  <p className="font-bold text-slate-700">Chancela Digital: QWP-{new Date().getFullYear()}-{reportMonitorias.length.toString().padStart(4, '0')}</p>
                  <p className="text-slate-500">Emissão: {new Date().toLocaleDateString('pt-BR')} • Emissor: {currentUser?.name || 'Gestão da Qualidade'}</p>
                </div>
              </div>

              {/* Rodapé confidencial */}
              <div className="text-center pt-3 text-[9px] text-slate-400 uppercase tracking-widest font-bold">
                Qualidade WP · Sistema Integrado de Gestão da Qualidade · Confidencial Interno
              </div>
            </div>
          </div>
        </div>

      </div>

      {isEmailModalOpen && (
        <EmailReportModal
          isOpen={isEmailModalOpen}
          onClose={() => setIsEmailModalOpen(false)}
          teamTitle={selectedTeam ? selectedTeam.name : 'Todas as Equipes (Visão Consolidada)'}
          periodLabel={dateRange.label}
          kpiSummary={{
            avgScore: Math.round(avgScore * 10) / 10,
            targetScore: config.targetScore,
            totalAudits: totalVolume,
            criticalRate: totalVolume > 0 ? Math.round((criticalErrorsCount / totalVolume) * 1000) / 10 : 0,
          }}
          teamManager={teamManager}
          users={users}
          currentUser={currentUser || null}
          reportNotes={executiveNotes}
        />
      )}
    </div>,
    document.body
  );
}
