import React, { useMemo } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import DistributionChart from '../widgets/DistributionChart';
import RankingWidget from '../widgets/RankingWidget';
import SlaWidget from '../widgets/SlaWidget';
import OfensoresChart from '../widgets/OfensoresChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import { Target, ClipboardCheck, AlertTriangle, TrendingUp, RotateCcw, CheckCircle2, XCircle, Users } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';

export default function QualityManagerDashboard() {
  const { user, monitorias, users, forms } = useDashboard();
  const { config, getLevelForScore, isAboveTarget } = useQualityConfig();

  // --- Scored monitorias (have a score value)
  const scoredMonitorias = useMemo(() =>
    monitorias.filter(m => m.score !== undefined && m.score !== null),
    [monitorias]
  );

  // --- Média Geral: average of all scored monitorias
  const avgScore = useMemo(() =>
    scoredMonitorias.length > 0
      ? scoredMonitorias.reduce((a, m) => a + (m.score || 0), 0) / scoredMonitorias.length
      : 0,
    [scoredMonitorias]
  );

  // --- Monitorias com score abaixo de 75%
  const criticalErrors = useMemo(() => scoredMonitorias.filter(m => (m.score || 0) < 75).length, [scoredMonitorias]);

  // --- Pendentes totais (all statuses requiring action)
  const pendingActions = useMemo(() =>
    monitorias.filter(m =>
      ['pendente_revisao', 'em_contestacao', 'aguardando_gestor_suporte', 'aguardando_gestor_qualidade'].includes(m.status)
    ).length,
    [monitorias]
  );

  // --- Minhas Ações: awaiting quality manager decision
  const pendingMyActions = useMemo(() =>
    monitorias.filter(m => m.status === 'aguardando_gestor_qualidade').length,
    [monitorias]
  );

  // --- Reevaluation metrics (consistent history-based logic)
  const totalContestations = useMemo(() =>
    monitorias.filter(m =>
      m.history?.some(h => h.action.includes('Contestação'))
    ).length,
    [monitorias]
  );

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

  const reavRejected = useMemo(() =>
    monitorias.filter(m =>
      m.history?.some(h =>
        h.action.includes('Improcedente') ||
        h.action.includes('Mantida') ||
        h.action.toLowerCase().includes('negada') ||
        h.action.toLowerCase().includes('recusada')
      )
    ).length,
    [monitorias]
  );

  // Taxa de Reversão: % of contested that had the note changed
  const reversalRate = useMemo(() =>
    totalContestations > 0 ? (reavAccepted / totalContestations) * 100 : 0,
    [totalContestations, reavAccepted]
  );

  // --- Trend Data (score per day, all scored monitorias)
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
      ScoreMedio: Math.round((data.totalScore / data.count) * 100) / 100
    })).sort((a, b) => {
      const [da, ma] = a.name.split('/').map(Number);
      const [db, mb] = b.name.split('/').map(Number);
      return ma !== mb ? ma - mb : da - db;
    });
  }, [scoredMonitorias]);

  // --- Tendência: 2nd half avg vs 1st half avg of period
  const trendPercentage = useMemo(() => {
    if (trendData.length < 2) return 0;
    const mid = Math.floor(trendData.length / 2);
    const avgFirst = trendData.slice(0, mid).reduce((a, b) => a + b.ScoreMedio, 0) / (mid || 1);
    const avgSecond = trendData.slice(mid).reduce((a, b) => a + b.ScoreMedio, 0) / (trendData.length - mid || 1);
    return avgFirst > 0 ? ((avgSecond / avgFirst) - 1) * 100 : 0;
  }, [trendData]);

  // --- Grade Distribution (by config levels)
  const colorMap: Record<string, string> = {
    'text-indigo-700': '#6366f1', 'text-emerald-700': '#10b981',
    'text-amber-700': '#f59e0b',  'text-red-700': '#ef4444',
    'text-purple-700': '#a855f7', 'text-blue-700': '#3b82f6',
  };
  const gradeDistribution = useMemo(() =>
    config.levels
      .map(level => ({
        name: `${level.label} (${level.minScore}-${level.maxScore}%)`,
        value: scoredMonitorias.filter(m => (m.score || 0) >= level.minScore && (m.score || 0) <= level.maxScore).length,
        color: colorMap[level.color] || '#94a3b8'
      }))
      .filter(d => d.value > 0),
    [config.levels, scoredMonitorias]
  );

  // --- Auditor Ranking (by volume)
  const auditorRanking = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    monitorias.forEach(m => {
      const id = m.evaluator_id;
      if (!id) return;
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
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [monitorias, users]);

  // --- Agent Rankings (by avg score — same logic as Admin)
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

  // Top = at or above target (best first)
  const topAgents = agentRanking.filter(a => a.score >= config.targetScore).slice(0, 5);
  // Opportunities = below target, sorted from furthest to closest to target
  const bottomAgents = agentRanking
    .filter(a => a.score < config.targetScore)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  if (!user) return null;

  return (
    <div className="space-y-6 animate-fade-in min-w-0 overflow-hidden">
      <header>
        <h1 className="text-2xl font-black text-brand-primary tracking-tight uppercase">Gestão da Qualidade</h1>
        <p className="text-brand-muted text-sm font-medium mt-1">Visão estratégica e controle da operação de qualidade.</p>
      </header>

      {/* Row 1 — Main KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Média Geral"
          value={`${avgScore.toFixed(2)}%`}
          sub={isAboveTarget(avgScore) ? 'Meta atingida' : 'Abaixo da meta'}
          good={isAboveTarget(avgScore)}
          icon={<Target className="w-5 h-5" />}
          accent={getLevelForScore(avgScore).color}
        />
        <StatCard
          title="Pendentes"
          value={pendingActions}
          sub="Ações abertas no sistema"
          good={pendingActions === 0}
          icon={<Users className="w-5 h-5" />}
          accent="text-blue-600"
        />
        <StatCard
          title="Minhas Ações"
          value={pendingMyActions}
          sub="Aguardando minha decisão"
          good={pendingMyActions === 0}
          icon={<AlertTriangle className="w-5 h-5" />}
          accent="text-error"
        />
        <StatCard
          title="Tendência"
          value={`${trendPercentage >= 0 ? '+' : ''}${trendPercentage.toFixed(2)}%`}
          sub="2ª metade vs 1ª metade do período"
          good={trendPercentage >= 0}
          icon={<TrendingUp className="w-5 h-5" />}
          accent="text-brand-highlight"
        />
      </div>

      {/* Row 2 — Reevaluation KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Taxa de Reversão"
          value={`${reversalRate.toFixed(2)}%`}
          sub="Contestações com nota alterada"
          good={reversalRate <= 15}
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

      {/* Row 3 — Trend chart + Distribution + Auditor Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[300px]">
          <TrendChart
            title="Evolução da Qualidade"
            subtitle="Média global de score por dia"
            data={trendData}
            dataKeys={[{ key: 'ScoreMedio', name: 'Média Global', color: '#6366f1' }]}
          />
        </div>
        <div className="space-y-6">
          <div className="h-[300px]">
            <DistributionChart
              title="Curva de Qualidade"
              data={gradeDistribution}
            />
          </div>
        </div>
      </div>

      {/* Row 4 — Auditor Ranking + SLA Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[320px]">
          <RankingWidget
            title="Ranking de Auditores"
            subtitle="Por volume de auditorias realizadas"
            data={auditorRanking}
          />
        </div>
        <div className="h-[320px]">
          <SlaWidget
            title="Aguardando Minha Ação"
            monitorias={monitorias}
            users={users}
            targetStatus="aguardando_gestor_qualidade"
          />
        </div>
      </div>

      {/* Row 5 — Ofensores + Agent Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-[420px]">
          <OfensoresChart monitorias={monitorias} forms={forms} limit={8} />
        </div>
        <div className="space-y-6">
          <div className="h-[200px]">
            <RankingWidget
              title="Melhores Scores (Agentes)"
              subtitle={`Acima da meta (${config.targetScore}%)`}
              data={topAgents}
            />
          </div>
          <div className="h-[200px]">
            <RankingWidget
              title="Oportunidades (Agentes)"
              subtitle="Mais críticos primeiro"
              data={bottomAgents}
            />
          </div>
        </div>
      </div>

      <RecentAuditsTable monitorias={monitorias} users={users} />
    </div>
  );
}
