import React, { useState, useEffect, useMemo } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import DistributionChart from '../widgets/DistributionChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import ActionDeadlineWidget from '../widgets/ActionDeadlineWidget';
import ComparativeBarChart from '../widgets/ComparativeBarChart';
import OfensoresChart from '../widgets/OfensoresChart';
import { 
  ClipboardCheck, 
  Target, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  History, 
  Clock, 
  Users, 
  Activity, 
  TrendingUp,
  Award
} from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { isApprovalAction, isRejectionAction, isContestationAction } from '../../../lib/contestation';
import { chartColorMap, chartPalette, chartColorArray } from '../chartColors';

// High-fidelity mock datasets for fallback and customization mode
const mockTrendData = [
  { name: '01/05', ScoreMedio: 82.3, MeuScore: 84.5, ScoreEquipe: 81.2, MediaEquipe: 81.5 },
  { name: '05/05', ScoreMedio: 84.1, MeuScore: 83.2, ScoreEquipe: 82.5, MediaEquipe: 82.1 },
  { name: '10/05', ScoreMedio: 83.8, MeuScore: 86.1, ScoreEquipe: 83.1, MediaEquipe: 82.8 },
  { name: '15/05', ScoreMedio: 85.2, MeuScore: 87.4, ScoreEquipe: 84.8, MediaEquipe: 83.5 },
  { name: '20/05', ScoreMedio: 86.5, MeuScore: 85.9, ScoreEquipe: 85.2, MediaEquipe: 84.2 },
  { name: '25/05', ScoreMedio: 87.0, MeuScore: 88.2, ScoreEquipe: 86.1, MediaEquipe: 85.0 }
];

const mockDistributionData = [
  { name: 'Excelente (91-100%)', value: 35, color: '#10B981' },
  { name: 'Aceitável (80-90%)', value: 18, color: '#3B82F6' },
  { name: 'Atenção (60-79%)', value: 5, color: '#F59E0B' },
  { name: 'Ruim (0-59%)', value: 2, color: '#EF4444' }
];

const mockPrecisionData = [
  { name: 'Estáveis', value: 54, color: '#10B981' },
  { name: 'Reavaliadas', value: 6, color: '#F59E0B' }
];

const mockComparativeData = [
  { name: 'Seg', meuVolume: 5, mediaEquipe: 4.2 },
  { name: 'Ter', meuVolume: 6, mediaEquipe: 4.5 },
  { name: 'Qua', meuVolume: 4, mediaEquipe: 4.0 },
  { name: 'Qui', meuVolume: 7, mediaEquipe: 4.8 },
  { name: 'Sex', meuVolume: 5, mediaEquipe: 4.3 }
];

const mockClientDissatisfaction = [
  { name: 'Navegação confusa', value: 12, color: '#3B82F6' },
  { name: 'Demora no retorno', value: 8, color: '#10B981' },
  { name: 'Tom inadequado', value: 5, color: '#F59E0B' },
  { name: 'Erro de sistema', value: 3, color: '#EF4444' }
];

const mockQualityDissatisfaction = [
  { name: 'Script incompleto', value: 15, color: '#3B82F6' },
  { name: 'Erro de registro', value: 10, color: '#10B981' },
  { name: 'Postura fria', value: 6, color: '#F59E0B' },
  { name: 'Sem FCR', value: 4, color: '#EF4444' }
];

const mockMonitoriasDeadlines = [
  {
    id: 'm1',
    display_id: '001',
    ticket_id: '10239',
    status: 'pendente_revisao',
    evaluator_name: 'Mariana Santos',
    created_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    action_deadline_at: new Date(Date.now() + 8 * 3600 * 1000).toISOString()
  },
  {
    id: 'm2',
    display_id: '002',
    ticket_id: '10482',
    status: 'em_contestacao',
    evaluated_name: 'Ana Silva',
    created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    action_deadline_at: new Date(Date.now() + 14 * 3600 * 1000).toISOString()
  }
] as any[];

const mockMonitoriasOfensores = [
  { answers: { q1: 'NAO', q2: 'SIM', q3: 'SIM', q4: 'SIM', q5: 'SIM' } },
  { answers: { q1: 'NAO', q2: 'NAO', q3: 'SIM', q4: 'SIM', q5: 'SIM' } },
  { answers: { q1: 'NAO', q2: 'NAO', q3: 'NAO', q4: 'SIM', q5: 'SIM' } },
  { answers: { q1: 'SIM', q2: 'SIM', q3: 'NAO', q4: 'NAO', q5: 'SIM' } },
  { answers: { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM', q5: 'NAO' } }
] as any[];

const mockForms = [
  {
    id: 'f1',
    sections: [
      {
        questions: [
          { id: 'q1', text: 'Conhecimento Técnico e Permissionamento' },
          { id: 'q2', text: 'Postura e Empatia no Atendimento' },
          { id: 'q3', text: 'Resolução no Primeiro Contato (FCR)' },
          { id: 'q4', text: 'Confirmação de Dados Cadastrais' },
          { id: 'q5', text: 'Segurança e Confidencialidade' }
        ]
      }
    ]
  }
] as any[];

const mockRecentMonitorias = [
  {
    id: 'm-rec-1',
    display_id: '1004',
    ticket_id: '98431',
    status: 'concluida',
    evaluator_id: 'u1',
    evaluated_id: 'u3',
    score: 95.5,
    created_at: new Date().toISOString(),
    action_deadline_at: new Date().toISOString()
  },
  {
    id: 'm-rec-2',
    display_id: '1003',
    ticket_id: '98422',
    status: 'pendente_revisao',
    evaluator_id: 'u1',
    evaluated_id: 'u4',
    score: 82.0,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    action_deadline_at: new Date(Date.now() + 72000000).toISOString()
  },
  {
    id: 'm-rec-3',
    display_id: '1002',
    ticket_id: '98415',
    status: 'em_contestacao',
    evaluator_id: 'u2',
    evaluated_id: 'u5',
    score: 72.5,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    action_deadline_at: new Date(Date.now() + 36000000).toISOString()
  },
  {
    id: 'm-rec-4',
    display_id: '1001',
    ticket_id: '98399',
    status: 'concluida',
    evaluator_id: 'u2',
    evaluated_id: 'u6',
    score: 48.0,
    created_at: new Date(Date.now() - 14400000).toISOString(),
    action_deadline_at: new Date().toISOString()
  }
] as any[];

interface QualityDashboardProps {
  isCustomizing?: boolean;
  activeEditingId?: string | null;
  setActiveEditingId?: (id: string | null) => void;
}

export default function QualityDashboard({
  isCustomizing = false,
  activeEditingId,
  setActiveEditingId
}: QualityDashboardProps) {
  let dashboardData: any = {
    user: null,
    monitorias: [],
    users: [],
    teams: [],
    forms: [],
    dissatisfactionFields: [],
    globalAvg: 0
  };

  try {
    const context = useDashboard();
    if (context) {
      dashboardData = context;
    }
  } catch (e) {
    // safe fallback when outside DashboardProvider (e.g. customization preview)
  }

  const { user, monitorias, users, teams, forms, dissatisfactionFields, globalAvg } = dashboardData;
  const { config, getLevelForScore, isAboveTarget } = useQualityConfig();
  const [comparativeData, setComparativeData] = useState<any[]>([]);

  // Strict RBAC scope filter: evaluator_id === user.id
  const myMonitorias = useMemo(() => {
    if (isCustomizing) return [];
    return monitorias.filter((m: any) => m.evaluator_id === user?.id);
  }, [isCustomizing, monitorias, user]);

  // Fallback mode trigger: if monitorias is empty, inject high-fidelity mock data
  const useFallback = useMemo(() => {
    return isCustomizing || myMonitorias.length === 0;
  }, [isCustomizing, myMonitorias]);

  const scoredMonitorias = useMemo(() => {
    if (useFallback) return [];
    return myMonitorias.filter((m: any) => m.score !== undefined && m.score !== null);
  }, [useFallback, myMonitorias]);

  // Nota Média Individual (SIMPLE average)
  const avgScore = useMemo(() => {
    if (useFallback) return 86.15;
    return scoredMonitorias.length > 0
      ? scoredMonitorias.reduce((a: number, m: any) => a + (m.score || 0), 0) / scoredMonitorias.length
      : 0;
  }, [useFallback, scoredMonitorias]);

  // Nota Média Geral (puxada do globalAvg no DashboardContext)
  const globalAvgScore = useMemo(() => {
    if (useFallback) return 82.4;
    return typeof globalAvg === 'number' ? globalAvg : 82.4;
  }, [useFallback, globalAvg]);

  // Monitorias que sofreram contestação do time
  const contestedMyMonitorias = useMemo(() => {
    if (useFallback) return [];
    return myMonitorias.filter((m: any) =>
      m.history?.some((h: any) => isContestationAction(h.action))
    );
  }, [useFallback, myMonitorias]);

  // Reavaliações Aprovadas (Nota alterada — conta apenas pelo ÚLTIMO desfecho)
  const reavAccepted = useMemo(() => {
    if (useFallback) return 3;
    return contestedMyMonitorias.filter((m: any) => {
      const resolutions = (m.history || []).filter((h: any) =>
        isApprovalAction(h.action) || isRejectionAction(h.action)
      );
      if (resolutions.length === 0) return false;
      return isApprovalAction(resolutions[resolutions.length - 1].action);
    }).length;
  }, [useFallback, contestedMyMonitorias]);

  // Reavaliações Recusadas (Nota mantida — conta apenas pelo ÚLTIMO desfecho)
  const reavRejected = useMemo(() => {
    if (useFallback) return 5;
    return contestedMyMonitorias.filter((m: any) => {
      const resolutions = (m.history || []).filter((h: any) =>
        isApprovalAction(h.action) || isRejectionAction(h.action)
      );
      if (resolutions.length === 0) return false;
      return isRejectionAction(resolutions[resolutions.length - 1].action);
    }).length;
  }, [useFallback, contestedMyMonitorias]);

  // Taxa de Reversão Individual
  const reversionRate = useMemo(() => {
    const totalContested = reavAccepted + reavRejected;
    if (totalContested === 0) return 0;
    return (reavAccepted / totalContested) * 100;
  }, [reavAccepted, reavRejected]);

  // Volumetria Diária calculation
  useEffect(() => {
    if (useFallback) return;
    async function calculateComparativeData() {
      try {
        const days: Record<string, { meuVolume: number; teamTotal: number; activeAuditors: Set<string> }> = {};
        
        monitorias.forEach((m: any) => {
          const date = new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
          if (!days[date]) days[date] = { meuVolume: 0, teamTotal: 0, activeAuditors: new Set() };
          
          if (m.evaluator_id === user?.id) {
            days[date].meuVolume += 1;
          }
          days[date].teamTotal += 1;
          if (m.evaluator_id) {
            days[date].activeAuditors.add(m.evaluator_id);
          }
        });

        const chartData = Object.entries(days).map(([name, data]) => ({
          name,
          meuVolume: data.meuVolume,
          mediaEquipe: data.activeAuditors.size > 0
            ? Number((data.teamTotal / data.activeAuditors.size).toFixed(2))
            : 0
        })).sort((a, b) => {
          const [da, ma] = a.name.split('/').map(Number);
          const [db, mb] = b.name.split('/').map(Number);
          return ma !== mb ? ma - mb : da - db;
        });

        setComparativeData(chartData);
      } catch (e) {
        console.error("Failed to calculate comparative data", e);
      }
    }
    calculateComparativeData();
  }, [useFallback, monitorias, user]);

  const resolvedComparativeData = useMemo(() => {
    if (useFallback) return mockComparativeData;
    return comparativeData;
  }, [useFallback, comparativeData]);

  // Distribuição por Equipes (INJETAR: Gráfico de rosca exibindo proporcionalidade de monitorias realizadas por ele)
  const teamsDistribution = useMemo(() => {
    if (useFallback) return [
      { name: 'Equipe Alpha', value: 25, color: '#3B82F6' },
      { name: 'Equipe Beta', value: 15, color: '#10B981' },
      { name: 'Equipe Gamma', value: 8, color: '#F59E0B' }
    ];
    const teamCounts: Record<string, number> = {};
    myMonitorias.forEach((m: any) => {
      if (m.team_id) {
        teamCounts[m.team_id] = (teamCounts[m.team_id] || 0) + 1;
      }
    });
    const COLORS = chartColorArray();
    return Object.entries(teamCounts).map(([teamId, count], index) => {
      const teamObj = teams?.find((t: any) => t.id === teamId);
      return {
        name: teamObj?.name || `Equipe ${teamId.substring(0, 4)}`,
        value: count,
        color: COLORS[index % COLORS.length]
      };
    }).filter(d => d.value > 0);
  }, [useFallback, myMonitorias, teams]);

  // Minha Curva de Qualidade (Distribuição por Nível)
  const gradeDistribution = useMemo(() => {
    if (useFallback) return mockDistributionData;
    const colorMap = chartColorMap();

    return config.levels.map(level => ({
      name: `${level.label} (${level.minScore}-${level.maxScore}%)`,
      value: myMonitorias.filter((m: any) => m.score >= level.minScore && m.score <= level.maxScore).length,
      color: colorMap[level.color] || '#94a3b8'
    })).filter(d => d.value > 0);
  }, [useFallback, config.levels, myMonitorias]);

  // Precisão da Qualidade (Estáveis vs Reavaliadas)
  const totalReevaluated = useMemo(() => {
    if (useFallback) return 6;
    return myMonitorias.filter((m: any) => 
      ['contestacao_aceita', 'finalizada_alterada'].includes(m.status) ||
      m.history?.some((h: any) => 
        h.action.toLowerCase().includes('reavaliada') ||
        h.action.toLowerCase().includes('procedente') ||
        h.action.toLowerCase().includes('alterada')
      )
    ).length;
  }, [useFallback, myMonitorias]);

  const precisionData = useMemo(() => {
    if (useFallback) return mockPrecisionData;
    const totalVal = myMonitorias.length;
    return [
      { name: 'Estáveis', value: totalVal - totalReevaluated, color: chartPalette().excelente },
      { name: 'Reavaliadas', value: totalReevaluated, color: chartPalette().atencao }
    ].filter(d => d.value > 0);
  }, [useFallback, myMonitorias, totalReevaluated]);

  // Insatisfação — Visão do Cliente
  const clientDissatisfactionData = useMemo(() => {
    if (useFallback) return mockClientDissatisfaction;
    if (!dissatisfactionFields || dissatisfactionFields.length === 0) return [];
    const COLORS = chartColorArray();
    const monWithAnswers = myMonitorias.filter((m: any) => m.dissatisfaction_answers && Object.keys(m.dissatisfaction_answers).length > 0);
    const clientFields = dissatisfactionFields.filter((f: any) => f.type === 'cliente');

    const freq: Record<string, number> = {};
    monWithAnswers.forEach((m: any) => {
      clientFields.forEach((f: any) => {
        const answers = m.dissatisfaction_answers?.[f.id] || [];
        answers.forEach((opt: string) => { freq[opt] = (freq[opt] || 0) + 1; });
      });
    });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }));
  }, [useFallback, myMonitorias, dissatisfactionFields]);

  // Insatisfação — Visão da Qualidade
  const qualityDissatisfactionData = useMemo(() => {
    if (useFallback) return mockQualityDissatisfaction;
    if (!dissatisfactionFields || dissatisfactionFields.length === 0) return [];
    const COLORS = chartColorArray();
    const monWithAnswers = myMonitorias.filter((m: any) => m.dissatisfaction_answers && Object.keys(m.dissatisfaction_answers).length > 0);
    const qualityFields = dissatisfactionFields.filter((f: any) => f.type === 'qualidade');

    const freq: Record<string, number> = {};
    monWithAnswers.forEach((m: any) => {
      qualityFields.forEach((f: any) => {
        const answers = m.dissatisfaction_answers?.[f.id] || [];
        answers.forEach((opt: string) => { freq[opt] = (freq[opt] || 0) + 1; });
      });
    });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }));
  }, [useFallback, myMonitorias, dissatisfactionFields]);

  // SLA e Volume calculations
  const pendingActions = useMemo(() => {
    if (useFallback) return 2;
    return myMonitorias.filter((m: any) => m.status === 'em_contestacao').length;
  }, [useFallback, myMonitorias]);

  const myMonitoriasCount = useMemo(() => {
    if (useFallback) return 48;
    return myMonitorias.length;
  }, [useFallback, myMonitorias]);

  // Fila 1: Monitorias em Andamento (all open processes under current monitor)
  // Regra: evaluator_id === user.id (inherent to myMonitorias) AND status !== 'concluida' && status !== 'arquivada'
  // Drafts ('rascunho') and signature states ('pendente_assinatura') must be included
  const monitoriasEmAndamento = useMemo(() => {
    const filterFn = (m: any) => m.status !== 'concluida' && m.status !== 'arquivada';
    if (useFallback) {
      return mockMonitoriasDeadlines.filter(filterFn);
    }
    return myMonitorias.filter(filterFn);
  }, [useFallback, myMonitorias]);

  // Fila 2: Ações Expirando (critical contestations in active dispute/re-review)
  // Regra: evaluator_id === user.id (inherent to myMonitorias) AND (status === 'em_contestacao' || status === 'reavaliacao_pendente' || status === 'reavaliacao_solicitada')
  // Sort by action_deadline_at ascending (most imminent deadline at the top)
  const acoesExpirando = useMemo(() => {
    const filterFn = (m: any) => m.status === 'em_contestacao' || m.status === 'reavaliacao_pendente' || m.status === 'reavaliacao_solicitada';
    const sortFn = (a: any, b: any) => {
      const timeA = a.action_deadline_at ? new Date(a.action_deadline_at).getTime() : Infinity;
      const timeB = b.action_deadline_at ? new Date(b.action_deadline_at).getTime() : Infinity;
      return timeA - timeB;
    };
    if (useFallback) {
      return mockMonitoriasDeadlines.filter(filterFn).sort(sortFn);
    }
    return myMonitorias.filter(filterFn).sort(sortFn);
  }, [useFallback, myMonitorias]);

  // Diffs versus Quality Config Targets
  const scoreDiff = avgScore - config.targetScore;
  const diffSign = scoreDiff >= 0 ? '↑' : '↓';
  const diffColorClass = scoreDiff >= 0
    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
    : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400';

  const globalDiff = globalAvgScore - config.targetScore;
  const globalDiffSign = globalDiff >= 0 ? '↑' : '↓';
  const globalDiffColorClass = globalDiff >= 0
    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
    : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400';

  const volDiff = myMonitoriasCount - config.targetVolume;
  const volSign = volDiff >= 0 ? '↑' : '↓';
  const volColorClass = volDiff >= 0
    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
    : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400';

  const revDiff = reversionRate - config.targetReversalRate;
  const revSign = revDiff <= 0 ? '↓' : '↑'; // Lower is better
  const revColorClass = revDiff <= 0
    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
    : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400';

  return (
    <div className="space-y-6 animate-fade-in min-w-0 overflow-visible">

      {/* LINHA 1 (Foco Operacional e Ação Crítica - lg:grid-cols-4 gap-6) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Minhas Pendências"
          value={pendingActions}
          sub="Aguardando reanálise"
          good={pendingActions === 0}
          icon={pendingActions === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          accent={pendingActions === 0 ? 'text-functional-success' : 'text-functional-error'}
          isCustomizing={isCustomizing}
          profile="qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Meu Volume"
          value={myMonitoriasCount}
          sub="no período"
          good={volDiff >= 0}
          icon={<ClipboardCheck className="w-5 h-5" />}
          accent={volDiff >= 0 ? 'text-functional-success' : 'text-functional-error'}
          badge={
            <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${volColorClass}`}>
              {volSign} {Math.abs(volDiff)}
            </span>
          }
          isCustomizing={isCustomizing}
          profile="qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Nota Média Individual"
          value={`${avgScore.toFixed(2)}%`}
          sub="Sua média simples"
          good={isAboveTarget(avgScore)}
          icon={<Target className="w-5 h-5" />}
          accent="text-slate-500"
          badge={
            <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${diffColorClass}`}>
              {diffSign} {Math.abs(scoreDiff).toFixed(2)}%
            </span>
          }
          isCustomizing={isCustomizing}
          profile="qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Nota Média Geral"
          value={`${globalAvgScore.toFixed(2)}%`}
          sub="Régua comparativa global"
          good={isAboveTarget(globalAvgScore)}
          icon={<Award className="w-5 h-5" />}
          accent="text-slate-500"
          badge={
            <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${globalDiffColorClass}`}>
              {globalDiffSign} {Math.abs(globalDiff).toFixed(2)}%
            </span>
          }
          isCustomizing={isCustomizing}
          profile="qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      {/* LINHA 2 (Métricas de Contestação e Calibração - lg:grid-cols-4 gap-6) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Reav. Recebidas"
          value={reavAccepted + reavRejected}
          sub="Volume de contestações"
          good={true}
          icon={<History className="w-5 h-5" />}
          accent="text-slate-500"
          isCustomizing={isCustomizing}
          profile="qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Reav. Aprovadas"
          value={reavAccepted}
          sub="Procedentes (Nota alterada)"
          good={true}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="text-functional-success"
          isCustomizing={isCustomizing}
          profile="qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Reav. Recusadas"
          value={reavRejected}
          sub="Improcedentes (Nota mantida)"
          good={true}
          icon={<XCircle className="w-5 h-5" />}
          accent="text-functional-error"
          isCustomizing={isCustomizing}
          profile="qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Taxa de Reversão Individual"
          value={`${reversionRate.toFixed(2)}%`}
          sub="Qualidade de monitoramento"
          good={reversionRate <= config.targetReversalRate}
          icon={<Target className="w-5 h-5" />}
          accent={reversionRate <= config.targetReversalRate ? 'text-functional-success' : 'text-functional-error'}
          badge={
            <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${revColorClass}`}>
              {revSign} {Math.abs(revDiff).toFixed(2)}%
            </span>
          }
          isCustomizing={isCustomizing}
          profile="qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      {/* LINHA 3 (Volumetria Isolada - grid-cols-1) */}
      <div className="grid grid-cols-1 gap-6">
        <div className="h-[340px]">
          <ComparativeBarChart
            title="Volumetria Diária"
            subtitle="Comparativo com a média da equipe"
            data={resolvedComparativeData}
            dataKeys={[
              { key: 'meuVolume', name: 'Meu Volume', color: '#6366f1' },
              { key: 'mediaEquipe', name: 'Média Equipe', color: '#2dd4bf' }
            ]}
            isCustomizing={isCustomizing}
            profile="qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* LINHA 4 (Filas e Prazos Operacionais - Lado a Lado - lg:grid-cols-2 gap-6) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-[340px]">
          <ActionDeadlineWidget
            title="Monitorias em Andamento"
            monitorias={monitoriasEmAndamento}
            preFilteredSorted={true}
            isCustomizing={isCustomizing}
            profile="qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
        <div className="h-[340px]">
          <ActionDeadlineWidget
            title="Ações Expirando"
            monitorias={acoesExpirando}
            preFilteredSorted={true}
            isCustomizing={isCustomizing}
            profile="qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* LINHA 5 (O Gráfico de Critérios Amplo - grid-cols-1) */}
      <div className="grid grid-cols-1 gap-6">
        <div className="h-[420px]">
          <OfensoresChart 
            title="Maiores Ofensores — Critérios"
            subtitle="Itens que você mais despontuou"
            monitorias={useFallback ? mockMonitoriasOfensores : myMonitorias} 
            forms={useFallback ? mockForms : forms} 
            isCustomizing={isCustomizing}
            profile="qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* LINHA 6 (Distribuição e Calibração - lg:grid-cols-3 gap-6) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="h-[380px]">
          <DistributionChart 
            title="Distribuição por Equipes" 
            data={teamsDistribution} 
            isCustomizing={isCustomizing}
            profile="qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>

        <div className="h-[380px]">
          <DistributionChart 
            title="Minha Curva de Qualidade" 
            data={gradeDistribution} 
            isCustomizing={isCustomizing}
            profile="qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>

        <div className="h-[380px]">
          <DistributionChart 
            title="Precisão da Qualidade" 
            data={precisionData} 
            isCustomizing={isCustomizing}
            profile="qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* LINHA 7 (Visões de Insatisfação Lado a Lado - lg:grid-cols-2 gap-6) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-[380px]">
          <DistributionChart
            title="Insatisfação — Visão do Cliente"
            data={clientDissatisfactionData}
            isCustomizing={isCustomizing}
            profile="qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>

        <div className="h-[380px]">
          <DistributionChart
            title="Insatisfação — Visão da Qualidade"
            data={qualityDissatisfactionData}
            isCustomizing={isCustomizing}
            profile="qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* LINHA 8 (Tabela Base - grid-cols-1) */}
      <div className="overflow-hidden">
        <RecentAuditsTable 
          monitorias={useFallback ? mockRecentMonitorias : myMonitorias} 
          users={users} 
          title="Minhas Auditorias Recentes" 
          isCustomizing={isCustomizing}
        />
      </div>
    </div>
  );
}
