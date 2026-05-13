import React, { useMemo } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import DistributionChart from '../widgets/DistributionChart';
import RankingWidget from '../widgets/RankingWidget';
import SlaWidget from '../widgets/SlaWidget';
import OfensoresChart from '../widgets/OfensoresChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import { Target, ClipboardCheck, AlertTriangle, TrendingUp, RotateCcw, CheckCircle2, XCircle, Users, ShieldCheck, History } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';

export default function AdminDashboard() {
  const { user, monitorias, users, forms } = useDashboard();
  const { config, getLevelForScore, isAboveTarget } = useQualityConfig();

  const scoredMonitorias = useMemo(() =>
    monitorias.filter(m => m.score !== undefined && m.score !== null),
    [monitorias]
  );

  const avgScore = useMemo(() =>
    scoredMonitorias.length > 0
      ? scoredMonitorias.reduce((a, m) => a + (m.score || 0), 0) / scoredMonitorias.length
      : 0,
    [scoredMonitorias]
  );

  const pendingActions = useMemo(() =>
    monitorias.filter(m =>
      ['pendente_revisao', 'em_contestacao', 'aguardando_gestor_suporte', 'aguardando_gestor_qualidade'].includes(m.status)
    ).length,
    [monitorias]
  );

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

  const reversalRate = useMemo(() =>
    totalContestations > 0 ? (reavAccepted / totalContestations) * 100 : 0,
    [totalContestations, reavAccepted]
  );

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

  const trendPercentage = useMemo(() => {
    if (trendData.length < 2) return 0;
    const mid = Math.floor(trendData.length / 2);
    const avgFirst = trendData.slice(0, mid).reduce((a, b) => a + b.ScoreMedio, 0) / (mid || 1);
    const avgSecond = trendData.slice(mid).reduce((a, b) => a + b.ScoreMedio, 0) / (trendData.length - mid || 1);
    return avgFirst > 0 ? ((avgSecond / avgFirst) - 1) * 100 : 0;
  }, [trendData]);

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

  const topAgents = agentRanking.filter(a => a.score >= config.targetScore).slice(0, 5);
  const bottomAgents = agentRanking
    .filter(a => a.score < config.targetScore)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  if (!user) return null;

  return (
    <div className="space-y-6 animate-fade-in min-w-0 overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Média Geral (Admin)"
          value={`${avgScore.toFixed(2)}%`}
          sub="Performance global da operação"
          good={isAboveTarget(avgScore)}
          icon={<Target className="w-5 h-5" />}
          accent={getLevelForScore(avgScore).color}
        />
        <StatCard
          title="Total Pendentes"
          value={pendingActions}
          sub="Ações em todos os perfis"
          good={pendingActions === 0}
          icon={<AlertTriangle className="w-5 h-5" />}
          accent="text-error"
        />
        <StatCard
          title="Usuários Ativos"
          value={users.filter(u => u.active !== false).length}
          sub="Cadastrados no sistema"
          good={true}
          icon={<Users className="w-5 h-5" />}
          accent="text-brand-accent"
        />
        <StatCard
          title="Tendência"
          value={`${trendPercentage >= 0 ? '+' : ''}${trendPercentage.toFixed(2)}%`}
          sub="Evolução global"
          good={trendPercentage >= 0}
          icon={<TrendingUp className="w-5 h-5" />}
          accent="text-brand-highlight"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Reavaliações"
          value={totalContestations}
          sub="Total de contestações"
          good={true}
          icon={<History className="w-5 h-5" />}
          accent="text-info"
        />
        <StatCard
          title="Taxa Reversão"
          value={`${reversalRate.toFixed(2)}%`}
          sub="Qualidade das monitorias"
          good={reversalRate <= 15}
          icon={<RotateCcw className="w-5 h-5" />}
          accent="text-brand-highlight"
        />
        <StatCard
          title="Reav. Aprovadas"
          value={reavAccepted}
          sub="Contestações procedentes"
          good={true}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="text-success"
        />
        <StatCard
          title="Reav. Recusadas"
          value={reavRejected}
          sub="Contestações improcedentes"
          good={true}
          icon={<XCircle className="w-5 h-5" />}
          accent="text-error"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[300px]">
          <TrendChart
            title="Performance Histórica"
            subtitle="Visão administrativa de score global"
            data={trendData}
            dataKeys={[{ key: 'ScoreMedio', name: 'Média Global', color: '#6366f1' }]}
          />
        </div>
        <div className="h-[300px]">
          <DistributionChart
            title="Curva de Qualidade"
            data={gradeDistribution}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="h-[420px] lg:col-span-1">
          <RankingWidget
            title="Melhores Suportes"
            subtitle="Top 5 por score médio"
            data={topAgents}
            type="score"
          />
        </div>
        <div className="h-[420px] lg:col-span-1">
          <RankingWidget
            title="Maiores Ofensores"
            subtitle="Pontos de melhoria"
            data={bottomAgents}
            type="score"
          />
        </div>
        <div className="h-[420px] lg:col-span-1">
          <RankingWidget
            title="Volume por Auditor"
            subtitle="Engajamento na plataforma"
            data={auditorRanking}
            type="count"
          />
        </div>
      </div>

      <div className="h-[420px]">
        <OfensoresChart monitorias={monitorias} forms={forms} limit={12} />
      </div>

      <RecentAuditsTable monitorias={monitorias} users={users} title="Últimas Auditorias do Sistema" />
    </div>
  );
}
