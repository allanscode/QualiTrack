import { describe, expect, it } from 'vitest';
import { matchesAssignedMonitor } from './queueMonitorFilter';
import { QueueAssignment } from './queueDistribution';

const assignments: Record<string, QueueAssignment> = {
  '101': {
    ticket_id: '101', queue_type: 'negativas', assigned_to: 'monitor-a',
    status: 'pending', assignment_source: 'automatic', started_at: null, started_by: null,
  },
  '102': {
    ticket_id: '102', queue_type: 'negativas', assigned_to: 'monitor-b',
    status: 'pending', assignment_source: 'manual', started_at: null, started_by: null,
  },
};

describe('filtro por monitor de qualidade', () => {
  it('mantém todos quando nenhum monitor foi selecionado', () => {
    expect(matchesAssignedMonitor('negativas', 'admin', '', '101', assignments, true)).toBe(true);
  });

  it('mostra apenas tickets atribuídos ao monitor, online ou offline', () => {
    expect(matchesAssignedMonitor('negativas', 'admin', 'monitor-a', '101', assignments, true)).toBe(true);
    expect(matchesAssignedMonitor('negativas', 'gestor_qualidade', 'monitor-a', '102', assignments, true)).toBe(false);
    expect(matchesAssignedMonitor('negativas', 'admin', 'monitor-c', '101', assignments, true)).toBe(false);
  });

  it('não habilita o filtro para monitor comum nem filas sem atribuição', () => {
    expect(matchesAssignedMonitor('negativas', 'qualidade', 'monitor-b', '101', assignments, true)).toBe(true);
    expect(matchesAssignedMonitor('proativas', 'admin', 'monitor-a', '101', assignments, true)).toBe(true);
  });

  it('aguarda atribuições antes de mostrar resultados', () => {
    expect(matchesAssignedMonitor('negativas', 'admin', 'monitor-a', '101', assignments, false)).toBe(false);
  });
});
