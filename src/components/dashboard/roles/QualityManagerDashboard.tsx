import React, { useMemo } from 'react';
import { useDashboard } from '../DashboardContext';
import StatCard from '../widgets/StatCard';
import TrendChart from '../widgets/TrendChart';
import DistributionChart from '../widgets/DistributionChart';
import RankingWidget from '../widgets/RankingWidget';
import ComparativeBarChart from '../widgets/ComparativeBarChart';
import OfensoresChart from '../widgets/OfensoresChart';
import RecentAuditsTable from '../widgets/RecentAuditsTable';
import { Target, ClipboardCheck, AlertTriangle, TrendingUp, RotateCcw, CheckCircle2, XCircle, Users, UserMinus } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { isApprovalAction, isRejectionAction, isContestationAction } from '../../../lib/contestation';
import { chartColorMap, chartColorArray, chartPalette } from '../chartColors';

export default function QualityManagerDashboard() {
  const { user, monitorias, users, forms, dissatisfactionFields } = useDashboard();
  const { config, getLevelForScore, isAboveTarget } = useQualityConfig();

  // --- Scored monitorias (have a score value)
  const scoredMonitorias = useMemo(() =>
    monitorias.filter(m => m.score !== undefined && m.score !== null),
    [monitorias]
  );

  // --- Média Geral: average of all scored monitorias
  const avgScore = useMemo(() =>
    scoredMonitorias.length > 0
      ? scoredMonitorias.reduce((a, m) => a + (m.score || 0), 0) / scoredMonitorias.length
      : 0,
    [scoredMonitorias]
  );

  // --- Monitorias com score abaixo de 75%
  const criticalErrors = useMemo(() => scoredMonitorias.filter(m => (m.score || 0) < config.targetScore).length, [scoredMonitorias, config.targetScore]);

  // --- Pendentes totais (all statuses requiring action)
  const pendingActions = useMemo(() =>
    monitorias.filter(m =>
      ['pendente_revisao', 'em_contestacao', 'aguardando_gestor_suporte', 'aguardando_gestor_qualidade'].includes(m.status)
    ).length,
    [monitorias]
  );

  // --- Minhas Ações: awaiting quality manager decision
  const pendingMyActions = useMemo(() =>
    monitorias.filter(m => m.status === 'aguardando_gestor_qualidade').length,
    [monitorias]
  );

  // --- Reevaluation metrics (consistent history-based logic)
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

  // Taxa de Reversão: % of contested that had the note changed
  const reversalRate = useMemo(() =>
    totalContestations > 0 ? (reavAccepted / totalContestations) * 100 : 0,
    [totalContestations, reavAccepted]
  );

  // --- Trend Data (score per day, all scored monitorias)
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

  // --- Tendência: 2nd half avg vs 1st half avg of period
  const trendPercentage = useMemo(() => {
    if (trendData.length < 2) return 0;
    const mid = Math.floor(trendData.length / 2);
    const avgFirst = trendData.slice(0, mid).reduce((a, b) => a + b.ScoreMedio, 0) / (mid || 1);
    const avgSecond = trendData.slice(mid).reduce((a, b) => a + b.ScoreMedio, 0) / (trendData.length - mid || 1);
    return avgFirst > 0 ? ((avgSecond / avgFirst) - 1) * 100 : 0;
  }, [trendData]);

  // --- Grade Distribution (by config levels)
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

  // --- Auditor Ranking (by volume)
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

  // --- Agent Rankings (by avg score — same logic as Admin)
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

  // Top = at or above target (best first)
  const topAgents = agentRanking.filter(a => a.score >= config.targetScore).slice(0, 5);
  // Opportunities = below target, sorted from furthest to closest to target
  const bottomAgents = agentRanking
    .filter(a => a.score < config.targetScore)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  // --- Rankings de Contestações (Top 5 Agentes - Global)
  const topApprovedAgents = useMemo(() => {
    const map: Record<string, number> = {};
    monitorias.forEach(m => {
      const isAccepted = m.status === 'contestacao_aceita' || 
                        m.status === 'finalizada_alterada' ||
                        m.history?.some(h =>
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
        name: users.find(u => u.id === id)?.name || 'Agente Externo',
        count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [monitorias, users]);

  const topRejectedAgents = useMemo(() => {
    const map: Record<string, number> = {};
    monitorias.forEach(m => {
      const isRejected = m.status === 'contestacao_negada' || 
                        m.history?.some(h => h.action.toLowerCase().includes('negada') || h.action.toLowerCase().includes('recusada') || h.action.includes('Improcedente') || h.action.includes('Mantida'));
      
      if (isRejected && m.evaluated_id) {
        map[m.evaluated_id] = (map[m.evaluated_id] || 0) + 1;
      }
    });
    return Object.entries(map)
      .map(([id, count]) => ({
        id,
        name: users.find(u => u.id === id)?.name || 'Agente Externo',
        count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [monitorias, users]);

  // --- Precisão da Qualidade (Estáveis vs Reavaliadas)
  const precisionData = useMemo(() => {
  const p = chartPalette();
  const total = scoredMonitorias.length;
  const reevaluated = reavAccepted;
  const stable = total - reevaluated;

  return [
    { name: 'Estáveis', value: stable, color: p.excelente },
    { name: 'Reavaliadas', value: reevaluated, color: p.atencao }
    ].filter(d => d.value > 0);
  }, [scoredMonitorias, reavAccepted]);

  // --- Volumetria de Reavaliações (Aceitas vs Recusadas) por Agente da Qualidade
  const reevaluationVolumeData = useMemo(() => {
    // 1. Identifica todos os IDs únicos de avaliadores no período
    const evaluatorIds = Array.from(new Set(
      monitorias.map(m => m.evaluator_id).filter((id): id is string => !!id)
    ));

    // 2. Para cada avaliador, conta pelo ÚLTIMO desfecho de cada monitoria
    return evaluatorIds.map(evaluatorId => {
      const auditorName = users.find(u => u.id === evaluatorId)?.name || 'Avaliador';
      const auditorContested = monitorias.filter(m =>
        m.evaluator_id === evaluatorId &&
        m.history?.some(h => isContestationAction(h.action))
      );

      let aceitas = 0;
      let recusadas = 0;

      auditorContested.forEach(m => {
        const resolutions = (m.history || []).filter(h =>
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
  }, [monitorias, users]);

  if (!user) return null;

  return (
    <div className="space-y-6 animate-fade-in min-w-0 overflow-hidden">

      {/* Linha 1 — Benchmarks e Minhas Ações */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Média Geral"
          value={`${avgScore.toFixed(2)}%`}
          sub={isAboveTarget(avgScore) ? 'Meta atingida' : 'Abaixo da meta'}
          good={isAboveTarget(avgScore)}
          icon={<Target className="w-5 h-5" />}
          accent={getLevelForScore(avgScore).color}
        />
        <StatCard
          title="Minhas Ações"
          value={pendingMyActions}
          sub="Aguardando sua decisão"
          good={pendingMyActions === 0}
          icon={<AlertTriangle className="w-5 h-5" />}
          accent="text-functional-error"
        />
        <StatCard
          title="Monitorias"
          value={monitorias.length}
          sub="Volume total do período"
          good={true}
          icon={<ClipboardCheck className="w-5 h-5" />}
          accent="text-brand-accent"
        />
        <StatCard
          title="Tendência"
          value={`${trendPercentage >= 0 ? '+' : ''}${trendPercentage.toFixed(2)}%`}
          sub="Evolução no período"
          good={trendPercentage >= 0}
          icon={<TrendingUp className="w-5 h-5" />}
          accent="text-brand-highlight"
        />
      </div>

      {/* Linha 2 — Pendências e Qualidade */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Pendentes"
          value={pendingActions}
          sub="Ações abertas no sistema"
          good={pendingActions === 0}
          icon={<Users className="w-5 h-5" />}
          accent="text-info"
        />
        <StatCard
          title="Taxa de Reversão"
          value={`${reversalRate.toFixed(2)}%`}
          sub="Contestações Procedentes"
          good={reversalRate <= 15}
          icon={<RotateCcw className="w-5 h-5" />}
          accent="text-brand-highlight"
        />
        <StatCard
          title="Reav. Aceitas"
          value={reavAccepted}
          sub="Nota alterada"
          good={true}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accent="text-success"
        />
        <StatCard
          title="Reav. Recusadas"
          value={reavRejected}
          sub="Nota mantida"
          good={true}
          icon={<XCircle className="w-5 h-5" />}
          accent="text-functional-error"
        />
      </div>

      {/* Linha 3 — Evolução Única */}
      <div className="grid grid-cols-1 gap-6">
        <div className="h-[300px]">
          <TrendChart
            title="Evolução da Qualidade"
            subtitle="Média global de score por dia"
            data={trendData}
            dataKeys={[{ key: 'ScoreMedio', name: 'Média Global', color: chartPalette().excelente }]}
          />
        </div>
      </div>

      {/* Linha 4 — Curva, Precisão e Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="h-[300px]">
          <DistributionChart
            title="Curva de Qualidade"
            data={gradeDistribution}
          />
        </div>
        <div className="h-[300px]">
          <DistributionChart
            title="Precisão da Qualidade"
            data={precisionData}
          />
        </div>
        <div className="h-[300px]">
          <RankingWidget
            title="Ranking de Qualidade"
            subtitle="Por volume de auditorias realizadas"
            data={auditorRanking}
            type="count"
          />
        </div>
      </div>

      {/* Row 5 — Maiores Ofensores Único */}
      <div className="grid grid-cols-1 gap-6">
        <div className="h-[420px]">
          <OfensoresChart monitorias={monitorias} forms={forms} limit={12} />
        </div>
      </div>

      {/* Row 6 — Melhores Scores e Oportunidades */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-[250px]">
          <RankingWidget
            title="Melhores Scores (Suporte)"
            subtitle={`Acima da meta (${config.targetScore}%)`}
            data={topAgents}
          />
        </div>
        <div className="h-[250px]">
          <RankingWidget
            title="Oportunidades (Suporte)"
            subtitle="Mais críticos primeiro"
            data={bottomAgents}
            icon={<Target className="w-4 h-4 text-brand-primary" />}
          />
        </div>
      </div>

      {/* Row 7 — Prazos de Ação e Rankings de Contestações */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="h-[320px]">
          <ComparativeBarChart
            title="Volume de Reavaliações"
            subtitle="Aceitas vs Recusadas no período"
            data={reevaluationVolumeData}
      dataKeys={[
        { key: 'Aceitas', name: 'Aceitas (Nota Alterada)', color: chartPalette().aceitavel },
        { key: 'Recusadas', name: 'Recusadas (Nota Mantida)', color: chartPalette().ruim }
            ]}
          />
        </div>
        <div className="h-[320px]">
          <RankingWidget
            title="Top Reav. Aceitas (Geral)"
            subtitle="Agentes com mais notas alteradas"
            data={topApprovedAgents}
            type="count"
          />
        </div>
        <div className="h-[320px]">
          <RankingWidget
            title="Top Reav. Recusadas (Geral)"
            subtitle="Agentes com mais notas mantidas"
            data={topRejectedAgents}
            type="count"
            icon={<UserMinus className="w-4 h-4 text-brand-primary" />}
          />
        </div>
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

      <RecentAuditsTable monitorias={monitorias} users={users} />
    </div>
  );
}
