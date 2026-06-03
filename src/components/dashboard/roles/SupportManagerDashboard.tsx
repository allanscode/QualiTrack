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

export default function SupportManagerDashboard() {
  // monitorias from context are already filtered by date/team/agent/channel from FilterBar
  const { user, monitorias, users, teams, dissatisfactionFields } = useDashboard();
  const { config, getLevelForScore, isAboveTarget } = useQualityConfig();

  // --- Scored monitorias: any monitoria that has been evaluated (has a score)
  // Used for: Média Equipe, Evolução do Score, Rankings
  const scoredMonitorias = useMemo(() =>
    monitorias.filter(m => m.score !== undefined && m.score !== null),
    [monitorias]
  );

  // --- Média Equipe: average score of all scored monitorias
  const avgScore = useMemo(() =>
    scoredMonitorias.length > 0
      ? scoredMonitorias.reduce((a, m) => a + (m.score || 0), 0) / scoredMonitorias.length
      : 0,
    [scoredMonitorias]
  );

  const { globalAvg } = useDashboard();

  // --- Pendentes Agente: awaiting agent acknowledgement
  const pendingAgent = useMemo(() =>
    monitorias.filter(m => m.status === 'pendente_revisao').length,
    [monitorias]
  );

  // --- Minhas Ações: awaiting this manager's action
  const pendingManager = useMemo(() =>
    monitorias.filter(m => m.status === 'aguardando_gestor_suporte').length,
    [monitorias]
  );

  // --- Reavaliação metrics
  // Monitorias que tiveram pelo menos uma contestação
  const contestedMonitorias = useMemo(() =>
    monitorias.filter(m =>
      m.history?.some(h => isContestationAction(h.action))
    ),
    [monitorias]
  );

  const totalContestations = contestedMonitorias.length;

  // Conta apenas pelo ÚLTIMO desfecho — evita dupla contagem em múltiplas rodadas
  const reavAccepted = useMemo(() =>
    contestedMonitorias.filter(m => {
      const resolutions = (m.history || []).filter(h =>
        isApprovalAction(h.action) || isRejectionAction(h.action)
      );
      if (resolutions.length === 0) return false;
      return isApprovalAction(resolutions[resolutions.length - 1].action);
    }).length,
    [contestedMonitorias]
  );

  const reavRejected = useMemo(() =>
    contestedMonitorias.filter(m => {
      const resolutions = (m.history || []).filter(h =>
        isApprovalAction(h.action) || isRejectionAction(h.action)
      );
      if (resolutions.length === 0) return false;
      return isRejectionAction(resolutions[resolutions.length - 1].action);
    }).length,
    [contestedMonitorias]
  );

  // Taxa de Reversão: % of contested that had the score changed
  const reversalRate = useMemo(() =>
    totalContestations > 0 ? (reavAccepted / totalContestations) * 100 : 0,
    [totalContestations, reavAccepted]
  );

  // --- Evolução do Score: average score per day (scored monitorias only)
  const trendData = useMemo(() => {
    const days: Record<string, { totalScore: number, count: number }> = {};
    scoredMonitorias.forEach(m => {
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
  }, [scoredMonitorias]);

  // --- Tendência: compares the average of the second half of the period vs the first half.
  // Positive = quality is improving; Negative = quality is declining.
  const trendPercentage = useMemo(() => {
    if (trendData.length < 2) return 0;
    const mid = Math.floor(trendData.length / 2);
    const firstHalf = trendData.slice(0, mid);
    const secondHalf = trendData.slice(mid);
    const avgFirst = firstHalf.reduce((a, b) => a + b.ScoreEquipe, 0) / (firstHalf.length || 1);
    const avgSecond = secondHalf.reduce((a, b) => a + b.ScoreEquipe, 0) / (secondHalf.length || 1);
    return avgFirst > 0 ? ((avgSecond / avgFirst) - 1) * 100 : 0;
  }, [trendData]);

  // --- Agent Rankings (same logic as Admin/QualityManager)
  const agentRanking = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    scoredMonitorias.forEach(m => {
      const id = m.evaluated_id;
      if (!map[id]) map[id] = { total: 0, count: 0 };
      map[id].total += m.score || 0;
      map[id].count++;
    });
    return Object.entries(map)
      .map(([id, s]) => ({
        id,
        name: users.find(u => u.id === id)?.name || id,
        score: Math.round((s.total / s.count) * 100) / 100,
        count: s.count
      }))
      .sort((a, b) => b.score - a.score);
  }, [scoredMonitorias, users]);

  // Top = at or above target (best scores first)
  const topAgents = agentRanking
    .filter(a => a.score >= config.targetScore)
    .slice(0, 5);

  // Opportunities = below target, sorted from furthest to closest to target
  const bottomAgents = agentRanking
    .filter(a => a.score < config.targetScore)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  // --- Rankings de Contestações (Top 5 Agentes)
  const topApprovedAgents = useMemo(() => {
    const map: Record<string, number> = {};
    monitorias.forEach(m => {
      const isAccepted = m.status === 'contestacao_aceita' || 
                        m.status === 'finalizada_alterada' ||
                        m.history?.some(h => h.action.toLowerCase().includes('aceita') || h.action.toLowerCase().includes('procedente') || h.action.toLowerCase().includes('alterada'));
      
      if (isAccepted && m.evaluated_id) {
        map[m.evaluated_id] = (map[m.evaluated_id] || 0) + 1;
      }
    });
    return Object.entries(map)
      .map(([id, count]) => ({
        id,
        name: users.find(u => u.id === id)?.name || 'Agente Externo',
        count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [monitorias, users]);

  const topRejectedAgents = useMemo(() => {
    const map: Record<string, number> = {};
    monitorias.forEach(m => {
      const isRejected = m.status === 'contestacao_negada' || 
                        m.history?.some(h => h.action.toLowerCase().includes('negada') || h.action.toLowerCase().includes('recusada') || h.action.includes('Improcedente') || h.action.includes('Mantida'));
      
      if (isRejected && m.evaluated_id) {
        map[m.evaluated_id] = (map[m.evaluated_id] || 0) + 1;
      }
    });
    return Object.entries(map)
      .map(([id, count]) => ({
        id,
        name: users.find(u => u.id === id)?.name || 'Agente Externo',
        count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [monitorias, users]);

  if (!user) return null;

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

  return (
    <div className="space-y-6 animate-fade-in min-w-0 overflow-hidden">

      {/* Linha 1 — Benchmarks */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Média Equipe"
          value={`${avgScore.toFixed(2)}%`}
          sub={isAboveTarget(avgScore) ? 'Dentro da meta' : 'Abaixo da meta'}
          good={isAboveTarget(avgScore)}
          icon={<Target className="w-5 h-5" />}
          accent="text-slate-500"
          badge={
            <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${diffColorClass}`}>
              {diffSign} {Math.abs(scoreDiff).toFixed(2)}%
            </span>
          }
        />
        <StatCard
          title="Média Global"
          value={`${globalAvg.toFixed(2)}%`}
          sub="Empresa"
          good={avgScore >= globalAvg}
          icon={<Users className="w-5 h-5" />}
          accent="text-slate-500"
        />
        <StatCard
          title="Tendência"
          value={`${trendPercentage >= 0 ? '+' : ''}${trendPercentage.toFixed(1)}%`}
          sub="Evolução no período"
          good={trendPercentage >= 0}
          icon={<TrendingUp className="w-5 h-5" />}
          accent="text-functional-success"
        />
        <StatCard
          title="Monitorias"
          value={monitorias.length}
          sub="Total do seu time"
          good={true}
          icon={<ClipboardCheck className="w-5 h-5" />}
          accent="text-slate-500"
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
        />
        <StatCard
          title="Minhas Ações"
          value={pendingManager}
          sub="Aguardando minha decisão"
          good={pendingManager === 0}
          icon={pendingManager === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          accent={pendingManager === 0 ? 'text-functional-success' : 'text-functional-error'}
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
      badge={
        <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${revColorClass}`}>
          {revSign} {Math.abs(revDiff).toFixed(2)}%
        </span>
      }
    />
        <StatCard
          title="Reav. Solicitadas"
          value={totalContestations}
          sub="Total de contestações"
          good={true}
          icon={<ClipboardCheck className="w-5 h-5" />}
          accent="text-slate-500"
        />
        <StatCard
          title="Reav. Aceitas"
          value={reavAccepted}
          sub="Nota alterada"
          good={true}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="text-functional-success"
        />
        <StatCard
          title="Reav. Recusadas"
          value={reavRejected}
          sub="Nota mantida"
          good={true}
          icon={<XCircle className="w-5 h-5" />}
          accent="text-functional-error"
        />
      </div>

      {/* Linha 4 — Trend chart (Agora ocupando a linha inteira) */}
      <div className="grid grid-cols-1 gap-6">
        <div className="h-[340px]">
          <TrendChart
            title="Evolução do Score"
            subtitle="Nota média agregada das suas equipes"
            data={trendData}
            dataKeys={[{ key: 'ScoreEquipe', name: 'Média Equipe', color: chartPalette().excelente }]}
          />
        </div>
      </div>

      {/* Linha 5 — Rankings de Notas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-[280px]">
          <RankingWidget
            title="Melhores Notas (Time)"
            subtitle={`Agentes acima da meta (${config.targetScore}%)`}
            data={topAgents}
          />
        </div>
        <div className="h-[280px]">
        <RankingWidget
          title="Oportunidades (Time)"
          subtitle={`Agentes abaixo da meta (${config.targetScore}%)`}
          data={bottomAgents}
      icon={<Target className="w-5 h-5" />}
      accent="text-functional-warning"
        />
        </div>
      </div>

      {/* Linha 6 — Rankings de Contestações */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-[280px]">
          <RankingWidget
            title="Top Reav. Aceitas"
            subtitle="Agentes com mais notas alteradas"
            data={topApprovedAgents}
            type="count"
          />
        </div>
        <div className="h-[280px]">
        <RankingWidget
          title="Top Reav. Recusadas"
          subtitle="Agentes com mais notas mantidas"
          data={topRejectedAgents}
          type="count"
          icon={<XCircle className="w-5 h-5" />}
          accent="text-functional-error"
        />
        </div>
      </div>

      {dissatisfactionFields.length > 0 && (() => {
        const COLORS = chartColorArray();
        const monWithAnswers = monitorias.filter(m => m.dissatisfaction_answers && Object.keys(m.dissatisfaction_answers).length > 0);

        const clientFields = dissatisfactionFields.filter(f => f.type === 'cliente');
        const qualityFields = dissatisfactionFields.filter(f => f.type === 'qualidade');

        const buildChartData = (fields: typeof dissatisfactionFields) => {
          const freq: Record<string, number> = {};
          monWithAnswers.forEach(m => {
            fields.forEach(f => {
              const answers = m.dissatisfaction_answers?.[f.id] || [];
              answers.forEach(opt => { freq[opt] = (freq[opt] || 0) + 1; });
            });
          });
          return Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }));
        };

        const clientData = buildChartData(clientFields);
        const qualityData = buildChartData(qualityFields);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-[300px]">
              <DistributionChart title="Insatisfação — Visão do Cliente" data={clientData} />
            </div>
            <div className="h-[300px]">
              <DistributionChart title="Insatisfação — Visão da Qualidade" data={qualityData} />
            </div>
          </div>
        );
      })()}

      <RecentAuditsTable monitorias={monitorias} users={users} />
    </div>
  );
}
