import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMonitoriaSave } from './useMonitoriaSave';

const db = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ insert: db.insert }) },
  mockDb: {},
}));
vi.mock('../lib/helpdeskQueue', () => ({ backfillAgentTeam: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('useMonitoriaSave', () => {
  beforeEach(() => vi.clearAllMocks());

  it('salva monitoria concluída sem enviar a coluna concluded_at ausente da base migrada', async () => {
    const onSaved = vi.fn();
    db.insert.mockImplementation(() => ({ select: () => ({ single: async () => ({ data: { id: 'monitoria-1' }, error: null }) }) }));
    const deps = {
      user: { id: 'auditor-1', name: 'Auditor', role: 'qualidade' },
      initialData: undefined,
      isReevaluating: false,
      isAdminEdit: false,
      header: {
        form_id: 'form-1', evaluated_id: 'agente-1', team_id: 'equipe-1', ticket_id: '170445',
        ticket_date: '2026-09-28', channel: 'chat', satisfaction_result: 'Sem pesquisa',
      },
      scores: { pergunta: 'SIM' }, observations: {}, criticalErrors: {}, criticalErrorObservations: {},
      dissatisfactionAnswers: {}, score: 100,
      selectedForm: { id: 'form-1', sections: [{ questions: [{ id: 'pergunta' }] }] },
      qualityConfig: { action_deadline: {}, businessHours: {} },
      allUsers: [{ id: 'agente-1', name: 'Agente PJ', primary_team_id: 'equipe-pj' }],
      forms: [], teams: [{ id: 'equipe-pj', name: 'PJs' }],
      dissatisfactionFields: [], clientFieldsToShow: [], qualityFieldsToShow: [],
      onSaved,
    } as unknown as Parameters<typeof useMonitoriaSave>[0];

    const { result } = renderHook(() => useMonitoriaSave(deps));
    act(() => result.current.handleSave());

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('monitoria-1', 'concluida'));
    expect(db.insert).toHaveBeenCalledOnce();
    const payload = db.insert.mock.calls[0][0][0];
    expect(payload.status).toBe('concluida');
    expect(payload.team_id).toBe('equipe-pj');
    expect(payload.team_name).toBe('PJs');
    expect(payload.ticket_group_team_id).toBe('equipe-1');
    expect(payload).not.toHaveProperty('concluded_at');
  });

  it('inicia uma monitoria positiva PJ pela revisão do gestor, mesmo com outro grupo no ticket', async () => {
    const onSaved = vi.fn();
    db.insert.mockImplementation(() => ({ select: () => ({ single: async () => ({ data: { id: 'monitoria-pj' }, error: null }) }) }));
    const deps = {
      user: { id: 'auditor-1', name: 'Auditor', role: 'qualidade' },
      initialData: undefined,
      isReevaluating: false,
      isAdminEdit: false,
      header: {
        form_id: 'form-1', evaluated_id: 'agente-1', team_id: 'grupo-revenda', ticket_id: '175475',
        ticket_date: '2026-10-05', channel: 'chat', satisfaction_result: 'Sem pesquisa',
      },
      scores: { pergunta: 'SIM' }, observations: {}, criticalErrors: {}, criticalErrorObservations: {},
      dissatisfactionAnswers: {}, score: 100,
      selectedForm: { id: 'form-1', sections: [{ questions: [{ id: 'pergunta' }] }] },
      qualityConfig: { action_deadline: {}, businessHours: {} },
      allUsers: [{ id: 'agente-1', name: 'Agente PJ', primary_team_id: 'equipe-pj' }],
      forms: [], teams: [{ id: 'equipe-pj', name: 'PJ Bruno', requires_pj_review: true }],
      dissatisfactionFields: [], clientFieldsToShow: [], qualityFieldsToShow: [],
      onSaved,
    } as unknown as Parameters<typeof useMonitoriaSave>[0];

    const { result } = renderHook(() => useMonitoriaSave(deps));
    act(() => result.current.handleSave());

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('monitoria-pj', 'pendente_revisao'));
    const payload = db.insert.mock.calls[0][0][0];
    expect(payload).toMatchObject({
      status: 'pendente_revisao', team_id: 'equipe-pj', team_name: 'PJ Bruno',
      ticket_group_team_id: 'grupo-revenda', resolution_type: null,
    });
    expect(payload.history[0].action).toBe('Monitoria Criada');
    expect(payload.action_deadline_at).toBeTruthy();
  });
});
