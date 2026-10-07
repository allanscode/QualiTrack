interface PublicationContext {status:string;satisfaction_result?:string|null;score?:number|null}
const terminalStatuses=new Set(['concluida','finalizada_alterada']);
const eligibleStatuses=new Set(['pendente_revisao','concluida','contestacao_aceita','contestacao_negada','finalizada_alterada']);

export function awaitsFinalPositiveDecision(context:PublicationContext):boolean {
  return context.satisfaction_result==='Positiva' && typeof context.score==='number' && Number.isFinite(context.score)
    && context.score<75 && !terminalStatuses.has(context.status);
}

export function canPublishSavedMonitoria(context:PublicationContext):boolean {
  return typeof context.score==='number' && Number.isFinite(context.score) && context.score>=0 && context.score<=100
    && eligibleStatuses.has(context.status) && !awaitsFinalPositiveDecision(context);
}
