import { Monitoria, AgentFeedback, EvaluationForm } from '../types';

export interface QuestionOffender {
  questionId: string;
  questionText: string;
  sectionTitle?: string;
  failureCount: number;
  totalEvaluated: number;
  failureRate: number; // 0 a 100
}

export interface CriticalOffender {
  name: string;
  count: number;
  percentage: number;
}

export interface ChannelPerformance {
  channel: string;
  count: number;
  avgScore: number;
}

export interface FeedbackROIItem {
  agentId: string;
  agentName: string;
  feedbackDate: string;
  feedbackTitle: string;
  scoreBefore: number;
  countBefore: number;
  scoreAfter: number;
  countAfter: number;
  delta: number;
}

export interface RootCauseDiagnosis {
  totalAudits: number;
  avgScore: number;
  criticalErrorsCount: number;
  criticalRate: number;
  topQuestionOffenders: QuestionOffender[];
  topCriticalErrors: CriticalOffender[];
  topClientDissatisfactions: Array<{ reason: string; count: number }>;
  channelBreakdown: ChannelPerformance[];
  feedbackROI: {
    overallBeforeScore: number;
    overallAfterScore: number;
    overallDelta: number;
    improvedAgentsCount: number;
    totalAgentsWith1on1: number;
    agentDetails: FeedbackROIItem[];
  };
  recommendations: Array<{
    title: string;
    description: string;
    priority: 'alta' | 'media' | 'baixa';
    category: 'processo' | 'treinamento' | 'ferramenta';
  }>;
}

/**
 * Analisa as monitorias, formulários e feedbacks para derivar a causa raiz dos desvios
 * e mensurar o retorno de investimento (ROI) dos feedbacks 1:1.
 */
export function analyzeRootCause(
  monitorias: Monitoria[],
  forms: EvaluationForm[] = [],
  feedbacks: AgentFeedback[] = []
): RootCauseDiagnosis {
  const activeMonitorias = monitorias.filter(m => m.active !== false);
  const totalAudits = activeMonitorias.length;

  if (totalAudits === 0) {
    return {
      totalAudits: 0,
      avgScore: 0,
      criticalErrorsCount: 0,
      criticalRate: 0,
      topQuestionOffenders: [],
      topCriticalErrors: [],
      topClientDissatisfactions: [],
      channelBreakdown: [],
      feedbackROI: {
        overallBeforeScore: 0,
        overallAfterScore: 0,
        overallDelta: 0,
        improvedAgentsCount: 0,
        totalAgentsWith1on1: 0,
        agentDetails: [],
      },
      recommendations: [],
    };
  }

  // 1. Média de Score e Erros Críticos
  const totalScore = activeMonitorias.reduce((acc, m) => acc + (typeof m.score === 'number' ? m.score : 0), 0);
  const avgScore = Math.round((totalScore / totalAudits) * 10) / 10;

  const withCritical = activeMonitorias.filter(
    m => (m.selected_critical_errors && m.selected_critical_errors.length > 0) || m.score === 0
  );
  const criticalErrorsCount = withCritical.length;
  const criticalRate = Math.round((criticalErrorsCount / totalAudits) * 1000) / 10;

  // 2. Mapa de perguntas dos formulários
  const questionMap = new Map<string, { text: string; sectionTitle: string }>();
  forms.forEach(form => {
    form.sections?.forEach(sec => {
      sec.questions?.forEach(q => {
        questionMap.set(q.id, { text: q.text, sectionTitle: sec.title });
      });
    });
  });

  // 3. Ofensores por Pergunta (respostas 'NAO')
  const questionStats = new Map<string, { failed: number; total: number }>();
  activeMonitorias.forEach(m => {
    if (!m.answers) return;
    Object.entries(m.answers).forEach(([qId, val]) => {
      const current = questionStats.get(qId) || { failed: 0, total: 0 };
      if (val === 'NAO') current.failed += 1;
      if (val === 'SIM' || val === 'NAO') current.total += 1;
      questionStats.set(qId, current);
    });
  });

  const topQuestionOffenders: QuestionOffender[] = Array.from(questionStats.entries())
    .map(([qId, stat]) => {
      const info = questionMap.get(qId);
      const text = info?.text || `Critério ${qId}`;
      const sectionTitle = info?.sectionTitle;
      const failureRate = stat.total > 0 ? Math.round((stat.failed / stat.total) * 1000) / 10 : 0;
      return {
        questionId: qId,
        questionText: text,
        sectionTitle,
        failureCount: stat.failed,
        totalEvaluated: stat.total,
        failureRate,
      };
    })
    .filter(o => o.failureCount > 0)
    .sort((a, b) => b.failureCount - a.failureCount)
    .slice(0, 5);

  // 4. Ofensores Críticos Mais Frequentes
  const criticalMap = new Map<string, number>();
  activeMonitorias.forEach(m => {
    if (m.selected_critical_errors && Array.isArray(m.selected_critical_errors)) {
      m.selected_critical_errors.forEach(err => {
        criticalMap.set(err, (criticalMap.get(err) || 0) + 1);
      });
    }
  });

  const topCriticalErrors: CriticalOffender[] = Array.from(criticalMap.entries())
    .map(([name, count]) => ({
      name,
      count,
      percentage: Math.round((count / (criticalErrorsCount || 1)) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  // 5. Motivos de Insatisfação do Cliente
  const dissatMap = new Map<string, number>();
  activeMonitorias.forEach(m => {
    if (m.dissatisfaction_answers) {
      Object.values(m.dissatisfaction_answers).forEach(items => {
        if (Array.isArray(items)) {
          items.forEach(reason => {
            dissatMap.set(reason, (dissatMap.get(reason) || 0) + 1);
          });
        }
      });
    }
  });

  const topClientDissatisfactions = Array.from(dissatMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 6. Desempenho por Canal
  const channelMap = new Map<string, { total: number; sum: number }>();
  activeMonitorias.forEach(m => {
    const ch = m.channel || 'Não informado';
    const cur = channelMap.get(ch) || { total: 0, sum: 0 };
    cur.total += 1;
    cur.sum += typeof m.score === 'number' ? m.score : 0;
    channelMap.set(ch, cur);
  });

  const channelBreakdown: ChannelPerformance[] = Array.from(channelMap.entries())
    .map(([channel, data]) => ({
      channel,
      count: data.total,
      avgScore: data.total > 0 ? Math.round((data.sum / data.total) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // 7. Análise de ROI / Impacto do Feedback 1:1
  // Para cada atendente com feedback registrado, calcula a média de notas antes e depois do feedback
  const agentDetails: FeedbackROIItem[] = [];
  let totalBeforeSum = 0;
  let totalBeforeCount = 0;
  let totalAfterSum = 0;
  let totalAfterCount = 0;
  let improvedCount = 0;

  // Agrupar feedbacks por atendente pegando o primeiro feedback relevante
  const feedbacksByAgent = new Map<string, AgentFeedback[]>();
  feedbacks.forEach(fb => {
    const list = feedbacksByAgent.get(fb.agent_id) || [];
    list.push(fb);
    feedbacksByAgent.set(fb.agent_id, list);
  });

  feedbacksByAgent.forEach((agentFbs, agentId) => {
    // Ordenar pelo mais antigo para medir evolução contínua
    const sortedFbs = [...agentFbs].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const firstFb = sortedFbs[0];
    const fbTime = new Date(firstFb.created_at).getTime();
    if (isNaN(fbTime)) return;

    const agentMonitorias = activeMonitorias.filter(m => m.evaluated_id === agentId);
    const beforeList = agentMonitorias.filter(m => {
      const t = new Date(m.created_at).getTime();
      return !isNaN(t) && t < fbTime;
    });
    const afterList = agentMonitorias.filter(m => {
      const t = new Date(m.created_at).getTime();
      return !isNaN(t) && t >= fbTime;
    });

    if (beforeList.length > 0 && afterList.length > 0) {
      const scoreBefore =
        Math.round((beforeList.reduce((acc, m) => acc + (m.score || 0), 0) / beforeList.length) * 10) / 10;
      const scoreAfter =
        Math.round((afterList.reduce((acc, m) => acc + (m.score || 0), 0) / afterList.length) * 10) / 10;
      const delta = Math.round((scoreAfter - scoreBefore) * 10) / 10;

      if (delta > 0) improvedCount += 1;

      totalBeforeSum += scoreBefore * beforeList.length;
      totalBeforeCount += beforeList.length;
      totalAfterSum += scoreAfter * afterList.length;
      totalAfterCount += afterList.length;

      const agentName = beforeList[0]?.evaluated_name || afterList[0]?.evaluated_name || 'Atendente';

      agentDetails.push({
        agentId,
        agentName,
        feedbackDate: firstFb.created_at,
        feedbackTitle: firstFb.title,
        scoreBefore,
        countBefore: beforeList.length,
        scoreAfter,
        countAfter: afterList.length,
        delta,
      });
    }
  });

  const overallBeforeScore =
    totalBeforeCount > 0 ? Math.round((totalBeforeSum / totalBeforeCount) * 10) / 10 : 0;
  const overallAfterScore =
    totalAfterCount > 0 ? Math.round((totalAfterSum / totalAfterCount) * 10) / 10 : 0;
  const overallDelta = Math.round((overallAfterScore - overallBeforeScore) * 10) / 10;

  // 8. Recomendações Automáticas de Gestão
  const recommendations: RootCauseDiagnosis['recommendations'] = [];

  if (topQuestionOffenders.length > 0) {
    const worst = topQuestionOffenders[0];
    recommendations.push({
      title: `Reforço Operacional em "${worst.questionText.slice(0, 45)}..."`,
      description: `Este critério falhou ${worst.failureCount} vezes (${worst.failureRate}% de reprovação). Recomendado criar checklist rápido de validação no 1:1 e orientar a equipe.`,
      priority: worst.failureRate > 20 ? 'alta' : 'media',
      category: 'treinamento',
    });
  }

  if (criticalRate > 5) {
    recommendations.push({
      title: 'Atenção a Falhas Críticas de Conformidade',
      description: `A taxa de erros críticos está em ${criticalRate}% (${criticalErrorsCount} casos). Priorize alinhamentos com gestores de suporte para blindar regras de negócio e segurança.`,
      priority: 'alta',
      category: 'processo',
    });
  }

  if (channelBreakdown.length > 1) {
    const lowestChannel = [...channelBreakdown].sort((a, b) => a.avgScore - b.avgScore)[0];
    if (lowestChannel && lowestChannel.avgScore < avgScore - 5) {
      recommendations.push({
        title: `Padronização de Atendimento no Canal ${lowestChannel.channel}`,
        description: `O canal ${lowestChannel.channel} registrou nota média de ${lowestChannel.avgScore}%, abaixo da média geral da operação (${avgScore}%). Recomendado auditar scripts específicos deste canal.`,
        priority: 'media',
        category: 'ferramenta',
      });
    }
  }

  if (recommendations.length === 0) {
    recommendations.push({
      title: 'Operação com Alta Aderência aos Critérios',
      description: 'Nenhum desvio crítico concentrado detectado. Continue mantendo as sessões periódicas de 1:1 e acompanhamento do PDI.',
      priority: 'baixa',
      category: 'processo',
    });
  }

  return {
    totalAudits,
    avgScore,
    criticalErrorsCount,
    criticalRate,
    topQuestionOffenders,
    topCriticalErrors,
    topClientDissatisfactions,
    channelBreakdown,
    feedbackROI: {
      overallBeforeScore,
      overallAfterScore,
      overallDelta,
      improvedAgentsCount: improvedCount,
      totalAgentsWith1on1: agentDetails.length,
      agentDetails,
    },
    recommendations,
  };
}
