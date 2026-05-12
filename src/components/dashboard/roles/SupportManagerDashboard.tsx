import React, { useMemo } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import DistributionChart from '../widgets/DistributionChart';
import RankingWidget from '../widgets/RankingWidget';
import SlaWidget from '../widgets/SlaWidget';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import { Target, Users, TrendingUp, ClipboardCheck, AlertTriangle, RotateCcw, CheckCircle2, XCircle } from 'lucide-react';
import Card from '../../ui/Card';

export default function SupportManagerDashboard() {
  const { user, monitorias, users, teams } = useDashboard();

  const myTeamIds = useMemo(() => user?.team_ids || [], [user]);
  
  const teamMonitorias = useMemo(() => monitorias.filter(m => {
    const evaluatedUser = users.find(u => u.id === m.evaluated_id);
    return evaluatedUser?.team_ids?.some(tid => myTeamIds.includes(tid));
  }), [monitorias, users, myTeamIds]);

  const completed = useMemo(() => teamMonitorias.filter(m => ['concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(m.status)), [teamMonitorias]);
  const avgScore = useMemo(() => completed.length > 0 ? (completed.reduce((a, m) => a + (m.score || 0), 0) / completed.length) : 0, [completed]);
  
  const totalContestations = useMemo(() => teamMonitorias.filter(m => m.history.some(h => h.action.includes('Contestação'))).length, [teamMonitorias]);
  const reavAccepted = useMemo(() => teamMonitorias.filter(m => m.status === 'contestacao_aceita' || m.status === 'finalizada_alterada').length, [teamMonitorias]);
  const reavRejected = useMemo(() => teamMonitorias.filter(m => m.status === 'contestacao_negada').length, [teamMonitorias]);
  const reversalRate = useMemo(() => totalContestations > 0 ? (reavAccepted / totalContestations) * 100 : 0, [totalContestations, reavAccepted]);

  const pendingAgent = useMemo(() => teamMonitorias.filter(m => m.status === 'pendente_revisao').length, [teamMonitorias]);
  const pendingManager = useMemo(() => teamMonitorias.filter(m => m.status === 'aguardando_gestor_suporte').length, [teamMonitorias]);

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
      ScoreEquipe: Math.round(data.totalScore / data.count)
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
    const avgFirst = firstHalf.reduce((a, b) => a + b.ScoreEquipe, 0) / (firstHalf.length || 1);
    const avgSecond = secondHalf.reduce((a, b) => a + b.ScoreEquipe, 0) / (secondHalf.length || 1);
    return avgFirst > 0 ? ((avgSecond / avgFirst) - 1) * 100 : 0;
  }, [trendData]);

  // Agent Rankings
  const agentRanking = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    completed.forEach(m => {
      const id = m.evaluated_id;
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
      .sort((a, b) => b.score - a.score);
  }, [completed, users]);

  const topAgents = agentRanking.slice(0, 5);
  const bottomAgents = [...agentRanking].reverse().slice(0, 5);

  if (!user) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h1 className="text-2xl font-black text-brand-primary tracking-tight uppercase">Gestão de Operação</h1>
        <p className="text-brand-muted text-sm font-medium mt-1">Olá, {user.name}. Acompanhe o desempenho das suas equipes.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Média Equipe" 
          value={`${avgScore.toFixed(1)}%`} 
          sub={avgScore >= 85 ? 'Dentro da meta' : 'Abaixo da meta'} 
          good={avgScore >= 85} 
          icon={<Target className="w-5 h-5" />} 
          accent="text-brand-accent" 
        />
        <StatCard 
          title="Pendentes Agente" 
          value={pendingAgent} 
          sub="Aguardando ciência" 
          good={pendingAgent === 0} 
          icon={<Users className="w-5 h-5" />} 
          accent="text-warning" 
        />
        <StatCard 
          title="Minhas Ações" 
          value={pendingManager} 
          sub="Reavaliações Pendentes" 
          good={pendingManager === 0} 
          icon={<AlertTriangle className="w-5 h-5" />} 
          accent="text-error" 
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

      {/* Volumetria de Reavaliação Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Taxa de Reversão" 
          value={`${reversalRate.toFixed(1)}%`} 
          sub="Notas alteradas" 
          good={reversalRate <= 20} 
          icon={<RotateCcw className="w-5 h-5" />} 
          accent="text-brand-highlight" 
        />
        <StatCard 
          title="Reav. Solicitadas" 
          value={totalContestations} 
          sub="Contestações no período" 
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
        <div className="lg:col-span-2">
          <TrendChart 
            title="Evolução do Score" 
            subtitle="Nota média agregada das suas equipes" 
            data={trendData} 
            dataKeys={[{ key: 'ScoreEquipe', name: 'Média Equipe', color: '#6366f1' }]} 
          />
        </div>
        <div>
          <SlaWidget 
            title="Aguardando Minha Ação"
            monitorias={teamMonitorias}
            users={users}
            targetStatus="aguardando_gestor_suporte"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankingWidget title="Top Melhores Notas" items={topAgents} type="top" />
        <RankingWidget title="Oportunidades de Melhoria" items={bottomAgents} type="bottom" />
      </div>

      <RecentAuditsTable monitorias={teamMonitorias} users={users} />
    </div>
  );
}
