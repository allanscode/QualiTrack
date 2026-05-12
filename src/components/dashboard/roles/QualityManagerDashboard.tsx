import React, { useMemo } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import DistributionChart from '../widgets/DistributionChart';
import RankingWidget from '../widgets/RankingWidget';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import { Target, ClipboardCheck, Users, AlertTriangle, TrendingUp, RotateCcw, CheckCircle2, XCircle } from 'lucide-react';
import Card from '../../ui/Card';

export default function QualityManagerDashboard() {
  const { user, monitorias, users } = useDashboard();

  const completed = useMemo(() => monitorias.filter(m => ['concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(m.status)), [monitorias]);
  const avgScore = useMemo(() => completed.length > 0 ? (completed.reduce((a, m) => a + (m.score || 0), 0) / completed.length) : 0, [completed]);
  const pendingValidation = useMemo(() => monitorias.filter(m => m.status === 'pendente_validacao').length, [monitorias]);
  const criticalErrors = useMemo(() => completed.filter(m => m.score < 75).length, [completed]);

  const totalContestations = useMemo(() => monitorias.filter(m => m.history.some(h => h.action.includes('Contestação'))).length, [monitorias]);
  const reavAccepted = useMemo(() => monitorias.filter(m => m.status === 'contestacao_aceita' || m.status === 'finalizada_alterada').length, [monitorias]);
  const reavRejected = useMemo(() => monitorias.filter(m => m.status === 'contestacao_negada').length, [monitorias]);
  const reversalRate = useMemo(() => totalContestations > 0 ? (reavAccepted / totalContestations) * 100 : 0, [totalContestations, reavAccepted]);

  // Trend Data Calculation
  const trendData = useMemo(() => {
    const days: Record<string, { totalScore: number, count: number }> = {};
    completed.forEach(m => {
      const date = new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (!days[date]) days[date] = { totalScore: 0, count: 0 };
      days[date].totalScore += m.score || 0;
      days[date].count += 1;
    });

    return Object.entries(days).map(([name, data]) => ({
      name,
      ScoreMedio: Math.round(data.totalScore / data.count)
    })).sort((a, b) => {
      const [da, ma] = a.name.split('/').map(Number);
      const [db, mb] = b.name.split('/').map(Number);
      return ma !== mb ? ma - mb : da - db;
    });
  }, [completed]);

  // Trend Percentage
  const trendPercentage = useMemo(() => {
    if (trendData.length < 2) return 0;
    const mid = Math.floor(trendData.length / 2);
    const firstHalf = trendData.slice(0, mid);
    const secondHalf = trendData.slice(mid);
    const avgFirst = firstHalf.reduce((a, b) => a + b.ScoreMedio, 0) / (firstHalf.length || 1);
    const avgSecond = secondHalf.reduce((a, b) => a + b.ScoreMedio, 0) / (secondHalf.length || 1);
    return avgFirst > 0 ? ((avgSecond / avgFirst) - 1) * 100 : 0;
  }, [trendData]);

  // Grade Distribution
  const gradeDistribution = [
    { name: 'Excelente (100%)', value: completed.filter(m => m.score === 100).length, color: '#6366f1' },
    { name: 'Bom (90-99%)', value: completed.filter(m => m.score >= 90 && m.score < 100).length, color: '#10b981' },
    { name: 'Atenção (75-89%)', value: completed.filter(m => m.score >= 75 && m.score < 90).length, color: '#f59e0b' },
    { name: 'Crítico (< 75%)', value: completed.filter(m => m.score < 75).length, color: '#ef4444' },
  ].filter(d => d.value > 0);

  // Auditor Ranking
  const auditorRanking = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    monitorias.forEach(m => {
      const id = m.evaluator_id;
      if (!map[id]) map[id] = { total: 0, count: 0 };
      map[id].total += m.score || 0;
      map[id].count++;
    });
    return Object.entries(map)
      .map(([id, s]) => ({ 
        id, 
        name: users.find(u => u.id === id)?.name || id, 
        score: Math.round(s.total / s.count), 
        count: s.count 
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [monitorias, users]);

  if (!user) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h1 className="text-2xl font-black text-brand-primary tracking-tight uppercase">Gestão da Qualidade</h1>
        <p className="text-brand-muted text-sm font-medium mt-1">Visão estratégica e controle da operação de qualidade.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Média Geral" 
          value={`${avgScore.toFixed(1)}%`} 
          sub={avgScore >= 85 ? 'Meta atingida' : 'Abaixo da meta'} 
          good={avgScore >= 85} 
          icon={<Target className="w-5 h-5" />} 
          accent="text-brand-accent" 
        />
        <StatCard 
          title="Pendentes" 
          value={pendingValidation} 
          sub="Validação Gestor" 
          good={pendingValidation === 0} 
          icon={<Users className="w-5 h-5" />} 
          accent="text-blue-600" 
        />
        <StatCard 
          title="Alertas Críticos" 
          value={criticalErrors} 
          sub="Monitorias < 75%" 
          good={criticalErrors === 0} 
          icon={<AlertTriangle className="w-5 h-5" />} 
          accent="text-error" 
        />
        <StatCard 
          title="Tendência" 
          value={`${trendPercentage >= 0 ? '+' : ''}${trendPercentage.toFixed(1)}%`} 
          sub="Evolução do score" 
          good={trendPercentage >= 0} 
          icon={<TrendingUp className="w-5 h-5" />} 
          accent="text-brand-highlight" 
        />
      </div>

      {/* Volumetria de Reavaliação Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Taxa de Reversão" 
          value={`${reversalRate.toFixed(1)}%`} 
          sub="Notas alteradas global" 
          good={reversalRate <= 15} 
          icon={<RotateCcw className="w-5 h-5" />} 
          accent="text-brand-highlight" 
        />
        <StatCard 
          title="Reav. Solicitadas" 
          value={totalContestations} 
          sub="Volume total de contestações" 
          good={true} 
          icon={<AlertTriangle className="w-5 h-5" />} 
          accent="text-info" 
        />
        <StatCard 
          title="Reav. Aceitas" 
          value={reavAccepted} 
          sub="Procedentes" 
          good={true} 
          icon={<CheckCircle2 className="w-5 h-5" />} 
          accent="text-success" 
        />
        <StatCard 
          title="Reav. Recusadas" 
          value={reavRejected} 
          sub="Improcedentes" 
          good={true} 
          icon={<XCircle className="w-5 h-5" />} 
          accent="text-error" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[340px]">
          <TrendChart 
            title="Evolução da Qualidade" 
            subtitle="Média global de score por dia"
            data={trendData} 
            dataKeys={[{ key: 'ScoreMedio', name: 'Média Global', color: '#6366f1' }]} 
          />
        </div>
        <div className="space-y-6 h-[340px] overflow-y-auto no-scrollbar">
          <DistributionChart 
            title="Curva de Qualidade" 
            data={gradeDistribution} 
          />
          <RankingWidget 
            title="Ranking de Auditores" 
            subtitle="Por volume de auditorias"
            items={auditorRanking} 
          />
        </div>
      </div>

      <RecentAuditsTable monitorias={monitorias} users={users} />
    </div>
  );
}
