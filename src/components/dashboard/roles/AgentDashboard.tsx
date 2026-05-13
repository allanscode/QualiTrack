import React, { useMemo } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import DistributionChart from '../widgets/DistributionChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import SlaWidget from '../widgets/SlaWidget';
import OfensoresChart from '../widgets/OfensoresChart';
import { Target, ClipboardCheck, AlertTriangle, TrendingUp, RotateCcw, CheckCircle2, XCircle, BarChart3, Users } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';

export default function AgentDashboard() {
  const { user, monitorias, allMonitorias, users, forms } = useDashboard();
  const { config, getLevelForScore, isAboveTarget } = useQualityConfig();

  // --- Only MY monitorias (for personal metrics) - FILTERED BY UI
  const myMonitorias = useMemo(() => 
    monitorias.filter(m => m.evaluated_id === user?.id), 
    [monitorias, user]
  );

  // --- Only MY monitorias (for SlaWidget/Pendencies) - UNFILTERED BY UI
  const myAllMonitorias = useMemo(() => 
    allMonitorias.filter(m => m.evaluated_id === user?.id), 
    [allMonitorias, user]
  );
  
  // --- Team Data (for comparison)
  const teamMonitorias = useMemo(() => {
    const myInfo = users.find(u => u.id === user?.id);
    let myTeamIds = myInfo?.team_ids || user?.team_ids || [];
    
    if (myTeamIds.length === 0) {
      const fromRecords = monitorias.filter(m => m.evaluated_id === user?.id && m.team_id).map(m => m.team_id!);
      myTeamIds = Array.from(new Set(fromRecords));
    }

    return monitorias.filter(m => m.team_id && myTeamIds.includes(m.team_id));
  }, [monitorias, user, users]);

  // --- Main Calculations (All active monitorias)
  const avgScore = useMemo(() => 
    myMonitorias.length > 0 ? (myMonitorias.reduce((a, m) => a + (m.score || 0), 0) / myMonitorias.length) : 0, 
    [myMonitorias]
  );

  const teamAvgScore = useMemo(() => 
    teamMonitorias.length > 0 ? (teamMonitorias.reduce((a, m) => a + (m.score || 0), 0) / teamMonitorias.length) : 0, 
    [teamMonitorias]
  );

  // --- Contestation Metrics
  const myContestations = useMemo(() => 
    myMonitorias.filter(m => m.history?.some(h => h.action.includes('Contestação'))),
    [myMonitorias]
  );

  const contestationsApproved = useMemo(() => 
    myContestations.filter(m => m.status === 'contestacao_aceita' || m.status === 'finalizada_alterada').length,
    [myContestations]
  );

  const contestationsRejected = useMemo(() => 
    myContestations.filter(m => m.status === 'contestacao_negada').length,
    [myContestations]
  );

  const reversalRate = useMemo(() => 
    myContestations.length > 0 ? (contestationsApproved / myContestations.length) * 100 : 0,
    [myContestations, contestationsApproved]
  );

  // --- Trend Data (Agent vs Team)
  const trendData = useMemo(() => {
    const days: Record<string, { myTotal: number, myCount: number, teamTotal: number, teamCount: number }> = {};
    
    // Process My Scores
    myMonitorias.forEach(m => {
      const date = new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (!days[date]) days[date] = { myTotal: 0, myCount: 0, teamTotal: 0, teamCount: 0 };
      days[date].myTotal += m.score || 0;
      days[date].myCount += 1;
    });

    // Process Team Scores
    teamMonitorias.forEach(m => {
      const date = new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (!days[date]) days[date] = { myTotal: 0, myCount: 0, teamTotal: 0, teamCount: 0 };
      days[date].teamTotal += m.score || 0;
      days[date].teamCount += 1;
    });

    return Object.entries(days).map(([name, data]) => ({
      name,
      MeuScore: data.myCount > 0 ? Math.round((data.myTotal / data.myCount) * 100) / 100 : undefined,
      MediaEquipe: data.teamCount > 0 ? Math.round((data.teamTotal / data.teamCount) * 100) / 100 : undefined
    })).sort((a, b) => {
      const [da, ma] = a.name.split('/').map(Number);
      const [db, mb] = b.name.split('/').map(Number);
      return ma !== mb ? ma - mb : da - db;
    });
  }, [myMonitorias, teamMonitorias]);

  const level = getLevelForScore(avgScore);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Minha Média"
          value={`${avgScore.toFixed(2)}%`}
          sub={level.label}
          good={isAboveTarget(avgScore)}
          icon={<Target className="w-5 h-5" />}
          accent={level.color}
        />
        <StatCard
          title="Média da Equipe"
          value={`${teamAvgScore.toFixed(2)}%`}
          sub={avgScore >= teamAvgScore ? 'Você está acima da média' : 'Você está abaixo da média'}
          good={avgScore >= teamAvgScore}
          icon={<Users className="w-5 h-5" />}
          accent="text-brand-highlight"
        />
        <StatCard
          title="Monitorias"
          value={myMonitorias.length.toString()}
          sub="Total no período"
          good={true}
          icon={<ClipboardCheck className="w-5 h-5" />}
          accent="text-brand-accent"
        />
        <StatCard
          title="Tendência"
          value={`${reversalRate.toFixed(1)}%`}
          sub="Taxa de Reversão"
          good={true}
          icon={<TrendingUp className="w-5 h-5" />}
          accent="text-info"
        />
      </div>

      {/* Contestation Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Taxa de Reversão"
          value={`${reversalRate.toFixed(1)}%`}
          sub="Contestações Procedentes"
          good={true}
          icon={<RotateCcw className="w-5 h-5" />}
          accent="text-brand-muted"
        />
        <StatCard
          title="Solicitadas"
          value={myContestations.length.toString()}
          sub="Total de Contestações"
          good={true}
          icon={<BarChart3 className="w-5 h-5" />}
          accent="text-brand-muted"
        />
        <StatCard
          title="Aprovadas"
          value={contestationsApproved.toString()}
          sub="Nota Alterada"
          good={true}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="text-success"
        />
        <StatCard
          title="Recusadas"
          value={contestationsRejected.toString()}
          sub="Nota Mantida"
          good={false}
          icon={<XCircle className="w-5 h-5" />}
          accent="text-error"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[350px]">
          <TrendChart 
            data={trendData} 
            title="Evolução Comparativa"
            subtitle="Meu Score vs Média da Equipe"
            dataKeys={[
              { key: 'MeuScore', name: 'Meu Score', color: '#6366f1' },
              { key: 'MediaEquipe', name: 'Média Equipe', color: '#10b981' }
            ]}
          />
        </div>
        <div className="lg:col-span-1 h-[350px]">
          <DistributionChart 
            title="Minha Classificação"
            data={config.levels.map(l => ({
              name: l.label,
              value: myMonitorias.filter(m => (m.score || 0) >= l.minScore && (m.score || 0) <= l.maxScore).length,
              color: l.color.includes('emerald') ? '#10b981' : l.color.includes('amber') ? '#f59e0b' : l.color.includes('red') ? '#ef4444' : '#6366f1'
            })).filter(d => d.value > 0)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 min-h-[400px]">
          <OfensoresChart 
            monitorias={myMonitorias}
            forms={forms}
            title="Meus Ofensores"
            subtitle="Critérios onde você mais falhou"
            limit={5}
          />
        </div>
        <div className="lg:col-span-1">
          <SlaWidget 
            title="Aguardando Minha Ação"
            monitorias={myAllMonitorias} 
            users={users}
            targetStatus={['pendente_revisao', 'contestacao_negada']}
          />
        </div>
      </div>

      <RecentAuditsTable monitorias={myMonitorias} users={users} />
    </div>
  );
}
