import { describe, it, expect } from 'vitest';
import {
  isApprovalAction,
  isRejectionAction,
  isContestationAction,
  isResolutionAction,
  resolveContestationResult,
  getContestedMonitorias,
  getLastResolution,
  countContestationOutcomes,
} from '../lib/contestation';
import { Monitoria, MonitoriaHistoryEntry } from '../types';

const createMockMonitoria = (overrides: Partial<Monitoria> = {}): Monitoria => ({
  id: 'm1',
  ticket_id: 'T001',
  evaluator_id: 'u1',
  evaluated_id: 'u2',
  form_id: 'f1',
  channel: 'Chat',
  ticket_date: new Date().toISOString().split('T')[0],
  analysis_date: new Date().toISOString().split('T')[0],
  satisfaction_result: 'Sem pesquisa',
  satisfaction_has_record: false,
  satisfaction_record_text: '',
  answers: {},
  score: 80,
  status: 'pendente_revisao',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  history: [],
  ...overrides,
});

const createHistoryEntry = (overrides: Partial<MonitoriaHistoryEntry> = {}): MonitoriaHistoryEntry => ({
  action: 'Monitoria Criada',
  by_id: 'u1',
  by_name: 'Auditor',
  at: new Date().toISOString(),
  ...overrides,
});

describe('contestation', () => {
  describe('isApprovalAction', () => {
    it('deve detectar "procedente" (case insensitive)', () => {
      expect(isApprovalAction('Contestação Procedente')).toBe(true);
      expect(isApprovalAction('PROCEDENTE')).toBe(true);
      expect(isApprovalAction('procedente')).toBe(true);
    });

    it('deve detectar "aceita" / "aceito" / "aceita"', () => {
      expect(isApprovalAction('Contestação Aceita')).toBe(true);
      expect(isApprovalAction('ACEITA')).toBe(true);
      expect(isApprovalAction('Reavaliação Aceita')).toBe(true);
    });

    it('deve detectar "reavaliada" / "reavaliado"', () => {
      expect(isApprovalAction('Monitoria Reavaliada')).toBe(true);
      expect(isApprovalAction('REAVALIADA')).toBe(true);
    });

    it('deve detectar "alterada" / "alterado"', () => {
      expect(isApprovalAction('Finalizada Alterada')).toBe(true);
      expect(isApprovalAction('ALTERADO')).toBe(true);
    });

    it('NÃO deve detectar ações sem palavras-chave de aprovação', () => {
      expect(isApprovalAction('Monitoria Criada')).toBe(false);
      expect(isApprovalAction('Contestação Negada')).toBe(false);
      expect(isApprovalAction('Em Contestação')).toBe(false);
      expect(isApprovalAction('')).toBe(false);
    });
  });

  describe('isRejectionAction', () => {
    it('deve detectar "Improcedente" (case sensitive per code)', () => {
      expect(isRejectionAction('Contestação Improcedente')).toBe(true);
      expect(isRejectionAction('IMPROCEDENTE')).toBe(true); // lower() check
    });

    it('deve detectar "Mantida" (case sensitive per code)', () => {
      expect(isRejectionAction('Nota Mantida')).toBe(true);
      expect(isRejectionAction('MANTIDA')).toBe(true);
    });

    it('deve detectar "negada" (lowercase keywords)', () => {
      expect(isRejectionAction('Contestação Negada')).toBe(true);
      expect(isRejectionAction('NEGADA')).toBe(true);
    });

    it('deve detectar "recusada" (lowercase keywords)', () => {
      expect(isRejectionAction('Contestação Recusada')).toBe(true);
      expect(isRejectionAction('RECUSADA')).toBe(true);
    });

    it('NÃO deve detectar ações sem palavras-chave de rejeição', () => {
      expect(isRejectionAction('Monitoria Criada')).toBe(false);
      expect(isRejectionAction('Contestação Aceita')).toBe(false);
      expect(isRejectionAction('')).toBe(false);
    });

    it('deve priorizar case-sensitive "Improcedente" e "Mantida" antes do lowercase', () => {
      // O código verifica action.includes('Improcedente') ANTES do lower().includes()
      // mas como usa ||, ambos paths funcionam. Teste de comportamento:
      expect(isRejectionAction('Improcedente')).toBe(true);
      expect(isRejectionAction('improcedente')).toBe(true); // lower path
      expect(isRejectionAction('Mantida')).toBe(true);
      expect(isRejectionAction('mantida')).toBe(true);
    });
  });

  describe('isContestationAction', () => {
    it('deve detectar "Contestação" (case sensitive)', () => {
      expect(isContestationAction('Contestação Solicitada')).toBe(true);
      expect(isContestationAction('contestação')).toBe(false); // case sensitive!
    });

    it('deve detectar "contestou" (lowercase)', () => {
      expect(isContestationAction('Agente contestou')).toBe(true);
      expect(isContestationAction('CONTESTOU')).toBe(true);
    });

    it('deve detectar "solicitou reavaliação" (lowercase)', () => {
      expect(isContestationAction('Solicitou Reavaliação')).toBe(true);
      expect(isContestationAction('SOLICITOU REAVALIAÇÃO')).toBe(true);
    });

    it('NÃO deve detectar ações sem palavras-chave de contestação', () => {
      expect(isContestationAction('Monitoria Criada')).toBe(false);
      expect(isContestationAction('Edição pelo Administrador')).toBe(false);
      expect(isContestationAction('')).toBe(false);
    });
  });

  describe('isResolutionAction', () => {
    it('deve retornar true para ações de aprovação', () => {
      expect(isResolutionAction('Contestação Aceita')).toBe(true);
      expect(isResolutionAction('Procedente')).toBe(true);
    });

    it('deve retornar true para ações de rejeição', () => {
      expect(isResolutionAction('Contestação Negada')).toBe(true);
      expect(isResolutionAction('Improcedente')).toBe(true);
    });

    it('deve retornar false para ações que não são resolução', () => {
      expect(isResolutionAction('Monitoria Criada')).toBe(false);
      expect(isResolutionAction('Contestação Solicitada')).toBe(false);
      expect(isResolutionAction('Em Contestação')).toBe(false);
    });
  });

  describe('resolveContestationResult', () => {
    it('deve retornar "approved" para ações de aprovação', () => {
      expect(resolveContestationResult('Contestação Aceita')).toBe('approved');
      expect(resolveContestationResult('Procedente')).toBe('approved');
    });

    it('deve retornar "rejected" para ações de rejeição', () => {
      expect(resolveContestationResult('Contestação Negada')).toBe('rejected');
      expect(resolveContestationResult('Improcedente')).toBe('rejected');
    });

    it('deve retornar null para ações que não são resolução', () => {
      expect(resolveContestationResult('Monitoria Criada')).toBeNull();
      expect(resolveContestationResult('Contestação Solicitada')).toBeNull();
    });
  });

  describe('getContestedMonitorias', () => {
    it('deve filtrar apenas monitorias com histórico de contestação', () => {
      const m1 = createMockMonitoria({
        history: [createHistoryEntry({ action: 'Contestação Solicitada' })],
      });
      const m2 = createMockMonitoria({ history: [createHistoryEntry({ action: 'Monitoria Criada' })] });
      const m3 = createMockMonitoria({
        history: [createHistoryEntry({ action: 'Agente contestou a nota' })],
      });

      const result = getContestedMonitorias([m1, m2, m3]);
      expect(result).toHaveLength(2);
      expect(result.map(m => m.id)).toContain(m1.id);
      expect(result.map(m => m.id)).toContain(m3.id);
    });

    it('deve retornar array vazio se nenhuma tem contestação', () => {
      const m1 = createMockMonitoria({ history: [createHistoryEntry({ action: 'Monitoria Criada' })] });
      const result = getContestedMonitorias([m1]);
      expect(result).toHaveLength(0);
    });

    it('deve lidar com monitorias sem history', () => {
      const m1 = createMockMonitoria({ history: undefined });
      const m2 = createMockMonitoria({ history: [] });
      const result = getContestedMonitorias([m1, m2]);
      expect(result).toHaveLength(0);
    });
  });

  describe('getLastResolution', () => {
    it('deve retornar a última ação de resolução (aprovação ou rejeição)', () => {
      const history = [
        createHistoryEntry({ action: 'Monitoria Criada', at: '2026-01-01T10:00:00Z' }),
        createHistoryEntry({ action: 'Contestação Solicitada', at: '2026-01-02T10:00:00Z' }),
        createHistoryEntry({ action: 'Contestação Aceita', at: '2026-01-03T10:00:00Z' }),
      ];
      const result = getLastResolution(history);
      expect(result).not.toBeNull();
      expect(result?.action).toBe('Contestação Aceita');
    });

    it('deve retornar a última rejeição se for a mais recente', () => {
      const history = [
        createHistoryEntry({ action: 'Contestação Aceita', at: '2026-01-02T10:00:00Z' }),
        createHistoryEntry({ action: 'Contestação Negada', at: '2026-01-03T10:00:00Z' }),
      ];
      const result = getLastResolution(history);
      expect(result?.action).toBe('Contestação Negada');
    });

    it('deve ignorar ações que não são resolução', () => {
      const history = [
        createHistoryEntry({ action: 'Contestação Aceita', at: '2026-01-02T10:00:00Z' }),
        createHistoryEntry({ action: 'Monitoria Reavaliada (Procedente)', at: '2026-01-03T10:00:00Z' }), // não é resolução
      ];
      const result = getLastResolution(history);
      expect(result?.action).toBe('Contestação Aceita');
    });

    it('deve retornar null se history vazio ou undefined', () => {
      expect(getLastResolution([])).toBeNull();
      // @ts-expect-error - testando comportamento com undefined
      expect(getLastResolution(undefined)).toBeNull();
    });

    it('deve retornar null se não há ações de resolução', () => {
      const history = [
        createHistoryEntry({ action: 'Monitoria Criada', at: '2026-01-01T10:00:00Z' }),
        createHistoryEntry({ action: 'Contestação Solicitada', at: '2026-01-02T10:00:00Z' }),
      ];
      expect(getLastResolution(history)).toBeNull();
    });
  });

  describe('countContestationOutcomes', () => {
    it('deve contar usando contestation_result quando disponível', () => {
      const m1 = createMockMonitoria({
        id: 'm1',
        contestation_result: 'approved',
        history: [createHistoryEntry({ action: 'Contestação Solicitada' })],
      });
      const m2 = createMockMonitoria({
        id: 'm2',
        contestation_result: 'rejected',
        history: [createHistoryEntry({ action: 'Contestação Solicitada' })],
      });
      const m3 = createMockMonitoria({
        id: 'm3',
        contestation_result: 'pending',
        history: [createHistoryEntry({ action: 'Contestação Solicitada' })],
      });

      const result = countContestationOutcomes([m1, m2, m3]);
      expect(result.accepted).toBe(1);
      expect(result.rejected).toBe(1);
      expect(result.total).toBe(3); // 3 monitorias contestadas
    });

    it('deve usar último desfecho do history quando contestation_result ausente/pending', () => {
      const m1 = createMockMonitoria({
        id: 'm1',
        contestation_result: 'pending',
        history: [
          createHistoryEntry({ action: 'Contestação Solicitada', at: '2026-01-01T10:00:00Z' }),
          createHistoryEntry({ action: 'Contestação Aceita', at: '2026-01-02T10:00:00Z' }),
        ],
      });
      const m2 = createMockMonitoria({
        id: 'm2',
        contestation_result: 'pending',
        history: [
          createHistoryEntry({ action: 'Contestação Solicitada', at: '2026-01-01T10:00:00Z' }),
          createHistoryEntry({ action: 'Contestação Negada', at: '2026-01-02T10:00:00Z' }),
        ],
      });

      const result = countContestationOutcomes([m1, m2]);
      expect(result.accepted).toBe(1);
      expect(result.rejected).toBe(1);
      expect(result.total).toBe(2);
    });

    it('deve evitar dupla contagem usando apenas o ÚLTIMO desfecho', () => {
      // Simula múltiplas rodadas: aceitou -> negou -> aceitou
      const m1 = createMockMonitoria({
        id: 'm1',
        contestation_result: 'pending',
        history: [
          createHistoryEntry({ action: 'Contestação Solicitada', at: '2026-01-01T10:00:00Z' }),
          createHistoryEntry({ action: 'Contestação Aceita', at: '2026-01-02T10:00:00Z' }), // 1ª aceitação
          createHistoryEntry({ action: 'Contestação Negada', at: '2026-01-03T10:00:00Z' }), // rejeição
          createHistoryEntry({ action: 'Contestação Aceita', at: '2026-01-04T10:00:00Z' }), // 2ª aceitação (última)
        ],
      });

      const result = countContestationOutcomes([m1]);
      expect(result.accepted).toBe(1); // Apenas a última (aceita) conta
      expect(result.rejected).toBe(0);
      expect(result.total).toBe(1);
    });

    it('deve ignorar monitorias sem contestação no history', () => {
      const m1 = createMockMonitoria({ history: [createHistoryEntry({ action: 'Monitoria Criada' })] });
      const m2 = createMockMonitoria({ history: [createHistoryEntry({ action: 'Contestação Solicitada' })] });

      const result = countContestationOutcomes([m1, m2]);
      expect(result.total).toBe(1); // Apenas m2 tem contestação
    });

    it('deve lidar com array vazio', () => {
      const result = countContestationOutcomes([]);
      expect(result).toEqual({ accepted: 0, rejected: 0, total: 0 });
    });

    it('deve priorizar contestation_result sobre history', () => {
      const m1 = createMockMonitoria({
        id: 'm1',
        contestation_result: 'approved', // DB diz aprovado
        history: [
          createHistoryEntry({ action: 'Contestação Solicitada', at: '2026-01-01T10:00:00Z' }),
          createHistoryEntry({ action: 'Contestação Negada', at: '2026-01-02T10:00:00Z' }), // Mas history diz negado
        ],
      });

      const result = countContestationOutcomes([m1]);
      expect(result.accepted).toBe(1); // contestation_result vence
      expect(result.rejected).toBe(0);
    });
  });
});
