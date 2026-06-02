import React, { useMemo } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import DistributionChart from '../widgets/DistributionChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import ActionDeadlineWidget from '../widgets/ActionDeadlineWidget';
import OfensoresChart from '../widgets/OfensoresChart';
import { Target, ClipboardCheck, AlertTriangle, TrendingUp, CheckCircle2, XCircle, Users } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { chartPalette } from '../chartColors';

export default function AgentDashboard() {
  const { user, monitorias, allMonitorias, users, forms } = useDashboard();
  const { config, getLevelForScore, isAboveTarget } = useQualityConfig();

  // --- Only MY monitorias (for personal metrics) - FILTERED BY UI
  const myMonitorias = useMemo(() => 
    monitorias.filter(m => m.evaluated_id === user?.id), 
    [monitorias, user]
  );

  // --- Only MY monitorias (for ActionDeadlineWidget/Pendencies) - UNFILTERED BY UI
  const myAllMonitorias = useMemo(() => 
    allMonitorias.filter(m => m.evaluated_id === user?.id), 
    [allMonitorias, user]
  );
  
  // --- Team Data (for comparison)
  const teamMonitorias = useMemo(() => {
    const myInfo = users.find(u => u.id === user?.id);
    let myTeamIds = myInfo?.team_ids || user?.team_ids || [];
    
    if (myTeamIds.length === 0) {
      const fromRecords = allMonitorias.filter(m => m.evaluated_id === user?.id && m.team_id).map(m => m.team_id!);
      myTeamIds = Array.from(new Set(fromRecords));
    }

    return monitorias.filter(m => m.team_id && myTeamIds.includes(m.team_id));
  }, [monitorias, user, users]);

  // --- Minha Média (follows all filters)
  const avgScore = useMemo(() => 
    myMonitorias.length > 0 ? (myMonitorias.reduce((a, m) => a + (m.score || 0), 0) / myMonitorias.length) : 0, 
    [myMonitorias]
  );

  // --- Média das Minhas Equipes (Follows filters, but specifically for teams the agent is part of)
  const teamAvgScore = useMemo(() => 
    teamMonitorias.length > 0 ? (teamMonitorias.reduce((a, m) => a + (m.score || 0), 0) / teamMonitorias.length) : 0, 
    [teamMonitorias]
  );

  // --- Global Average is already provided by DashboardContext as globalAvg

  // --- Contestation Metrics
  const myContestations = useMemo(() => 
    myMonitorias.filter(m => 
      m.history?.some(h => 
        h.action.includes('Contestação') ||
        h.action.toLowerCase().includes('contestou') ||
        h.action.toLowerCase().includes('solicitou reavaliação')
      )
    ),
    [myMonitorias]
  );

  const contestationsApproved = useMemo(() => 
    myContestations.filter(m => 
      m.status === 'contestacao_aceita' || 
      m.status === 'finalizada_alterada' ||
      m.history?.some(h =>
        h.action.toLowerCase().includes('procedente') ||
        h.action.toLowerCase().includes('alterada') ||
        h.action.toLowerCase().includes('aceita') ||
        h.action.toLowerCase().includes('alterado') ||
        h.action.toLowerCase().includes('reavaliada')
      )
    ).length,
    [myContestations]
  );

  const contestationsRejected = useMemo(() => 
    myContestations.filter(m => 
      m.status === 'contestacao_negada' ||
      m.history?.some(h =>
        h.action.includes('Improcedente') ||
        h.action.includes('Mantida') ||
        h.action.toLowerCase().includes('negada') ||
        h.action.toLowerCase().includes('recusada') ||
        h.action.toLowerCase().includes('mantida')
      )
    ).length,
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

  // --- Tendência: Compara a média da 2ª metade do período vs a 1ª metade
  const trendPercentage = useMemo(() => {
    if (trendData.length < 2) return 0;
    const mid = Math.floor(trendData.length / 2);
    const firstHalf = trendData.slice(0, mid);
    const secondHalf = trendData.slice(mid);
    const avgFirst = firstHalf.reduce((a, b) => a + (b.MeuScore || 0), 0) / (firstHalf.filter(x => x.MeuScore !== undefined).length || 1);
    const avgSecond = secondHalf.reduce((a, b) => a + (b.MeuScore || 0), 0) / (secondHalf.filter(x => x.MeuScore !== undefined).length || 1);
    return avgFirst > 0 ? ((avgSecond / avgFirst) - 1) * 100 : 0;
  }, [trendData]);

  // --- Total Pendentes: Monitorias aguardando ação do agente (Ciente ou Re-contestação)
  const pendingCount = useMemo(() => 
    myAllMonitorias.filter(m => ['pendente_revisao', 'contestacao_negada'].includes(m.status)).length,
    [myAllMonitorias]
  );

  const { globalAvg } = useDashboard();
  const level = getLevelForScore(avgScore);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Linha 1: Benchmarks de Performance */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Minha Média"
          value={`${avgScore.toFixed(2)}%`}
          sub={level.label}
          good={isAboveTarget(avgScore)}
          icon={<Target className="w-5 h-5" />}
          accent={level.color}
          badge={
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-black rounded-md ${isAboveTarget(avgScore) ? 'bg-functional-success/10 text-functional-success' : 'bg-functional-error/10 text-functional-error'}`}>
              {isAboveTarget(avgScore) ? '↑' : '↓'}
            </span>
          }
        />
        <StatCard
          title="Média Equipe"
          value={`${teamAvgScore.toFixed(2)}%`}
          sub={avgScore >= teamAvgScore ? 'Acima da média' : 'Abaixo da média'}
          good={avgScore >= teamAvgScore}
          icon={<Users className="w-5 h-5" />}
          accent="text-brand-muted"
        />
        <StatCard
          title="Média Global"
          value={`${globalAvg.toFixed(2)}%`}
          sub="Empresa"
          good={avgScore >= globalAvg}
          icon={<Users className="w-5 h-5" />}
          accent="text-brand-muted"
        />
        <StatCard
          title="Tendência"
          value={`${trendPercentage >= 0 ? '+' : ''}${trendPercentage.toFixed(1)}%`}
          sub="Evolução no período"
          good={trendPercentage >= 0}
      icon={<TrendingUp className="w-5 h-5" />}
      accent="text-functional-success"
    />
  </div>

  {/* Linha 2: Volume e Contestações (Contagem Única por Monitoria) */}
  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
    <StatCard
      title="Monitorias"
      value={myMonitorias.length.toString()}
      sub="Total no período"
      good={true}
      icon={<ClipboardCheck className="w-5 h-5" />}
      accent="text-brand-primary"
        />
        <StatCard
          title="Total Pendentes"
          value={pendingCount.toString()}
          sub="Aguardando sua ação"
          good={pendingCount === 0}
          icon={pendingCount === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          accent={pendingCount === 0 ? 'text-functional-success' : 'text-functional-error'}
        />
        <StatCard
          title="Solicitadas"
          value={myContestations.length.toString()}
          sub="Contestações abertas"
          good={true}
          icon={<ClipboardCheck className="w-5 h-5" />}
          accent="text-brand-muted"
        />
        <StatCard
          title="Aprovadas"
          value={contestationsApproved.toString()}
          sub="Nota Alterada"
          good={true}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="text-functional-success"
        />
        <StatCard
          title="Recusadas"
          value={contestationsRejected.toString()}
          sub="Nota Mantida"
          good={false}
          icon={<XCircle className="w-5 h-5" />}
          accent="text-functional-error"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[350px]">
          <TrendChart 
            data={trendData} 
            title="Evolução Comparativa"
            subtitle="Meu Score vs Média da Equipe"
      dataKeys={[
        { key: 'MeuScore', name: 'Meu Score', color: chartPalette().excelente },
        { key: 'MediaEquipe', name: 'Média Equipe', color: chartPalette().aceitavel }
      ]}
          />
        </div>
        <div className="lg:col-span-1 h-[350px]">
          <DistributionChart 
            title="Minha Classificação"
            data={config.levels.map(l => ({
              name: l.label,
              value: myMonitorias.filter(m => (m.score || 0) >= l.minScore && (m.score || 0) <= l.maxScore).length,
              color: l.color.includes('aceitavel') || l.color.includes('emerald') ? chartPalette().aceitavel : l.color.includes('atencao') || l.color.includes('amber') ? chartPalette().atencao : l.color.includes('ruim') || l.color.includes('red') ? chartPalette().ruim : chartPalette().excelente
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
<ActionDeadlineWidget
          title="Aguardando Minha Ação"
          monitorias={myAllMonitorias}
          targetStatus={['pendente_revisao', 'contestacao_negada']}
        />
        </div>
      </div>

      <RecentAuditsTable monitorias={myMonitorias} users={users} />
    </div>
  );
}
