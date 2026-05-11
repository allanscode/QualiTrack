import React, { useState, useEffect, useMemo } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import DistributionChart from '../widgets/DistributionChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import SlaWidget from '../widgets/SlaWidget';
import ComparativeBarChart from '../widgets/ComparativeBarChart';
import { ClipboardCheck, Target, CheckCircle2, XCircle, TrendingUp, AlertCircle } from 'lucide-react';
import { supabase, mockDb } from '../../../lib/supabase';
import { Monitoria } from '../../../types';
import Card from '../../ui/Card';

export default function AuditorDashboard() {
  const { user, monitorias, users, filters } = useDashboard();
  const [comparativeData, setComparativeData] = useState<any[]>([]);

  const myMonitorias = useMemo(() => monitorias.filter(m => m.evaluator_id === user?.id), [monitorias, user]);
  const completed = useMemo(() => myMonitorias.filter(m => ['concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(m.status)), [myMonitorias]);
  
  const avgScore = useMemo(() => completed.length > 0 ? (completed.reduce((a, m) => a + (m.score || 0), 0) / completed.length) : 0, [completed]);
  
  const reavAccepted = useMemo(() => myMonitorias.filter(m => m.status === 'contestacao_aceita' || m.status === 'finalizada_alterada').length, [myMonitorias]);
  const reavRejected = useMemo(() => myMonitorias.filter(m => m.status === 'contestacao_negada').length, [myMonitorias]);

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
          mediaEquipe: Number((data.teamTotal / auditorsCount).toFixed(1))
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

  // Grade Distribution for "My Audits"
  const gradeDistribution = [
    { name: '100%', value: completed.filter(m => m.score === 100).length, color: '#6366f1' },
    { name: '90-99%', value: completed.filter(m => m.score >= 90 && m.score < 100).length, color: '#10b981' },
    { name: '75-89%', value: completed.filter(m => m.score >= 75 && m.score < 90).length, color: '#f59e0b' },
    { name: '< 75%', value: completed.filter(m => m.score < 75).length, color: '#ef4444' },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6 animate-fade-in">
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
          value={`${avgScore.toFixed(1)}%`} 
          sub="Média das notas aplicadas" 
          good={avgScore >= 85} 
          icon={<Target className="w-5 h-5" />} 
          accent="text-brand-accent" 
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
          <Card className="h-[340px] flex flex-col">
            <div className="mb-4">
              <h3 className="font-black text-brand-primary uppercase tracking-tight">Volumetria Diária</h3>
              <p className="text-[10px] font-bold text-brand-muted uppercase">Comparativo com a média da equipe</p>
            </div>
            <div className="flex-1">
               <ComparativeBarChart 
                data={comparativeData}
                dataKeys={[
                  { key: 'meuVolume', name: 'Meu Volume', color: '#6366f1' },
                  { key: 'mediaEquipe', name: 'Média Equipe', color: '#e2e8f0' }
                ]}
              />
            </div>
          </Card>
          
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
          <Card className="h-[340px] flex flex-col">
            <DistributionChart 
              title="Minha Curva de Qualidade" 
              data={gradeDistribution} 
            />
          </Card>

          <Card className="p-6 bg-brand-primary text-white overflow-hidden relative group">
            <div className="relative z-10">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-1">Dica de Produtividade</h4>
              <p className="text-sm font-bold leading-tight">Mantenha seu SLA de reavaliação abaixo de 24h para garantir a satisfação dos agentes.</p>
            </div>
            <TrendingUp className="absolute -right-4 -bottom-4 w-24 h-24 text-white/5 group-hover:scale-110 transition-transform duration-500" />
          </Card>
        </div>
      </div>

      <RecentAuditsTable monitorias={myMonitorias} users={users} />
    </div>
  );
}
