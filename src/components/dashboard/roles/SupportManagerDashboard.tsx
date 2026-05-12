import React, { useMemo } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import RankingWidget from '../widgets/RankingWidget';
import SlaWidget from '../widgets/SlaWidget';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import { Target, Users, TrendingUp, AlertTriangle, RotateCcw, CheckCircle2, XCircle } from 'lucide-react';

import { useQualityConfig } from '../../../lib/useQualityConfig';

export default function SupportManagerDashboard() {
  // monitorias from context are already filtered by date/team/agent/channel from FilterBar
  const { user, monitorias, users, teams } = useDashboard();
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
  // Reav. Solicitadas: monitorias where the agent or support manager contested
  const totalContestations = useMemo(() =>
    monitorias.filter(m =>
      m.history?.some(h =>
        h.action.includes('Contestação') ||
        h.action.toLowerCase().includes('contestou') ||
        h.action.toLowerCase().includes('solicitou reavaliação')
      )
    ).length,
    [monitorias]
  );

  // Reav. Aceitas: note was changed after contest (score altered or explicitly accepted)
  const reavAccepted = useMemo(() =>
    monitorias.filter(m =>
      m.history?.some(h =>
        h.action.includes('Procedente') ||
        h.action.includes('Alterada') ||
        h.action.toLowerCase().includes('aceita') ||
        h.action.toLowerCase().includes('alterado')
      )
    ).length,
    [monitorias]
  );

  // Reav. Recusadas: explicitly rejected/maintained
  const reavRejected = useMemo(() =>
    monitorias.filter(m =>
      m.history?.some(h =>
        h.action.includes('Improcedente') ||
        h.action.includes('Mantida') ||
        h.action.toLowerCase().includes('negada') ||
        h.action.toLowerCase().includes('recusada') ||
        h.action.toLowerCase().includes('mantida')
      )
    ).length,
    [monitorias]
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

  if (!user) return null;

  return (
    <div className="space-y-6 animate-fade-in min-w-0 overflow-hidden">
      <header>
        <h1 className="text-2xl font-black text-brand-primary tracking-tight uppercase">Gestão de Operação</h1>
        <p className="text-brand-muted text-sm font-medium mt-1">Olá, {user.name}. Acompanhe o desempenho das suas equipes.</p>
      </header>

      {/* Row 1 — Main KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Média Equipe"
          value={`${avgScore.toFixed(2)}%`}
          sub={isAboveTarget(avgScore) ? 'Dentro da meta' : 'Abaixo da meta'}
          good={isAboveTarget(avgScore)}
          icon={<Target className="w-5 h-5" />}
          accent={getLevelForScore(avgScore).color}
        />
        <StatCard
          title="Pendentes Agente"
          value={pendingAgent}
          sub="Aguardando ciência do agente"
          good={pendingAgent === 0}
          icon={<Users className="w-5 h-5" />}
          accent="text-warning"
        />
        <StatCard
          title="Minhas Ações"
          value={pendingManager}
          sub="Aguardando minha decisão"
          good={pendingManager === 0}
          icon={<AlertTriangle className="w-5 h-5" />}
          accent="text-error"
        />
        <StatCard
          title="Tendência"
          value={`${trendPercentage >= 0 ? '+' : ''}${trendPercentage.toFixed(2)}%`}
          sub="2ª metade vs 1ª metade do período"
          good={trendPercentage >= 0}
          icon={<TrendingUp className="w-5 h-5" />}
          accent="text-blue-600"
        />
      </div>

      {/* Row 2 — Reevaluation KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Taxa de Reversão"
          value={`${reversalRate.toFixed(2)}%`}
          sub="Contestações com nota alterada"
          good={reversalRate <= 20}
          icon={<RotateCcw className="w-5 h-5" />}
          accent="text-brand-highlight"
        />
        <StatCard
          title="Reav. Solicitadas"
          value={totalContestations}
          sub="Total de contestações abertas"
          good={true}
          icon={<AlertTriangle className="w-5 h-5" />}
          accent="text-info"
        />
        <StatCard
          title="Reav. Aceitas"
          value={reavAccepted}
          sub="Nota alterada (procedentes)"
          good={true}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="text-success"
        />
        <StatCard
          title="Reav. Recusadas"
          value={reavRejected}
          sub="Nota mantida (improcedentes)"
          good={true}
          icon={<XCircle className="w-5 h-5" />}
          accent="text-error"
        />
      </div>

      {/* Row 3 — Trend chart + SLA Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TrendChart
            title="Evolução do Score"
            subtitle="Nota média agregada das suas equipes"
            data={trendData}
            dataKeys={[{ key: 'ScoreEquipe', name: 'Média Equipe', color: '#6366f1' }]}
          />
        </div>
        <div>
          <SlaWidget
            title="Aguardando Minha Ação"
            monitorias={monitorias}
            users={users}
            targetStatus="aguardando_gestor_suporte"
          />
        </div>
      </div>

      {/* Row 4 — Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankingWidget
          title="Top Melhores Notas"
          subtitle={`Agentes acima da meta (${config.targetScore}%)`}
          data={topAgents}
        />
        <RankingWidget
          title="Oportunidades de Melhoria"
          subtitle={`Agentes abaixo da meta — mais críticos primeiro`}
          data={bottomAgents}
        />
      </div>

      <RecentAuditsTable monitorias={monitorias} users={users} />
    </div>
  );
}
