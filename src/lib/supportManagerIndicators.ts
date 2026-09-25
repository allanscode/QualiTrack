import type { Monitoria, HelpdeskSubmission } from '../types';

export interface SupportManagerIndicators {
  totalAvaliado: number;
  totalPositivo: number;
  totalNegativo: number;
  totalInvalidados: number;
  avaliadosList: Monitoria[];
  positivosList: Monitoria[];
  negativosList: Monitoria[];
  invalidadosList: Monitoria[];
}

/**
 * Calcula os indicadores obrigatórios do Dashboard do Gestor de Suporte (WQ-21)
 *
 * Regras:
 * - Escopado para os times do gestor de suporte.
 * - Total Avaliado: volume de monitorias pontuadas.
 * - Total Positivo: score >= 75 (limiar fixo de domínio).
 * - Total Negativo: score < 75 (limiar fixo de domínio).
 * - Total de Tickets Invalidados: último envio bem-sucedido no Zendesk com outcome = 'negativa'.
 * - Sem queries N+1.
 */
export function computeSupportManagerIndicators(
  monitorias: Monitoria[],
  teamIds: string[],
  helpdeskSubmissions: HelpdeskSubmission[] = []
): SupportManagerIndicators {
  const scoped = monitorias.filter(m => m.team_id && teamIds.includes(m.team_id));

  // Monitorias avaliadas (com score preenchido e ativas)
  const avaliadosList = scoped.filter(
    m => m.score !== undefined && m.score !== null && m.active !== false
  );

  // Limiar fixo de 75% (não usa targetScore variável)
  const positivosList = avaliadosList.filter(m => (m.score ?? 0) >= 75);
  const negativosList = avaliadosList.filter(m => (m.score ?? 0) < 75);

  // Mapeia a última submissão com status 'sent' para cada monitoria
  const latestSentSubmissionByMonitoria = new Map<string, HelpdeskSubmission>();
  for (const sub of helpdeskSubmissions) {
    if (sub.status !== 'sent') continue;
    const existing = latestSentSubmissionByMonitoria.get(sub.monitoria_id);
    if (!existing || new Date(sub.created_at).getTime() > new Date(existing.created_at).getTime()) {
      latestSentSubmissionByMonitoria.set(sub.monitoria_id, sub);
    }
  }

  const invalidadosList = avaliadosList.filter(m => {
    const lastSub = latestSentSubmissionByMonitoria.get(m.id);
    return lastSub?.outcome === 'negativa';
  });

  return {
    totalAvaliado: avaliadosList.length,
    totalPositivo: positivosList.length,
    totalNegativo: negativosList.length,
    totalInvalidados: invalidadosList.length,
    avaliadosList,
    positivosList,
    negativosList,
    invalidadosList,
  };
}
