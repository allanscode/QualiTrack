import { describe, it, expect } from 'vitest';
import {
  shouldReceiveContestationNotification,
  getContestationNotifications,
  type MonitoriaLike,
  type UserLike,
} from './contestationNotifications';

describe('shouldReceiveContestationNotification (WQ-25)', () => {
  const evaluatorId = 'eval-123';
  const monitoria = { evaluator_id: evaluatorId };

  it('gestor_qualidade DEVE receber a notificação', () => {
    const user: UserLike = { id: 'gestor-q-1', role: 'gestor_qualidade' };
    expect(shouldReceiveContestationNotification(user, monitoria)).toBe(true);
  });

  it('admin DEVE receber a notificação', () => {
    const user: UserLike = { id: 'admin-1', role: 'admin' };
    expect(shouldReceiveContestationNotification(user, monitoria)).toBe(true);
  });

  it('monitor avaliador (evaluator) DEVE receber a notificação', () => {
    const user: UserLike = { id: evaluatorId, role: 'qualidade' };
    expect(shouldReceiveContestationNotification(user, monitoria)).toBe(true);
  });

  it('outro monitor de qualidade (não avaliador) NÃO deve receber a notificação', () => {
    const user: UserLike = { id: 'other-auditor-999', role: 'qualidade' };
    expect(shouldReceiveContestationNotification(user, monitoria)).toBe(false);
  });

  it('atendente de suporte NÃO deve receber a notificação', () => {
    const user: UserLike = { id: 'support-agent-1', role: 'suporte' };
    expect(shouldReceiveContestationNotification(user, monitoria)).toBe(false);
  });

  it('gestor de suporte NÃO deve receber a notificação', () => {
    const user: UserLike = { id: 'support-manager-1', role: 'gestor_suporte' };
    expect(shouldReceiveContestationNotification(user, monitoria)).toBe(false);
  });

  it('usuário nulo ou indefinido retorna false', () => {
    expect(shouldReceiveContestationNotification(null, monitoria)).toBe(false);
    expect(shouldReceiveContestationNotification(undefined, monitoria)).toBe(false);
  });
});

describe('getContestationNotifications (WQ-25)', () => {
  const evaluatorUser: UserLike = { id: 'auditor-1', role: 'qualidade' };
  const gestorQUser: UserLike = { id: 'gestor-q-1', role: 'gestor_qualidade' };
  const otherMonitor: UserLike = { id: 'auditor-2', role: 'qualidade' };
  const supportUser: UserLike = { id: 'agent-1', role: 'suporte' };

  const sampleMonitoria: MonitoriaLike = {
    id: 'm-100',
    ticket_id: '99881',
    display_id: '042',
    status: 'em_contestacao',
    evaluator_id: 'auditor-1',
    updated_at: '2026-09-25T14:30:00-03:00',
    history: [
      { action: 'Monitoria Criada', at: '2026-09-24T10:00:00-03:00' },
      {
        action: 'Contestação realizada',
        at: '2026-09-25T14:30:00-03:00',
        note: 'Discordo da pontuação de empatia',
      },
    ],
  };

  it('deve gerar notificação estável com id baseado em monitoria_id + timestamp do evento', () => {
    const readIds = new Set<string>();
    const notifs = getContestationNotifications(evaluatorUser, [sampleMonitoria], readIds);

    expect(notifs).toHaveLength(1);
    expect(notifs[0].id).toBe('contestacao-m-100-2026-09-25T14:30:00-03:00');
    expect(notifs[0].monitoriaId).toBe('m-100');
    expect(notifs[0].ticketId).toBe('99881');
    expect(notifs[0].read).toBe(false);
    expect(notifs[0].message).toContain('Discordo da pontuação de empatia');
  });

  it('deve marcar notificação como lida se o id estiver em readNotificationIds', () => {
    const readIds = new Set<string>(['contestacao-m-100-2026-09-25T14:30:00-03:00']);
    const notifs = getContestationNotifications(evaluatorUser, [sampleMonitoria], readIds);

    expect(notifs).toHaveLength(1);
    expect(notifs[0].read).toBe(true);
  });

  it('uma nova contestação posterior na mesma monitoria deve gerar nova notificação com novo ID', () => {
    const readIds = new Set<string>(['contestacao-m-100-2026-09-25T14:30:00-03:00']);

    // Nova contestação ocorre às 16:00
    const recontestedMonitoria: MonitoriaLike = {
      ...sampleMonitoria,
      updated_at: '2026-09-25T16:00:00-03:00',
      history: [
        ...(sampleMonitoria.history || []),
        { action: 'Monitoria Reavaliada', at: '2026-09-25T15:00:00-03:00' },
        { action: 'Contestação realizada', at: '2026-09-25T16:00:00-03:00', note: 'Nova contestação' },
      ],
    };

    const notifs = getContestationNotifications(evaluatorUser, [recontestedMonitoria], readIds);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].id).toBe('contestacao-m-100-2026-09-25T16:00:00-03:00');
    // Como o novo ID não estava no Set, deve ser unread!
    expect(notifs[0].read).toBe(false);
  });

  it('NÃO deve gerar notificação para estado legado "contestado"', () => {
    const legacyMonitoria: MonitoriaLike = {
      ...sampleMonitoria,
      status: 'contestado',
    };
    const notifs = getContestationNotifications(gestorQUser, [legacyMonitoria], new Set());
    expect(notifs).toHaveLength(0);
  });

  it('NÃO deve gerar notificação para outros monitores ou equipe de suporte', () => {
    expect(getContestationNotifications(otherMonitor, [sampleMonitoria], new Set())).toHaveLength(0);
    expect(getContestationNotifications(supportUser, [sampleMonitoria], new Set())).toHaveLength(0);
  });
});
