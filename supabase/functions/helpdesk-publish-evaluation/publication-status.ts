/** CSAT positivo invalidado aguarda a decisão final; as demais filas mantêm
 * o fluxo de publicação após salvar e revisar o preview. */
export function canPublishMonitoriaStatus(status: string, context?: {
  satisfaction_result?: string | null; score?: number | null;
}): boolean {
  if (context && (typeof context.score!=='number' || !Number.isFinite(context.score) || context.score<0 || context.score>100)) return false;
  if (context?.satisfaction_result==='Positiva' && (context.score ?? 75)<75) {
    return status==='concluida' || status==='finalizada_alterada';
  }
  return [
    'pendente_revisao',
    'concluida',
    'contestacao_aceita',
    'contestacao_negada',
    'finalizada_alterada',
  ].includes(status);
}
