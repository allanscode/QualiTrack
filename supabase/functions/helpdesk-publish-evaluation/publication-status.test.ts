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
});
