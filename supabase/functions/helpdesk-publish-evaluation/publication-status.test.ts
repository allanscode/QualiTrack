import { describe, expect, it } from 'vitest';
import { canPublishMonitoriaStatus } from './publication-status.ts';

describe('canPublishMonitoriaStatus', () => {
  it('permite revisar e publicar logo após salvar a monitoria', () => {
    expect(canPublishMonitoriaStatus('pendente_revisao')).toBe(true);
  });

  it('impede publicação durante uma contestação em andamento', () => {
    expect(canPublishMonitoriaStatus('em_contestacao')).toBe(false);
    expect(canPublishMonitoriaStatus('aguardando_gestor_qualidade')).toBe(false);
  });

  it('preserva a publicação de monitorias concluídas', () => {
    expect(canPublishMonitoriaStatus('concluida')).toBe(true);
  });
  it('positiva invalidada aguarda decisão final inclusive se a contestação tiver sido negada',()=>{
    for(const status of ['pendente_revisao','em_contestacao','aguardando_gestor_suporte','aguardando_gestor_qualidade','aguardando_revisao_pj','contestacao_negada','contestacao_aceita','reavaliacao_solicitada']) {
      expect(canPublishMonitoriaStatus(status,{satisfaction_result:'Positiva',score:0})).toBe(false);
    }
    expect(canPublishMonitoriaStatus('concluida',{satisfaction_result:'Positiva',score:74.99})).toBe(true);
    expect(canPublishMonitoriaStatus('finalizada_alterada',{satisfaction_result:'Positiva',score:0})).toBe(true);
  });
  it('mantém o fluxo das demais pesquisas e não invalida uma positiva com exatamente75',()=>{
    expect(canPublishMonitoriaStatus('pendente_revisao',{satisfaction_result:'Negativa',score:0})).toBe(true);
    expect(canPublishMonitoriaStatus('pendente_revisao',{satisfaction_result:'Sem pesquisa',score:60})).toBe(true);
    expect(canPublishMonitoriaStatus('pendente_revisao',{satisfaction_result:'Positiva',score:75})).toBe(true);
    expect(canPublishMonitoriaStatus('concluida',{satisfaction_result:'Positiva',score:null})).toBe(false);
  });
});
