import React from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import DistributionChart from '../widgets/DistributionChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import SlaWidget from '../widgets/SlaWidget';
import { ClipboardCheck, RotateCcw, AlertCircle, Award } from 'lucide-react';

export default function AuditorDashboard() {
  const { user, monitorias, users } = useDashboard();

  if (!user) return null;

  const totalAudits = monitorias.length;
  const completed = monitorias.filter(m => ['concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(m.status));
  
  const contestations = monitorias.filter(m => m.history.some(h => h.action.includes('Contestação'))).length;
  const reversed = monitorias.filter(m => m.status === 'contestacao_aceita' || m.status === 'finalizada_alterada').length;
  
  const reversalRate = contestations > 0 ? (reversed / contestations) * 100 : 0;

  // Grade Distribution
  const gradeDistribution = [
    { name: '100%', value: completed.filter(m => m.score === 100).length, color: '#6366f1' },
    { name: '90-99%', value: completed.filter(m => m.score >= 90 && m.score < 100).length, color: '#10b981' },
    { name: '75-89%', value: completed.filter(m => m.score >= 75 && m.score < 90).length, color: '#f59e0b' },
    { name: '< 75%', value: completed.filter(m => m.score < 75).length, color: '#ef4444' },
  ].filter(d => d.value > 0);

  // Volume Trend
  const volumeMap: Record<string, number> = {};
  monitorias.forEach(m => {
    const key = new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    if (!volumeMap[key]) volumeMap[key] = 0;
    volumeMap[key]++;
  });

  const volumeChartData = Object.entries(volumeMap)
    .map(([date, count]) => ({ name: date, Volume: count }))
    .reverse();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Auditorias Realizadas" 
          value={totalAudits} 
          sub="no período" 
          good={true} 
          icon={<ClipboardCheck className="w-5 h-5" />} 
          accent="text-emerald-600" 
        />
        <StatCard 
          title="Contestações Recebidas" 
          value={contestations} 
          sub={`${((contestations / (totalAudits || 1)) * 100).toFixed(1)}% do total`} 
          good={contestations === 0} 
          icon={<AlertCircle className="w-5 h-5" />} 
          accent="text-orange-600" 
        />
        <StatCard 
          title="Taxa de Reversão" 
          value={`${reversalRate.toFixed(1)}%`} 
          sub={reversalRate > 20 ? 'Atenção necessária' : 'Dentro do aceitável'} 
          good={reversalRate <= 20} 
          icon={<RotateCcw className="w-5 h-5" />} 
          accent={reversalRate <= 20 ? 'text-blue-600' : 'text-red-600'} 
        />
        <StatCard 
          title="Nota Média Aplicada" 
          value={`${completed.length > 0 ? (completed.reduce((a, m) => a + m.score, 0) / completed.length).toFixed(1) : 0}%`} 
          sub="visão geral" 
          good={true} 
          icon={<Award className="w-5 h-5" />} 
          accent="text-indigo-600" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TrendChart 
            title="Volume Operacional" 
            subtitle="Quantidade de auditorias realizadas por dia" 
            data={volumeChartData} 
            dataKeys={[
              { key: 'Volume', name: 'Auditorias', color: '#10b981' }
            ]} 
          />
        </div>
        <div className="space-y-6">
          <DistributionChart 
            title="Curva de Qualidade" 
            data={gradeDistribution} 
          />
          <SlaWidget 
            title="Aguardando Minha Reavaliação"
            monitorias={monitorias}
            users={users}
            targetStatus="em_contestacao"
          />
        </div>
      </div>

      <RecentAuditsTable monitorias={monitorias} users={users} />
    </div>
  );
}
