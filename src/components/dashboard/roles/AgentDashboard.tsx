import React, { useMemo } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import DistributionChart from '../widgets/DistributionChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import SlaWidget from '../widgets/SlaWidget';
import { Target, ClipboardCheck, AlertTriangle, TrendingUp, CheckCircle2, XCircle } from 'lucide-react';

export default function AgentDashboard() {
  const { user, monitorias, users } = useDashboard();
  
  if (!user) return null;

  const myMonitorias = useMemo(() => monitorias.filter(m => m.evaluated_id === user.id), [monitorias, user]);
  const completed = useMemo(() => myMonitorias.filter(m => ['concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(m.status)), [myMonitorias]);
  const avgScore = useMemo(() => completed.length > 0 ? (completed.reduce((a, m) => a + (m.score || 0), 0) / completed.length) : 0, [completed]);
  
  const contestations = useMemo(() => myMonitorias.filter(m => m.history.some(h => h.action.includes('Contestação'))).length, [myMonitorias]);
  const reversed = useMemo(() => myMonitorias.filter(m => m.status === 'contestacao_aceita' || m.status === 'finalizada_alterada').length, [myMonitorias]);
  const pendingReview = useMemo(() => myMonitorias.filter(m => m.status === 'pendente_revisao').length, [myMonitorias]);

  // Error distribution for current agent
  const errorMap: Record<string, number> = {};
  completed.forEach(m => {
    m.evaluation_data?.sections?.forEach((s: any) => {
      s.items?.forEach((i: any) => {
        if (i.value === 'não' || i.value === false) {
          errorMap[i.title] = (errorMap[i.title] || 0) + 1;
        }
      });
    });
  });

  const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#8b5cf6', '#06b6d4'];
  const errorData = Object.entries(errorMap)
    .map(([name, value]) => ({ name, value, color: '' }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((item, i) => ({ ...item, color: COLORS[i] || '#94a3b8' }));

  // Group by day for trend
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
      MeuScore: Math.round(data.totalScore / data.count)
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
    const avgFirst = firstHalf.reduce((a, b) => a + b.MeuScore, 0) / (firstHalf.length || 1);
    const avgSecond = secondHalf.reduce((a, b) => a + b.MeuScore, 0) / (secondHalf.length || 1);
    return avgFirst > 0 ? ((avgSecond / avgFirst) - 1) * 100 : 0;
  }, [trendData]);

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h1 className="text-2xl font-black text-brand-primary tracking-tight uppercase">Minha Performance</h1>
        <p className="text-brand-muted text-sm font-medium mt-1">Olá, {user.name}. Veja como está sua qualidade.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Minha Média" 
          value={`${avgScore.toFixed(1)}%`} 
          sub={avgScore >= 85 ? 'Dentro da meta' : 'Abaixo da meta'} 
          good={avgScore >= 85} 
          icon={<Target className="w-5 h-5" />} 
          accent="text-brand-accent" 
        />
        <StatCard 
          title="Pendentes" 
          value={pendingReview} 
          sub="Ciência necessária" 
          good={pendingReview === 0} 
          icon={<AlertTriangle className="w-5 h-5" />} 
          accent="text-warning" 
        />
        <StatCard 
          title="Contestações" 
          value={contestations} 
          sub={`Procedentes: ${reversed}`} 
          good={true} 
          icon={<CheckCircle2 className="w-5 h-5" />} 
          accent="text-success" 
        />
        <StatCard 
          title="Tendência" 
          value={`${trendPercentage >= 0 ? '+' : ''}${trendPercentage.toFixed(1)}%`} 
          sub="Evolução do score" 
          good={trendPercentage >= 0} 
          icon={<TrendingUp className="w-5 h-5" />} 
          accent="text-blue-600" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <TrendChart 
            title="Evolução da Nota" 
            subtitle="Sua média de score por dia" 
            data={trendData} 
            dataKeys={[{ key: 'MeuScore', name: 'Meu Score', color: '#6366f1' }]} 
          />
          <SlaWidget 
            title="Aguardando Minha Revisão"
            monitorias={myMonitorias}
            users={users}
            targetStatus="pendente_revisao"
          />
        </div>
        <div>
          <DistributionChart 
            title="Meus Ofensores" 
            data={errorData} 
          />
        </div>
      </div>

      <RecentAuditsTable monitorias={myMonitorias} users={users} />
    </div>
  );
}
