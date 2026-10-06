/** A publicação pode ocorrer após salvar a monitoria, com revisão ainda aberta. */
export function canPublishMonitoriaStatus(status: string): boolean {
  return [
    'pendente_revisao',
    'concluida',
    'contestacao_aceita',
    'contestacao_negada',
    'finalizada_alterada',
  ].includes(status);
}
