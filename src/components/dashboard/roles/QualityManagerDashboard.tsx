import React from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import DistributionChart from '../widgets/DistributionChart';
import RankingWidget from '../widgets/RankingWidget';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import { Target, ClipboardCheck, RotateCcw, BarChart3 } from 'lucide-react';

export default function QualityManagerDashboard() {
  const { user, monitorias, users } = useDashboard();

  if (!user) return null;

  const completed = monitorias.filter(m => ['concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(m.status));
  const totalAudits = monitorias.length;
  const avgScore = completed.length > 0 ? (completed.reduce((a, m) => a + (m.score || 0), 0) / completed.length) : 0;
  
  const contestations = monitorias.filter(m => m.history.some(h => h.action.includes('Contestação'))).length;
  const reversed = monitorias.filter(m => m.status === 'contestacao_aceita' || m.status === 'finalizada_alterada').length;
  const reversalRate = contestations > 0 ? (reversed / contestations) * 100 : 0;

  // Grade Distribution
  const gradeDistribution = [
    { name: 'Excelente (100%)', value: completed.filter(m => m.score === 100).length, color: '#6366f1' },
    { name: 'Bom (90-99%)', value: completed.filter(m => m.score >= 90 && m.score < 100).length, color: '#10b981' },
    { name: 'Atenção (75-89%)', value: completed.filter(m => m.score >= 75 && m.score < 90).length, color: '#f59e0b' },
    { name: 'Crítico (< 75%)', value: completed.filter(m => m.score < 75).length, color: '#ef4444' },
  ].filter(d => d.value > 0);

  // Trend Chart
  const chartDataMap: Record<string, { total: number, count: number }> = {};
  completed.forEach(m => {
    const key = new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    if (!chartDataMap[key]) chartDataMap[key] = { total: 0, count: 0 };
    chartDataMap[key].total += m.score || 0;
    chartDataMap[key].count++;
  });

  const chartData = Object.entries(chartDataMap)
    .map(([date, d]) => ({ name: date, MediaGlobal: Math.round(d.total / d.count) }))
    .reverse();

  // Auditor Efficiency Ranking
  const auditorMap: Record<string, { total: number; count: number }> = {};
  monitorias.forEach(m => {
    const id = m.evaluator_id;
    if (!auditorMap[id]) auditorMap[id] = { total: 0, count: 0 };
    auditorMap[id].total += m.score || 0; // Using score as placeholder for auditor efficiency metric, could be adapted later
    auditorMap[id].count++;
  });

  const auditorRanking = Object.entries(auditorMap)
    .map(([id, s]) => ({ 
      id, 
      name: users.find(u => u.id === id)?.name || id, 
      score: Math.round(s.total / s.count), 
      count: s.count 
    }))
    .sort((a, b) => b.count - a.count); // Rank by volume

  const topAuditors = auditorRanking.slice(0, 5);

  // Agent Rankings
  const agentMap: Record<string, { total: number; count: number }> = {};
  completed.forEach(m => {
    const id = m.evaluated_id;
    if (!agentMap[id]) agentMap[id] = { total: 0, count: 0 };
    agentMap[id].total += m.score || 0;
    agentMap[id].count++;
  });

  const agentRankingData = Object.entries(agentMap)
    .map(([id, s]) => ({ 
      id, 
      name: users.find(u => u.id === id)?.name || id, 
      score: Math.round(s.total / s.count), 
      count: s.count 
    }))
    .sort((a, b) => b.score - a.score);

  const topAgents = agentRankingData.slice(0, 5);
  const bottomAgents = [...agentRankingData].filter(a => a.score < 100).sort((a, b) => a.score - b.score).slice(0, 5);


  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Média Global" 
          value={`${avgScore.toFixed(1)}%`} 
          sub={avgScore >= 75 ? 'Qualidade sustentada' : 'Abaixo da meta'} 
          good={avgScore >= 75} 
          icon={<Target className="w-5 h-5" />} 
          accent={avgScore >= 75 ? 'text-emerald-600' : 'text-red-600'} 
        />
        <StatCard 
          title="Volume Auditado" 
          value={totalAudits} 
          sub="auditorias no período" 
          good={true} 
          icon={<ClipboardCheck className="w-5 h-5" />} 
          accent="text-blue-600" 
        />
        <StatCard 
          title="Taxa de Reversão Global" 
          value={`${reversalRate.toFixed(1)}%`} 
          sub="sobre o total de contestações" 
          good={reversalRate <= 20} 
          icon={<RotateCcw className="w-5 h-5" />} 
          accent={reversalRate <= 20 ? 'text-emerald-600' : 'text-red-600'} 
        />
        <StatCard 
          title="Consistência" 
          value={`${gradeDistribution.find(d => d.name.includes('Excelente')) ? Math.round((gradeDistribution.find(d => d.name.includes('Excelente'))!.value / (completed.length || 1)) * 100) : 0}%`} 
          sub="avaliações com nota 100" 
          good={true} 
          icon={<BarChart3 className="w-5 h-5" />} 
          accent="text-indigo-600" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TrendChart 
            title="Evolução da Qualidade (Global)" 
            subtitle="Nota média de todas as operações por dia" 
            data={chartData} 
            dataKeys={[
              { key: 'MediaGlobal', name: 'Média Global', color: '#6366f1' }
            ]} 
          />
        </div>
        <div>
          <DistributionChart 
            title="Distribuição de Qualidade" 
            data={gradeDistribution} 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <RankingWidget title="Produtividade (Auditores)" items={topAuditors} type="top" />
        <RankingWidget title="Top Agentes" items={topAgents} type="top" />
        <RankingWidget title="Oportunidades de Melhoria (Agentes)" items={bottomAgents} type="bottom" />
      </div>

      <RecentAuditsTable monitorias={monitorias} users={users} />
    </div>
  );
}
