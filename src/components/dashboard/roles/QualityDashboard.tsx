import React, { useState, useEffect, useMemo } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import DistributionChart from '../widgets/DistributionChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import SlaWidget from '../widgets/SlaWidget';
import ComparativeBarChart from '../widgets/ComparativeBarChart';
import OfensoresChart from '../widgets/OfensoresChart';
import { ClipboardCheck, Target, CheckCircle2, XCircle, AlertTriangle, History, Clock } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { isApprovalAction, isRejectionAction, isContestationAction } from '../../../lib/contestation';
import Card from '../../ui/Card';

export default function QualityDashboard() {
  const { user, monitorias, users, forms } = useDashboard();
  const { config, getLevelForScore, isAboveTarget } = useQualityConfig();
  const [comparativeData, setComparativeData] = useState<any[]>([]);

  const myMonitorias = useMemo(() => monitorias.filter(m => m.evaluator_id === user?.id), [monitorias, user]);
  
  const scoredMonitorias = useMemo(() => myMonitorias.filter(m => m.score !== undefined && m.score !== null), [myMonitorias]);
  const avgScore = useMemo(() => scoredMonitorias.length > 0 ? (scoredMonitorias.reduce((a, m) => a + (m.score || 0), 0) / scoredMonitorias.length) : 0, [scoredMonitorias]);
  
  // Monitorias que tiveram pelo menos uma contestação
  const contestedMyMonitorias = useMemo(() =>
    myMonitorias.filter(m =>
      m.history?.some(h => isContestationAction(h.action))
    ),
    [myMonitorias]
  );

  // Conta apenas pelo ÚLTIMO desfecho — evita dupla contagem em múltiplas rodadas
  const reavAccepted = useMemo(() =>
    contestedMyMonitorias.filter(m => {
      const resolutions = (m.history || []).filter(h =>
        isApprovalAction(h.action) || isRejectionAction(h.action)
      );
      if (resolutions.length === 0) return false;
      return isApprovalAction(resolutions[resolutions.length - 1].action);
    }).length,
    [contestedMyMonitorias]
  );

  const reavRejected = useMemo(() =>
    contestedMyMonitorias.filter(m => {
      const resolutions = (m.history || []).filter(h =>
        isApprovalAction(h.action) || isRejectionAction(h.action)
      );
      if (resolutions.length === 0) return false;
      return isRejectionAction(resolutions[resolutions.length - 1].action);
    }).length,
    [contestedMyMonitorias]
  );

  useEffect(() => {
    async function calculateComparativeData() {
      try {
        const days: Record<string, { meuVolume: number, teamTotal: number, activeAuditors: Set<string> }> = {};
        
        monitorias.forEach(m => {
          const date = new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
          if (!days[date]) days[date] = { meuVolume: 0, teamTotal: 0, activeAuditors: new Set() };
          
          if (m.evaluator_id === user?.id) {
            days[date].meuVolume += 1;
          }
          days[date].teamTotal += 1;
          if (m.evaluator_id) {
            days[date].activeAuditors.add(m.evaluator_id);
          }
        });

        const chartData = Object.entries(days).map(([name, data]) => ({
          name,
          meuVolume: data.meuVolume,
          // Divide only by auditors who actually worked that day
          mediaEquipe: data.activeAuditors.size > 0
            ? Number((data.teamTotal / data.activeAuditors.size).toFixed(2))
            : 0
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

  const gradeDistribution = useMemo(() => {
    const colorMap: Record<string, string> = {
      'text-indigo-700': '#6366f1',
      'text-emerald-700': '#10b981',
      'text-amber-700':   '#f59e0b',
      'text-red-700':     '#ef4444',
      'text-purple-700':  '#a855f7',
      'text-blue-700':    '#3b82f6',
    };

    return config.levels.map(level => ({
      name: `${level.label} (${level.minScore}-${level.maxScore}%)`,
      value: myMonitorias.filter(m => m.score >= level.minScore && m.score <= level.maxScore).length,
      color: colorMap[level.color] || '#94a3b8'
    })).filter(d => d.value > 0);
  }, [config.levels, myMonitorias]);

  const totalReevaluated = useMemo(() => {
    // "Reavaliada" = quality's original assessment was CHANGED (contestation accepted)
    // "Estável"   = quality maintained their assessment (including rejected contestations)
    return myMonitorias.filter(m => 
      ['contestacao_aceita', 'finalizada_alterada'].includes(m.status) ||
      m.history?.some(h => 
        h.action.toLowerCase().includes('reavaliada') ||
        h.action.toLowerCase().includes('procedente') ||
        h.action.toLowerCase().includes('alterada')
      )
    ).length;
  }, [myMonitorias]);

  const pendingAuditsCount = useMemo(() => {
    return myMonitorias.filter(m => 
      m.active !== false && 
      !['concluida', 'finalizada_alterada', 'contestacao_aceita', 'contestacao_negada'].includes(m.status)
    ).length;
  }, [myMonitorias]);

  const pendingActions = useMemo(() => {
    return myMonitorias.filter(m => m.status === 'em_contestacao').length;
  }, [myMonitorias]);

  return (
    <div className="space-y-6 animate-fade-in min-w-0 overflow-hidden">

      {/* Row 1: Key Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          title="Meu Volume" 
          value={myMonitorias.length} 
          sub="no período" 
          good={true} 
          icon={<ClipboardCheck className="w-4 h-4" />} 
          accent="text-info" 
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
          title="Pendente Ação" 
          value={pendingActions} 
          sub="Aguardando reanálise" 
          good={pendingActions === 0} 
          icon={<AlertTriangle className="w-5 h-5" />} 
          accent="text-error" 
        />
      </div>

      {/* Row 2: Reevaluation Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          title="Reav. Aceitas" 
          value={reavAccepted} 
          sub="Procedentes (Nota alterada)" 
          good={reavAccepted === 0} 
          icon={<CheckCircle2 className="w-5 h-5" />} 
          accent="text-success" 
        />
        <StatCard 
          title="Reav. Recusadas" 
          value={reavRejected} 
          sub="Improcedentes (Nota mantida)" 
          good={true} 
          icon={<XCircle className="w-5 h-5" />} 
          accent="text-error" 
        />
        <StatCard 
          title="Total Reav Recebidas" 
          value={reavAccepted + reavRejected} 
          sub="Total de contestações" 
          good={true} 
          icon={<History className="w-4 h-4" />} 
          accent="text-brand-highlight" 
        />
      </div>

      {/* Row 3: Main Charts (Volume and Pendents) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[340px]">
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
        <div className="h-[340px]">
          <Card padding="lg" className="h-full flex flex-col">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-brand-primary" />
              </div>
              <div>
                <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest leading-tight">Auditorias Pendentes</h3>
                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mt-0.5">Aguardando Conclusão</p>
              </div>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <div className="relative">
                <p className="text-[100px] font-black text-brand-primary tracking-tighter tabular-nums leading-none">
                  {pendingAuditsCount}
                </p>
                <div className="absolute -top-4 -right-8 w-10 h-10 bg-brand-primary/5 rounded-full blur-xl animate-pulse" />
              </div>
              <div className="mt-8 px-6 py-2.5 bg-brand-primary/5 rounded-full border border-brand-primary/10">
                <p className="text-[10px] font-black text-brand-muted uppercase tracking-[0.2em]">Total em Aberto</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Row 4: Quality Charts and Reevaluations (3 columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="h-[400px]">
          <DistributionChart 
            title="Minha Curva de Qualidade" 
            data={gradeDistribution} 
          />
        </div>

        <div className="h-[400px]">
          <DistributionChart 
            title="Precisão da Qualidade" 
            data={[
              { name: 'Estáveis', value: myMonitorias.length - totalReevaluated, color: '#6366f1' },
              { name: 'Reavaliadas', value: totalReevaluated, color: '#f59e0b' }
            ].filter(d => d.value > 0)} 
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

      {/* Row 5: Maiores Ofensores (Full Width) */}
      <div className="grid grid-cols-1 gap-6">
        <div className="h-[420px]">
          <OfensoresChart 
            title="Maiores Ofensores"
            subtitle="Itens que você mais despontuou"
            monitorias={myMonitorias} 
            forms={forms} 
            limit={12} 
          />
        </div>
      </div>

      {/* Row 5: Recent Audits (Full Width) */}
      <div className="overflow-hidden">
        <RecentAuditsTable monitorias={myMonitorias} users={users} title="Minhas Auditorias Recentes" limit={10} />
      </div>
    </div>
  );
}
