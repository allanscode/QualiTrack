import { describe, expect, it } from 'vitest';
import type { Monitoria, User } from '../types';
import { getManagerDecisionHistory } from './managerDecisionHistory';

const users = [{ id: 'support-manager', role: 'gestor_suporte', name: 'Gestor PJ' }] as User[];
const monitoria = {
  id: 'monitoria-1', ticket_id: '177437', history: [
    { action: 'Monitoria criada', by_id: 'auditor', by_name: 'Auditor', at: '2026-10-01T12:00:00Z' },
    { action: 'Gestor PJ encaminhou contestação para a Gestão da Qualidade', by_id: 'support-manager', by_name: 'Gestor PJ', at: '2026-10-02T12:00:00Z' },
    { action: 'Monitoria aprovada pelo Gestor de Suporte', by_id: 'support-manager', by_name: 'Gestor PJ', at: '2026-10-03T12:00:00Z' },
    { action: 'Reavaliação aceita pelo Gestor Qual.', by_id: 'quality-manager', by_name: 'Qualidade', at: '2026-10-04T12:00:00Z' },
  ],
} as Monitoria;

describe('getManagerDecisionHistory', () => {
  it('lista decisões dos gestores de atendimento em ordem cronológica inversa', () => {
    expect(getManagerDecisionHistory([monitoria], users).map(item => item.kind)).toEqual(['approval', 'contestation']);
  });

  it('reconhece ações antigas pelo papel do autor e ignora o gestor de qualidade', () => {
    const legacy = { ...monitoria, history: [
      { action: 'Contestação realizada', by_id: 'support-manager', by_name: 'Gestor PJ', at: '2026-10-02T12:00:00Z' },
      { action: 'Monitoria aprovada pelo Gestor Qualidade', by_id: 'quality-manager', by_name: 'Qualidade', at: '2026-10-03T12:00:00Z' },
    ] } as Monitoria;
    expect(getManagerDecisionHistory([legacy], users).map(item => item.kind)).toEqual(['contestation']);
  });
});
