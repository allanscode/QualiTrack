import React, { useMemo } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import DistributionChart from '../widgets/DistributionChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import SlaWidget from '../widgets/SlaWidget';
import { Target, ClipboardCheck, AlertTriangle, TrendingUp } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';

export default function AgentDashboard() {
  const { user, monitorias, users } = useDashboard();
  const { config, getLevelForScore, isAboveTarget } = useQualityConfig();

  const myMonitorias = useMemo(() => 
    monitorias.filter(m => m.evaluated_id === user?.id), 
    [monitorias, user]
  );
  
  const completed = useMemo(() => 
    myMonitorias.filter(m => ['concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(m.status)), 
    [myMonitorias]
  );
  
  const avgScore = useMemo(() => 
    completed.length > 0 ? (completed.reduce((a, m) => a + (m.score || 0), 0) / completed.length) : 0, 
    [completed]
  );
  
  const pendingAction = useMemo(() => 
    myMonitorias.filter(m => m.status === 'pendente_revisao').length, 
    [myMonitorias]
  );

  // Trend Data
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
      MeuScore: Math.round((data.totalScore / data.count) * 100) / 100
    })).sort((a, b) => {
      const [da, ma] = a.name.split('/').map(Number);
      const [db, mb] = b.name.split('/').map(Number);
      return ma !== mb ? ma - mb : da - db;
    });
  }, [completed]);

  const trendPercentage = useMemo(() => {
    if (trendData.length < 2) return 0;
    const mid = Math.floor(trendData.length / 2);
    const firstHalf = trendData.slice(0, mid);
    const secondHalf = trendData.slice(mid);
    const avgFirst = firstHalf.reduce((a, b) => a + b.MeuScore, 0) / (firstHalf.length || 1);
    const avgSecond = secondHalf.reduce((a, b) => a + b.MeuScore, 0) / (secondHalf.length || 1);
    return avgFirst > 0 ? ((avgSecond / avgFirst) - 1) * 100 : 0;
  }, [trendData]);

  const classificationData = useMemo(() => {
    const colorMap: Record<string, string> = {
      'text-indigo-700': '#6366f1',
      'text-emerald-700': '#10b981',
      'text-amber-700': '#f59e0b',
      'text-red-700': '#ef4444',
      'text-purple-700': '#a855f7',
      'text-blue-700': '#3b82f6',
    };

    return config.levels.map(level => ({
      name: level.label,
      value: myMonitorias.filter(m => m.score >= level.minScore && m.score <= level.maxScore).length,
      color: colorMap[level.color] || '#94a3b8'
    })).filter(d => d.value > 0);
  }, [config.levels, myMonitorias]);

  if (!user) return null;

  return (
    <div className="space-y-6 animate-fade-in min-w-0 overflow-hidden">
      <header>
        <h1 className="text-2xl font-black text-brand-primary tracking-tight uppercase">Meu Desempenho</h1>
        <p className="text-brand-muted text-sm font-medium mt-1">Olá, {user.name}. Veja como está sua qualidade este mês.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Minha Média" 
          value={`${avgScore.toFixed(2)}%`} 
          sub={isAboveTarget(avgScore) ? 'Acima da meta' : 'Abaixo da meta'} 
          good={isAboveTarget(avgScore)} 
          icon={<Target className="w-5 h-5" />} 
          accent={getLevelForScore(avgScore).color} 
        />
        <StatCard 
          title="Monitorias" 
          value={myMonitorias.length} 
          sub="Total no período" 
          good={true} 
          icon={<ClipboardCheck className="w-5 h-5" />} 
          accent="text-blue-600" 
        />
        <StatCard 
          title="Pendentes" 
          value={pendingAction} 
          sub="Aguardando sua revisão" 
          good={pendingAction === 0} 
          icon={<AlertTriangle className="w-5 h-5" />} 
          accent="text-error" 
        />
        <StatCard 
          title="Tendência" 
          value={`${trendPercentage >= 0 ? '+' : ''}${trendPercentage.toFixed(2)}%`} 
          sub="Evolução do score" 
          good={trendPercentage >= 0} 
          icon={<TrendingUp className="w-5 h-5" />} 
          accent="text-brand-highlight" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="h-[340px]">
            <TrendChart 
              title="Minha Evolução" 
              subtitle="Score médio por dia"
              data={trendData} 
              dataKeys={[{ key: 'MeuScore', name: 'Meu Score', color: '#6366f1' }]} 
            />
          </div>
          
          <div className="h-[400px]">
            <SlaWidget 
              title="Aguardando Minha Ciência"
              monitorias={myMonitorias}
              users={users}
              targetStatus="pendente_revisao"
            />
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="h-[340px]">
            <DistributionChart 
              title="Minha Classificação" 
              data={classificationData} 
            />
          </div>
        </div>
      </div>

      <div className="pt-4">
        <RecentAuditsTable monitorias={myMonitorias} users={users} />
      </div>
    </div>
  );
}
