import { describe, it, expect } from 'vitest';
import { computeSupportManagerIndicators } from './supportManagerIndicators';
import type { Monitoria, HelpdeskSubmission } from '../types';

describe('computeSupportManagerIndicators (WQ-21)', () => {
  const teamA = 'team-aaa';
  const teamB = 'team-bbb';
  const teamOther = 'team-other';

  const mockMonitorias: Partial<Monitoria>[] = [
    // Team A: Positiva (score 80)
    { id: 'm1', team_id: teamA, score: 80, active: true },
    // Team A: Positiva no limite (score 75)
    { id: 'm2', team_id: teamA, score: 75, active: true },
    // Team A: Negativa (score 70)
    { id: 'm3', team_id: teamA, score: 70, active: true },
    // Team A: Negativa crítica (score 30)
    { id: 'm4', team_id: teamA, score: 30, active: true },
    // Team B: Positiva (score 95)
    { id: 'm5', team_id: teamB, score: 95, active: true },
    // Team Other: Excluída do escopo (score 85)
    { id: 'm6', team_id: teamOther, score: 85, active: true },
    // Team A: Inativa (não deve contar)
    { id: 'm7', team_id: teamA, score: 50, active: false },
    // Team A: Sem nota ainda (rascunho / pendente)
    { id: 'm8', team_id: teamA, score: undefined, active: true },
  ];

  const mockSubmissions: Partial<HelpdeskSubmission>[] = [
    // m3: enviada como negativa com sucesso
    { id: 'sub1', monitoria_id: 'm3', status: 'sent', outcome: 'negativa', created_at: '2026-09-25T10:00:00Z' },
    // m4: enviada como negativa com sucesso
    { id: 'sub2', monitoria_id: 'm4', status: 'sent', outcome: 'negativa', created_at: '2026-09-25T11:00:00Z' },
    // m1: enviada como positiva com sucesso
    { id: 'sub3', monitoria_id: 'm1', status: 'sent', outcome: 'positiva', created_at: '2026-09-25T12:00:00Z' },
    // m2: falha de envio (status 'failed'), não conta como publicação bem-sucedida
    { id: 'sub4', monitoria_id: 'm2', status: 'failed', outcome: 'negativa', created_at: '2026-09-25T13:00:00Z' },
    // m6: outra equipe (não deve contar para manager dos times A e B)
    { id: 'sub5', monitoria_id: 'm6', status: 'sent', outcome: 'negativa', created_at: '2026-09-25T14:00:00Z' },
  ];

  it('deve escopar indicadores estritamente para as equipes do gestor de suporte', () => {
    const res = computeSupportManagerIndicators(
      mockMonitorias as Monitoria[],
      [teamA, teamB],
      mockSubmissions as HelpdeskSubmission[]
    );

    // Total Avaliado nos times A e B: m1 (80), m2 (75), m3 (70), m4 (30), m5 (95) = 5
    expect(res.totalAvaliado).toBe(5);
    expect(res.avaliadosList.map(m => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
  });

  it('deve classificar Total Positivo como score >= 75 e Total Negativo como score < 75', () => {
    const res = computeSupportManagerIndicators(
      mockMonitorias as Monitoria[],
      [teamA],
      mockSubmissions as HelpdeskSubmission[]
    );

    // No time A:
    // Positivos (score >= 75): m1 (80), m2 (75) -> 2
    expect(res.totalPositivo).toBe(2);
    expect(res.positivosList.map(m => m.id)).toEqual(['m1', 'm2']);

    // Negativos (score < 75): m3 (70), m4 (30) -> 2
    expect(res.totalNegativo).toBe(2);
    expect(res.negativosList.map(m => m.id)).toEqual(['m3', 'm4']);
  });

  it('deve calcular Tickets Invalidados baseado no último envio ao Zendesk com sucesso com outcome = negativa', () => {
    const res = computeSupportManagerIndicators(
      mockMonitorias as Monitoria[],
      [teamA, teamB],
      mockSubmissions as HelpdeskSubmission[]
    );

    // m3 (sent, negativa) e m4 (sent, negativa) contam -> 2
    // m2 falhou (status failed) -> não conta
    // m6 pertence a teamOther -> não conta
    expect(res.totalInvalidados).toBe(2);
    expect(res.invalidadosList.map(m => m.id)).toEqual(['m3', 'm4']);
  });

  it('deve considerar a última submissão cronológica no Zendesk caso haja reavaliações', () => {
    const reevaluatedSubmissions: Partial<HelpdeskSubmission>[] = [
      // Primeiro envio foi negativo
      { id: 'sub-old', monitoria_id: 'm3', status: 'sent', outcome: 'negativa', created_at: '2026-09-20T10:00:00Z' },
      // Segundo envio após reavaliação foi positivo
      { id: 'sub-new', monitoria_id: 'm3', status: 'sent', outcome: 'positiva', created_at: '2026-09-25T10:00:00Z' },
    ];

    const res = computeSupportManagerIndicators(
      mockMonitorias as Monitoria[],
      [teamA],
      reevaluatedSubmissions as HelpdeskSubmission[]
    );

    // A última submissão de m3 foi positiva, logo não deve contar como invalidado
    expect(res.totalInvalidados).toBe(0);
    expect(res.invalidadosList).toHaveLength(0);
  });
});
