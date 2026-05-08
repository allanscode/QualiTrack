import React from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import DistributionChart from '../widgets/DistributionChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import SlaWidget from '../widgets/SlaWidget';
import { Target, ClipboardCheck, AlertTriangle, TrendingUp } from 'lucide-react';

export default function AgentDashboard() {
  const { user, monitorias, users, teams } = useDashboard();

  if (!user) return null;

  // Filter completed monitorias for scores
  const completed = monitorias.filter(m => ['concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(m.status));
  const totalAudits = monitorias.length;
  const avgScore = completed.length > 0 ? (completed.reduce((a, m) => a + (m.score || 0), 0) / completed.length) : 0;
  const contestations = monitorias.filter(m => m.history.some(h => h.action.includes('Contestação'))).length;

  // Error distribution
  const errorMap: Record<string, number> = {};
  completed.forEach(m => {
    if (m.question_observations) {
      Object.keys(m.question_observations).forEach(q => {
        if (!errorMap[q]) errorMap[q] = 0;
        errorMap[q]++;
      });
    }
    if (m.critical_error_observations) {
      Object.keys(m.critical_error_observations).forEach(q => {
        const key = `Crítico: ${q}`;
        if (!errorMap[key]) errorMap[key] = 0;
        errorMap[key]++;
      });
    }
  });

  const errorData = Object.entries(errorMap)
    .map(([name, value], i) => ({ 
      name: name.slice(0, 20) + (name.length > 20 ? '...' : ''), 
      value, 
      color: ['#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399'][i % 5] 
    }))
    .sort((a, b) => b.value - a.value).slice(0, 5);

  // Trend Chart (last 7 days by default if filter allows, otherwise aggregates by date)
  const chartDataMap: Record<string, { total: number, count: number, teamTotal: number, teamCount: number }> = {};
  
  // Calculate team average if agent is in a team
  const myTeamIds = user.team_ids || [];
  const teamUsers = users.filter(u => u.team_ids?.some(tid => myTeamIds.includes(tid))).map(u => u.id);
  
  // Get all completed monitorias for the team
  const allTeamCompleted = monitorias.filter(m => 
    teamUsers.includes(m.evaluated_id) && 
    ['concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(m.status)
  );

  allTeamCompleted.forEach(m => {
    const key = new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    if (!chartDataMap[key]) chartDataMap[key] = { total: 0, count: 0, teamTotal: 0, teamCount: 0 };
    chartDataMap[key].teamTotal += m.score || 0;
    chartDataMap[key].teamCount++;
  });

  completed.forEach(m => {
    const key = new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    if (!chartDataMap[key]) chartDataMap[key] = { total: 0, count: 0, teamTotal: 0, teamCount: 0 };
    chartDataMap[key].total += m.score || 0;
    chartDataMap[key].count++;
  });

  const chartData = Object.entries(chartDataMap)
    .map(([date, d]) => ({ 
      name: date, 
      meuScore: d.count > 0 ? Math.round(d.total / d.count) : null,
      mediaEquipe: d.teamCount > 0 ? Math.round(d.teamTotal / d.teamCount) : null
    }))
    .reverse();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Minha Média" 
          value={`${avgScore.toFixed(1)}%`} 
          sub={avgScore >= 75 ? 'Acima da meta' : 'Abaixo da meta'} 
          good={avgScore >= 75} 
          icon={<Target className="w-5 h-5" />} 
          accent={avgScore >= 75 ? 'text-emerald-600' : 'text-red-600'} 
        />
        <StatCard 
          title="Auditorias Recebidas" 
          value={totalAudits} 
          sub="no período" 
          good={true} 
          icon={<ClipboardCheck className="w-5 h-5" />} 
          accent="text-blue-600" 
        />
        <StatCard 
          title="Contestações" 
          value={contestations} 
          sub="solicitadas" 
          good={contestations === 0} 
          icon={<AlertTriangle className="w-5 h-5" />} 
          accent="text-orange-600" 
        />
        <StatCard 
          title="Tendência" 
          value={chartData.length >= 2 ? (chartData[chartData.length - 1].meuScore >= chartData[0].meuScore ? 'Positiva' : 'Negativa') : '—'} 
          sub="comparado ao início" 
          good={chartData.length >= 2 ? chartData[chartData.length - 1].meuScore >= chartData[0].meuScore : true} 
          icon={<TrendingUp className="w-5 h-5" />} 
          accent="text-indigo-600" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TrendChart 
            title="Evolução do Score" 
            subtitle="Sua nota vs Média da Equipe" 
            data={chartData} 
            dataKeys={[
              { key: 'meuScore', name: 'Meu Score', color: '#6366f1' },
              { key: 'mediaEquipe', name: 'Média da Equipe', color: '#9ca3af' }
            ]} 
          />
        </div>
        <div className="space-y-6">
          <DistributionChart 
            title="Principais Oportunidades (Erros)" 
            data={errorData} 
          />
          <SlaWidget 
            title="Aguardando Minha Revisão"
            monitorias={monitorias}
            users={users}
            targetStatus="pendente_revisao"
          />
        </div>
      </div>

      <RecentAuditsTable monitorias={monitorias} users={users} />
    </div>
  );
}
