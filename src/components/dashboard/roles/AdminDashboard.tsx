import React, { useMemo, useState, useEffect } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import DistributionChart from '../widgets/DistributionChart';
import RankingWidget from '../widgets/RankingWidget';
import ActionDeadlineWidget from '../widgets/ActionDeadlineWidget';
import OfensoresChart from '../widgets/OfensoresChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import { Target, AlertTriangle, TrendingUp, CheckCircle2, XCircle, Users, History, Activity } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { isApprovalAction, isRejectionAction, isContestationAction } from '../../../lib/contestation';
import { chartColorMap, chartColorArray, chartPalette } from '../chartColors';

export default function AdminDashboard() {
  const { user, monitorias, users, forms, onlineUsers, dissatisfactionFields } = useDashboard();
  const { config, getLevelForScore, isAboveTarget } = useQualityConfig();

  const scoredMonitorias = useMemo(() =>
    monitorias.filter(m => m.score !== undefined && m.score !== null),
    [monitorias]
  );

  const avgScore = useMemo(() =>
    scoredMonitorias.length > 0
      ? scoredMonitorias.reduce((a, m) => a + (m.score || 0), 0) / scoredMonitorias.length
      : 0,
    [scoredMonitorias]
  );

  const pendingActions = useMemo(() =>
    monitorias.filter(m =>
      ['pendente_revisao', 'em_contestacao', 'aguardando_gestor_suporte', 'aguardando_gestor_qualidade'].includes(m.status)
    ).length,
    [monitorias]
  );

  // Monitorias que tiveram pelo menos uma contestação
  const contestedMonitorias = useMemo(() =>
    monitorias.filter(m =>
      m.history?.some(h => isContestationAction(h.action))
    ),
    [monitorias]
  );

  const totalContestations = contestedMonitorias.length;

  // Conta apenas pelo ÚLTIMO desfecho — evita dupla contagem em múltiplas rodadas
  const reavAccepted = useMemo(() =>
    contestedMonitorias.filter(m => {
      const resolutions = (m.history || []).filter(h =>
        isApprovalAction(h.action) || isRejectionAction(h.action)
      );
      if (resolutions.length === 0) return false;
      return isApprovalAction(resolutions[resolutions.length - 1].action);
    }).length,
    [contestedMonitorias]
  );

  const reavRejected = useMemo(() =>
    contestedMonitorias.filter(m => {
      const resolutions = (m.history || []).filter(h =>
        isApprovalAction(h.action) || isRejectionAction(h.action)
      );
      if (resolutions.length === 0) return false;
      return isRejectionAction(resolutions[resolutions.length - 1].action);
    }).length,
    [contestedMonitorias]
  );

  const reversalRate = useMemo(() =>
    totalContestations > 0 ? (reavAccepted / totalContestations) * 100 : 0,
    [totalContestations, reavAccepted]
  );

  const trendData = useMemo(() => {
    const days: Record<string, { totalScore: number, count: number }> = {};
    scoredMonitorias.forEach(m => {
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
  }, [scoredMonitorias]);

  const trendPercentage = useMemo(() => {
    if (trendData.length < 2) return 0;
    const mid = Math.floor(trendData.length / 2);
    const avgFirst = trendData.slice(0, mid).reduce((a, b) => a + b.ScoreMedio, 0) / (mid || 1);
    const avgSecond = trendData.slice(mid).reduce((a, b) => a + b.ScoreMedio, 0) / (trendData.length - mid || 1);
    return avgFirst > 0 ? ((avgSecond / avgFirst) - 1) * 100 : 0;
  }, [trendData]);

  const colorMap = chartColorMap();
  const gradeDistribution = useMemo(() =>
    config.levels
      .map(level => ({
        name: `${level.label} (${level.minScore}-${level.maxScore}%)`,
        value: scoredMonitorias.filter(m => (m.score || 0) >= level.minScore && (m.score || 0) <= level.maxScore).length,
        color: colorMap[level.color] || '#94a3b8'
      }))
      .filter(d => d.value > 0),
    [config.levels, scoredMonitorias]
  );

  const auditorRanking = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    monitorias.forEach(m => {
      const id = m.evaluator_id;
      if (!id) return;
      if (!map[id]) map[id] = { total: 0, count: 0 };
      map[id].total += m.score || 0;
      map[id].count++;
    });
    return Object.entries(map)
      .map(([id, s]) => ({
        id,
        name: users.find(u => u.id === id)?.name || id,
        score: Math.round((s.total / s.count) * 100) / 100,
        count: s.count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [monitorias, users]);

  const agentRanking = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    scoredMonitorias.forEach(m => {
      const id = m.evaluated_id;
      if (!map[id]) map[id] = { total: 0, count: 0 };
      map[id].total += m.score || 0;
      map[id].count++;
    });
    return Object.entries(map)
      .map(([id, s]) => ({
        id,
        name: users.find(u => u.id === id)?.name || id,
        score: Math.round((s.total / s.count) * 100) / 100,
        count: s.count
      }))
      .sort((a, b) => b.score - a.score);
  }, [scoredMonitorias, users]);

  const topAgents = agentRanking.filter(a => a.score >= config.targetScore).slice(0, 5);
  const bottomAgents = agentRanking
    .filter(a => a.score < config.targetScore)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  const [showOnlineList, setShowOnlineList] = useState(false);

  useEffect(() => {
    if (!showOnlineList) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.online-users-popover') && !target.closest('.online-users-trigger')) {
        setShowOnlineList(false);
      }
    };
    document.addEventListener('click', handleOutsideClick, true);
    return () => document.removeEventListener('click', handleOutsideClick, true);
  }, [showOnlineList]);

  const onlineSub = useMemo(() => (
    <div className="relative inline-flex items-center gap-1.5">
      <button 
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowOnlineList(prev => !prev);
        }}
        className="online-users-trigger cursor-pointer hover:opacity-90 active:scale-95 transition-all inline-flex items-center gap-1.5 group/online"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="transition-colors group-hover/online:text-emerald-500 font-bold lowercase tracking-wider border-b border-dashed border-emerald-500/40 pb-0.5">
          {onlineUsers.length === 1 ? '1 conectado agora' : `${onlineUsers.length} conectados agora`}
        </span>
      </button>

      {/* Premium Tooltip / Popover triggered by click */}
      {showOnlineList && (
        <div className="online-users-popover absolute top-full left-0 mt-3 w-72 bg-surface-card border border-surface-border rounded-2xl shadow-2xl p-4 z-[100] text-left normal-case tracking-normal animate-slide-in-up">
          <div className="flex items-center justify-between border-b border-surface-border pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </div>
              <span className="text-xs font-extrabold text-brand-primary tracking-wide">Pessoas Online ({onlineUsers.length})</span>
            </div>
            <button 
              type="button" 
              onClick={() => setShowOnlineList(false)}
              className="text-brand-muted hover:text-brand-primary hover:bg-surface-subtle p-1.5 rounded-lg transition-all text-xs font-bold cursor-pointer"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {onlineUsers.length === 0 ? (
              <div className="text-[10px] text-brand-muted py-2 text-center">Nenhum usuário ativo</div>
            ) : (
              onlineUsers.map(u => (
                <div 
                  key={u.id} 
                  className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-surface-subtle/80 transition-all duration-200 group/item"
                >
                  <div className="w-7 h-7 rounded-full bg-brand-subtle flex items-center justify-center font-extrabold text-xs text-brand-primary uppercase shrink-0 group-hover/item:scale-105 transition-transform duration-200">
                    {u.name ? u.name.substring(0, 2) : 'US'}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold truncate text-[11px] text-brand-primary group-hover/item:text-brand-accent transition-colors">
                      {u.name} {user && u.id === user.id ? ' (Você)' : ''}
                    </span>
                    <span className="text-[9px] text-brand-muted font-medium capitalize mt-0.5">{u.role?.replace('_', ' ')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  ), [onlineUsers, user, showOnlineList]);

  if (!user) return null;

  return (
    <div className="space-y-6 animate-fade-in min-w-0 overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Média Geral (Admin)"
          value={`${avgScore.toFixed(2)}%`}
          sub="Performance global da operação"
          good={isAboveTarget(avgScore)}
          icon={<Target className="w-5 h-5" />}
          accent={getLevelForScore(avgScore).color}
        />
        <StatCard
          title="Total Pendentes"
          value={pendingActions}
          sub="Ações em todos os perfis"
          good={pendingActions === 0}
          icon={<AlertTriangle className="w-5 h-5" />}
          accent="text-functional-error"
        />
        <StatCard
          title="Usuários Online"
          value={onlineUsers.length}
          sub={onlineSub}
          good={true}
          icon={<Activity className="w-5 h-5" />}
          accent="text-functional-success"
        />
        <StatCard
          title="Tendência"
          value={`${trendPercentage >= 0 ? '+' : ''}${trendPercentage.toFixed(2)}%`}
          sub="Evolução global"
          good={trendPercentage >= 0}
      icon={<TrendingUp className="w-5 h-5" />}
      accent="text-functional-success"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Reavaliações"
          value={totalContestations}
          sub="Total de contestações"
          good={true}
          icon={<History className="w-5 h-5" />}
          accent="text-brand-muted"
        />
    <StatCard
      title="Taxa Reversão"
      value={`${reversalRate.toFixed(2)}%`}
      sub="Qualidade das monitorias"
      good={reversalRate <= 15}
      icon={<Target className="w-5 h-5" />}
      accent={getLevelForScore(reversalRate).color}
    />
        <StatCard
          title="Reav. Aprovadas"
          value={reavAccepted}
          sub="Contestações procedentes"
          good={true}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="text-functional-success"
        />
        <StatCard
          title="Reav. Recusadas"
          value={reavRejected}
          sub="Contestações improcedentes"
          good={true}
          icon={<XCircle className="w-5 h-5" />}
          accent="text-functional-error"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[300px]">
          <TrendChart
            title="Performance Histórica"
            subtitle="Visão administrativa de score global"
            data={trendData}
            dataKeys={[{ key: 'ScoreMedio', name: 'Média Global', color: chartPalette().excelente }]}
          />
        </div>
        <div className="h-[300px]">
          <DistributionChart
            title="Curva de Qualidade"
            data={gradeDistribution}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="h-[420px] lg:col-span-1">
          <RankingWidget
            title="Melhores Suportes"
            subtitle="Top 5 por score médio"
            data={topAgents}
            type="score"
          />
        </div>
        <div className="h-[420px] lg:col-span-1">
            <RankingWidget
              title="Maiores Ofensores"
              subtitle="Pontos de melhoria"
              data={bottomAgents}
              type="score"
              icon={<AlertTriangle className="w-5 h-5" />}
              accent="text-functional-error"
            />
        </div>
        <div className="h-[420px] lg:col-span-1">
          <RankingWidget
            title="Volume por Auditor"
            subtitle="Engajamento na plataforma"
            data={auditorRanking}
            type="count"
          />
        </div>
      </div>

      <div className="h-[420px]">
        <OfensoresChart monitorias={monitorias} forms={forms} limit={12} />
      </div>

      {dissatisfactionFields.length > 0 && (() => {
        const COLORS = chartColorArray();
        const monWithAnswers = monitorias.filter(m => m.dissatisfaction_answers && Object.keys(m.dissatisfaction_answers).length > 0);

        const clientFields = dissatisfactionFields.filter(f => f.type === 'cliente');
        const qualityFields = dissatisfactionFields.filter(f => f.type === 'qualidade');

        const buildChartData = (fields: typeof dissatisfactionFields) => {
          const freq: Record<string, number> = {};
          monWithAnswers.forEach(m => {
            fields.forEach(f => {
              const answers = m.dissatisfaction_answers?.[f.id] || [];
              answers.forEach(opt => { freq[opt] = (freq[opt] || 0) + 1; });
            });
          });
          return Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }));
        };

        const clientData = buildChartData(clientFields);
        const qualityData = buildChartData(qualityFields);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-[300px]">
              <DistributionChart title="Insatisfação — Visão do Cliente" data={clientData} />
            </div>
            <div className="h-[300px]">
              <DistributionChart title="Insatisfação — Visão da Qualidade" data={qualityData} />
            </div>
          </div>
        );
      })()}

      <RecentAuditsTable monitorias={monitorias} users={users} title="Últimas Auditorias do Sistema" />
    </div>
  );
}
