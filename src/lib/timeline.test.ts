import { describe, it, expect } from 'vitest';
import { formatTimelineDateTime, resolveTimelineActor } from './timeline';

describe('formatTimelineDateTime (WQ-23)', () => {
  it('deve formatar data e hora completas no formato esperado (DD/MM/YYYY às HH:mm)', () => {
    // 2026-09-25T17:21:00 no fuso de SP (UTC-3 = 20:21 UTC)
    const isoString = '2026-09-25T20:21:00Z';
    expect(formatTimelineDateTime(isoString)).toBe('25/09/2026 às 17:21');
  });

  it('deve formatar corretamente para múltiplos dias consecutivos', () => {
    expect(formatTimelineDateTime('2026-09-24T15:00:00-03:00')).toBe('24/09/2026 às 15:00');
    expect(formatTimelineDateTime('2026-09-25T15:00:00-03:00')).toBe('25/09/2026 às 15:00');
    expect(formatTimelineDateTime('2026-09-26T15:00:00-03:00')).toBe('26/09/2026 às 15:00');
  });

  it('deve tratar virada de mês mantendo o fuso America/Sao_Paulo consistente', () => {
    // 01/10/2026 02:30:00 UTC = 30/09/2026 23:30 em São Paulo
    expect(formatTimelineDateTime('2026-10-01T02:30:00Z')).toBe('30/09/2026 às 23:30');
    // 01/10/2026 03:01:00 UTC = 01/10/2026 00:01 em São Paulo
    expect(formatTimelineDateTime('2026-10-01T03:01:00Z')).toBe('01/10/2026 às 00:01');
  });

  it('deve tratar virada de ano', () => {
    expect(formatTimelineDateTime('2027-01-01T00:05:00-03:00')).toBe('01/01/2027 às 00:05');
  });

  it('deve usar fallbackDate se a data principal for nula ou indefinida', () => {
    expect(formatTimelineDateTime(null, '2026-09-25T17:21:00-03:00')).toBe('25/09/2026 às 17:21');
    expect(formatTimelineDateTime(undefined, '2026-09-25T17:21:00-03:00')).toBe('25/09/2026 às 17:21');
    expect(formatTimelineDateTime('', '2026-09-25T17:21:00-03:00')).toBe('25/09/2026 às 17:21');
  });

  it('deve usar fallbackDate se a data principal for inválida', () => {
    expect(formatTimelineDateTime('invalid-date', '2026-09-25T17:21:00-03:00')).toBe('25/09/2026 às 17:21');
  });

  it('deve retornar traço seguro (—) se ambas as datas forem inválidas ou ausentes', () => {
    expect(formatTimelineDateTime(null, null)).toBe('—');
    expect(formatTimelineDateTime(undefined, undefined)).toBe('—');
    expect(formatTimelineDateTime('invalid', 'also-invalid')).toBe('—');
  });
});

describe('resolveTimelineActor (WQ-23)', () => {
  const users = [
    { id: 'u-auditor', role: 'qualidade', name: 'Allan Santos' },
    { id: 'u-manager-q', role: 'gestor_qualidade', name: 'Mariana Gestora' },
    { id: 'u-agent', role: 'suporte', name: 'João Atendente' },
    { id: 'u-manager-s', role: 'gestor_suporte', name: 'Carlos Supervisor' },
  ];

  it('deve anonimizar membros da qualidade para visualização de suporte', () => {
    expect(resolveTimelineActor('u-auditor', 'Allan Santos', users, 'suporte')).toBe('Equipe de Qualidade');
    expect(resolveTimelineActor('u-manager-q', 'Mariana Gestora', users, 'suporte')).toBe('Equipe de Qualidade');
  });

  it('deve anonimizar membros da qualidade para visualização de gestor de suporte', () => {
    expect(resolveTimelineActor('u-auditor', 'Allan Santos', users, 'gestor_suporte')).toBe('Equipe de Qualidade');
    expect(resolveTimelineActor('u-manager-q', 'Mariana Gestora', users, 'gestor_suporte')).toBe('Equipe de Qualidade');
  });

  it('NÃO deve anonimizar quando a visualização for de qualidade ou admin', () => {
    expect(resolveTimelineActor('u-auditor', 'Allan Santos', users, 'qualidade')).toBe('Allan Santos');
    expect(resolveTimelineActor('u-auditor', 'Allan Santos', users, 'admin')).toBe('Allan Santos');
    expect(resolveTimelineActor('u-auditor', 'Allan Santos', users, 'gestor_qualidade')).toBe('Allan Santos');
  });

  it('NÃO deve anonimizar atendentes de suporte na visualização de suporte', () => {
    expect(resolveTimelineActor('u-agent', 'João Atendente', users, 'suporte')).toBe('João Atendente');
    expect(resolveTimelineActor('u-manager-s', 'Carlos Supervisor', users, 'suporte')).toBe('Carlos Supervisor');
  });
});
