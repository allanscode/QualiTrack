import React, { useState } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import DistributionChart from '../widgets/DistributionChart';
import RankingWidget from '../widgets/RankingWidget';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import SlaWidget from '../widgets/SlaWidget';
import { Users, Target, AlertTriangle, ClipboardCheck } from 'lucide-react';

export default function SupportManagerDashboard() {
  const { user, monitorias, users } = useDashboard();
  const [localFilter, setLocalFilter] = useState<'contestacoes' | null>(null);

  if (!user) return null;

  const completed = monitorias.filter(m => ['concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(m.status));
  const totalAudits = monitorias.length;
  const avgScore = completed.length > 0 ? (completed.reduce((a, m) => a + (m.score || 0), 0) / completed.length) : 0;
  
  const contestations = monitorias.filter(m => m.history.some(h => h.action.includes('Contestação'))).length;
  const activeAgents = new Set(monitorias.map(m => m.evaluated_id)).size;

  // Error distribution
  const errorMap: Record<string, number> = {};
  completed.forEach(m => {
    if (m.question_observations) {
      Object.keys(m.question_observations).forEach(q => {
        if (!errorMap[q]) errorMap[q] = 0;
        errorMap[q]++;
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

  // Trend Chart
  const chartDataMap: Record<string, { total: number, count: number }> = {};
  completed.forEach(m => {
    const key = new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    if (!chartDataMap[key]) chartDataMap[key] = { total: 0, count: 0 };
    chartDataMap[key].total += m.score || 0;
    chartDataMap[key].count++;
  });

  const chartData = Object.entries(chartDataMap)
    .map(([date, d]) => ({ name: date, MediaEquipe: Math.round(d.total / d.count) }))
    .reverse();

  // Agent Rankings
  const agentMap: Record<string, { total: number; count: number }> = {};
  completed.forEach(m => {
    const id = m.evaluated_id;
    if (!agentMap[id]) agentMap[id] = { total: 0, count: 0 };
    agentMap[id].total += m.score || 0;
    agentMap[id].count++;
  });

  const rankingData = Object.entries(agentMap)
    .map(([id, s]) => ({ 
      id, 
      name: users.find(u => u.id === id)?.name || id, 
      score: Math.round(s.total / s.count), 
      count: s.count 
    }))
    .sort((a, b) => b.score - a.score);

  const topAgents = rankingData.slice(0, 5);
  const bottomAgents = [...rankingData].filter(a => a.score < 100).sort((a, b) => a.score - b.score).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Média da Equipe" 
          value={`${avgScore.toFixed(1)}%`} 
          sub={avgScore >= 75 ? 'Acima da meta' : 'Abaixo da meta'} 
          good={avgScore >= 75} 
          icon={<Target className="w-5 h-5" />} 
          accent={avgScore >= 75 ? 'text-emerald-600' : 'text-red-600'} 
        />
        <StatCard 
          title="Auditorias Realizadas" 
          value={totalAudits} 
          sub="no período" 
          good={true} 
          icon={<ClipboardCheck className="w-5 h-5" />} 
          accent="text-blue-600" 
        />
        <StatCard 
          title="Agentes Avaliados" 
          value={activeAgents} 
          sub="na equipe" 
          good={true} 
          icon={<Users className="w-5 h-5" />} 
          accent="text-indigo-600" 
        />
        <StatCard 
          title="Taxa de Contestação" 
          value={`${totalAudits > 0 ? ((contestations / totalAudits) * 100).toFixed(1) : 0}%`} 
          sub={`${contestations} contestações (clique para ver)`} 
          good={totalAudits === 0 || (contestations / totalAudits) < 0.1} 
          icon={<AlertTriangle className="w-5 h-5" />} 
          accent="text-orange-600" 
          onClick={() => setLocalFilter(prev => prev === 'contestacoes' ? null : 'contestacoes')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TrendChart 
            title="Evolução da Equipe" 
            subtitle="Nota média agregada por dia" 
            data={chartData} 
            dataKeys={[
              { key: 'MediaEquipe', name: 'Média da Equipe', color: '#6366f1' }
            ]} 
          />
        </div>
        <div>
          <DistributionChart 
            title="Maiores Ofensores (Erros)" 
            data={errorData} 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <RankingWidget title="Top Agentes" items={topAgents} type="top" />
        <RankingWidget title="Oportunidades de Melhoria" items={bottomAgents} type="bottom" />
        <SlaWidget 
          title="Aguardando Minha Ação"
          monitorias={monitorias}
          users={users}
          targetStatus="aguardando_gestor_suporte"
        />
      </div>

      <RecentAuditsTable 
        monitorias={localFilter === 'contestacoes' ? monitorias.filter(m => m.history.some(h => h.action.includes('Contestação'))) : monitorias} 
        users={users} 
        title={localFilter === 'contestacoes' ? 'Monitorias com Contestação' : 'Monitorias Recentes'}
      />
    </div>
  );
}
