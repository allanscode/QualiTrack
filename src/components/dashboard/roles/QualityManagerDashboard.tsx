import React, { useMemo, useState } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import RankingWidget from '../widgets/RankingWidget';
import OfensoresChart from '../widgets/OfensoresChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import DistributionChart from '../widgets/DistributionChart';
import Card from '../../ui/Card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Target, AlertTriangle, TrendingUp, CheckCircle2, XCircle, Users, History, Activity, PieChart as PieChartIcon, ClipboardCheck, Award } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { isApprovalAction, isRejectionAction, isContestationAction } from '../../../lib/contestation';
import { chartColorMap, chartColorArray, chartPalette } from '../chartColors';
import ComparativeBarChart from '../widgets/ComparativeBarChart';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

// High-fidelity mock datasets for customization mode
const mockPrecisionData = [
  { name: 'Estáveis', value: 54, color: '#10B981' },
  { name: 'Reavaliadas', value: 6, color: '#F59E0B' }
];

const mockContestationsApproved = [
  { id: '1', name: 'Ana Silva', count: 4 },
  { id: '2', name: 'Bruno Costa', count: 2 },
  { id: '3', name: 'Daniel Oliveira', count: 1 }
];

const mockContestationsRejected = [
  { id: '6', name: 'Fabio Santos', count: 5 },
  { id: '7', name: 'Gabriela Melo', count: 3 },
  { id: '8', name: 'João Alves', count: 2 }
];

const mockReevaluationsByAuditor = [
  { name: 'Mariana Santos', Aceitas: 4, Recusadas: 2 },
  { name: 'Rodrigo Lima', Aceitas: 2, Recusadas: 5 },
  { name: 'Amanda Costa', Aceitas: 3, Recusadas: 1 },
  { name: 'Felipe Souza', Aceitas: 1, Recusadas: 3 }
];

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

const mockTeamDistribution = [
  { name: 'Alpha', value: 35, color: '#3B82F6' },
  { name: 'Beta', value: 25, color: '#10B981' },
  { name: 'Delta', value: 15, color: '#F59E0B' },
  { name: 'Gama', value: 10, color: '#EF4444' }
];

const mockTopAgents = [
  { id: '1', name: 'Ana Silva', score: 96.5, count: 12 },
  { id: '2', name: 'Bruno Costa', score: 94.2, count: 10 },
  { id: '3', name: 'Carla Souza', score: 92.8, count: 11 },
  { id: '4', name: 'Daniel Oliveira', score: 91.5, count: 14 },
  { id: '5', name: 'Eduarda Lima', score: 90.1, count: 9 }
];

const mockBottomAgents = [
  { id: '6', name: 'Fabio Santos', score: 71.2, count: 8 },
  { id: '7', name: 'Gabriela Melo', score: 72.5, count: 11 },
  { id: '8', name: 'Hugo Rocha', score: 73.8, count: 9 },
  { id: '9', name: 'Isabela Cruz', score: 74.2, count: 10 },
  { id: '10', name: 'João Alves', score: 74.8, count: 12 }
];

const mockAuditorRanking = [
  { id: '11', name: 'Mariana Santos', score: 86.5, count: 42 },
  { id: '12', name: 'Rodrigo Lima', score: 85.2, count: 38 },
  { id: '13', name: 'Amanda Costa', score: 87.1, count: 35 },
  { id: '14', name: 'Felipe Souza', score: 84.8, count: 31 },
  { id: '15', name: 'Juliana Oliveira', score: 86.0, count: 28 }
];

const mockClientDissatisfaction = [
  { name: 'Navegação confusa', value: 12, color: '#3B82F6' },
  { name: 'Demora no retorno', value: 8, color: '#10B981' },
  { name: 'Tom inadequado', value: 5, color: '#F59E0B' },
  { name: 'Erro de sistema', value: 3, color: '#EF4444' }
];

const mockQualityDissatisfaction = [
  { name: 'Script incompleto', value: 15, color: '#3B82F6' },
  { name: 'Erro de registro', value: 10, color: '#10B981' },
  { name: 'Postura fria', value: 6, color: '#F59E0B' },
  { name: 'Sem FCR', value: 4, color: '#EF4444' }
];

const mockUsersList = [
  { id: 'u1', name: 'Mariana Santos', role: 'qualidade' },
  { id: 'u2', name: 'Rodrigo Lima', role: 'qualidade' },
  { id: 'u3', name: 'Ana Silva', role: 'suporte' },
  { id: 'u4', name: 'Bruno Costa', role: 'suporte' },
  { id: 'u5', name: 'Carla Souza', role: 'suporte' },
  { id: 'u6', name: 'Daniel Oliveira', role: 'suporte' }
];

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

const mockMonitoriasOfensores = [
  { answers: { q1: 'NAO', q2: 'SIM', q3: 'SIM', q4: 'SIM', q5: 'SIM' } },
  { answers: { q1: 'NAO', q2: 'NAO', q3: 'SIM', q4: 'SIM', q5: 'SIM' } },
  { answers: { q1: 'NAO', q2: 'NAO', q3: 'NAO', q4: 'SIM', q5: 'SIM' } },
  { answers: { q1: 'SIM', q2: 'SIM', q3: 'NAO', q4: 'NAO', q5: 'SIM' } },
  { answers: { q1: 'SIM', q2: 'SIM', q3: 'SIM', q4: 'SIM', q5: 'NAO' } }
] as any[];

interface QualityManagerDashboardProps {
  isCustomizing?: boolean;
  activeEditingId?: string | null;
  setActiveEditingId?: (id: string | null) => void;
}

export default function QualityManagerDashboard({
  isCustomizing = false,
  activeEditingId,
  setActiveEditingId
}: QualityManagerDashboardProps) {
  let dashboardData: any = {
    user: null,
    monitorias: [],
    users: [],
    teams: [],
    forms: [],
    onlineUsers: [],
    dissatisfactionFields: []
  };

  try {
    const context = useDashboard();
    if (context) {
      dashboardData = context;
    }
  } catch (e) {
    // safe fallback when outside DashboardProvider (e.g. customization preview)
  }

  const { monitorias, users, teams, forms, onlineUsers, dissatisfactionFields } = dashboardData;
  const { config, saveConfig, getLevelForScore } = useQualityConfig();

  const [hoverMedia, setHoverMedia] = useState(false);
  const [hoverCurva, setHoverCurva] = useState(false);
  const [tempMediaSub, setTempMediaSub] = useState('');
  const [tempCurvaSub, setTempCurvaSub] = useState('');

  // 1. Calculations - Real vs Mock Fallbacks
  const scoredMonitorias = useMemo(() => {
    if (isCustomizing) return [];
    return monitorias.filter((m: any) => m.score !== undefined && m.score !== null);
  }, [isCustomizing, monitorias]);

  const avgScore = useMemo(() => {
    if (isCustomizing) return 85.42;
    return scoredMonitorias.length > 0
      ? scoredMonitorias.reduce((a: number, m: any) => a + (m.score || 0), 0) / scoredMonitorias.length
      : 0;
  }, [isCustomizing, scoredMonitorias]);

  const pendingActions = useMemo(() => {
    if (isCustomizing) return 4;
    return monitorias.filter((m: any) =>
      ['pendente_revisao', 'em_contestacao', 'aguardando_gestor_suporte', 'aguardando_gestor_qualidade'].includes(m.status)
    ).length;
  }, [isCustomizing, monitorias]);

  const pendingMyActions = useMemo(() => {
    if (isCustomizing) return 1;
    return monitorias.filter((m: any) => m.status === 'aguardando_gestor_qualidade').length;
  }, [isCustomizing, monitorias]);

  const totalMonitorias = useMemo(() => {
    if (isCustomizing) return 85;
    return monitorias.length;
  }, [isCustomizing, monitorias]);

  // Monitorias que tiveram pelo menos uma contestação
  const contestedMonitorias = useMemo(() => {
    if (isCustomizing) return [];
    return monitorias.filter((m: any) =>
      m.history?.some((h: any) => isContestationAction(h.action))
    );
  }, [isCustomizing, monitorias]);

  const totalContestations = useMemo(() => {
    if (isCustomizing) return 12;
    return contestedMonitorias.length;
  }, [isCustomizing, contestedMonitorias]);

  // Conta apenas pelo ÚLTIMO desfecho — evita dupla contagem em múltiplas rodadas
  const reavAccepted = useMemo(() => {
    if (isCustomizing) return 1;
    return contestedMonitorias.filter((m: any) => {
      const resolutions = (m.history || []).filter((h: any) =>
        isApprovalAction(h.action) || isRejectionAction(h.action)
      );
      if (resolutions.length === 0) return false;
      return isApprovalAction(resolutions[resolutions.length - 1].action);
    }).length;
  }, [isCustomizing, contestedMonitorias]);

  const reavRejected = useMemo(() => {
    if (isCustomizing) return 11;
    return contestedMonitorias.filter((m: any) => {
      const resolutions = (m.history || []).filter((h: any) =>
        isApprovalAction(h.action) || isRejectionAction(h.action)
      );
      if (resolutions.length === 0) return false;
      return isRejectionAction(resolutions[resolutions.length - 1].action);
    }).length;
  }, [isCustomizing, contestedMonitorias]);

  const reversalRate = useMemo(() => {
    if (isCustomizing) return 8.33;
    return totalContestations > 0 ? (reavAccepted / totalContestations) * 100 : 0;
  }, [isCustomizing, totalContestations, reavAccepted]);

  const trendData = useMemo(() => {
    if (isCustomizing) return mockTrendData;
    const days: Record<string, { totalScore: number, count: number }> = {};
    scoredMonitorias.forEach((m: any) => {
      const date = new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (!days[date]) days[date] = { totalScore: 0, count: 0 };
      days[date].totalScore += m.score || 0;
      days[date].count += 1;
    });
    return Object.entries(days).map(([name, data]) => ({
      name,
      ScoreMedio: Math.round((data.totalScore / data.count) * 100) / 100
    })).sort((a, b) => {
      const [da, ma] = a.name.split('/').map(Number);
      const [db, mb] = b.name.split('/').map(Number);
      return ma !== mb ? ma - mb : da - db;
    });
  }, [isCustomizing, scoredMonitorias]);

  const trendPercentage = useMemo(() => {
    if (isCustomizing) return 2.45;
    if (trendData.length < 2) return 0;
    const mid = Math.floor(trendData.length / 2);
    const avgFirst = trendData.slice(0, mid).reduce((a, b) => a + b.ScoreMedio, 0) / (mid || 1);
    const avgSecond = trendData.slice(mid).reduce((a, b) => a + b.ScoreMedio, 0) / (trendData.length - mid || 1);
    return avgFirst > 0 ? ((avgSecond / avgFirst) - 1) * 100 : 0;
  }, [isCustomizing, trendData]);

  const colorMap = chartColorMap();

  const gradeDistribution = useMemo(() => {
    if (isCustomizing) return mockDistributionData;
    return config.levels
      .map(level => ({
        name: `${level.label} (${level.minScore}-${level.maxScore}%)`,
        value: scoredMonitorias.filter((m: any) => (m.score || 0) >= level.minScore && (m.score || 0) <= level.maxScore).length,
        color: colorMap[level.color] || '#94a3b8'
      }))
      .filter(d => d.value > 0);
  }, [isCustomizing, config.levels, scoredMonitorias, colorMap]);

  const excellentCount = useMemo(() => {
    if (isCustomizing) return 35;
    return scoredMonitorias.filter((m: any) => {
      const lvl = getLevelForScore(m.score || 0);
      return lvl?.color === 'excelente';
    }).length;
  }, [isCustomizing, scoredMonitorias, getLevelForScore]);

  const excellentPercent = useMemo(() => {
    if (isCustomizing) return 64.81;
    return scoredMonitorias.length > 0 ? (excellentCount / scoredMonitorias.length) * 100 : 0;
  }, [isCustomizing, excellentCount, scoredMonitorias]);

  const excellentTrendPercentage = useMemo(() => {
    if (isCustomizing) return 4.81;
    if (scoredMonitorias.length < 2) return 0;
    const sorted = [...scoredMonitorias].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const mid = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, mid);
    const secondHalf = sorted.slice(mid);

    const getExcPercent = (list: typeof sorted) => {
      if (list.length === 0) return 0;
      const exc = list.filter((m: any) => {
        const lvl = getLevelForScore(m.score || 0);
        return lvl?.color === 'excelente';
      }).length;
      return (exc / list.length) * 100;
    };

    const firstExc = getExcPercent(firstHalf);
    const secondExc = getExcPercent(secondHalf);
    return secondExc - firstExc;
  }, [isCustomizing, scoredMonitorias, getLevelForScore]);

  const excDiffSign = excellentTrendPercentage >= 0 ? '↑' : '↓';
  const excColorClass = excellentTrendPercentage >= 0
    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
    : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400';

  const teamMonitoriaDistribution = useMemo(() => {
    if (isCustomizing) return mockTeamDistribution;
    const counts: Record<string, number> = {};
    monitorias.forEach((m: any) => {
      const teamName = m.team_name || teams.find((t: any) => t.id === m.team_id)?.name || 'Sem Equipe';
      counts[teamName] = (counts[teamName] || 0) + 1;
    });

    const colors = chartColorArray();
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({
        name,
        value,
        color: colors[i % colors.length]
      }));
  }, [isCustomizing, monitorias, teams]);

  const auditorRanking = useMemo(() => {
    if (isCustomizing) return mockAuditorRanking;
    const map: Record<string, { total: number; count: number }> = {};
    monitorias.forEach((m: any) => {
      const id = m.evaluator_id;
      if (!id) return;
      if (!map[id]) map[id] = { total: 0, count: 0 };
      map[id].total += m.score || 0;
      map[id].count++;
    });
    return Object.entries(map)
      .map(([id, s]) => ({
        id,
        name: users.find((u: any) => u.id === id)?.name || id,
        score: Math.round((s.total / s.count) * 100) / 100,
        count: s.count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [isCustomizing, monitorias, users]);

  const agentRanking = useMemo(() => {
    if (isCustomizing) return [];
    const map: Record<string, { total: number; count: number }> = {};
    scoredMonitorias.forEach((m: any) => {
      const id = m.evaluated_id;
      if (!map[id]) map[id] = { total: 0, count: 0 };
      map[id].total += m.score || 0;
      map[id].count++;
    });
    return Object.entries(map)
      .map(([id, s]) => ({
        id,
        name: users.find((u: any) => u.id === id)?.name || id,
        score: Math.round((s.total / s.count) * 100) / 100,
        count: s.count
      }))
      .sort((a, b) => b.score - a.score);
  }, [isCustomizing, scoredMonitorias, users]);

  const topAgents = useMemo(() => {
    if (isCustomizing) return mockTopAgents;
    return agentRanking.filter((a: any) => a.score >= config.targetScore).slice(0, 5);
  }, [isCustomizing, agentRanking, config.targetScore]);

  const bottomAgents = useMemo(() => {
    if (isCustomizing) return mockBottomAgents;
    return agentRanking
      .filter((a: any) => a.score < config.targetScore)
      .sort((a: any, b: any) => a.score - b.score)
      .slice(0, 5);
  }, [isCustomizing, agentRanking, config.targetScore]);

  // --- Rankings de Contestações (Top 5 Agentes - Global)
  const topApprovedAgents = useMemo(() => {
    if (isCustomizing) return mockContestationsApproved;
    const map: Record<string, number> = {};
    monitorias.forEach((m: any) => {
      const isAccepted = m.status === 'contestacao_aceita' ||
                        m.status === 'finalizada_alterada' ||
                        m.history?.some((h: any) =>
                          h.action.toLowerCase().includes('procedente') ||
                          h.action.toLowerCase().includes('alterada') ||
                          h.action.toLowerCase().includes('aceita') ||
                          h.action.toLowerCase().includes('alterado') ||
                          h.action.toLowerCase().includes('reavaliada')
                        );

      if (isAccepted && m.evaluated_id) {
        map[m.evaluated_id] = (map[m.evaluated_id] || 0) + 1;
      }
    });
    return Object.entries(map)
      .map(([id, count]) => ({
        id,
        name: users.find((u: any) => u.id === id)?.name || 'Agente Externo',
        count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [isCustomizing, monitorias, users]);

  const topRejectedAgents = useMemo(() => {
    if (isCustomizing) return mockContestationsRejected;
    const map: Record<string, number> = {};
    monitorias.forEach((m: any) => {
      const isRejected = m.status === 'contestacao_negada' ||
                        m.history?.some((h: any) => h.action.toLowerCase().includes('negada') || h.action.toLowerCase().includes('recusada') || h.action.includes('Improcedente') || h.action.includes('Mantida'));

      if (isRejected && m.evaluated_id) {
        map[m.evaluated_id] = (map[m.evaluated_id] || 0) + 1;
      }
    });
    return Object.entries(map)
      .map(([id, count]) => ({
        id,
        name: users.find((u: any) => u.id === id)?.name || 'Agente Externo',
        count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [isCustomizing, monitorias, users]);

  // --- Precisão da Qualidade (Estáveis vs Reavaliadas)
  const precisionData = useMemo(() => {
    if (isCustomizing) return mockPrecisionData;
    const p = chartPalette();
    const total = scoredMonitorias.length;
    const reevaluated = reavAccepted;
    const stable = total - reevaluated;

    return [
      { name: 'Estáveis', value: stable, color: p.excelente },
      { name: 'Reavaliadas', value: reevaluated, color: p.atencao }
    ].filter(d => d.value > 0);
  }, [isCustomizing, scoredMonitorias, reavAccepted]);

  // --- Volumetria de Reavaliações (Aceitas vs Recusadas) por Agente da Qualidade
  const reevaluationVolumeData = useMemo(() => {
    if (isCustomizing) return mockReevaluationsByAuditor;
    // 1. Identifica todos os IDs únicos de avaliadores no período
    const evaluatorIds = Array.from(new Set(
      monitorias.map((m: any) => m.evaluator_id).filter((id: string): id is string => !!id)
    ));

    // 2. Para cada avaliador, conta pelo ÚLTIMO desfecho de cada monitoria
    return evaluatorIds.map(evaluatorId => {
      const auditorName = users.find((u: any) => u.id === evaluatorId)?.name || 'Avaliador';
      const auditorContested = monitorias.filter((m: any) =>
        m.evaluator_id === evaluatorId &&
        m.history?.some((h: any) => isContestationAction(h.action))
      );

      let aceitas = 0;
      let recusadas = 0;

      auditorContested.forEach((m: any) => {
        const resolutions = (m.history || []).filter((h: any) =>
          isApprovalAction(h.action) || isRejectionAction(h.action)
        );
        if (resolutions.length === 0) return;
        const last = resolutions[resolutions.length - 1];
        if (isApprovalAction(last.action)) aceitas++;
        else recusadas++;
      });

      return {
        name: auditorName,
        Aceitas: aceitas,
        Recusadas: recusadas
      };
    }).sort((a, b) => (b.Aceitas + b.Recusadas) - (a.Aceitas + a.Recusadas));
  }, [isCustomizing, monitorias, users]);


  const onlineSub = useMemo(() => (
    <div className="relative inline-flex items-center gap-1.5 select-none">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <span className="text-brand-muted text-xs font-semibold lowercase tracking-wider">
        {isCustomizing ? '8 conectados agora' : (onlineUsers.length === 1 ? '1 conectado agora' : `${onlineUsers.length} conectados agora`)}
      </span>
    </div>
  ), [isCustomizing, onlineUsers]);

  const scoreDiff = avgScore - config.targetScore;
  const diffSign = scoreDiff >= 0 ? '↑' : '↓';
  const diffColorClass = scoreDiff >= 0
    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
    : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400';

  const revDiff = reversalRate - config.targetReversalRate;
  const revSign = revDiff <= 0 ? '↓' : '↑';
  const revColorClass = revDiff <= 0
    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
    : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400';

  const CustomTooltipMedia = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const total = teamMonitoriaDistribution.reduce((sum, entry) => sum + entry.value, 0);
    const percent = total > 0 ? ((d.value / total) * 100).toFixed(1) : 0;
    return (
      <div className="bg-brand-primary text-brand-on-primary px-3 py-2 rounded-xl shadow-xl text-xs font-bold">
        <p className="mb-0.5">{d.name}</p>
        <p className="opacity-80">{d.value} monitorias ({percent}%)</p>
      </div>
    );
  };

  const CustomTooltipCurva = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const total = gradeDistribution.reduce((sum, entry) => sum + entry.value, 0);
    const percent = total > 0 ? ((d.value / total) * 100).toFixed(1) : 0;
    return (
      <div className="bg-brand-primary text-brand-on-primary px-3 py-2 rounded-xl shadow-xl text-xs font-bold">
        <p className="mb-0.5">{d.name}</p>
        <p className="opacity-80">{d.value} ocorrências ({percent}%)</p>
      </div>
    );
  };

  const getExplanation = (key: string, defaultText: string) => {
    const lookupKey = `gestor_qualidade_${key}`;
    return (config?.statCardExplanations?.[lookupKey] !== undefined && config.statCardExplanations[lookupKey] !== '')
      ? config.statCardExplanations[lookupKey]
      : (config?.statCardExplanations?.[key] !== undefined && config.statCardExplanations[key] !== '')
        ? config.statCardExplanations[key]
        : defaultText;
  };

  const mediaExplanation = getExplanation('Média Geral', 'Média de score global e divisão por equipe');
  const curvaExplanation = getExplanation('Curva de Qualidade', 'Distribuição percentual das notas em faixas');

  const isEditingMedia = activeEditingId === 'media-geral';
  const isEditingCurva = activeEditingId === 'curva-qualidade';

  const handleEditMediaClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempMediaSub(mediaExplanation.slice(0, 35));
    if (setActiveEditingId) {
      setActiveEditingId('media-geral');
    }
    setHoverMedia(false);
  };

  const handleSaveMedia = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updatedExplanations = {
        ...(config.statCardExplanations || {}),
        'gestor_qualidade_Média Geral': tempMediaSub,
      };
      await saveConfig({
        ...config,
        statCardExplanations: updatedExplanations,
      });
      toast.success('Descrição atualizada com sucesso!');
      if (setActiveEditingId) {
        setActiveEditingId(null);
      }
    } catch (err) {
      toast.error('Erro ao salvar descrição.');
    }
  };

  const handleCancelMedia = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (setActiveEditingId) {
      setActiveEditingId(null);
    }
  };

  const handleEditCurvaClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempCurvaSub(curvaExplanation.slice(0, 35));
    if (setActiveEditingId) {
      setActiveEditingId('curva-qualidade');
    }
    setHoverCurva(false);
  };

  const handleSaveCurva = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updatedExplanations = {
        ...(config.statCardExplanations || {}),
        'gestor_qualidade_Curva de Qualidade': tempCurvaSub,
      };
      await saveConfig({
        ...config,
        statCardExplanations: updatedExplanations,
      });
      toast.success('Descrição atualizada com sucesso!');
      if (setActiveEditingId) {
        setActiveEditingId(null);
      }
    } catch (err) {
      toast.error('Erro ao salvar descrição.');
    }
  };

  const handleCancelCurva = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (setActiveEditingId) {
      setActiveEditingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in min-w-0 overflow-visible">
      {/* LINHA 1 (FOCO TOTAL NO TOPO - REQUISITO CRÍTICO): Configure com lg:grid-cols-2 gap-6 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StatCard
          title="Média Geral"
          value={`${avgScore.toFixed(2)}%`}
          sub={isCustomizing ? 'Média simulada do período' : 'Média acumulada global'}
          good={avgScore >= config.targetScore}
          icon={<Target className="w-5 h-5" />}
          accent="text-brand-accent"
          badge={
            <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${isCustomizing ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' : diffColorClass}`}>
              {isCustomizing ? '↑' : diffSign} {isCustomizing ? '5.42%' : Math.abs(scoreDiff).toFixed(2) + '%'}
            </span>
          }
          isCustomizing={isCustomizing}
          profile="gestor_qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Índice de Excelência"
          value={`${excellentPercent.toFixed(2)}%`}
          sub={isCustomizing ? 'Percentual na faixa Excelente' : 'Percentual na faixa Excelente'}
          good={excellentPercent >= 50}
          icon={<Award className="w-5 h-5" />}
          accent="text-brand-accent"
          badge={
            <div className="flex items-center gap-1.5">
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest rounded-md ${
                excellentPercent >= 50
                  ? 'bg-functional-success/10 text-functional-success border border-functional-success/20'
                  : 'bg-functional-warning/10 text-functional-warning border border-functional-warning/20'
              }`}>
                {excellentPercent >= 50 ? 'Alto' : 'Médio'}
              </span>
              <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md ${isCustomizing ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' : excColorClass}`}>
                {isCustomizing ? '↑' : excDiffSign} {isCustomizing ? '4.81%' : Math.abs(excellentTrendPercentage).toFixed(2) + '%'}
              </span>
            </div>
          }
          isCustomizing={isCustomizing}
          profile="gestor_qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      {/* LINHA 2: Métricas Operacionais - Cards Menores (com Minhas Ações na 1ª posição e quebra harmônica) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        <StatCard
          title="Minhas Ações"
          value={pendingMyActions}
          sub="Aguardando sua decisão"
          good={pendingMyActions === 0}
          icon={pendingMyActions === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          accent={pendingMyActions === 0 ? 'text-functional-success' : 'text-functional-error'}
          isCustomizing={isCustomizing}
          profile="gestor_qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Total"
          value={totalMonitorias}
          sub="Volume de monitorias"
          good={true}
          icon={<ClipboardCheck className="w-5 h-5" />}
          accent="text-brand-accent"
          isCustomizing={isCustomizing}
          profile="gestor_qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Total Pendentes"
          value={pendingActions}
          sub="Ações abertas no sistema"
          good={pendingActions === 0}
          icon={pendingActions === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          accent={pendingActions === 0 ? 'text-functional-success' : 'text-functional-error'}
          isCustomizing={isCustomizing}
          profile="gestor_qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Usuários Online"
          value={isCustomizing ? 8 : onlineUsers.length}
          sub={onlineSub}
          good={true}
          icon={<Activity className="w-5 h-5" />}
          accent="text-slate-500"
          isCustomizing={isCustomizing}
          profile="gestor_qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Tendência"
          value={`${trendPercentage >= 0 ? '+' : ''}${trendPercentage.toFixed(2)}%`}
          sub="Evolução no período"
          good={trendPercentage >= 0}
          icon={<TrendingUp className="w-5 h-5" />}
          accent="text-functional-success"
          isCustomizing={isCustomizing}
          profile="gestor_qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      {/* LINHA 3: Métricas de Reavaliação (lg:grid-cols-4 gap-6) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Reavaliações"
          value={totalContestations}
          sub="Volume de contestações"
          good={true}
          icon={<History className="w-5 h-5" />}
          accent="text-slate-500"
          isCustomizing={isCustomizing}
          profile="gestor_qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Reav. Aprovadas"
          value={reavAccepted}
          sub="Contestações procedentes"
          good={true}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="text-functional-success"
          isCustomizing={isCustomizing}
          profile="gestor_qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Reav. Recusadas"
          value={reavRejected}
          sub="Contestações improcedentes"
          good={true}
          icon={<XCircle className="w-5 h-5" />}
          accent="text-functional-error"
          isCustomizing={isCustomizing}
          profile="gestor_qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Taxa de Reversão"
          value={`${reversalRate.toFixed(2)}%`}
          sub="Qualidade das monitorias"
          good={reversalRate <= config.targetReversalRate}
          icon={<Target className="w-5 h-5" />}
          accent={reversalRate <= config.targetReversalRate ? 'text-functional-success' : 'text-functional-error'}
          badge={
            <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${isCustomizing ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' : revColorClass}`}>
              {isCustomizing ? '↓' : revSign} {isCustomizing ? '1.67%' : Math.abs(revDiff).toFixed(2) + '%'}
            </span>
          }
          isCustomizing={isCustomizing}
          profile="gestor_qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      {/* LINHA 4: Gráficos de Distribuição Isolados (Distribuição por Equipe | Curva de Qualidade | Precisão da Qualidade, lg:grid-cols-3 gap-6) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bloco Distribuição por Equipe */}
        <div className="h-[380px]">
          {isEditingMedia ? (
            <Card padding="lg" className="h-full flex flex-col justify-between border-brand-accent/50 bg-surface-card shadow-lg animate-fade-in relative z-50">
              <div className="flex flex-col h-full gap-3" onClick={(e) => e.stopPropagation()}>
                <span className="text-[10px] font-black uppercase tracking-widest text-brand-muted">
                  Editar Descrição: Distribuição por Equipe
                </span>
                <textarea
                  value={tempMediaSub}
                  onChange={(e) => setTempMediaSub(e.target.value.slice(0, 35))}
                  maxLength={35}
                  className="w-full text-xs p-2.5 rounded-lg border border-surface-border bg-surface-bg text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-accent resize-none flex-1"
                  placeholder="Digite a descrição da métrica (máx. 35 caracteres)..."
                  autoFocus
                />
                <div className="text-[10px] text-brand-muted text-right -mt-1">
                  {tempMediaSub.length}/35
                </div>
                <div className="flex justify-end gap-1.5 mt-auto">
                  <button
                    type="button"
                    onClick={handleCancelMedia}
                    className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md text-brand-muted hover:bg-surface-subtle transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveMedia}
                    className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-brand-accent text-white hover:bg-brand-accent/90 transition-colors cursor-pointer"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </Card>
          ) : (
            <Card padding="lg" className="h-full flex flex-col">
              <div className="flex items-center gap-3 mb-4 min-w-0">
                <div
                  className={`relative w-9 h-9 rounded-xl bg-icon-accent flex items-center justify-center flex-shrink-0 text-brand-accent transition-all ${
                    isCustomizing ? 'cursor-pointer hover:ring-2 hover:ring-brand-accent/50' : 'cursor-help'
                  }`}
                  onClick={isCustomizing ? handleEditMediaClick : undefined}
                  onMouseEnter={() => setHoverMedia(true)}
                  onMouseLeave={() => setHoverMedia(false)}
                >
                  <Target className="w-5 h-5 fill-current fill-opacity-15" strokeWidth={2} fill="currentColor" fillOpacity={0.15} />
                  <AnimatePresence>
                    {hoverMedia && mediaExplanation && (
                      <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.95 }}
                        transition={{ duration: 0.12, ease: 'easeOut' }}
                        className="absolute top-full left-0 mt-2 z-50 whitespace-nowrap bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-xl shadow-slate-900/10 border border-slate-800/10 dark:border-slate-200/10 pointer-events-none"
                      >
                        {mediaExplanation}{isCustomizing ? ' (Clique para editar)' : ''}
                        <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-900 dark:bg-slate-50 rotate-45" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest truncate flex-1 min-w-0">
                  Distribuição por Equipe
                </h3>
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                {teamMonitoriaDistribution.length > 0 ? (
                  <div className="flex-1 flex flex-col justify-between min-h-0">
                    <div className="flex-1 min-h-[140px] relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Tooltip content={<CustomTooltipMedia />} />
                          <Pie
                            data={teamMonitoriaDistribution}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={75}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {teamMonitoriaDistribution.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Compact Legend */}
                    <div className="max-h-[85px] overflow-y-auto pr-1 no-scrollbar flex flex-wrap justify-center gap-x-3 gap-y-1.5 mt-2 pt-2 border-t border-surface-border/40">
                      {teamMonitoriaDistribution.map((entry: any, index: number) => {
                        const totalVal = teamMonitoriaDistribution.reduce((acc: number, item: any) => acc + item.value, 0);
                        const percent = totalVal > 0 ? ((entry.value / totalVal) * 100).toFixed(1) : '0';
                        return (
                          <div key={index} className="flex items-center gap-1.5 text-[9px] text-brand-muted font-black uppercase tracking-tight">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                            {entry.name}: {entry.value} ({percent}%)
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-brand-muted opacity-40">
                    Sem dados por equipe
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Bloco Distribuição por Nível / Curva de Qualidade */}
        <div className="h-[380px]">
          {isEditingCurva ? (
            <Card padding="lg" className="h-full flex flex-col justify-between border-brand-accent/50 bg-surface-card shadow-lg animate-fade-in relative z-50">
              <div className="flex flex-col h-full gap-3" onClick={(e) => e.stopPropagation()}>
                <span className="text-[10px] font-black uppercase tracking-widest text-brand-muted">
                  Editar Descrição: Curva de Qualidade
                </span>
                <textarea
                  value={tempCurvaSub}
                  onChange={(e) => setTempCurvaSub(e.target.value.slice(0, 35))}
                  maxLength={35}
                  className="w-full text-xs p-2.5 rounded-lg border border-surface-border bg-surface-bg text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-accent resize-none flex-1"
                  placeholder="Digite a descrição da métrica (máx. 35 caracteres)..."
                  autoFocus
                />
                <div className="text-[10px] text-brand-muted text-right -mt-1">
                  {tempCurvaSub.length}/35
                </div>
                <div className="flex justify-end gap-1.5 mt-auto">
                  <button
                    type="button"
                    onClick={handleCancelCurva}
                    className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md text-brand-muted hover:bg-surface-subtle transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCurva}
                    className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-brand-accent text-white hover:bg-brand-accent/90 transition-colors cursor-pointer"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </Card>
          ) : (
            <Card padding="lg" className="h-full flex flex-col">
              <div className="flex items-center gap-3 mb-4 min-w-0">
                <div
                  className={`relative w-9 h-9 rounded-xl bg-icon-accent flex items-center justify-center flex-shrink-0 text-brand-accent transition-all ${
                    isCustomizing ? 'cursor-pointer hover:ring-2 hover:ring-brand-accent/50' : 'cursor-help'
                  }`}
                  onClick={isCustomizing ? handleEditCurvaClick : undefined}
                  onMouseEnter={() => setHoverCurva(true)}
                  onMouseLeave={() => setHoverCurva(false)}
                >
                  <PieChartIcon className="w-5 h-5 fill-current fill-opacity-15" strokeWidth={2} fill="currentColor" fillOpacity={0.15} />
                  <AnimatePresence>
                    {hoverCurva && curvaExplanation && (
                      <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.95 }}
                        transition={{ duration: 0.12, ease: 'easeOut' }}
                        className="absolute top-full left-0 mt-2 z-50 whitespace-nowrap bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-xl shadow-slate-900/10 border border-slate-800/10 dark:border-slate-200/10 pointer-events-none"
                      >
                        {curvaExplanation}{isCustomizing ? ' (Clique para editar)' : ''}
                        <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-900 dark:bg-slate-50 rotate-45" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest truncate flex-1 min-w-0">
                  Curva de Qualidade
                </h3>
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                {gradeDistribution.length > 0 ? (
                  <div className="flex-1 flex flex-col justify-between min-h-0">
                    <div className="flex-1 min-h-[140px] relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Tooltip content={<CustomTooltipCurva />} />
                          <Pie
                            data={gradeDistribution}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={75}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {gradeDistribution.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Compact Legend */}
                    <div className="max-h-[85px] overflow-y-auto pr-1 no-scrollbar flex flex-wrap justify-center gap-x-3 gap-y-1.5 mt-2 pt-2 border-t border-surface-border/40">
                      {gradeDistribution.map((entry: any, index: number) => {
                        const totalVal = gradeDistribution.reduce((acc: number, item: any) => acc + item.value, 0);
                        const percent = totalVal > 0 ? ((entry.value / totalVal) * 100).toFixed(1) : '0';
                        return (
                          <div key={index} className="flex items-center gap-1.5 text-[9px] text-brand-muted font-black uppercase tracking-tight">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                            {entry.name.split(' (')[0]}: {entry.value} ({percent}%)
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-brand-muted opacity-40">
                    Sem dados de nível
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Bloco Precisão da Qualidade */}
        <div className="h-[380px]">
          <DistributionChart
            title="Precisão da Qualidade"
            data={precisionData}
            isCustomizing={isCustomizing}
            profile="gestor_qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* LINHA 5: Performance Histórica */}
      <div className="h-[380px]">
        <TrendChart
          title="Performance Histórica"
          subtitle="Média global de score por dia"
          data={trendData}
          dataKeys={[{ key: 'ScoreMedio', name: 'Média Global', color: chartPalette().excelente }]}
          isCustomizing={isCustomizing}
          profile="gestor_qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      {/* LINHA 6: Volume de Reavaliações por Auditor */}
      <div className="h-[420px]">
        <ComparativeBarChart
          title="Volume de Reavaliações por Auditor"
          subtitle="Acompanhamento de revisões deferidas e indeferidas por monitor"
          data={reevaluationVolumeData}
          dataKeys={[
            { key: 'Aceitas', name: 'Procedente (Alterada)', color: chartPalette().excelente },
            { key: 'Recusadas', name: 'Improcedente (Mantida)', color: chartPalette().atencao }
          ]}
          isCustomizing={isCustomizing}
          profile="gestor_qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      {/* LINHA 7: Rankings Compactados (Melhores Suporte | Maiores Ofensores | Volume por Auditor | Top Reav. Aceitas | Top Reav. Recusadas) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="h-[420px] py-1.5">
          <RankingWidget
            title="Melhores Suporte"
            subtitle="Top 5 por score médio"
            data={topAgents}
            type="score"
            isCustomizing={isCustomizing}
            profile="gestor_qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
        <div className="h-[420px] py-1.5">
          <RankingWidget
            title="Maiores Ofensores"
            subtitle="Pontos de melhoria"
            data={bottomAgents}
            type="score"
            icon={<AlertTriangle className="w-5 h-5" />}
            accent="text-functional-error"
            isCustomizing={isCustomizing}
            profile="gestor_qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
        <div className="h-[420px] py-1.5">
          <RankingWidget
            title="Volume por Auditor"
            subtitle="Engajamento na plataforma"
            data={auditorRanking}
            type="count"
            isCustomizing={isCustomizing}
            profile="gestor_qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
        <div className="h-[420px] py-1.5">
          <RankingWidget
            title="Top Reav. Aceitas"
            subtitle="Reavaliações procedentes"
            data={topApprovedAgents}
            type="count"
            isCustomizing={isCustomizing}
            profile="gestor_qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
        <div className="h-[420px] py-1.5">
          <RankingWidget
            title="Top Reav. Recusadas"
            subtitle="Reavaliações improcedentes"
            data={topRejectedAgents}
            type="count"
            icon={<XCircle className="w-5 h-5" />}
            accent="text-functional-error"
            isCustomizing={isCustomizing}
            profile="gestor_qualidade"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* LINHA 8: Maiores Ofensores */}
      <div className="h-[420px]">
        <OfensoresChart
          title="Maiores Ofensores"
          subtitle="Critérios com mais falhas no período"
          monitorias={isCustomizing ? mockMonitoriasOfensores : monitorias}
          forms={isCustomizing ? mockForms : forms}
          isCustomizing={isCustomizing}
          profile="gestor_qualidade"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      {/* LINHA 9: Insatisfação */}
      {(() => {
        let clientData: any[] = [];
        let qualityData: any[] = [];
        let showSection = false;

        if (isCustomizing) {
          clientData = mockClientDissatisfaction;
          qualityData = mockQualityDissatisfaction;
          showSection = true;
        } else if (dissatisfactionFields && dissatisfactionFields.length > 0) {
          const COLORS = chartColorArray();
          const monWithAnswers = monitorias.filter((m: any) => m.dissatisfaction_answers && Object.keys(m.dissatisfaction_answers).length > 0);

          const clientFields = dissatisfactionFields.filter((f: any) => f.type === 'cliente');
          const qualityFields = dissatisfactionFields.filter((f: any) => f.type === 'qualidade');

          const buildChartData = (fields: typeof dissatisfactionFields) => {
            const freq: Record<string, number> = {};
            monWithAnswers.forEach((m: any) => {
              fields.forEach((f: any) => {
                const answers = m.dissatisfaction_answers?.[f.id] || [];
                answers.forEach((opt: string) => { freq[opt] = (freq[opt] || 0) + 1; });
              });
            });
            return Object.entries(freq)
              .sort((a, b) => b[1] - a[1])
              .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }));
          };

          clientData = buildChartData(clientFields);
          qualityData = buildChartData(qualityFields);
          showSection = true;
        }

        if (!showSection) return null;

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-[360px]">
              <DistributionChart
                title="Insatisfação — Visão do Cliente"
                data={clientData}
                isCustomizing={isCustomizing}
                profile="gestor_qualidade"
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>
            <div className="h-[360px]">
              <DistributionChart
                title="Insatisfação — Visão da Qualidade"
                data={qualityData}
                isCustomizing={isCustomizing}
                profile="gestor_qualidade"
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>
          </div>
        );
      })()}

      {/* LINHA 10: Últimas Auditorias do Sistema */}
      <RecentAuditsTable
        monitorias={isCustomizing ? mockRecentMonitorias : monitorias}
        users={isCustomizing ? mockUsersList : users}
        title="Últimas Auditorias do Sistema"
      />
    </div>
  );
}
