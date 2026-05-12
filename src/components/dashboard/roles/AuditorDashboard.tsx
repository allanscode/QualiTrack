import React, { useState, useEffect, useMemo } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import DistributionChart from '../widgets/DistributionChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import SlaWidget from '../widgets/SlaWidget';
import ComparativeBarChart from '../widgets/ComparativeBarChart';
import { ClipboardCheck, Target, CheckCircle2, XCircle } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';

export default function AuditorDashboard() {
  const { user, monitorias, users } = useDashboard();
  const { config, getLevelForScore, isAboveTarget } = useQualityConfig();
  const [comparativeData, setComparativeData] = useState<any[]>([]);

  const myMonitorias = useMemo(() => monitorias.filter(m => m.evaluator_id === user?.id), [monitorias, user]);
  
  const scoredMonitorias = useMemo(() => myMonitorias.filter(m => m.score !== undefined && m.score !== null), [myMonitorias]);
  const avgScore = useMemo(() => scoredMonitorias.length > 0 ? (scoredMonitorias.reduce((a, m) => a + (m.score || 0), 0) / scoredMonitorias.length) : 0, [scoredMonitorias]);
  
  const reavAccepted = useMemo(() => myMonitorias.filter(m =>
    m.history?.some(h =>
      h.action.includes('Procedente') ||
      h.action.includes('Alterada') ||
      h.action.toLowerCase().includes('aceita') ||
      h.action.toLowerCase().includes('alterado')
    )
  ).length, [myMonitorias]);

  const reavRejected = useMemo(() => myMonitorias.filter(m =>
    m.history?.some(h =>
      h.action.includes('Improcedente') ||
      h.action.includes('Mantida') ||
      h.action.toLowerCase().includes('negada') ||
      h.action.toLowerCase().includes('recusada')
    )
  ).length, [myMonitorias]);

  useEffect(() => {
    async function calculateComparativeData() {
      try {
        const days: Record<string, { meuVolume: number, teamTotal: number }> = {};
        
        // Use all monitorias for team volume comparison
        monitorias.forEach(m => {
          const date = new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
          if (!days[date]) days[date] = { meuVolume: 0, teamTotal: 0 };
          
          if (m.evaluator_id === user?.id) {
            days[date].meuVolume += 1;
          }
          days[date].teamTotal += 1;
        });

        const auditorsCount = users.filter(u => u.role === 'qualidade').length || 1;

        const chartData = Object.entries(days).map(([name, data]) => ({
          name,
          meuVolume: data.meuVolume,
          mediaEquipe: Number((data.teamTotal / auditorsCount).toFixed(2))
        })).sort((a, b) => {
          const [da, ma] = a.name.split('/').map(Number);
          const [db, mb] = b.name.split('/').map(Number);
          return ma !== mb ? ma - mb : da - db;
        });

        setComparativeData(chartData);
      } catch (e) {
        console.error("Failed to calculate comparative data", e);
      }
    }
    calculateComparativeData();
  }, [monitorias, user, users]);

  if (!user) return null;

  // Grade Distribution (Dynamic from Config)
  const gradeDistribution = useMemo(() => {
    const colorMap: Record<string, string> = {
      'text-indigo-700': '#6366f1',
      'text-emerald-700': '#10b981',
      'text-amber-700': '#f59e0b',
      'text-red-700': '#ef4444',
      'text-purple-700': '#a855f7',
      'text-blue-700': '#3b82f6',
    };

    return config.levels.map(level => ({
      name: `${level.label} (${level.minScore}-${level.maxScore}%)`,
      value: myMonitorias.filter(m => m.score >= level.minScore && m.score <= level.maxScore).length,
      color: colorMap[level.color] || '#94a3b8'
    })).filter(d => d.value > 0);
  }, [config.levels, myMonitorias]);

  const totalReevaluated = useMemo(() => {
    return myMonitorias.filter(m => 
      ['contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(m.status) ||
      m.history?.some(h => h.action.includes('Reavaliada') || h.action.includes('Contestação'))
    ).length;
  }, [myMonitorias]);

  return (
    <div className="space-y-6 animate-fade-in min-w-0 overflow-hidden">
      <header>
        <h1 className="text-2xl font-black text-brand-primary tracking-tight uppercase">Painel do Auditor</h1>
        <p className="text-brand-muted text-sm font-medium mt-1">Olá, {user.name}. Acompanhe sua produtividade e qualidade.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Meu Volume" 
          value={myMonitorias.length} 
          sub="no período" 
          good={true} 
          icon={<ClipboardCheck className="w-5 h-5" />} 
          accent="text-blue-600" 
        />
        <StatCard 
          title="Nota Média" 
          value={`${avgScore.toFixed(2)}%`} 
          sub="Média das notas aplicadas" 
          good={isAboveTarget(avgScore)} 
          icon={<Target className="w-5 h-5" />} 
          accent={getLevelForScore(avgScore).color} 
        />
        <StatCard 
          title="Reav. Aceitas" 
          value={reavAccepted} 
          sub="Contestações procedentes" 
          good={reavAccepted === 0} 
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
        <div className="lg:col-span-2 space-y-6">
          <div className="h-[340px]">
            <ComparativeBarChart 
              title="Volumetria Diária"
              subtitle="Comparativo com a média da equipe"
              data={comparativeData}
              dataKeys={[
                { key: 'meuVolume', name: 'Meu Volume', color: '#6366f1' },
                { key: 'mediaEquipe', name: 'Média Equipe', color: '#94a3b8' }
              ]}
            />
          </div>
          
          <div className="h-[400px]">
            <SlaWidget 
              title="Minhas Reavaliações Pendentes"
              monitorias={myMonitorias}
              users={users}
              targetStatus="em_contestacao"
            />
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="h-[340px]">
            <DistributionChart 
              title="Minha Curva de Qualidade" 
              data={gradeDistribution} 
            />
          </div>

          <div className="h-[400px]">
            <DistributionChart 
              title="Precisão da Auditoria" 
              data={[
                { name: 'Estáveis', value: myMonitorias.length - totalReevaluated, color: '#6366f1' },
                { name: 'Reavaliadas', value: totalReevaluated, color: '#f59e0b' }
              ].filter(d => d.value > 0)} 
            />
          </div>
        </div>
      </div>

      <RecentAuditsTable monitorias={myMonitorias} users={users} />
    </div>
  );
}
