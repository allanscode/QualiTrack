export type DashboardRole = 'admin' | 'gestor_qualidade' | 'gestor_suporte' | 'qualidade' | 'suporte';

export type DashboardWidgetType =
  | 'StatCard'
  | 'TrendChart'
  | 'DistributionChart'
  | 'ComparativeBarChart'
  | 'RankingWidget'
  | 'OfensoresChart'
  | 'ActionDeadlineWidget'
  | 'RecentAuditsTable'
  | 'ManagerDecisionHistoryTable'
  | 'CriticalErrorsTable'
  | 'AgentEvaluationVolumeTable'
  | 'AuditorEvaluationVolumeTable'
  | 'PositiveLowScoreTable'
  | 'PositiveCriticalZeroTable'
  | 'CustomChart'
  | 'FeedbacksWidget'
  | 'QualityAchievementsWidget'
  | 'NegativeCallsTrainingAlert';

export interface DashboardWidgetDefinition {
  type: DashboardWidgetType;
  title: string;
  id: string;
  category: 'card' | 'chart' | 'table';
}

export interface DashboardRoleLayout {
  hidden: string[];
  order: string[];
}

export type DashboardLayouts = Partial<Record<DashboardRole, DashboardRoleLayout>>;

export function widgetId(type: DashboardWidgetType, title: string): string {
  return `${type}:${title}`;
}

function widget(type: DashboardWidgetType, title: string): DashboardWidgetDefinition {
  return {
    type,
    title,
    id: widgetId(type, title),
    category: type === 'StatCard' ? 'card' : type === 'RecentAuditsTable' || type === 'ManagerDecisionHistoryTable' || type === 'CriticalErrorsTable' || type === 'AgentEvaluationVolumeTable' || type === 'AuditorEvaluationVolumeTable' || type === 'PositiveLowScoreTable' || type === 'PositiveCriticalZeroTable' ? 'table' : 'chart',
  };
}

const c = (title: string) => widget('StatCard', title);
const chart = (type: Exclude<DashboardWidgetType, 'StatCard' | 'RecentAuditsTable'>, title: string) => widget(type, title);
const table = (title: string) => widget('RecentAuditsTable', title);
const managerHistory = widget('ManagerDecisionHistoryTable', 'Decisões dos Gestores de Atendimento');
const criticalErrors = widget('CriticalErrorsTable', 'Erros Críticos por Agente');
const evaluationVolume = widget('AgentEvaluationVolumeTable', 'Avalia\u00e7\u00f5es por Agente');
const auditorVolume = widget('AuditorEvaluationVolumeTable', 'Monitorias por Monitor');
const positiveLow = widget('PositiveLowScoreTable', 'CSAT positivo · nota abaixo de 75%');
const positiveCritical = widget('PositiveCriticalZeroTable', 'CSAT positivo · zero por erro crítico');
const custom = (title: string) => widget('CustomChart', title);

export const DASHBOARD_WIDGETS: Record<DashboardRole, DashboardWidgetDefinition[]> = {
  admin: [
    c('Média Geral'), c('Índice de Excelência'), c('Total'), c('Total Pendentes'),
    c('Usuários Online'), c('Tendência'), c('Total Reavaliações'), c('Reav. Aprovadas'),
    c('Reav. Recusadas'), c('Taxa de Reversão'),
    custom('Distribuição por Equipe'), custom('Curva de Qualidade'), custom('Ações Expirando'),
    chart('DistributionChart', 'Precisão da Qualidade'),
    chart('DistributionChart', 'Insatisfação — Visão do Cliente'),
    chart('DistributionChart', 'Insatisfação — Visão da Qualidade'),
    chart('TrendChart', 'Performance Histórica'),
    chart('ComparativeBarChart', 'Volume de Reavaliações por Auditor'),
    chart('RankingWidget', 'Melhores Suporte'), chart('RankingWidget', 'Maiores Ofensores'),
    chart('RankingWidget', 'Volume por Auditor'), chart('RankingWidget', 'Top Reav. Aceitas'),
    chart('RankingWidget', 'Top Reav. Recusadas'), chart('OfensoresChart', 'Maiores Ofensores'),
    table('Últimas Auditorias do Sistema'), managerHistory, criticalErrors, evaluationVolume, auditorVolume, positiveLow, positiveCritical,
    widget('FeedbacksWidget', 'Feedbacks & Gestão de 1:1'),
  ],
  gestor_qualidade: [
    c('Minhas Ações'), c('Média Geral'), c('Índice de Excelência'), c('Total'),
    c('Total Pendentes'), c('Usuários Online'), c('Tendência'), c('Total Reavaliações'),
    c('Reav. Aprovadas'), c('Reav. Recusadas'), c('Taxa de Reversão'),
    custom('Distribuição por Equipe'), custom('Curva de Qualidade'), custom('Ações Expirando'),
    chart('DistributionChart', 'Precisão da Qualidade'),
    chart('DistributionChart', 'Insatisfação — Visão do Cliente'),
    chart('DistributionChart', 'Insatisfação — Visão da Qualidade'),
    chart('TrendChart', 'Performance Histórica'),
    chart('ComparativeBarChart', 'Volume de Reavaliações por Auditor'),
    chart('RankingWidget', 'Melhores Suporte'), chart('RankingWidget', 'Maiores Ofensores'),
    chart('RankingWidget', 'Volume por Auditor'), chart('RankingWidget', 'Top Reav. Aceitas'),
    chart('RankingWidget', 'Top Reav. Recusadas'), chart('OfensoresChart', 'Maiores Ofensores'),
    table('Últimas Auditorias do Sistema'), managerHistory, criticalErrors, evaluationVolume, auditorVolume, positiveLow, positiveCritical,
  ],
  gestor_suporte: [
    c('Minhas Ações'), c('Média Geral'), c('Índice de Excelência'), c('Total'),
    c('Total Pendentes'), c('Taxa de Reversão'), c('Usuários Online'),
    c('Total Avaliado'), c('Total Positivo'), c('Total Negativo'), c('Tickets Invalidados'),
    c('Total Reavaliações'), c('Reav. Aprovadas'), c('Reav. Recusadas'), c('Tendência'),
    custom('Curva de Qualidade'), custom('Ações Expirando'),
    chart('OfensoresChart', 'Maiores Ofensores — Critérios'),
    chart('TrendChart', 'Performance Histórica'),
    chart('RankingWidget', 'Melhores Suporte'), chart('RankingWidget', 'Maiores Ofensores'),
    chart('RankingWidget', 'Top Reav. Aceitas'), chart('RankingWidget', 'Top Reav. Recusadas'),
    chart('DistributionChart', 'Insatisfação — Visão do Cliente'),
    chart('DistributionChart', 'Insatisfação — Visão da Qualidade'),
    widget('FeedbacksWidget', 'Feedbacks & Gestão de 1:1'),
    widget('NegativeCallsTrainingAlert', 'Necessidade de treinamento'),
    table('Monitorias Recentes'), managerHistory, criticalErrors, evaluationVolume,
  ],
  qualidade: [
    c('Minhas Pendências'), c('Meu Volume'), c('Nota Média Individual'), c('Nota Média Geral'),
    c('Total Reav. Recebidas'), c('Reav. Aprovadas'), c('Reav. Recusadas'), c('Taxa de Reversão Individual'),
    chart('ComparativeBarChart', 'Volumetria Diária'),
    chart('ActionDeadlineWidget', 'Monitorias em Andamento'),
    chart('ActionDeadlineWidget', 'Ações Expirando'),
    chart('OfensoresChart', 'Maiores Ofensores — Critérios'),
    chart('DistributionChart', 'Distribuição por Equipes'),
    chart('DistributionChart', 'Minha Curva de Qualidade'),
    chart('DistributionChart', 'Precisão da Qualidade'),
    chart('DistributionChart', 'Insatisfação — Visão do Cliente'),
    chart('DistributionChart', 'Insatisfação — Visão da Qualidade'),
    table('Minhas Auditorias Recentes'), managerHistory, criticalErrors, evaluationVolume, auditorVolume,
  ],
  suporte: [
    c('Minhas Pendências'), c('Meu Volume'), c('Minha Média'), c('Média Equipe'),
    c('Contestações Solicitadas'), c('Contestações Aprovadas'), c('Contestações Recusadas'),
    c('Taxa de Sucesso'),
    chart('TrendChart', 'Evolução Comparativa'), chart('TrendChart', 'Evolução Semanal'),
    chart('ActionDeadlineWidget', 'Contestações Ativas'),
    chart('ActionDeadlineWidget', 'Prazos para Contestar'),
    chart('OfensoresChart', 'Meus Ofensores'),
    chart('DistributionChart', 'Minha Classificação por Faixas'),
    chart('DistributionChart', 'Insatisfação — Visão do Cliente'),
    chart('DistributionChart', 'Insatisfação — Visão da Qualidade'),
    table('Minhas Auditorias Recentes'),
    widget('QualityAchievementsWidget', 'Minhas Conquistas & Gamificação'),
    widget('FeedbacksWidget', 'Meus Feedbacks & Planos 1:1'),
  ],
};

export function orderedWidgets(role: DashboardRole, layout?: DashboardRoleLayout): DashboardWidgetDefinition[] {
  const widgets = DASHBOARD_WIDGETS[role];
  if (!layout?.order?.length) return widgets;
  const rank = new Map(layout.order.map((id, index) => [id, index]));
  return [...widgets].sort((a, b) =>
    (rank.get(a.id) ?? widgets.length + widgets.indexOf(a)) -
    (rank.get(b.id) ?? widgets.length + widgets.indexOf(b))
  );
}
