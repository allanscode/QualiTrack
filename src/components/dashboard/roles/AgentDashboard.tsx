import React, { useMemo } from 'react';
import { useDashboard } from '../DashboardContext';
import { Monitoria } from '../../../types';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import DistributionChart from '../widgets/DistributionChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import ActionDeadlineWidget from '../widgets/ActionDeadlineWidget';
import OfensoresChart from '../widgets/OfensoresChart';
import { Target, ClipboardCheck, AlertTriangle, TrendingUp, CheckCircle2, XCircle, Users, History } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { chartPalette, chartColorArray } from '../chartColors';

// High-fidelity mock datasets for customization mode
const mockTrendData = [
  { name: '01/05', MeuScore: 84.5, MediaEquipe: 81.5 },
  { name: '05/05', MeuScore: 83.2, MediaEquipe: 82.1 },
  { name: '10/05', MeuScore: 86.1, MediaEquipe: 82.8 },
  { name: '15/05', MeuScore: 87.4, MediaEquipe: 83.5 },
  { name: '20/05', MeuScore: 85.9, MediaEquipe: 84.2 },
  { name: '25/05', MeuScore: 88.2, MediaEquipe: 85.0 }
];

const mockDistributionData = [
  { name: 'Excelente (91-100%)', value: 12, color: '#10B981' },
  { name: 'Aceitável (80-90%)', value: 5, color: '#3B82F6' },
  { name: 'Atenção (60-79%)', value: 1, color: '#F59E0B' },
  { name: 'Ruim (0-59%)', value: 0, color: '#EF4444' }
];

const mockPrecisionData = [
  { name: 'Estáveis', value: 15, color: '#10B981' },
  { name: 'Reavaliadas', value: 3, color: '#F59E0B' }
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

const mockMonitoriasOfensores = [
  { answers: { q1: 'NAO', q2: 'SIM', q3: 'SIM', q4: 'SIM', q5: 'SIM' } },
  { answers: { q1: 'NAO', q2: 'NAO', q3: 'SIM', q4: 'SIM', q5: 'SIM' } },
  { answers: { q1: 'SIM', q2: 'SIM', q3: 'NAO', q4: 'NAO', q5: 'SIM' } }
];

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
];

const mockMonitoriasDeadlines = [
  {
    id: 'm1',
    display_id: '001',
    ticket_id: '10239',
    status: 'pendente_revisao',
    evaluator_name: 'Análise da Qualidade',
    created_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    action_deadline_at: new Date(Date.now() + 8 * 3600 * 1000).toISOString()
  },
  {
    id: 'm2',
    display_id: '002',
    ticket_id: '10482',
    status: 'contestacao_negada',
    evaluator_name: 'Análise da Qualidade',
    created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    action_deadline_at: new Date(Date.now() + 14 * 3600 * 1000).toISOString()
  },
  {
    id: 'm3',
    display_id: '003',
    ticket_id: '10512',
    status: 'em_contestacao',
    evaluator_name: 'Análise da Qualidade',
    created_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    action_deadline_at: new Date(Date.now() + 20 * 3600 * 1000).toISOString()
  }
];

const mockRecentMonitorias = [
  {
    id: 'm-rec-1',
    display_id: '1004',
    ticket_id: '98431',
    status: 'concluida',
    evaluator_name: 'Análise da Qualidade',
    score: 95.5,
    created_at: new Date().toISOString(),
    action_deadline_at: new Date().toISOString()
  },
  {
    id: 'm-rec-2',
    display_id: '1003',
    ticket_id: '98422',
    status: 'pendente_revisao',
    evaluator_name: 'Análise da Qualidade',
    score: 82.0,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    action_deadline_at: new Date(Date.now() + 72000000).toISOString()
  },
  {
    id: 'm-rec-3',
    display_id: '1002',
    ticket_id: '98415',
    status: 'em_contestacao',
    evaluator_name: 'Análise da Qualidade',
    score: 72.5,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    action_deadline_at: new Date(Date.now() + 36000000).toISOString()
  }
];

interface AgentDashboardProps {
  isCustomizing?: boolean;
  activeEditingId?: string | null;
  setActiveEditingId?: (id: string | null) => void;
}

export default function AgentDashboard({
  isCustomizing = false,
  activeEditingId,
  setActiveEditingId
}: AgentDashboardProps) {
  let dashboardData: any = {
    user: null,
    monitorias: [],
    allMonitorias: [],
    users: [],
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

  const { user, monitorias, allMonitorias, users, forms, dissatisfactionFields, globalAvg } = dashboardData;
  const { config, getLevelForScore, isAboveTarget } = useQualityConfig();

  // --- Only MY monitorias (for personal metrics) - FILTERED BY UI
  const myMonitorias = useMemo(() => {
    if (isCustomizing) return [];
    return monitorias.filter((m: any) => m.evaluated_id === user?.id);
  }, [isCustomizing, monitorias, user]);

  // --- Only MY monitorias (for ActionDeadlineWidget/Pendencies) - UNFILTERED BY UI
  const myAllMonitorias = useMemo(() => {
    if (isCustomizing) return [];
    return allMonitorias.filter((m: any) => m.evaluated_id === user?.id);
  }, [isCustomizing, allMonitorias, user]);

  // --- Anonymized and masked datasets
  const maskedMonitorias = isCustomizing ? mockRecentMonitorias.map((m: any) => ({
    ...m,
    evaluator_name: 'Análise da Qualidade',
    evaluator_id: 'Análise da Qualidade',
  })) : myMonitorias.map((m: any) => ({
    ...m,
    evaluator_name: 'Análise da Qualidade',
    evaluator_id: 'Análise da Qualidade',
  }));

  const maskedAllMonitorias = isCustomizing ? mockMonitoriasDeadlines.map((m: any) => ({
    ...m,
    evaluator_name: 'Análise da Qualidade',
    evaluator_id: 'Análise da Qualidade',
  })) : myAllMonitorias.map((m: any) => ({
    ...m,
    evaluator_name: 'Análise da Qualidade',
    evaluator_id: 'Análise da Qualidade',
  }));

  const maskedUsers = users.map((u: any) => {
    if (['admin', 'gestor_qualidade', 'qualidade'].includes(u.role)) {
      return { ...u, name: 'Análise da Qualidade' };
    }
    return u;
  });
  
  // --- Team Data (for comparison)
  const teamMonitorias = useMemo(() => {
    if (isCustomizing) return [];
    const myInfo = users.find((u: any) => u.id === user?.id);
    let myTeamIds = myInfo?.team_ids || user?.team_ids || [];
    
    if (myTeamIds.length === 0) {
      const fromRecords = allMonitorias.filter((m: any) => m.evaluated_id === user?.id && m.team_id).map((m: any) => m.team_id!);
      myTeamIds = Array.from(new Set(fromRecords));
    }

    return monitorias.filter((m: any) => m.team_id && myTeamIds.includes(m.team_id));
  }, [isCustomizing, monitorias, user, users, allMonitorias]);

  // --- Minha Média (follows all filters)
  const avgScore = useMemo(() => {
    if (isCustomizing) return 85.5;
    return myMonitorias.length > 0 ? (myMonitorias.reduce((a: number, m: any) => a + (m.score || 0), 0) / myMonitorias.length) : 0;
  }, [isCustomizing, myMonitorias]);

  // --- Média das Minhas Equipes (Follows filters, but specifically for teams the agent is part of)
  const teamAvgScore = useMemo(() => {
    if (isCustomizing) return 81.2;
    return teamMonitorias.length > 0 ? (teamMonitorias.reduce((a: number, m: any) => a + (m.score || 0), 0) / teamMonitorias.length) : 0;
  }, [isCustomizing, teamMonitorias]);

  // --- Contestation Metrics
  const myContestations = useMemo(() => {
    if (isCustomizing) return [];
    return myMonitorias.filter((m: any) => 
      m.history?.some((h: any) => 
        h.action.includes('Contestação') ||
        h.action.toLowerCase().includes('contestou') ||
        h.action.toLowerCase().includes('solicitou reavaliação')
      )
    );
  }, [isCustomizing, myMonitorias]);

  const contestationsApproved = useMemo(() => {
    if (isCustomizing) return 2;
    return myContestations.filter((m: any) => 
      m.status === 'contestacao_aceita' || 
      m.status === 'finalizada_alterada' ||
      m.history?.some((h: any) =>
        h.action.toLowerCase().includes('procedente') ||
        h.action.toLowerCase().includes('alterada') ||
        h.action.toLowerCase().includes('aceita') ||
        h.action.toLowerCase().includes('alterado') ||
        h.action.toLowerCase().includes('reavaliada')
      )
    ).length;
  }, [isCustomizing, myContestations]);

  const contestationsRejected = useMemo(() => {
    if (isCustomizing) return 2;
    return myContestations.filter((m: any) => 
      m.status === 'contestacao_negada' ||
      m.history?.some((h: any) =>
        h.action.includes('Improcedente') ||
        h.action.includes('Mantida') ||
        h.action.toLowerCase().includes('negada') ||
        h.action.toLowerCase().includes('recusada') ||
        h.action.toLowerCase().includes('mantida')
      )
    ).length;
  }, [isCustomizing, myContestations]);

  const reversionRate = useMemo(() => {
    const totalContested = contestationsApproved + contestationsRejected;
    if (totalContested === 0) return 0;
    return (contestationsApproved / totalContested) * 100;
  }, [contestationsApproved, contestationsRejected]);

  const revDiff = reversionRate - config.targetReversalRate;
  const revSign = revDiff >= 0 ? '↑' : '↓';
  const revColorClass = revDiff >= 0
    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
    : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400';

  // --- Trend Data (Agent vs Team)
  const trendData = useMemo(() => {
    if (isCustomizing) return mockTrendData;
    const days: Record<string, { myTotal: number, myCount: number, teamTotal: number, teamCount: number }> = {};
    
    // Process My Scores
    myMonitorias.forEach((m: any) => {
      const date = new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (!days[date]) days[date] = { myTotal: 0, myCount: 0, teamTotal: 0, teamCount: 0 };
      days[date].myTotal += m.score || 0;
      days[date].myCount += 1;
    });

    // Process Team Scores
    teamMonitorias.forEach((m: any) => {
      const date = new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (!days[date]) days[date] = { myTotal: 0, myCount: 0, teamTotal: 0, teamCount: 0 };
      days[date].teamTotal += m.score || 0;
      days[date].teamCount += 1;
    });

    return Object.entries(days).map(([name, data]) => ({
      name,
      MeuScore: data.myCount > 0 ? Math.round((data.myTotal / data.myCount) * 100) / 100 : undefined,
      MediaEquipe: data.teamCount > 0 ? Math.round((data.teamTotal / data.teamCount) * 100) / 100 : undefined
    })).sort((a, b) => {
      const [da, ma] = a.name.split('/').map(Number);
      const [db, mb] = b.name.split('/').map(Number);
      return ma !== mb ? ma - mb : da - db;
    });
  }, [isCustomizing, myMonitorias, teamMonitorias]);

  // --- Total Pendentes: Monitorias aguardando ação do agente (Ciente ou Re-contestação)
  const pendingCount = isCustomizing ? 2 : myAllMonitorias.filter((m: any) => ['pendente_revisao', 'contestacao_negada'].includes(m.status)).length;

  const level = getLevelForScore(avgScore);

  const scoreDiff = avgScore - config.targetScore;
  const diffSign = scoreDiff >= 0 ? '↑' : '↓';
  const diffColorClass = scoreDiff >= 0
    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
    : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400';

  const myMonitoriasCount = isCustomizing ? 18 : myMonitorias.length;

  const volDiff = myMonitoriasCount - config.targetVolume;
  const volSign = volDiff >= 0 ? '↑' : '↓';
  const volColorClass = volDiff >= 0
    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
    : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400';

  const myContestationsCount = isCustomizing ? 4 : myContestations.length;

  // --- Fila 1: Contestações Ativas
  const contestacoesAtivas = useMemo(() => {
    const filterFn = (m: any) => ['em_contestacao', 'aguardando_gestor_suporte', 'aguardando_gestor_qualidade'].includes(m.status);
    return maskedAllMonitorias
      .filter(filterFn)
      .sort((a: any, b: any) => {
        const timeA = a.action_deadline_at ? new Date(a.action_deadline_at).getTime() : Infinity;
        const timeB = b.action_deadline_at ? new Date(b.action_deadline_at).getTime() : Infinity;
        return timeA - timeB;
      });
  }, [maskedAllMonitorias]);

  // --- Fila 2: Prazos para Contestar
  const prazosParaContestar = useMemo(() => {
    const filterFn = (m: any) => ['pendente_revisao', 'contestacao_negada'].includes(m.status);
    return maskedAllMonitorias
      .filter(filterFn)
      .sort((a: any, b: any) => {
        const timeA = a.action_deadline_at ? new Date(a.action_deadline_at).getTime() : Infinity;
        const timeB = b.action_deadline_at ? new Date(b.action_deadline_at).getTime() : Infinity;
        return timeA - timeB;
      });
  }, [maskedAllMonitorias]);

  // --- Minha Classificação por Faixas
  const levelsData = useMemo(() => {
    if (isCustomizing) return mockDistributionData;
    const colors = chartPalette();
    return config.levels.map(l => {
      let color = colors.indigo;
      if (l.color.includes('excelente') || l.color.includes('indigo')) color = colors.excelente;
      else if (l.color.includes('aceitavel') || l.color.includes('emerald') || l.color.includes('success') || l.color.includes('green')) color = colors.aceitavel;
      else if (l.color.includes('atencao') || l.color.includes('amber') || l.color.includes('warning') || l.color.includes('yellow')) color = colors.atencao;
      else if (l.color.includes('ruim') || l.color.includes('red') || l.color.includes('error')) color = colors.ruim;
      return {
        name: `${l.label} (${l.minScore}-${l.maxScore}%)`,
        value: myMonitorias.filter((m: Monitoria) => (m.score || 0) >= l.minScore && (m.score || 0) <= l.maxScore).length,
        color
      };
    }).filter(d => d.value > 0);
  }, [isCustomizing, myMonitorias, config.levels]);

  // --- Precisão da Qualidade (Estáveis vs Reavaliadas)
  const totalReevaluated = useMemo(() => {
    if (isCustomizing) return 2;
    return myMonitorias.filter((m: any) => 
      ['contestacao_aceita', 'finalizada_alterada'].includes(m.status) ||
      m.history?.some((h: any) => 
        h.action.toLowerCase().includes('reavaliada') ||
        h.action.toLowerCase().includes('procedente') ||
        h.action.toLowerCase().includes('alterada')
      )
    ).length;
  }, [isCustomizing, myMonitorias]);

  const precisionData = useMemo(() => {
    if (isCustomizing) return mockPrecisionData;
    const totalVal = myMonitorias.length;
    return [
      { name: 'Estáveis', value: totalVal - totalReevaluated, color: chartPalette().excelente },
      { name: 'Reavaliadas', value: totalReevaluated, color: chartPalette().atencao }
    ].filter(d => d.value > 0);
  }, [isCustomizing, myMonitorias, totalReevaluated]);

  // --- Insatisfação — Visão do Cliente
  const clientDissatisfactionData = useMemo(() => {
    if (isCustomizing) return mockClientDissatisfaction;
    const fields = dissatisfactionFields || [];
    if (fields.length === 0) return [];
    const COLORS = chartColorArray();
    const monWithAnswers = myMonitorias.filter((m: any) => m.dissatisfaction_answers && Object.keys(m.dissatisfaction_answers).length > 0);
    const clientFields = fields.filter((f: any) => f.type === 'cliente');

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
  }, [isCustomizing, myMonitorias, dissatisfactionFields]);

  // --- Insatisfação — Visão da Qualidade
  const qualityDissatisfactionData = useMemo(() => {
    if (isCustomizing) return mockQualityDissatisfaction;
    const fields = dissatisfactionFields || [];
    if (fields.length === 0) return [];
    const COLORS = chartColorArray();
    const monWithAnswers = myMonitorias.filter((m: any) => m.dissatisfaction_answers && Object.keys(m.dissatisfaction_answers).length > 0);
    const qualityFields = fields.filter((f: any) => f.type === 'qualidade');

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
  }, [isCustomizing, myMonitorias, dissatisfactionFields]);

  return (
    <div className="space-y-6 animate-fade-in min-w-0 overflow-visible">
      {/* LINHA 1 (lg:grid-cols-4): Benchmarks de Performance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Minhas Pendências"
          value={pendingCount.toString()}
          sub="Aguardando sua ação"
          good={pendingCount === 0}
          icon={pendingCount === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          accent={pendingCount === 0 ? 'text-functional-success' : 'text-functional-error'}
          valueColorClass="text-slate-900 dark:text-slate-50"
          isCustomizing={isCustomizing}
          profile="suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Meu Volume"
          value={myMonitoriasCount.toString()}
          sub="Total no período"
          good={volDiff >= 0}
          icon={<ClipboardCheck className="w-5 h-5" />}
          accent={volDiff >= 0 ? 'text-functional-success' : 'text-functional-error'}
          badge={
            <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${volColorClass}`}>
              {volSign} {Math.abs(volDiff)}
            </span>
          }
          valueColorClass="text-slate-900 dark:text-slate-50"
          isCustomizing={isCustomizing}
          profile="suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Minha Média"
          value={`${avgScore.toFixed(2)}%`}
          sub={level.label}
          good={isAboveTarget(avgScore)}
          icon={<Target className="w-5 h-5" />}
          accent="text-slate-500"
          badge={
            <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${diffColorClass}`}>
              {diffSign} {Math.abs(scoreDiff).toFixed(2)}%
            </span>
          }
          valueColorClass="text-slate-900 dark:text-slate-50"
          isCustomizing={isCustomizing}
          profile="suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Média Equipe"
          value={`${teamAvgScore.toFixed(2)}%`}
          sub={avgScore >= teamAvgScore ? 'Acima da média' : 'Abaixo da média'}
          good={avgScore >= teamAvgScore}
          icon={<Users className="w-5 h-5" />}
          accent="text-slate-500"
          valueColorClass="text-slate-900 dark:text-slate-50"
          isCustomizing={isCustomizing}
          profile="suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      {/* LINHA 2 (lg:grid-cols-4): Volume e Contestações */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Contestações Solicitadas"
          value={myContestationsCount.toString()}
          sub="Total de contestações"
          good={true}
          icon={<History className="w-5 h-5" />}
          accent="text-slate-500"
          valueColorClass="text-slate-900 dark:text-slate-50"
          isCustomizing={isCustomizing}
          profile="suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Contestações Aprovadas"
          value={contestationsApproved.toString()}
          sub="Procedentes (Nota alterada)"
          good={true}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="text-functional-success"
          valueColorClass="text-slate-900 dark:text-slate-50"
          isCustomizing={isCustomizing}
          profile="suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Contestações Recusadas"
          value={contestationsRejected.toString()}
          sub="Improcedentes (Nota mantida)"
          good={true}
          icon={<XCircle className="w-5 h-5" />}
          accent="text-functional-error"
          valueColorClass="text-slate-900 dark:text-slate-50"
          isCustomizing={isCustomizing}
          profile="suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Taxa de Sucesso"
          value={`${reversionRate.toFixed(2)}%`}
          sub="Sucesso de contestações"
          good={reversionRate >= config.targetReversalRate}
          icon={<Target className="w-5 h-5" />}
          accent={reversionRate >= config.targetReversalRate ? 'text-functional-success' : 'text-functional-error'}
          badge={
            <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${revColorClass}`}>
              {revSign} {Math.abs(revDiff).toFixed(2)}%
            </span>
          }
          valueColorClass="text-slate-900 dark:text-slate-50"
          isCustomizing={isCustomizing}
          profile="suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      {/* LINHA 3 (grid-cols-1): Gráfico de Evolução Comparativa (TrendChart) */}
      <div className="grid grid-cols-1 gap-6">
        <div className="h-[380px]">
          <TrendChart 
            data={trendData} 
            title="Evolução Comparativa"
            subtitle="Meu Score vs Média da Equipe"
            dataKeys={[
              { key: 'MeuScore', name: 'Meu Score', color: chartPalette().excelente },
              { key: 'MediaEquipe', name: 'Média Equipe', color: chartPalette().aceitavel }
            ]}
            isCustomizing={isCustomizing}
            profile="suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* LINHA 3B (grid-cols-1): Gráfico de Evolução Semanal (TrendChart) */}
      <div className="grid grid-cols-1 gap-6">
        <div className="h-[380px]">
          <TrendChart 
            data={trendData} 
            title="Evolução Semanal"
            subtitle="Tendência de desempenho ao longo das semanas"
            dataKeys={[
              { key: 'MeuScore', name: 'Meu Score', color: chartPalette().excelente },
              { key: 'MediaEquipe', name: 'Média Equipe', color: chartPalette().aceitavel }
            ]}
            isCustomizing={isCustomizing}
            profile="suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* LINHA 4 (lg:grid-cols-2 gap-6): Filas e Prazos Operacionais - Lado a Lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-[340px]">
          <ActionDeadlineWidget
            title="Contestações Ativas"
            monitorias={contestacoesAtivas}
            preFilteredSorted={true}
            isCustomizing={isCustomizing}
            profile="suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
        <div className="h-[340px]">
          <ActionDeadlineWidget
            title="Prazos para Contestar"
            monitorias={prazosParaContestar}
            preFilteredSorted={true}
            isCustomizing={isCustomizing}
            profile="suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* LINHA 5 (grid-cols-1): Meus Ofensores */}
      <div className="grid grid-cols-1 gap-6">
        <div className="h-[420px]">
          <OfensoresChart 
            monitorias={isCustomizing ? mockMonitoriasOfensores : maskedMonitorias}
            forms={isCustomizing ? mockForms : forms}
            title="Meus Ofensores"
            subtitle="Critérios onde você mais falhou"
            limit={5}
            isCustomizing={isCustomizing}
            profile="suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* LINHA 6 (grid-cols-1 md:grid-cols-3 gap-6): Classificação por Faixas e Visões de Insatisfação */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="h-[340px]">
          <DistributionChart 
            title="Minha Classificação por Faixas"
            data={levelsData}
            isCustomizing={isCustomizing}
            profile="suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
        <div className="h-[340px]">
          <DistributionChart 
            title="Insatisfação — Visão do Cliente"
            data={clientDissatisfactionData}
            isCustomizing={isCustomizing}
            profile="suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
        <div className="h-[340px]">
          <DistributionChart 
            title="Insatisfação — Visão da Qualidade"
            data={qualityDissatisfactionData}
            isCustomizing={isCustomizing}
            profile="suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* LINHA 8 (grid-cols-1): Histórico Recente */}
      <div className="overflow-hidden">
        <RecentAuditsTable 
          monitorias={maskedMonitorias} 
          users={maskedUsers} 
          title="Minhas Auditorias Recentes"
          isCustomizing={isCustomizing}
        />
      </div>
    </div>
  );
}
