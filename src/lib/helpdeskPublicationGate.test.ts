import {describe,expect,it} from 'vitest';
import {awaitsFinalPositiveDecision,canPublishSavedMonitoria} from './helpdeskPublicationGate';
import {canPublishMonitoriaStatus} from '../../supabase/functions/helpdesk-publish-evaluation/publication-status';

describe('publication UI and authoritative server gate',()=>{
  it('prevents the auto-preview and view-only send until an invalid positive finishes the process',()=>{
    const initial={status:'pendente_revisao',satisfaction_result:'Positiva',score:50};
    expect(awaitsFinalPositiveDecision(initial)).toBe(true);
    expect(canPublishSavedMonitoria(initial)).toBe(false);
    expect(canPublishSavedMonitoria({...initial,status:'contestacao_negada'})).toBe(false);
    expect(awaitsFinalPositiveDecision({...initial,status:'concluida'})).toBe(false);
    expect(canPublishSavedMonitoria({...initial,status:'concluida'})).toBe(true);
  });
  it('agrees with the backend for every workflow state, CSAT type and threshold',()=>{
    const statuses=['pendente_revisao','em_contestacao','aguardando_gestor_suporte','aguardando_revisao_pj','aguardando_gestor_qualidade','concluida','contestacao_aceita','contestacao_negada','finalizada_alterada','reavaliacao_solicitada'];
    for(const status of statuses) for(const satisfaction_result of ['Positiva','Negativa','Sem pesquisa',null]) for(const score of [0,74.99,75,100,null,NaN,Infinity,-1]) {
      expect(canPublishSavedMonitoria({status,satisfaction_result,score})).toBe(canPublishMonitoriaStatus(status,{satisfaction_result,score}));
    }
  });
});
