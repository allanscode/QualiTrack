import React, { useState, useEffect, useMemo } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import DistributionChart from '../widgets/DistributionChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import ActionDeadlineWidget from '../widgets/ActionDeadlineWidget';
import ComparativeBarChart from '../widgets/ComparativeBarChart';
import OfensoresChart from '../widgets/OfensoresChart';
import { ClipboardCheck, Target, CheckCircle2, XCircle, AlertTriangle, History } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { isApprovalAction, isRejectionAction, isContestationAction } from '../../../lib/contestation';
import { chartColorMap, chartPalette } from '../chartColors';

// High-fidelity mock datasets for customization mode
const mockTrendData = [
  { name: '01/05', ScoreMedio: 82.3, MeuScore: 84.5, ScoreEquipe: 81.2, MediaEquipe: 81.5 },
  { name: '05/05', ScoreMedio: 84.1, MeuScore: 83.2, ScoreEquipe: 82.5, MediaEquipe: 82.1 },
  { name: '10/05', ScoreMedio: 83.8, MeuScore: 86.1, ScoreEquipe: 83.1, MediaEquipe: 82.8 },
  { name: '15/05', ScoreMedio: 85.2, MeuScore: 87.4, ScoreEquipe: 84.8, MediaEquipe: 83.5 },
  { name: '20/05', ScoreMedio: 86.5, MeuScore: 85.9, ScoreEquipe: 85.2, MediaEquipe: 84.2 },
  { name: '25/05', ScoreMedio: 87.0, MeuScore: 88.2, ScoreEquipe: 86.1, MediaEquipe: 85.0 }
];

const mockDistributionData = [
  { name: 'Excelente (90-100%)', value: 35, color: '#10B981' },
  { name: 'Aceitável (75-89%)', value: 18, color: '#3B82F6' },
  { name: 'Atenção (50-74%)', value: 5, color: '#F59E0B' },
  { name: 'Ruim (0-49%)', value: 2, color: '#EF4444' }
];

const mockPrecisionData = [
  { name: 'Estáveis', value: 54, color: '#10B981' },
  { name: 'Reavaliadas', value: 6, color: '#F59E0B' }
];

const mockComparativeData = [
  { name: 'Seg', meuVolume: 5, mediaEquipe: 4.2 },
  { name: 'Ter', meuVolume: 6, mediaEquipe: 4.5 },
  { name: 'Qua', meuVolume: 4, mediaEquipe: 4.0 },
  { name: 'Qui', meuVolume: 7, mediaEquipe: 4.8 },
  { name: 'Sex', meuVolume: 5, mediaEquipe: 4.3 }
];

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
    status: 'em_contestacao',
    evaluated_name: 'Ana Silva',
    created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    action_deadline_at: new Date(Date.now() + 14 * 3600 * 1000).toISOString()
  }
] as any[];

const mockMonitoriasOfensores = [
  { answers: { q1: 'NAO', q2: 'SIM', q3: 'SIM', q4: 'SIM', q5: 'SIM' } },
  { answers: { q1: 'NAO', q2: 'NAO', q3: 'SIM', q4: 'SIM', q5: 'SIM' } },
  { answers: { q1: 'NAO', q2: 'NAO', q3: 'NAO', q4: 'SIM', q5: 'SIM' } },
  { answers: { q1: 'SIM', q2: 'SIM', q3: 'NAO', q4: 'NAO', q5: 'SIM' } },
  { answers: { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM', q5: 'NAO' } }
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

const mockRecentMonitorias = [
  {
    id: 'm-rec-1',
    display_id: '1004',
    ticket_id: '98431',
    status: 'concluida',
    evaluator_id: 'u1',
    evaluated_id: 'u3',
    score: 95.5,
    created_at: new Date().toISOString(),
    action_deadline_at: new Date().toISOString()
  },
  {
    id: 'm-rec-2',
    display_id: '1003',
    ticket_id: '98422',
    status: 'pendente_revisao',
    evaluator_id: 'u1',
    evaluated_id: 'u4',
    score: 82.0,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    action_deadline_at: new Date(Date.now() + 72000000).toISOString()
  },
  {
    id: 'm-rec-3',
    display_id: '1002',
    ticket_id: '98415',
    status: 'em_contestacao',
    evaluator_id: 'u2',
    evaluated_id: 'u5',
    score: 72.5,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    action_deadline_at: new Date(Date.now() + 36000000).toISOString()
  },
  {
    id: 'm-rec-4',
    display_id: '1001',
    ticket_id: '98399',
    status: 'concluida',
    evaluator_id: 'u2',
    evaluated_id: 'u6',
    score: 48.0,
    created_at: new Date(Date.now() - 14400000).toISOString(),
    action_deadline_at: new Date().toISOString()
  }
] as any[];

interface QualityDashboardProps {
  isCustomizing?: boolean;
  activeEditingId?: string | null;
  setActiveEditingId?: (id: string | null) => void;
}

export default function QualityDashboard({
  isCustomizing = false,
  activeEditingId,
  setActiveEditingId
}: QualityDashboardProps) {
  let dashboardData: any = {
    user: null,
    monitorias: [],
    users: [],
    forms: []
  };

  try {
    const context = useDashboard();
    if (context) {
      dashboardData = context;
    }
  } catch (e) {
    // safe fallback when outside DashboardProvider (e.g. customization preview)
  }

  const { user, monitorias, users, forms } = dashboardData;
  const { config, getLevelForScore, isAboveTarget } = useQualityConfig();
  const [comparativeData, setComparativeData] = useState<any[]>([]);

  const myMonitorias = useMemo(() => {
    if (isCustomizing) return [];
    return monitorias.filter((m: any) => m.evaluator_id === user?.id);
  }, [isCustomizing, monitorias, user]);
  
  const scoredMonitorias = useMemo(() => {
    if (isCustomizing) return [];
    return myMonitorias.filter((m: any) => m.score !== undefined && m.score !== null);
  }, [isCustomizing, myMonitorias]);

  const avgScore = useMemo(() => {
    if (isCustomizing) return 86.15;
    return scoredMonitorias.length > 0
      ? scoredMonitorias.reduce((a: number, m: any) => a + (m.score || 0), 0) / scoredMonitorias.length
      : 0;
  }, [isCustomizing, scoredMonitorias]);
  
  // Monitorias que tiveram pelo menos uma contestação
  const contestedMyMonitorias = useMemo(() => {
    if (isCustomizing) return [];
    return myMonitorias.filter((m: any) =>
      m.history?.some((h: any) => isContestationAction(h.action))
    );
  }, [isCustomizing, myMonitorias]);

  // Conta apenas pelo ÚLTIMO desfecho — evita dupla contagem em múltiplas rodadas
  const reavAccepted = useMemo(() => {
    if (isCustomizing) return 3;
    return contestedMyMonitorias.filter((m: any) => {
      const resolutions = (m.history || []).filter((h: any) =>
        isApprovalAction(h.action) || isRejectionAction(h.action)
      );
      if (resolutions.length === 0) return false;
      return isApprovalAction(resolutions[resolutions.length - 1].action);
    }).length;
  }, [isCustomizing, contestedMyMonitorias]);

  const reavRejected = useMemo(() => {
    if (isCustomizing) return 5;
    return contestedMyMonitorias.filter((m: any) => {
      const resolutions = (m.history || []).filter((h: any) =>
        isApprovalAction(h.action) || isRejectionAction(h.action)
      );
      if (resolutions.length === 0) return false;
      return isRejectionAction(resolutions[resolutions.length - 1].action);
    }).length;
  }, [isCustomizing, contestedMyMonitorias]);

  useEffect(() => {
    if (isCustomizing) return;
    async function calculateComparativeData() {
      try {
        const days: Record<string, { meuVolume: number, teamTotal: number, activeAuditors: Set<string> }> = {};
        
        monitorias.forEach((m: any) => {
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
  }, [isCustomizing, monitorias, user, users]);

  const gradeDistribution = useMemo(() => {
    if (isCustomizing) return mockDistributionData;
    const colorMap = chartColorMap();

    return config.levels.map(level => ({
      name: `${level.label} (${level.minScore}-${level.maxScore}%)`,
      value: myMonitorias.filter((m: any) => m.score >= level.minScore && m.score <= level.maxScore).length,
      color: colorMap[level.color] || '#94a3b8'
    })).filter(d => d.value > 0);
  }, [isCustomizing, config.levels, myMonitorias]);

  const totalReevaluated = useMemo(() => {
    if (isCustomizing) return 3;
    // "Reavaliada" = quality's original assessment was CHANGED (contestation accepted)
    // "Estável"   = quality maintained their assessment (including rejected contestations)
    return myMonitorias.filter((m: any) => 
      ['contestacao_aceita', 'finalizada_alterada'].includes(m.status) ||
      m.history?.some((h: any) => 
        h.action.toLowerCase().includes('reavaliada') ||
        h.action.toLowerCase().includes('procedente') ||
        h.action.toLowerCase().includes('alterada')
      )
    ).length;
  }, [isCustomizing, myMonitorias]);

  const pendingAuditsCount = useMemo(() => {
    if (isCustomizing) return 1;
    return myMonitorias.filter((m: any) => 
      m.active !== false && 
      !['concluida', 'finalizada_alterada', 'contestacao_aceita', 'contestacao_negada'].includes(m.status)
    ).length;
  }, [isCustomizing, myMonitorias]);

  const pendingActions = useMemo(() => {
    if (isCustomizing) return 2;
    return myMonitorias.filter((m: any) => m.status === 'em_contestacao').length;
  }, [isCustomizing, myMonitorias]);

  const myMonitoriasCount = useMemo(() => {
    if (isCustomizing) return 48;
    return myMonitorias.length;
  }, [isCustomizing, myMonitorias]);

  const scoreDiff = avgScore - config.targetScore;
  const diffSign = scoreDiff >= 0 ? '↑' : '↓';
  const diffColorClass = scoreDiff >= 0
    ? 'bg-green-50 text-green-700 dark:bg-green-955/30 dark:text-green-400'
    : 'bg-red-50 text-red-700 dark:bg-red-955/30 dark:text-red-400';

  const volDiff = myMonitoriasCount - config.targetVolume;
  const volSign = volDiff >= 0 ? '↑' : '↓';
  const volColorClass = volDiff >= 0
    ? 'bg-green-50 text-green-700 dark:bg-green-955/30 dark:text-green-400'
    : 'bg-red-50 text-red-700 dark:bg-red-955/30 dark:text-red-400';

  const resolvedComparativeData = useMemo(() => {
    if (isCustomizing) return mockComparativeData;
    return comparativeData;
  }, [isCustomizing, comparativeData]);

  return (
    <div className="space-y-6 animate-fade-in min-w-0 overflow-visible">

      {/* Row 1: Key Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
        <StatCard
          title="Meu Volume"
          value={myMonitoriasCount}
          sub="no período"
          good={volDiff >= 0}
          icon={<ClipboardCheck className="w-5 h-5" />}
          accent={volDiff >= 0 ? 'text-functional-success' : 'text-functional-error'}
          valueColorClass={myMonitoriasCount >= config.targetVolume ? 'text-functional-success' : 'text-functional-error'}
          badge={
            <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${volColorClass}`}>
              {volSign} {Math.abs(volDiff)}
            </span>
          }
          isCustomizing={isCustomizing}
          profile="qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Nota Média"
          value={`${avgScore.toFixed(2)}%`}
          sub="Média das notas aplicadas"
          good={isAboveTarget(avgScore)}
          icon={<Target className="w-5 h-5" />}
          accent="text-slate-500"
          valueColorClass={avgScore >= config.targetScore ? 'text-functional-success' : 'text-functional-error'}
          badge={
            <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${diffColorClass}`}>
              {diffSign} {Math.abs(scoreDiff).toFixed(2)}%
            </span>
          }
          isCustomizing={isCustomizing}
          profile="qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Pendente Ação"
          value={pendingActions}
          sub="Aguardando reanálise"
          good={pendingActions === 0}
          icon={pendingActions === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          accent={pendingActions === 0 ? 'text-functional-success' : 'text-functional-error'}
          valueColorClass={pendingActions > 0 ? 'text-functional-error' : 'text-functional-success'}
          isCustomizing={isCustomizing}
          profile="qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      {/* Row 2: Reevaluation Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
        <StatCard
          title="Reav. Aceitas"
          value={reavAccepted}
          sub="Procedentes (Nota alterada)"
          good={true}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="text-functional-success"
          valueColorClass="text-functional-success"
          isCustomizing={isCustomizing}
          profile="qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Reav. Recusadas"
          value={reavRejected}
          sub="Improcedentes (Nota mantida)"
          good={true}
          icon={<XCircle className="w-5 h-5" />}
          accent="text-functional-error"
          valueColorClass="text-functional-error"
          isCustomizing={isCustomizing}
          profile="qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Total Reav Recebidas"
          value={reavAccepted + reavRejected}
          sub="Total de contestações"
          good={true}
          icon={<History className="w-5 h-5" />}
          accent="text-slate-500"
          isCustomizing={isCustomizing}
          profile="qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      {/* Row 3: Main Charts (Volume and Pendents) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[340px]">
          <ComparativeBarChart
            title="Volumetria Diária"
            subtitle="Comparativo com a média da equipe"
            data={resolvedComparativeData}
            dataKeys={[
              { key: 'meuVolume', name: 'Meu Volume', color: chartPalette().excelente },
              { key: 'mediaEquipe', name: 'Média Equipe', color: '#94a3b8' }
            ]}
            isCustomizing={isCustomizing}
            profile="qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
        <div className="h-[340px]">
          <StatCard
            title="Auditorias Pendentes"
            value={pendingAuditsCount}
            sub="Aguardando Conclusão"
            good={pendingAuditsCount === 0}
            icon={pendingAuditsCount === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            accent={pendingAuditsCount === 0 ? 'text-functional-success' : 'text-functional-warning'}
            valueColorClass={pendingAuditsCount > 0 ? 'text-functional-error' : 'text-functional-success'}
            isCustomizing={isCustomizing}
            profile="qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* Row 4: Quality Charts and Reevaluations (3 columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="h-[400px]">
          <DistributionChart 
            title="Minha Curva de Qualidade" 
            data={gradeDistribution} 
            isCustomizing={isCustomizing}
            profile="qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>

        <div className="h-[400px]">
          <DistributionChart 
            title="Precisão da Qualidade" 
            data={isCustomizing ? mockPrecisionData : [
              { name: 'Estáveis', value: myMonitorias.length - totalReevaluated, color: chartPalette().excelente },
              { name: 'Reavaliadas', value: totalReevaluated, color: chartPalette().atencao }
            ].filter(d => d.value > 0)} 
            isCustomizing={isCustomizing}
            profile="qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>

        <div className="h-[400px]">
          <ActionDeadlineWidget
            title="Minhas Reavaliações Pendentes"
            monitorias={isCustomizing ? mockMonitoriasDeadlines : myMonitorias}
            targetStatus="em_contestacao"
            isCustomizing={isCustomizing}
            profile="qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* Row 5: Maiores Ofensores (Full Width) */}
      <div className="grid grid-cols-1 gap-6">
        <div className="h-[420px]">
          <OfensoresChart 
            title="Maiores Ofensores"
            subtitle="Itens que você mais despontuou"
            monitorias={isCustomizing ? mockMonitoriasOfensores : myMonitorias} 
            forms={isCustomizing ? mockForms : forms} 
            isCustomizing={isCustomizing}
            profile="qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* Row 6: Recent Audits (Full Width) */}
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
