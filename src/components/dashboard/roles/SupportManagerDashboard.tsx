import React, { useMemo, useState, useEffect } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import RankingWidget from '../widgets/RankingWidget';
import DistributionChart from '../widgets/DistributionChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import OfensoresChart from '../widgets/OfensoresChart';
import Card from '../../ui/Card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Target, Users, TrendingUp, AlertTriangle, CheckCircle2, XCircle, ClipboardCheck, Award, Clock, History, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

import { useQualityConfig } from '../../../lib/useQualityConfig';
import { isApprovalAction, isRejectionAction, isContestationAction } from '../../../lib/contestation';
import { chartColorMap, chartColorArray, chartPalette } from '../chartColors';
import { getRemainingBusinessSeconds } from '../../../lib/businessHours';

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

const mockMonitoriasDeadlines = [
  {
    id: 'm1',
    display_id: '001',
    ticket_id: '10239',
    status: 'pendente_revisao',
    evaluator_name: 'Mariana Santos',
    created_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    action_deadline_at: new Date(Date.now() + 45 * 60 * 1000).toISOString() // 45 min
  },
  {
    id: 'm2',
    display_id: '002',
    ticket_id: '10482',
    status: 'em_contestacao',
    evaluated_name: 'Ana Silva',
    created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    action_deadline_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString() // 2h
  }
] as any[];

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

interface SupportManagerDashboardProps {
  isCustomizing?: boolean;
  activeEditingId?: string | null;
  setActiveEditingId?: (id: string | null) => void;
}

// Inline Countdown Row for Ações Expirando
function SlaCountdownItem({ monitoria, users }: { monitoria: any, users: any[] }) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const deadline = new Date(monitoria.action_deadline_at);
    return getRemainingBusinessSeconds(new Date(), deadline);
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const deadline = new Date(monitoria.action_deadline_at);
      setSecondsLeft(getRemainingBusinessSeconds(new Date(), deadline));
    }, 10000);
    return () => clearInterval(interval);
  }, [monitoria.action_deadline_at]);

  const formatTimeLeft = (sec: number) => {
    if (sec <= 0) return 'Expirado';
    const hours = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m rest.`;
    }
    return `${mins} min rest.`;
  };

  const isCritical = secondsLeft > 0 && secondsLeft < 3600; // < 1 hour
  const isExpired = secondsLeft <= 0;

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pendente_revisao': return 'Pendente Assinatura';
      case 'em_contestacao': return 'Em Contestação';
      case 'aguardando_gestor_suporte': return 'Aguardando Gestor';
      case 'aguardando_gestor_qualidade': return 'Aguardando Qualidade';
      default: return status;
    }
  };

  const agentName = users.find((u: any) => u.id === monitoria.evaluated_id)?.name || monitoria.evaluated_name || 'Agente';

  let badgeClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-300';
  if (isExpired) {
    badgeClass = 'bg-red-500/10 text-red-500 border border-red-500/20';
  } else if (isCritical) {
    badgeClass = 'animate-pulse bg-red-500/10 text-red-500 border border-red-500/20 font-black';
  }

  return (
    <div className="flex items-center justify-between p-3 rounded-2xl bg-surface-subtle/30 border border-surface-border/30 hover:border-surface-border transition-all duration-200">
      <div className="flex flex-col min-w-0 flex-1 mr-2">
        <div className="flex items-center gap-1.5 mb-1 min-w-0">
          <span className="font-mono font-black text-xs text-brand-primary flex-shrink-0">
            #{monitoria.ticket_id}
          </span>
          <span className="text-[10px] text-brand-muted font-bold truncate">
            • {agentName}
          </span>
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest text-brand-muted truncate">
          Etapa: {getStatusLabel(monitoria.status)}
        </span>
      </div>
      <div className="flex-shrink-0">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${badgeClass}`}>
          {formatTimeLeft(secondsLeft)}
        </span>
      </div>
    </div>
  );
}

export default function SupportManagerDashboard({
  isCustomizing = false,
  activeEditingId,
  setActiveEditingId
}: SupportManagerDashboardProps) {
  let dashboardData: any = {
    user: null,
    monitorias: [],
    users: [],
    teams: [],
    forms: [],
    onlineUsers: [],
    dissatisfactionFields: [],
    globalAvg: 0
  };

  try {
    const context = useDashboard();
    if (context) {
      dashboardData = context;
    }
  } catch (e) {
    // safe fallback
  }

  const { user, monitorias, users, teams, forms, onlineUsers, dissatisfactionFields, globalAvg } = dashboardData;
  const { config, saveConfig, getLevelForScore } = useQualityConfig();

  // Scoped Team IDs
  const myTeamIds = useMemo(() => user?.team_ids || [], [user]);

  // Restrict everything to this manager's teams
  const myMonitorias = useMemo(() => {
    if (isCustomizing) return [];
    return monitorias.filter((m: any) => myTeamIds.includes(m.team_id));
  }, [isCustomizing, monitorias, myTeamIds]);

  const scoredMonitorias = useMemo(() => {
    if (isCustomizing) return [];
    return myMonitorias.filter((m: any) => m.score !== undefined && m.score !== null);
  }, [isCustomizing, myMonitorias]);

  // --- Calculations

  // 1. Média Geral (Scoped average)
  const avgScore = useMemo(() => {
    if (isCustomizing) return 84.20;
    return scoredMonitorias.length > 0
      ? scoredMonitorias.reduce((a: number, m: any) => a + (m.score || 0), 0) / scoredMonitorias.length
      : 0;
  }, [isCustomizing, scoredMonitorias]);

  const scoreDiff = avgScore - config.targetScore;
  const diffSign = scoreDiff >= 0 ? '↑' : '↓';
  const diffColorClass = scoreDiff >= 0
    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
    : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400';

  // 2. Índice de Excelência (Scoped excellence index matching Admin)
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
    : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400';

  // Total volume
  const totalMonitorias = useMemo(() => {
    if (isCustomizing) return 15;
    return myMonitorias.length;
  }, [isCustomizing, myMonitorias]);

  // Total Pendentes (Unified agent acknowledgements + disputes + support manager actions)
  const pendingTotal = useMemo(() => {
    if (isCustomizing) return 3;
    return myMonitorias.filter((m: any) =>
      ['pendente_revisao', 'em_contestacao', 'aguardando_gestor_suporte'].includes(m.status)
    ).length;
  }, [isCustomizing, myMonitorias]);

  // Minhas Ações (Awaiting gestor_suporte decision)
  const pendingManager = useMemo(() => {
    if (isCustomizing) return 1;
    return myMonitorias.filter((m: any) => m.status === 'aguardando_gestor_suporte').length;
  }, [isCustomizing, myMonitorias]);

  // Online users scoped to manager's teams
  const teamOnlineUsers = useMemo(() => {
    if (isCustomizing) return onlineUsers;
    return onlineUsers.filter((ou: any) => {
      const fullUser = users.find((u: any) => u.id === ou.id);
      const uTeamIds = fullUser?.team_ids || [];
      return uTeamIds.some((tid: string) => myTeamIds.includes(tid));
    });
  }, [isCustomizing, onlineUsers, myTeamIds, users]);

  const onlineSub = useMemo(() => (
    <div className="relative inline-flex items-center gap-1.5 select-none">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <span className="text-brand-muted text-xs font-semibold lowercase tracking-wider">
        {isCustomizing ? '8 conectados' : (teamOnlineUsers.length === 1 ? '1 conectado' : `${teamOnlineUsers.length} conectados`)}
      </span>
    </div>
  ), [isCustomizing, teamOnlineUsers]);

  // Reevaluations
  const contestedMonitorias = useMemo(() => {
    if (isCustomizing) return [];
    return myMonitorias.filter((m: any) =>
      m.history?.some((h: any) => isContestationAction(h.action))
    );
  }, [isCustomizing, myMonitorias]);

  const totalContestations = useMemo(() => {
    if (isCustomizing) return 8;
    return contestedMonitorias.length;
  }, [isCustomizing, contestedMonitorias]);

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
    if (isCustomizing) return 7;
    return contestedMonitorias.filter((m: any) => {
      const resolutions = (m.history || []).filter((h: any) =>
        isApprovalAction(h.action) || isRejectionAction(h.action)
      );
      if (resolutions.length === 0) return false;
      return isRejectionAction(resolutions[resolutions.length - 1].action);
    }).length;
  }, [isCustomizing, contestedMonitorias]);

  const reversalRate = useMemo(() => {
    if (isCustomizing) return 12.50;
    return totalContestations > 0 ? (reavAccepted / totalContestations) * 100 : 0;
  }, [isCustomizing, totalContestations, reavAccepted]);

  const revDiff = reversalRate - config.targetReversalRate;
  const revSign = revDiff <= 0 ? '↓' : '↑';
  const revColorClass = revDiff <= 0
    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
    : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400';

  // Performance Histórica (Trend chart)
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
      ScoreEquipe: Math.round((data.totalScore / data.count) * 100) / 100
    })).sort((a, b) => {
      const [da, ma] = a.name.split('/').map(Number);
      const [db, mb] = b.name.split('/').map(Number);
      return ma !== mb ? ma - mb : da - db;
    });
  }, [isCustomizing, scoredMonitorias]);

  const trendPercentage = useMemo(() => {
    if (isCustomizing) return 1.85;
    if (trendData.length < 2) return 0;
    const mid = Math.floor(trendData.length / 2);
    const firstHalf = trendData.slice(0, mid);
    const secondHalf = trendData.slice(mid);
    const avgFirst = firstHalf.reduce((a, b) => a + b.ScoreEquipe, 0) / (firstHalf.length || 1);
    const avgSecond = secondHalf.reduce((a, b) => a + b.ScoreEquipe, 0) / (secondHalf.length || 1);
    return avgFirst > 0 ? ((avgSecond / avgFirst) - 1) * 100 : 0;
  }, [isCustomizing, trendData]);

  // Rankings
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

  // Melhores Suporte
  const topAgents = useMemo(() => {
    if (isCustomizing) return mockTopAgents;
    return agentRanking.filter(a => a.score >= config.targetScore).slice(0, 5);
  }, [isCustomizing, agentRanking, config.targetScore]);

  // Maiores Ofensores
  const bottomAgents = useMemo(() => {
    if (isCustomizing) return mockBottomAgents;
    return agentRanking
      .filter(a => a.score < config.targetScore)
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);
  }, [isCustomizing, agentRanking, config.targetScore]);

  // Maiores Ofensores - Critérios
  const criteriaOfensores = useMemo(() => {
    if (isCustomizing) {
      return [
        { id: 'q1', name: 'Conhecimento Técnico e Permissionamento', count: 12 },
        { id: 'q2', name: 'Postura e Empatia no Atendimento', count: 8 },
        { id: 'q3', name: 'Resolução no Primeiro Contato (FCR)', count: 5 },
        { id: 'q4', name: 'Confirmação de Dados Cadastrais', count: 3 },
        { id: 'q5', name: 'Segurança e Confidencialidade', count: 1 }
      ];
    }
    const map: Record<string, { text: string; naoCount: number }> = {};
    forms.forEach((form: any) => {
      form.sections?.forEach((section: any) => {
        section.questions?.forEach((q: any) => {
          if (!map[q.id]) map[q.id] = { text: q.text, naoCount: 0 };
        });
      });
    });
    myMonitorias.forEach((m: any) => {
      if (!m.answers) return;
      Object.entries(m.answers).forEach(([qId, answer]) => {
        if (!map[qId]) return;
        if (answer === 'NAO') map[qId].naoCount++;
      });
    });
    return Object.entries(map)
      .filter(([_, o]) => o.naoCount > 0)
      .sort((a, b) => b[1].naoCount - a[1].naoCount)
      .slice(0, 5)
      .map(([id, o]) => ({
        id,
        name: o.text,
        count: o.naoCount
      }));
  }, [isCustomizing, myMonitorias, forms]);

  // Reavaliações rankings
  const topApprovedAgents = useMemo(() => {
    if (isCustomizing) return mockContestationsApproved;
    const map: Record<string, number> = {};
    myMonitorias.forEach((m: any) => {
      const isAccepted = m.status === 'contestacao_aceita' || 
                        m.status === 'finalizada_alterada' ||
                        m.history?.some((h: any) => h.action.toLowerCase().includes('aceita') || h.action.toLowerCase().includes('procedente') || h.action.toLowerCase().includes('alterada'));
      
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
  }, [isCustomizing, myMonitorias, users]);

  const topRejectedAgents = useMemo(() => {
    if (isCustomizing) return mockContestationsRejected;
    const map: Record<string, number> = {};
    myMonitorias.forEach((m: any) => {
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
  }, [isCustomizing, myMonitorias, users]);

  // Curva de qualidade Pie Chart calculations
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
    const lookupKey = `gestor_suporte_${key}`;
    return (config?.statCardExplanations?.[lookupKey] !== undefined && config.statCardExplanations[lookupKey] !== '')
      ? config.statCardExplanations[lookupKey]
      : (config?.statCardExplanations?.[key] !== undefined && config.statCardExplanations[key] !== '')
        ? config.statCardExplanations[key]
        : defaultText;
  };

  const curvaExplanation = getExplanation('Curva de Qualidade', 'Distribuição percentual das notas em faixas');
  const isEditingCurva = activeEditingId === 'curva-qualidade';
  const [hoverCurva, setHoverCurva] = useState(false);
  const [tempCurvaSub, setTempCurvaSub] = useState('');

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
        'gestor_suporte_Curva de Qualidade': tempCurvaSub,
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

  // Ações Expirando list
  const sortedDeadlines = useMemo(() => {
    const source = isCustomizing ? mockMonitoriasDeadlines : myMonitorias;
    const filtered = source.filter((m: any) =>
      ['pendente_revisao', 'em_contestacao', 'aguardando_gestor_suporte'].includes(m.status)
      && m.action_deadline_at
    );
    
    return [...filtered].sort((a, b) => {
      const tA = new Date(a.action_deadline_at).getTime();
      const tB = new Date(b.action_deadline_at).getTime();
      return tA - tB;
    });
  }, [isCustomizing, myMonitorias]);

  return (
    <div className="space-y-6 animate-fade-in min-w-0 overflow-visible">

      {/* LINHA 1 (Destaque do Topo - 3 Blocos - lg:grid-cols-4 gap-6) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <StatCard
            title="Minhas Ações"
            value={pendingManager}
            sub={pendingManager === 0 ? "Fila de decisões em dia" : "Aguardando minha decisão"}
            good={pendingManager === 0}
            icon={pendingManager === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            accent={pendingManager === 0 ? 'text-functional-success' : 'text-functional-error'}
            badge={
              pendingManager > 0 ? (
                <span className="relative flex h-2 w-2 self-center">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              ) : undefined
            }
            isCustomizing={isCustomizing}
            profile="gestor_suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
        <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <StatCard
            title="Média Geral"
            value={`${avgScore.toFixed(2)}%`}
            sub={isCustomizing ? 'Média simulada do período' : 'Média acumulada do time'}
            good={avgScore >= config.targetScore}
            icon={<Target className="w-5 h-5" />}
            accent="text-brand-accent"
            badge={
              <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${isCustomizing ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' : diffColorClass}`}>
                {isCustomizing ? '↑' : diffSign} {isCustomizing ? '4.20%' : Math.abs(scoreDiff).toFixed(2) + '%'}
              </span>
            }
            isCustomizing={isCustomizing}
            profile="gestor_suporte"
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
            profile="gestor_suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* LINHA 2 (Métricas Operacionais e SLA - 4 Blocos Simétricos - lg:grid-cols-4 gap-6) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total"
          value={totalMonitorias}
          sub="Volume de monitorias"
          good={true}
          icon={<ClipboardCheck className="w-5 h-5" />}
          accent="text-brand-accent"
          isCustomizing={isCustomizing}
          profile="gestor_suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Total Pendentes"
          value={pendingTotal}
          sub="Assinaturas e contestações ativas"
          good={pendingTotal === 0}
          icon={pendingTotal === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          accent={pendingTotal === 0 ? 'text-functional-success' : 'text-functional-error'}
          isCustomizing={isCustomizing}
          profile="gestor_suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Taxa de Reversão"
          value={`${reversalRate.toFixed(2)}%`}
          sub="Eficácia das contestações do time"
          good={reversalRate <= config.targetReversalRate}
          icon={<Target className="w-5 h-5" />}
          accent={reversalRate <= config.targetReversalRate ? 'text-functional-success' : 'text-functional-error'}
          badge={
            <span className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md self-center ${isCustomizing ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' : revColorClass}`}>
              {isCustomizing ? '↓' : revSign} {isCustomizing ? '1.67%' : Math.abs(revDiff).toFixed(2) + '%'}
            </span>
          }
          isCustomizing={isCustomizing}
          profile="gestor_suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Usuários Online"
          value={isCustomizing ? 8 : teamOnlineUsers.length}
          sub={onlineSub}
          good={true}
          icon={<Activity className="w-5 h-5" />}
          accent="text-slate-500"
          onlineUsersOverride={teamOnlineUsers}
          isCustomizing={isCustomizing}
          profile="gestor_suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      {/* LINHA 3 (Métricas de Reavaliação - lg:grid-cols-4 gap-6) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Reavaliações"
          value={totalContestations}
          sub="Volume de contestações"
          good={true}
          icon={<History className="w-5 h-5" />}
          accent="text-slate-500"
          isCustomizing={isCustomizing}
          profile="gestor_suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Reav. Aprovadas"
          value={reavAccepted}
          sub="Nota alterada"
          good={true}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="text-functional-success"
          isCustomizing={isCustomizing}
          profile="gestor_suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
        <StatCard
          title="Reav. Recusadas"
          value={reavRejected}
          sub="Nota mantida"
          good={true}
          icon={<XCircle className="w-5 h-5" />}
          accent="text-functional-error"
          isCustomizing={isCustomizing}
          profile="gestor_suporte"
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
          profile="gestor_suporte"
          activeEditingId={activeEditingId}
          setActiveEditingId={setActiveEditingId}
        />
      </div>

      {/* LINHA 4 (Gráfico de Critérios Amplo - grid-cols-1) */}
      <div className="grid grid-cols-1 gap-6">
        <div className="h-[380px]">
          <OfensoresChart
            monitorias={isCustomizing ? [] : myMonitorias}
            forms={forms}
            limit={5}
            title="Maiores Ofensores — Critérios"
            isCustomizing={isCustomizing}
            profile="gestor_suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* LINHA 5 (Performance Temporal - grid-cols-1) */}
      <div className="grid grid-cols-1 gap-6">
        <div className="h-[380px]">
          <TrendChart
            title="Performance Histórica"
            subtitle="Nota média agregada das suas equipes"
            data={trendData}
            dataKeys={[{ key: 'ScoreEquipe', name: 'Média Geral', color: chartPalette().excelente }]}
            isCustomizing={isCustomizing}
            profile="gestor_suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* LINHA 6 (Distribuição e Alertas - lg:grid-cols-2 gap-6) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bloco: Curva de Qualidade / Distribuição por Nível */}
        <div className="h-[380px]">
          {isEditingCurva ? (
            <Card padding="md" className="h-full flex flex-col justify-between border-brand-accent/50 bg-surface-card shadow-lg relative z-50">
              <div className="flex flex-col h-full gap-2" onClick={(e) => e.stopPropagation()}>
                <span className="text-[10px] font-black uppercase tracking-widest text-brand-muted">
                  Editar Descrição: Curva de Qualidade (Distribuição por Nível)
                </span>
                <textarea
                  value={tempCurvaSub}
                  onChange={(e) => setTempCurvaSub(e.target.value.slice(0, 35))}
                  maxLength={35}
                  className="w-full text-xs p-1.5 rounded-lg border border-surface-border bg-surface-bg text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-accent resize-none h-12"
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
                    className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md text-brand-muted hover:bg-surface-subtle transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCurva}
                    className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-brand-accent text-white hover:bg-brand-accent/90 transition-colors cursor-pointer"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </Card>
          ) : (
            <Card padding="md" className="h-full flex flex-col overflow-visible">
              <div className="flex items-center gap-3 mb-3 min-w-0">
                <div 
                  className={`relative w-8 h-8 rounded-xl bg-icon-accent flex items-center justify-center flex-shrink-0 text-brand-accent transition-all ${
                    isCustomizing ? 'cursor-pointer hover:ring-2 hover:ring-brand-accent/50' : 'cursor-help'
                  }`}
                  onClick={isCustomizing ? handleEditCurvaClick : undefined}
                  onMouseEnter={() => setHoverCurva(true)}
                  onMouseLeave={() => setHoverCurva(false)}
                >
                  <Activity className="w-4 h-4 fill-current fill-opacity-15" strokeWidth={2} fill="currentColor" fillOpacity={0.15} />
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
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight whitespace-normal flex-1">
                  Curva de Qualidade (Distribuição por Nível)
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

        {/* Bloco 3: Ações Expirando list */}
        <div className="h-[380px]">
          <Card padding="md" className="h-full flex flex-col overflow-visible">
            <div className="flex items-center gap-3 mb-3 flex-shrink-0">
              <div className="relative w-8 h-8 rounded-xl bg-icon-highlight flex items-center justify-center flex-shrink-0 text-brand-highlight">
                <Clock className="w-4 h-4 fill-current fill-opacity-15" strokeWidth={2} fill="currentColor" fillOpacity={0.15} />
              </div>
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">
                  Ações Expirando
                </h3>
              </div>
            </div>
            
            {sortedDeadlines.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 opacity-60">
                <p className="text-[10px] text-brand-muted font-black uppercase tracking-widest leading-relaxed">
                  Nenhuma ação pendente de SLA no momento
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar min-h-0">
                {sortedDeadlines.map((m) => (
                  <SlaCountdownItem key={m.id} monitoria={m} users={users} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* LINHA 7 (O Cockpit de 4 Rankings - lg:grid-cols-4 gap-6) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="h-[380px]">
          <RankingWidget
            title="Melhores Suporte"
            subtitle={`Agentes acima da meta (${config.targetScore}%)`}
            data={topAgents}
            isCustomizing={isCustomizing}
            profile="gestor_suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
        <div className="h-[380px]">
          <RankingWidget
            title="Maiores Ofensores"
            subtitle={`Agentes abaixo da meta (${config.targetScore}%)`}
            data={bottomAgents}
            icon={<Target className="w-5 h-5" />}
            accent="text-functional-warning"
            isCustomizing={isCustomizing}
            profile="gestor_suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
        <div className="h-[380px]">
          <RankingWidget
            title="Top Reav. Aceitas"
            subtitle="Agentes com mais notas alteradas"
            data={topApprovedAgents}
            type="count"
            isCustomizing={isCustomizing}
            profile="gestor_suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
        <div className="h-[380px]">
          <RankingWidget
            title="Top Reav. Recusadas"
            subtitle="Agentes com mais notas mantidas"
            data={topRejectedAgents}
            type="count"
            icon={<XCircle className="w-5 h-5" />}
            accent="text-functional-error"
            isCustomizing={isCustomizing}
            profile="gestor_suporte"
            activeEditingId={activeEditingId}
            setActiveEditingId={setActiveEditingId}
          />
        </div>
      </div>

      {/* LINHA 7 — Insatisfações */}
      {(isCustomizing || (dissatisfactionFields && dissatisfactionFields.length > 0)) && (() => {
        const COLORS = chartColorArray();
        const monWithAnswers = myMonitorias.filter((m: any) => m.dissatisfaction_answers && Object.keys(m.dissatisfaction_answers).length > 0);

        const clientFields = dissatisfactionFields.filter((f: any) => f.type === 'cliente');
        const qualityFields = dissatisfactionFields.filter((f: any) => f.type === 'qualidade');

        const buildChartData = (fields: typeof dissatisfactionFields) => {
          if (isCustomizing) return [];
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

        const clientData = isCustomizing ? mockClientDissatisfaction : buildChartData(clientFields);
        const qualityData = isCustomizing ? mockQualityDissatisfaction : buildChartData(qualityFields);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-[360px]">
              <DistributionChart
                title="Insatisfação — Visão do Cliente"
                data={clientData}
                isCustomizing={isCustomizing}
                profile="gestor_suporte"
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>
            <div className="h-[360px]">
              <DistributionChart
                title="Insatisfação — Visão da Qualidade"
                data={qualityData}
                isCustomizing={isCustomizing}
                profile="gestor_suporte"
                activeEditingId={activeEditingId}
                setActiveEditingId={setActiveEditingId}
              />
            </div>
          </div>
        );
      })()}

      <RecentAuditsTable
        monitorias={isCustomizing ? mockRecentMonitorias : myMonitorias}
        users={users}
      />
    </div>
  );
}
