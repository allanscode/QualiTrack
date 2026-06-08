import React, { useMemo } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import RankingWidget from '../widgets/RankingWidget';
import ActionDeadlineWidget from '../widgets/ActionDeadlineWidget';
import DistributionChart from '../widgets/DistributionChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import { Target, Users, TrendingUp, AlertTriangle, CheckCircle2, XCircle, ClipboardCheck } from 'lucide-react';

import { useQualityConfig } from '../../../lib/useQualityConfig';
import { isApprovalAction, isRejectionAction, isContestationAction } from '../../../lib/contestation';
import { chartColorArray, chartPalette } from '../chartColors';

// High-fidelity mock datasets for customization mode
const mockTrendData = [
  { name: '01/05', ScoreMedio: 82.3, MeuScore: 84.5, ScoreEquipe: 81.2, MediaEquipe: 81.5 },
  { name: '05/05', ScoreMedio: 84.1, MeuScore: 83.2, ScoreEquipe: 82.5, MediaEquipe: 82.1 },
  { name: '10/05', ScoreMedio: 83.8, MeuScore: 86.1, ScoreEquipe: 83.1, MediaEquipe: 82.8 },
  { name: '15/05', ScoreMedio: 85.2, MeuScore: 87.4, ScoreEquipe: 84.8, MediaEquipe: 83.5 },
  { name: '20/05', ScoreMedio: 86.5, MeuScore: 85.9, ScoreEquipe: 85.2, MediaEquipe: 84.2 },
  { name: '25/05', ScoreMedio: 87.0, MeuScore: 88.2, ScoreEquipe: 86.1, MediaEquipe: 85.0 }
];

const mockTopAgents = [
  { id: '1', name: 'Ana Silva', score: 96.5, count: 12 },
  { id: '2', name: 'Bruno Costa', score: 94.2, count: 10 },
  { id: '3', name: 'Carla Souza', score: 92.8, count: 11 },
  { id: '4', name: 'Daniel Oliveira', score: 91.5, count: 14 },
  { id: '5', name: 'Eduarda Lima', score: 90.1, count: 9 }
];

const mockBottomAgents = [
  { id: '6', name: 'Fabio Santos', score: 71.2, count: 8 },
  { id: '7', name: 'Gabriela Melo', score: 72.5, count: 11 },
  { id: '8', name: 'Hugo Rocha', score: 73.8, count: 9 },
  { id: '9', name: 'Isabela Cruz', score: 74.2, count: 10 },
  { id: '10', name: 'João Alves', score: 74.8, count: 12 }
];

const mockContestationsApproved = [
  { id: '1', name: 'Ana Silva', count: 4 },
  { id: '2', name: 'Bruno Costa', count: 2 },
  { id: '3', name: 'Daniel Oliveira', count: 1 }
];

const mockContestationsRejected = [
  { id: '6', name: 'Fabio Santos', count: 5 },
  { id: '7', name: 'Gabriela Melo', count: 3 },
  { id: '8', name: 'João Alves', count: 2 }
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

interface SupportManagerDashboardProps {
  isCustomizing?: boolean;
  activeEditingId?: string | null;
  setActiveEditingId?: (id: string | null) => void;
}

export default function SupportManagerDashboard({
  isCustomizing = false,
  activeEditingId,
  setActiveEditingId
}: SupportManagerDashboardProps) {
  let dashboardData: any = {
    user: null,
    monitorias: [],
    users: [],
    teams: [],
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

  const { user, monitorias, users, teams, dissatisfactionFields, globalAvg } = dashboardData;
  const { config, getLevelForScore, isAboveTarget } = useQualityConfig();

  // --- Scored monitorias: any monitoria that has been evaluated (has a score)
  // Used for: Média Equipe, Evolução do Score, Rankings
  const scoredMonitorias = useMemo(() => {
    if (isCustomizing) return [];
    return monitorias.filter((m: any) => m.score !== undefined && m.score !== null);
  }, [isCustomizing, monitorias]);

  // --- Média Equipe: average score of all scored monitorias
  const avgScore = useMemo(() => {
    if (isCustomizing) return 84.20;
    return scoredMonitorias.length > 0
      ? scoredMonitorias.reduce((a: number, m: any) => a + (m.score || 0), 0) / scoredMonitorias.length
      : 0;
  }, [isCustomizing, scoredMonitorias]);

  const resolvedGlobalAvg = useMemo(() => {
    if (isCustomizing) return 82.80;
    return globalAvg || 0;
  }, [isCustomizing, globalAvg]);

  // --- Pendentes Agente: awaiting agent acknowledgement
  const pendingAgent = useMemo(() => {
    if (isCustomizing) return 2;
    return monitorias.filter((m: any) => m.status === 'pendente_revisao').length;
  }, [isCustomizing, monitorias]);

  // --- Minhas Ações: awaiting this manager's action
  const pendingManager = useMemo(() => {
    if (isCustomizing) return 1;
    return monitorias.filter((m: any) => m.status === 'aguardando_gestor_suporte').length;
  }, [isCustomizing, monitorias]);

  // --- Reavaliação metrics
  // Monitorias que tiveram pelo menos uma contestação
  const contestedMonitorias = useMemo(() => {
    if (isCustomizing) return [];
    return monitorias.filter((m: any) =>
      m.history?.some((h: any) => isContestationAction(h.action))
    );
  }, [isCustomizing, monitorias]);

  const totalContestations = useMemo(() => {
    if (isCustomizing) return 8;
    return contestedMonitorias.length;
  }, [isCustomizing, contestedMonitorias]);

  // Conta apenas pelo ÚLTIMO desfecho — evita dupla contagem em múltiplas rodadas
  const reavAccepted = useMemo(() => {
    if (isCustomizing) return 1;
    return contestedMonitorias.filter((m: any) => {
      const resolutions = (m.history || []).filter((h: any) =>
        isApprovalAction(h.action) || isRejectionAction(h.action)
      );
      if (resolutions.length === 0) return false;
      return isApprovalAction(resolutions[resolutions.length - 1].action);
    }).length;
  }, [isCustomizing, contestedMonitorias]);

  const reavRejected = useMemo(() => {
    if (isCustomizing) return 7;
    return contestedMonitorias.filter((m: any) => {
      const resolutions = (m.history || []).filter((h: any) =>
        isApprovalAction(h.action) || isRejectionAction(h.action)
      );
      if (resolutions.length === 0) return false;
      return isRejectionAction(resolutions[resolutions.length - 1].action);
    }).length;
  }, [isCustomizing, contestedMonitorias]);

  // Taxa de Reversão: % of contested that had the score changed
  const reversalRate = useMemo(() => {
    if (isCustomizing) return 12.50;
    return totalContestations > 0 ? (reavAccepted / totalContestations) * 100 : 0;
  }, [isCustomizing, totalContestations, reavAccepted]);

  // --- Evolução do Score: average score per day (scored monitorias only)
  const trendData = useMemo(() => {
    if (isCustomizing) return mockTrendData;
    const days: Record<string, { totalScore: number, count: number }> = {};
    scoredMonitorias.forEach((m: any) => {
      const date = new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (!days[date]) days[date] = { totalScore: 0, count: 0 };
      days[date].totalScore += m.score || 0;
      days[date].count += 1;
    });

    return Object.entries(days).map(([name, data]) => ({
      name,
      ScoreEquipe: Math.round((data.totalScore / data.count) * 100) / 100
    })).sort((a, b) => {
      const [da, ma] = a.name.split('/').map(Number);
      const [db, mb] = b.name.split('/').map(Number);
      return ma !== mb ? ma - mb : da - db;
    });
  }, [isCustomizing, scoredMonitorias]);

  // --- Tendência: compares the average of the second half of the period vs the first half.
  const trendPercentage = useMemo(() => {
    if (isCustomizing) return 1.85;
    if (trendData.length < 2) return 0;
    const mid = Math.floor(trendData.length / 2);
    const firstHalf = trendData.slice(0, mid);
    const secondHalf = trendData.slice(mid);
    const avgFirst = firstHalf.reduce((a, b) => a + b.ScoreEquipe, 0) / (firstHalf.length || 1);
    const avgSecond = secondHalf.reduce((a, b) => a + b.ScoreEquipe, 0) / (secondHalf.length || 1);
    return avgFirst > 0 ? ((avgSecond / avgFirst) - 1) * 100 : 0;
  }, [isCustomizing, trendData]);

  // --- Agent Rankings (same logic as Admin/QualityManager)
  const agentRanking = useMemo(() => {
    if (isCustomizing) return [];
    const map: Record<string, { total: number; count: number }> = {};
    scoredMonitorias.forEach((m: any) => {
      const id = m.evaluated_id;
      if (!map[id]) map[id] = { total: 0, count: 0 };
      map[id].total += m.score || 0;
      map[id].count++;
    });
    return Object.entries(map)
      .map(([id, s]) => ({
        id,
        name: users.find((u: any) => u.id === id)?.name || id,
        score: Math.round((s.total / s.count) * 100) / 100,
        count: s.count
      }))
      .sort((a, b) => b.score - a.score);
  }, [isCustomizing, scoredMonitorias, users]);

  // Top = at or above target (best scores first)
  const topAgents = useMemo(() => {
    if (isCustomizing) return mockTopAgents;
    return agentRanking.filter(a => a.score >= config.targetScore).slice(0, 5);
  }, [isCustomizing, agentRanking, config.targetScore]);

  // Opportunities = below target, sorted from furthest to closest to target
  const bottomAgents = useMemo(() => {
    if (isCustomizing) return mockBottomAgents;
    return agentRanking
      .filter(a => a.score < config.targetScore)
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);
  }, [isCustomizing, agentRanking, config.targetScore]);

  // --- Rankings de Contestações (Top 5 Agentes)
  const topApprovedAgents = useMemo(() => {
    if (isCustomizing) return mockContestationsApproved;
    const map: Record<string, number> = {};
    monitorias.forEach((m: any) => {
      const isAccepted = m.status === 'contestacao_aceita' || 
                        m.status === 'finalizada_alterada' ||
                        m.history?.some((h: any) => h.action.toLowerCase().includes('aceita') || h.action.toLowerCase().includes('procedente') || h.action.toLowerCase().includes('alterada'));
      
      if (isAccepted && m.evaluated_id) {
        map[m.evaluated_id] = (map[m.evaluated_id] || 0) + 1;
      }
    });
    return Object.entries(map)
      .map(([id, count]) => ({
        id,
        name: users.find((u: any) => u.id === id)?.name || 'Agente Externo',
        count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [isCustomizing, monitorias, users]);

  const topRejectedAgents = useMemo(() => {
    if (isCustomizing) return mockContestationsRejected;
    const map: Record<string, number> = {};
    monitorias.forEach((m: any) => {
      const isRejected = m.status === 'contestacao_negada' || 
                        m.history?.some((h: any) => h.action.toLowerCase().includes('negada') || h.action.toLowerCase().includes('recusada') || h.action.includes('Improcedente') || h.action.includes('Mantida'));
      
      if (isRejected && m.evaluated_id) {
        map[m.evaluated_id] = (map[m.evaluated_id] || 0) + 1;
      }
    });
    return Object.entries(map)
      .map(([id, count]) => ({
        id,
        name: users.find((u: any) => u.id === id)?.name || 'Agente Externo',
        count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [isCustomizing, monitorias, users]);

  const scoreDiff = avgScore - config.targetScore;
  const diffSign = scoreDiff >= 0 ? '↑' : '↓';
  const diffColorClass = scoreDiff >= 0
    ? 'bg-green-50 text-green-700 dark:bg-green-955/30 dark:text-green-400'
    : 'bg-red-50 text-red-700 dark:bg-red-955/30 dark:text-red-400';

  const revDiff = reversalRate - config.targetReversalRate;
  const revSign = revDiff <= 0 ? '↓' : '↑';
  const revColorClass = revDiff <= 0
    ? 'bg-green-50 text-green-700 dark:bg-green-955/30 dark:text-green-400'
    : 'bg-red-50 text-red-700 dark:bg-red-955/30 dark:text-red-400';

  const monitoriasCountValue = useMemo(() => {
    if (isCustomizing) return 15;
    return monitorias.length;
  }, [isCustomizing, monitorias]);

  return (
    <div className="space-y-6 animate-fade-in min-w-0 overflow-visible">

      {/* Linha 1 — Benchmarks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
        <StatCard
          title="Média Equipe"
          value={`${avgScore.toFixed(2)}%`}
          sub={isAboveTarget(avgScore) ? 'Dentro da meta' : 'Abaixo da meta'}
          good={isAboveTarget(avgScore)}
          icon={<Target className="w-5 h-5" />}
          accent="text-slate-500"
          valueColorClass={avgScore >= config.targetScore ? 'text-functional-success' : 'text-functional-error'}
          badge={
            <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${diffColorClass}`}>
              {diffSign} {Math.abs(scoreDiff).toFixed(2)}%
            </span>
          }
          isCustomizing={isCustomizing}
          profile="gestor_suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Média Global"
          value={`${resolvedGlobalAvg.toFixed(2)}%`}
          sub="Empresa"
          good={avgScore >= resolvedGlobalAvg}
          icon={<Users className="w-5 h-5" />}
          accent="text-slate-500"
          valueColorClass={resolvedGlobalAvg >= config.targetScore ? 'text-functional-success' : 'text-functional-error'}
          isCustomizing={isCustomizing}
          profile="gestor_suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Tendência"
          value={`${trendPercentage >= 0 ? '+' : ''}${trendPercentage.toFixed(1)}%`}
          sub="Evolução no período"
          good={trendPercentage >= 0}
          icon={<TrendingUp className="w-5 h-5" />}
          accent="text-functional-success"
          valueColorClass={trendPercentage >= 0 ? 'text-functional-success' : 'text-functional-error'}
          isCustomizing={isCustomizing}
          profile="gestor_suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Monitorias"
          value={monitoriasCountValue}
          sub="Total do seu time"
          good={true}
          icon={<ClipboardCheck className="w-5 h-5" />}
          accent="text-slate-500"
          isCustomizing={isCustomizing}
          profile="gestor_suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      {/* Linha 2 — Gestão e Ações */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard
          title="Pendentes Agentes"
          value={pendingAgent}
          sub="Aguardando ciência do suporte"
          good={pendingAgent === 0}
          icon={pendingAgent === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          accent={pendingAgent === 0 ? 'text-functional-success' : 'text-functional-warning'}
          valueColorClass={pendingAgent > 0 ? 'text-functional-error' : 'text-functional-success'}
          isCustomizing={isCustomizing}
          profile="gestor_suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Minhas Ações"
          value={pendingManager}
          sub="Aguardando minha decisão"
          good={pendingManager === 0}
          icon={pendingManager === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          accent={pendingManager === 0 ? 'text-functional-success' : 'text-functional-error'}
          valueColorClass={pendingManager > 0 ? 'text-functional-error' : 'text-functional-success'}
          isCustomizing={isCustomizing}
          profile="gestor_suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      {/* Linha 3 — Reavaliações (Contagem Única por Monitoria) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Taxa de Reversão"
          value={`${reversalRate.toFixed(2)}%`}
          sub="Contestações Procedentes"
          good={reversalRate <= config.targetReversalRate}
          icon={<Target className="w-5 h-5" />}
          accent={reversalRate <= config.targetReversalRate ? 'text-functional-success' : 'text-functional-error'}
          valueColorClass={reversalRate <= config.targetReversalRate ? 'text-functional-success' : 'text-functional-error'}
          badge={
            <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${revColorClass}`}>
              {revSign} {Math.abs(revDiff).toFixed(2)}%
            </span>
          }
          isCustomizing={isCustomizing}
          profile="gestor_suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Reav. Solicitadas"
          value={totalContestations}
          sub="Total de contestações"
          good={true}
          icon={<ClipboardCheck className="w-5 h-5" />}
          accent="text-slate-500"
          isCustomizing={isCustomizing}
          profile="gestor_suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Reav. Aceitas"
          value={reavAccepted}
          sub="Nota alterada"
          good={true}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="text-functional-success"
          valueColorClass="text-functional-success"
          isCustomizing={isCustomizing}
          profile="gestor_suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Reav. Recusadas"
          value={reavRejected}
          sub="Nota mantida"
          good={true}
          icon={<XCircle className="w-5 h-5" />}
          accent="text-functional-error"
          valueColorClass="text-functional-error"
          isCustomizing={isCustomizing}
          profile="gestor_suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      {/* Linha 4 — Trend chart (Agora ocupando a linha inteira) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[380px]">
          <TrendChart
            title="Evolução do Score"
            subtitle="Nota média agregada das suas equipes"
            data={trendData}
            dataKeys={[{ key: 'ScoreEquipe', name: 'Média Equipe', color: chartPalette().excelente }]}
            isCustomizing={isCustomizing}
            profile="gestor_suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
        <div className="h-[380px]">
          <ActionDeadlineWidget
            title="Ações Expirando"
            monitorias={isCustomizing ? mockMonitoriasDeadlines : monitorias}
            targetStatus={['pendente_revisao', 'em_contestacao', 'aguardando_gestor_suporte']}
            isCustomizing={isCustomizing}
            profile="gestor_suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* Linha 5 — Rankings de Notas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-[420px]">
          <RankingWidget
            title="Melhores Notas (Time)"
            subtitle={`Agentes acima da meta (${config.targetScore}%)`}
            data={topAgents}
            isCustomizing={isCustomizing}
            profile="gestor_suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
        <div className="h-[420px]">
          <RankingWidget
            title="Oportunidades (Time)"
            subtitle={`Agentes abaixo da meta (${config.targetScore}%)`}
            data={bottomAgents}
            icon={<Target className="w-5 h-5" />}
            accent="text-functional-warning"
            isCustomizing={isCustomizing}
            profile="gestor_suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* Linha 6 — Rankings de Contestações */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-[420px]">
          <RankingWidget
            title="Top Reav. Aceitas"
            subtitle="Agentes com mais notas alteradas"
            data={topApprovedAgents}
            type="count"
            isCustomizing={isCustomizing}
            profile="gestor_suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
        <div className="h-[420px]">
          <RankingWidget
            title="Top Reav. Recusadas"
            subtitle="Agentes com mais notas mantidas"
            data={topRejectedAgents}
            type="count"
            icon={<XCircle className="w-5 h-5" />}
            accent="text-functional-error"
            isCustomizing={isCustomizing}
            profile="gestor_suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* Linha 7 — Insatisfações */}
      {(isCustomizing || (dissatisfactionFields && dissatisfactionFields.length > 0)) && (() => {
        const COLORS = chartColorArray();
        const monWithAnswers = monitorias.filter((m: any) => m.dissatisfaction_answers && Object.keys(m.dissatisfaction_answers).length > 0);

        const clientFields = dissatisfactionFields.filter((f: any) => f.type === 'cliente');
        const qualityFields = dissatisfactionFields.filter((f: any) => f.type === 'qualidade');

        const buildChartData = (fields: typeof dissatisfactionFields) => {
          if (isCustomizing) return [];
          const freq: Record<string, number> = {};
          monWithAnswers.forEach((m: any) => {
            fields.forEach((f: any) => {
              const answers = m.dissatisfaction_answers?.[f.id] || [];
              answers.forEach((opt: string) => { freq[opt] = (freq[opt] || 0) + 1; });
            });
          });
          return Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }));
        };

        const clientData = isCustomizing ? mockClientDissatisfaction : buildChartData(clientFields);
        const qualityData = isCustomizing ? mockQualityDissatisfaction : buildChartData(qualityFields);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-[360px]">
              <DistributionChart
                title="Insatisfação — Visão do Cliente"
                data={clientData}
                isCustomizing={isCustomizing}
                profile="gestor_suporte"
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>
            <div className="h-[360px]">
              <DistributionChart
                title="Insatisfação — Visão da Qualidade"
                data={qualityData}
                isCustomizing={isCustomizing}
                profile="gestor_suporte"
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>
          </div>
        );
      })()}

      <RecentAuditsTable
        monitorias={isCustomizing ? mockRecentMonitorias : monitorias}
        users={users}
      />
    </div>
  );
}
