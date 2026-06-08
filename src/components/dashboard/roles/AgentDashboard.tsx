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

// High-fidelity mock datasets for customization mode
const mockTrendData = [
  { name: '01/05', MeuScore: 84.5, MediaEquipe: 81.5 },
  { name: '05/05', MeuScore: 83.2, MediaEquipe: 82.1 },
  { name: '10/05', MeuScore: 86.1, MediaEquipe: 82.8 },
  { name: '15/05', MeuScore: 87.4, MediaEquipe: 83.5 },
  { name: '20/05', MeuScore: 85.9, MediaEquipe: 84.2 },
  { name: '25/05', MeuScore: 88.2, MediaEquipe: 85.0 }
];

const mockDistributionData = [
  { name: 'Excelente (90-100%)', value: 12, color: '#10B981' },
  { name: 'Aceitável (75-89%)', value: 5, color: '#3B82F6' },
  { name: 'Atenção (50-74%)', value: 1, color: '#F59E0B' },
  { name: 'Ruim (0-49%)', value: 0, color: '#EF4444' }
];

const mockMonitoriasOfensores = [
  { answers: { q1: 'NAO', q2: 'SIM', q3: 'SIM', q4: 'SIM', q5: 'SIM' } },
  { answers: { q1: 'NAO', q2: 'NAO', q3: 'SIM', q4: 'SIM', q5: 'SIM' } },
  { answers: { q1: 'SIM', q2: 'SIM', q3: 'NAO', q4: 'NAO', q5: 'SIM' } }
] as any[];

const mockForms = [
  {
    id: 'f1',
    sections: [
      {
        questions: [
          { id: 'q1', text: 'Conhecimento Técnico e Permissionamento' },
          { id: 'q2', text: 'Postura e Empatia no Atendimento' },
          { id: 'q3', text: 'Resolução no Primeiro Contato (FCR)' },
          { id: 'q4', text: 'Confirmação de Dados Cadastrais' },
          { id: 'q5', text: 'Segurança e Confidencialidade' }
        ]
      }
    ]
  }
] as any[];

const mockMonitoriasDeadlines = [
  {
    id: 'm1',
    display_id: '001',
    ticket_id: '10239',
    status: 'pendente_revisao',
    evaluator_name: 'Mariana Santos',
    created_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    action_deadline_at: new Date(Date.now() + 8 * 3600 * 1000).toISOString()
  },
  {
    id: 'm2',
    display_id: '002',
    ticket_id: '10482',
    status: 'contestacao_negada',
    evaluator_name: 'Mariana Santos',
    created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    action_deadline_at: new Date(Date.now() + 14 * 3600 * 1000).toISOString()
  }
] as any[];

const mockRecentMonitorias = [
  {
    id: 'm-rec-1',
    display_id: '1004',
    ticket_id: '98431',
    status: 'concluida',
    evaluator_name: 'Análise da Qualidade',
    score: 95.5,
    created_at: new Date().toISOString(),
    action_deadline_at: new Date().toISOString()
  },
  {
    id: 'm-rec-2',
    display_id: '1003',
    ticket_id: '98422',
    status: 'pendente_revisao',
    evaluator_name: 'Análise da Qualidade',
    score: 82.0,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    action_deadline_at: new Date(Date.now() + 72000000).toISOString()
  },
  {
    id: 'm-rec-3',
    display_id: '1002',
    ticket_id: '98415',
    status: 'em_contestacao',
    evaluator_name: 'Análise da Qualidade',
    score: 72.5,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    action_deadline_at: new Date(Date.now() + 36000000).toISOString()
  }
] as any[];

interface AgentDashboardProps {
  isCustomizing?: boolean;
  activeEditingId?: string | null;
  setActiveEditingId?: (id: string | null) => void;
}

export default function AgentDashboard({
  isCustomizing = false,
  activeEditingId,
  setActiveEditingId
}: AgentDashboardProps) {
  let dashboardData: any = {
    user: null,
    monitorias: [],
    allMonitorias: [],
    users: [],
    forms: [],
    globalAvg: 0
  };

  try {
    const context = useDashboard();
    if (context) {
      dashboardData = context;
    }
  } catch (e) {
    // safe fallback when outside DashboardProvider (e.g. customization preview)
  }

  const { user, monitorias, allMonitorias, users, forms, globalAvg } = dashboardData;
  const { config, getLevelForScore, isAboveTarget } = useQualityConfig();

  // --- Only MY monitorias (for personal metrics) - FILTERED BY UI
  const myMonitorias = useMemo(() => {
    if (isCustomizing) return [];
    return monitorias.filter((m: any) => m.evaluated_id === user?.id);
  }, [isCustomizing, monitorias, user]);

  // --- Only MY monitorias (for ActionDeadlineWidget/Pendencies) - UNFILTERED BY UI
  const myAllMonitorias = useMemo(() => {
    if (isCustomizing) return [];
    return allMonitorias.filter((m: any) => m.evaluated_id === user?.id);
  }, [isCustomizing, allMonitorias, user]);
  
  // --- Team Data (for comparison)
  const teamMonitorias = useMemo(() => {
    if (isCustomizing) return [];
    const myInfo = users.find((u: any) => u.id === user?.id);
    let myTeamIds = myInfo?.team_ids || user?.team_ids || [];
    
    if (myTeamIds.length === 0) {
      const fromRecords = allMonitorias.filter((m: any) => m.evaluated_id === user?.id && m.team_id).map((m: any) => m.team_id!);
      myTeamIds = Array.from(new Set(fromRecords));
    }

    return monitorias.filter((m: any) => m.team_id && myTeamIds.includes(m.team_id));
  }, [isCustomizing, monitorias, user, users, allMonitorias]);

  // --- Minha Média (follows all filters)
  const avgScore = useMemo(() => {
    if (isCustomizing) return 85.5;
    return myMonitorias.length > 0 ? (myMonitorias.reduce((a: number, m: any) => a + (m.score || 0), 0) / myMonitorias.length) : 0;
  }, [isCustomizing, myMonitorias]);

  // --- Média das Minhas Equipes (Follows filters, but specifically for teams the agent is part of)
  const teamAvgScore = useMemo(() => {
    if (isCustomizing) return 81.2;
    return teamMonitorias.length > 0 ? (teamMonitorias.reduce((a: number, m: any) => a + (m.score || 0), 0) / teamMonitorias.length) : 0;
  }, [isCustomizing, teamMonitorias]);

  // --- Contestation Metrics
  const myContestations = useMemo(() => {
    if (isCustomizing) return [];
    return myMonitorias.filter((m: any) => 
      m.history?.some((h: any) => 
        h.action.includes('Contestação') ||
        h.action.toLowerCase().includes('contestou') ||
        h.action.toLowerCase().includes('solicitou reavaliação')
      )
    );
  }, [isCustomizing, myMonitorias]);

  const contestationsApproved = useMemo(() => {
    if (isCustomizing) return 2;
    return myContestations.filter((m: any) => 
      m.status === 'contestacao_aceita' || 
      m.status === 'finalizada_alterada' ||
      m.history?.some((h: any) =>
        h.action.toLowerCase().includes('procedente') ||
        h.action.toLowerCase().includes('alterada') ||
        h.action.toLowerCase().includes('aceita') ||
        h.action.toLowerCase().includes('alterado') ||
        h.action.toLowerCase().includes('reavaliada')
      )
    ).length;
  }, [isCustomizing, myContestations]);

  const contestationsRejected = useMemo(() => {
    if (isCustomizing) return 2;
    return myContestations.filter((m: any) => 
      m.status === 'contestacao_negada' ||
      m.history?.some((h: any) =>
        h.action.includes('Improcedente') ||
        h.action.includes('Mantida') ||
        h.action.toLowerCase().includes('negada') ||
        h.action.toLowerCase().includes('recusada') ||
        h.action.toLowerCase().includes('mantida')
      )
    ).length;
  }, [isCustomizing, myContestations]);

  // --- Trend Data (Agent vs Team)
  const trendData = useMemo(() => {
    if (isCustomizing) return mockTrendData;
    const days: Record<string, { myTotal: number, myCount: number, teamTotal: number, teamCount: number }> = {};
    
    // Process My Scores
    myMonitorias.forEach((m: any) => {
      const date = new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (!days[date]) days[date] = { myTotal: 0, myCount: 0, teamTotal: 0, teamCount: 0 };
      days[date].myTotal += m.score || 0;
      days[date].myCount += 1;
    });

    // Process Team Scores
    teamMonitorias.forEach((m: any) => {
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
  }, [isCustomizing, myMonitorias, teamMonitorias]);

  // --- Tendência: Compara a média da 2ª metade do período vs a 1ª metade
  const trendPercentage = useMemo(() => {
    if (isCustomizing) return 4.2;
    if (trendData.length < 2) return 0;
    const mid = Math.floor(trendData.length / 2);
    const firstHalf = trendData.slice(0, mid);
    const secondHalf = trendData.slice(mid);
    const avgFirst = firstHalf.reduce((a, b) => a + (b.MeuScore || 0), 0) / (firstHalf.filter(x => x.MeuScore !== undefined).length || 1);
    const avgSecond = secondHalf.reduce((a, b) => a + (b.MeuScore || 0), 0) / (secondHalf.filter(x => x.MeuScore !== undefined).length || 1);
    return avgFirst > 0 ? ((avgSecond / avgFirst) - 1) * 100 : 0;
  }, [isCustomizing, trendData]);

  // --- Total Pendentes: Monitorias aguardando ação do agente (Ciente ou Re-contestação)
  const pendingCount = useMemo(() => {
    if (isCustomizing) return 2;
    return myAllMonitorias.filter((m: any) => ['pendente_revisao', 'contestacao_negada'].includes(m.status)).length;
  }, [isCustomizing, myAllMonitorias]);

  const resolvedGlobalAvg = useMemo(() => {
    if (isCustomizing) return 82.4;
    return globalAvg || 0;
  }, [isCustomizing, globalAvg]);

  const level = getLevelForScore(avgScore);

  const scoreDiff = avgScore - config.targetScore;
  const diffSign = scoreDiff >= 0 ? '↑' : '↓';
  const diffColorClass = scoreDiff >= 0
    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
    : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400';

  const myMonitoriasCount = useMemo(() => {
    if (isCustomizing) return 18;
    return myMonitorias.length;
  }, [isCustomizing, myMonitorias]);

  const volDiff = myMonitoriasCount - config.targetVolume;
  const volSign = volDiff >= 0 ? '↑' : '↓';
  const volColorClass = volDiff >= 0
    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
    : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400';

  const myContestationsCount = useMemo(() => {
    if (isCustomizing) return 4;
    return myContestations.length;
  }, [isCustomizing, myContestations]);

  return (
    <div className="space-y-6 animate-fade-in min-w-0 overflow-visible">
      {/* Linha 1: Benchmarks de Performance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
        <StatCard
          title="Minha Média"
          value={`${avgScore.toFixed(2)}%`}
          sub={level.label}
          good={isAboveTarget(avgScore)}
          icon={<Target className="w-5 h-5" />}
          accent="text-slate-500"
          badge={
            <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${diffColorClass}`}>
              {diffSign} {Math.abs(scoreDiff).toFixed(2)}%
            </span>
          }
          isCustomizing={isCustomizing}
          profile="suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Média Equipe"
          value={`${teamAvgScore.toFixed(2)}%`}
          sub={avgScore >= teamAvgScore ? 'Acima da média' : 'Abaixo da média'}
          good={avgScore >= teamAvgScore}
          icon={<Users className="w-5 h-5" />}
          accent="text-slate-500"
          isCustomizing={isCustomizing}
          profile="suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Média Global"
          value={`${resolvedGlobalAvg.toFixed(2)}%`}
          sub="Empresa"
          good={avgScore >= resolvedGlobalAvg}
          icon={<Users className="w-5 h-5" />}
          accent="text-slate-500"
          isCustomizing={isCustomizing}
          profile="suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Tendência"
          value={`${trendPercentage >= 0 ? '+' : ''}${trendPercentage.toFixed(1)}%`}
          sub="Evolução no período"
          good={trendPercentage >= 0}
          icon={<TrendingUp className="w-5 h-5" />}
          accent="text-functional-success"
          isCustomizing={isCustomizing}
          profile="suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      {/* Linha 2: Volume e Contestações */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
        <StatCard
          title="Monitorias"
          value={myMonitoriasCount.toString()}
          sub="Total no período"
          good={volDiff >= 0}
          icon={<ClipboardCheck className="w-5 h-5" />}
          accent={volDiff >= 0 ? 'text-functional-success' : 'text-functional-error'}
          badge={
            <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${volColorClass}`}>
              {volSign} {Math.abs(volDiff)}
            </span>
          }
          isCustomizing={isCustomizing}
          profile="suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Total Pendentes"
          value={pendingCount.toString()}
          sub="Aguardando sua ação"
          good={pendingCount === 0}
          icon={pendingCount === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          accent={pendingCount === 0 ? 'text-functional-success' : 'text-functional-error'}
          isCustomizing={isCustomizing}
          profile="suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Solicitadas"
          value={myContestationsCount.toString()}
          sub="Contestações abertas"
          good={true}
          icon={<ClipboardCheck className="w-5 h-5" />}
          accent="text-slate-500"
          isCustomizing={isCustomizing}
          profile="suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Aprovadas"
          value={contestationsApproved.toString()}
          sub="Nota Alterada"
          good={true}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="text-functional-success"
          isCustomizing={isCustomizing}
          profile="suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Recusadas"
          value={contestationsRejected.toString()}
          sub="Nota Mantida"
          good={false}
          icon={<XCircle className="w-5 h-5" />}
          accent="text-functional-error"
          isCustomizing={isCustomizing}
          profile="suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[380px]">
          <TrendChart 
            data={trendData} 
            title="Evolução Comparativa"
            subtitle="Meu Score vs Média da Equipe"
            dataKeys={[
              { key: 'MeuScore', name: 'Meu Score', color: chartPalette().excelente },
              { key: 'MediaEquipe', name: 'Média Equipe', color: chartPalette().aceitavel }
            ]}
            isCustomizing={isCustomizing}
            profile="suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
        <div className="lg:col-span-1 h-[380px]">
          <DistributionChart 
            title="Minha Classificação"
            data={isCustomizing ? mockDistributionData : config.levels.map(l => ({
              name: l.label,
              value: myMonitorias.filter(m => (m.score || 0) >= l.minScore && (m.score || 0) <= l.maxScore).length,
              color: l.color.includes('aceitavel') || l.color.includes('emerald') ? chartPalette().aceitavel : l.color.includes('atencao') || l.color.includes('amber') ? chartPalette().atencao : l.color.includes('ruim') || l.color.includes('red') ? chartPalette().ruim : chartPalette().excelente
            })).filter(d => d.value > 0)}
            isCustomizing={isCustomizing}
            profile="suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[420px]">
          <OfensoresChart 
            monitorias={isCustomizing ? mockMonitoriasOfensores : myMonitorias}
            forms={isCustomizing ? mockForms : forms}
            title="Meus Ofensores"
            subtitle="Critérios onde você mais falhou"
            limit={5}
            isCustomizing={isCustomizing}
            profile="suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
        <div className="lg:col-span-1 h-[420px]">
          <ActionDeadlineWidget
            title="Aguardando Minha Ação"
            monitorias={isCustomizing ? mockMonitoriasDeadlines : myAllMonitorias}
            targetStatus={['pendente_revisao', 'contestacao_negada']}
            isCustomizing={isCustomizing}
            profile="suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      <div className="overflow-hidden">
        <RecentAuditsTable 
          monitorias={isCustomizing ? mockRecentMonitorias : myMonitorias} 
          users={users} 
          title="Minhas Auditorias Recentes"
          isCustomizing={isCustomizing}
        />
      </div>
    </div>
  );
}
